"""
backend/ml.py — Spending Leak Detection Engine for SpendSense.

Receives plain Python lists/dicts (from Supabase JSON responses).
No SQLite dependency. Four detectors:
  1. Z-score daily anomaly
  2. Per-category budget overspend
  3. Micro-transaction pattern (10+ txns < ₹100 in 30 days)
  4. Overall monthly budget breach
"""

import numpy as np
from collections import defaultdict
from datetime import datetime, timedelta


def detect_leaks(
    expenses: list[dict],
    category_budgets: dict[str, float],
    monthly_budget: float,
) -> list[dict]:
    """
    Parameters
    ----------
    expenses        : list of expense dicts with keys: amount, category, date, description
    category_budgets: {category: limit_amount}
    monthly_budget  : overall monthly spend cap

    Returns
    -------
    list of leak alert dicts sorted by severity (High → Medium → Low)
    """
    alerts = []

    if not expenses:
        return alerts

    # ── Pre-process ──────────────────────────────────────────────────────────
    daily_totals: dict[str, float] = defaultdict(float)
    category_totals: dict[str, float] = defaultdict(float)
    total_spent = 0.0
    micro_count = 0
    cutoff = datetime.now().date() - timedelta(days=30)

    for e in expenses:
        amt  = float(e["amount"])
        cat  = e["category"]
        day  = e["date"]                          # 'YYYY-MM-DD' string
        total_spent        += amt
        daily_totals[day]  += amt
        category_totals[cat] += amt

        # Micro-transaction check
        exp_date = datetime.strptime(day, "%Y-%m-%d").date()
        if amt < 100 and exp_date >= cutoff:
            micro_count += 1

    # ── Detector 1: Z-score daily anomaly ────────────────────────────────────
    if len(daily_totals) >= 3:
        amounts = np.array(list(daily_totals.values()), dtype=float)
        mean    = amounts.mean()
        std     = amounts.std()
        if std > 0:
            for day, total in daily_totals.items():
                z = (total - mean) / std
                if z > 2.0:
                    alerts.append({
                        "type":        "anomaly",
                        "severity":    "High",
                        "title":       f"Unusual Spending on {day}",
                        "description": (
                            f"You spent ₹{total:.0f} on {day}, which is "
                            f"{z:.1f} standard deviations above your daily average of ₹{mean:.0f}."
                        ),
                        "amount":      round(total, 2),
                        "date":        day,
                    })

    # ── Detector 2: Per-category overspend ───────────────────────────────────
    for cat, spent in category_totals.items():
        limit = category_budgets.get(cat)
        if not limit:
            continue
        pct = spent / limit
        if pct >= 1.0:
            alerts.append({
                "type":        "category_overspend",
                "severity":    "High",
                "title":       f"{cat} Budget Exceeded",
                "description": (
                    f"You've spent ₹{spent:.0f} on {cat}, "
                    f"which is {pct*100:.0f}% of your ₹{limit:.0f} limit."
                ),
                "amount":      round(spent, 2),
                "category":    cat,
            })
        elif pct >= 0.8:
            alerts.append({
                "type":        "category_warning",
                "severity":    "Medium",
                "title":       f"{cat} Approaching Limit",
                "description": (
                    f"You've used {pct*100:.0f}% (₹{spent:.0f}) of your "
                    f"₹{limit:.0f} {cat} budget."
                ),
                "amount":      round(spent, 2),
                "category":    cat,
            })

    # ── Detector 3: Micro-transaction pattern ────────────────────────────────
    if micro_count >= 10:
        alerts.append({
            "type":        "micro_transactions",
            "severity":    "Medium",
            "title":       "Frequent Small Purchases",
            "description": (
                f"You've made {micro_count} transactions under ₹100 in the last 30 days. "
                "These micro-expenses can silently drain your budget."
            ),
            "count":       micro_count,
        })

    # ── Detector 4: Overall budget breach ────────────────────────────────────
    if monthly_budget > 0:
        pct = total_spent / monthly_budget
        if pct >= 1.0:
            alerts.append({
                "type":        "budget_exceeded",
                "severity":    "High",
                "title":       "Monthly Budget Exceeded",
                "description": (
                    f"Total spend ₹{total_spent:.0f} has exceeded your "
                    f"₹{monthly_budget:.0f} monthly budget ({pct*100:.0f}%)."
                ),
                "amount":      round(total_spent, 2),
            })
        elif pct >= 0.85:
            alerts.append({
                "type":        "budget_warning",
                "severity":    "Medium",
                "title":       "Monthly Budget at Risk",
                "description": (
                    f"You've used {pct*100:.0f}% (₹{total_spent:.0f}) of your "
                    f"₹{monthly_budget:.0f} monthly budget."
                ),
                "amount":      round(total_spent, 2),
            })

    # Sort: High first, then Medium, then Low
    severity_order = {"High": 0, "Medium": 1, "Low": 2}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 3))

    return alerts