import numpy as np
from collections import defaultdict
from datetime import datetime, timedelta
from backend.db import get_db

def _get_category_budgets(cursor, user_id):
    """Fetch user-defined category budgets. Falls back to % of monthly if not set."""
    cursor.execute("SELECT monthly_budget FROM users WHERE id=?", (user_id,))
    user = cursor.fetchone()
    monthly = user['monthly_budget'] if user else 8000

    cursor.execute("SELECT category, limit_amount FROM budgets WHERE user_id=?", (user_id,))
    rows = cursor.fetchall()
    cat_budgets = {row['category']: row['limit_amount'] for row in rows}

    # Fallback defaults if user hasn't set a category budget
    defaults = {
        "Food": monthly * 0.30,
        "Transport": monthly * 0.15,
        "Subscriptions": monthly * 0.10,
        "Entertainment": monthly * 0.12,
        "Study Materials": monthly * 0.18,
        "Miscellaneous": monthly * 0.10,
    }
    for cat, default_val in defaults.items():
        if cat not in cat_budgets:
            cat_budgets[cat] = default_val

    return cat_budgets, monthly


def detect_leaks(user_id):
    conn = get_db()
    cursor = conn.cursor()

    thirty_days_ago = (datetime.today() - timedelta(days=30)).strftime('%Y-%m-%d')
    cursor.execute(
        "SELECT * FROM expenses WHERE user_id=? AND date>=? ORDER BY date DESC",
        (user_id, thirty_days_ago)
    )
    expenses = [dict(row) for row in cursor.fetchall()]

    cat_budgets, monthly_budget = _get_category_budgets(cursor, user_id)
    conn.close()

    if not expenses:
        return []

    leaks = []

    # ── 1. Per-category overspend (uses user-defined limits) ──
    category_totals = defaultdict(float)
    category_counts = defaultdict(int)
    for exp in expenses:
        category_totals[exp['category']] += exp['amount']
        category_counts[exp['category']] += 1

    total_spent = sum(category_totals.values())

    for cat, total in category_totals.items():
        limit = cat_budgets.get(cat)
        if not limit:
            continue
        pct = (total / limit) * 100

        if pct > 100:
            leaks.append({
                "type": "overspend",
                "category": cat,
                "severity": "high",
                "message": f"You've spent ₹{total:.0f} on {cat} — {pct:.0f}% of your ₹{limit:.0f} budget for this category!",
                "amount": total,
                "tip": f"You're ₹{total - limit:.0f} over your {cat} limit. Consider cutting back immediately."
            })
        elif pct > 80:
            leaks.append({
                "type": "overspend",
                "category": cat,
                "severity": "medium",
                "message": f"₹{total:.0f} spent on {cat} — {pct:.0f}% of your ₹{limit:.0f} limit. Getting close!",
                "amount": total,
                "tip": f"Only ₹{limit - total:.0f} left in your {cat} budget for this month."
            })

    # ── 2. Z-score anomaly on daily spend ──
    daily_totals = defaultdict(float)
    for exp in expenses:
        daily_totals[exp['date']] += exp['amount']

    amounts = list(daily_totals.values())
    if len(amounts) >= 5:
        mean = np.mean(amounts)
        std = np.std(amounts)
        if std > 0:
            for date, amt in daily_totals.items():
                z = (amt - mean) / std
                if z > 2.0:
                    leaks.append({
                        "type": "anomaly",
                        "category": "Daily Spike",
                        "severity": "high",
                        "message": f"Unusual spending spike on {date}: ₹{amt:.0f} — more than 2x your daily average of ₹{mean:.0f}!",
                        "amount": amt,
                        "tip": "Review what you bought on this day."
                    })

    # ── 3. Micro-expense pattern ──
    small_spends = [e for e in expenses if e['amount'] < 100]
    if len(small_spends) > 10:
        small_total = sum(e['amount'] for e in small_spends)
        leaks.append({
            "type": "recurring_small",
            "category": "Micro-expenses",
            "severity": "medium",
            "message": f"{len(small_spends)} small purchases totalling ₹{small_total:.0f} — death by a thousand cuts!",
            "amount": small_total,
            "tip": "Batch small errands. Avoid impulse buys under ₹100."
        })

    # ── 4. Overall budget breach ──
    if total_spent > monthly_budget * 0.85:
        pct = (total_spent / monthly_budget) * 100
        leaks.append({
            "type": "budget_breach",
            "category": "Overall Budget",
            "severity": "high" if total_spent > monthly_budget else "medium",
            "message": f"You've used {pct:.0f}% of your ₹{monthly_budget:.0f} monthly budget with days still remaining!",
            "amount": total_spent,
            "tip": "Freeze non-essential spending for the rest of the month."
        })

    return leaks


def get_spending_summary(user_id):
    conn = get_db()
    cursor = conn.cursor()

    thirty_days_ago = (datetime.today() - timedelta(days=30)).strftime('%Y-%m-%d')
    seven_days_ago = (datetime.today() - timedelta(days=7)).strftime('%Y-%m-%d')

    cursor.execute(
        "SELECT category, SUM(amount) as total, COUNT(*) as count FROM expenses "
        "WHERE user_id=? AND date>=? GROUP BY category ORDER BY total DESC",
        (user_id, thirty_days_ago)
    )
    categories = [dict(row) for row in cursor.fetchall()]

    cursor.execute(
        "SELECT date, SUM(amount) as total FROM expenses "
        "WHERE user_id=? AND date>=? GROUP BY date ORDER BY date ASC",
        (user_id, seven_days_ago)
    )
    daily = [dict(row) for row in cursor.fetchall()]

    cursor.execute("SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date>=?", (user_id, thirty_days_ago))
    monthly_total = cursor.fetchone()['total'] or 0

    cursor.execute("SELECT SUM(amount) as total FROM expenses WHERE user_id=? AND date>=?", (user_id, seven_days_ago))
    weekly_total = cursor.fetchone()['total'] or 0

    cursor.execute("SELECT monthly_budget FROM users WHERE id=?", (user_id,))
    budget = cursor.fetchone()['monthly_budget'] or 8000

    # Also attach category budgets to summary
    cursor.execute("SELECT category, limit_amount FROM budgets WHERE user_id=?", (user_id,))
    cat_budgets = {row['category']: row['limit_amount'] for row in cursor.fetchall()}

    conn.close()

    return {
        "monthly_total": round(monthly_total, 2),
        "weekly_total": round(weekly_total, 2),
        "budget": budget,
        "budget_remaining": round(budget - monthly_total, 2),
        "categories": categories,
        "daily_trend": daily,
        "category_budgets": cat_budgets
    }
