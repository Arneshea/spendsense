"""
backend/routes.py — All Flask API routes for SpendSense.
Every endpoint validates the Supabase JWT by calling Supabase's getUser()
endpoint directly — works with both HS256 and ECC (P-256) signing keys.
"""

from flask import Blueprint, request, jsonify
from functools import wraps
from datetime import datetime
import os
import requests as http_requests

from backend.db import get_user_client, supabase_admin
from backend.ml import detect_leaks

api = Blueprint("api", __name__, url_prefix="/api")

SUPABASE_URL     = os.environ["SUPABASE_URL"]
SUPABASE_ANON    = os.environ["SUPABASE_ANON_KEY"]

# ── JWT Auth Decorator ────────────────────────────────────────────────────────

def require_auth(f):
    """Verify JWT by calling Supabase Auth /user endpoint. Works with any key type."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth_header.split(" ", 1)[1]

        # Ask Supabase to verify the token — no local secret needed
        resp = http_requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return jsonify({"error": "Invalid or expired token"}), 401

        user_data = resp.json()
        kwargs["user_id"] = user_data["id"]
        kwargs["db"]      = get_user_client(token)
        return f(*args, **kwargs)
    return decorated


def current_month() -> str:
    return datetime.now().strftime("%Y-%m")


# ── /api/summary ─────────────────────────────────────────────────────────────

@api.route("/summary")
@require_auth
def get_summary(user_id, db):
    month = request.args.get("month", current_month())
    start = f"{month}-01"
    # Last day handled by Postgres range; use next month start
    year, mon = map(int, month.split("-"))
    next_mon  = f"{year}-{mon+1:02d}-01" if mon < 12 else f"{year+1}-01-01"

    # Total spent this month
    res = db.table("expenses") \
             .select("amount, category, date") \
             .eq("user_id", user_id) \
             .gte("date", start) \
             .lt("date", next_mon) \
             .execute()
    expenses = res.data or []

    total_spent = sum(float(e["amount"]) for e in expenses)

    # Per-category totals
    category_totals: dict = {}
    for e in expenses:
        category_totals[e["category"]] = (
            category_totals.get(e["category"], 0) + float(e["amount"])
        )

    # Daily chart data
    daily: dict = {}
    for e in expenses:
        daily[e["date"]] = daily.get(e["date"], 0) + float(e["amount"])

    # Monthly budget
    user_res = db.table("users").select("monthly_budget").eq("id", user_id).single().execute()
    monthly_budget = float(user_res.data.get("monthly_budget", 5000)) if user_res.data else 5000.0
    budget_remaining = monthly_budget - total_spent

    return jsonify({
        "total_spent":      total_spent,
        "monthly_budget":   monthly_budget,
        "budget_remaining": budget_remaining,
        "category_totals":  category_totals,
        "daily_chart":      [{"date": d, "amount": a} for d, a in sorted(daily.items())],
        "month":            month,
    })


# ── /api/expenses ─────────────────────────────────────────────────────────────

@api.route("/expenses", methods=["GET"])
@require_auth
def get_expenses(user_id, db):
    month = request.args.get("month", current_month())
    start = f"{month}-01"
    year, mon = map(int, month.split("-"))
    next_mon  = f"{year}-{mon+1:02d}-01" if mon < 12 else f"{year+1}-01-01"

    res = db.table("expenses") \
             .select("*") \
             .eq("user_id", user_id) \
             .gte("date", start) \
             .lt("date", next_mon) \
             .order("date", desc=True) \
             .execute()
    return jsonify(res.data or [])


@api.route("/expenses", methods=["POST"])
@require_auth
def add_expense(user_id, db):
    data = request.get_json(force=True)
    required = {"amount", "category", "description", "date"}
    if not required.issubset(data):
        return jsonify({"error": f"Missing fields: {required - data.keys()}"}), 400

    row = {
        "user_id":     user_id,
        "amount":      float(data["amount"]),
        "category":    data["category"],
        "description": data["description"],
        "date":        data["date"],
    }
    res = db.table("expenses").insert(row).execute()
    return jsonify(res.data[0] if res.data else {}), 201


@api.route("/expenses/<expense_id>", methods=["DELETE"])
@require_auth
def delete_expense(expense_id, user_id, db):
    db.table("expenses") \
      .delete() \
      .eq("id", expense_id) \
      .eq("user_id", user_id) \
      .execute()
    return jsonify({"deleted": expense_id})


# ── /api/budget ───────────────────────────────────────────────────────────────

@api.route("/budget", methods=["GET"])
@require_auth
def get_budget(user_id, db):
    res = db.table("users").select("monthly_budget").eq("id", user_id).single().execute()
    return jsonify({"monthly_budget": float(res.data.get("monthly_budget", 5000)) if res.data else 5000})


@api.route("/budget", methods=["PUT"])
@require_auth
def update_budget(user_id, db):
    data = request.get_json(force=True)
    budget = float(data.get("monthly_budget", 5000))
    db.table("users").update({"monthly_budget": budget}).eq("id", user_id).execute()
    return jsonify({"monthly_budget": budget})


# ── /api/category-budgets ────────────────────────────────────────────────────

@api.route("/category-budgets", methods=["GET"])
@require_auth
def get_category_budgets(user_id, db):
    month = request.args.get("month", current_month())
    res = db.table("budgets") \
             .select("category, limit_amount") \
             .eq("user_id", user_id) \
             .eq("month", month) \
             .execute()
    return jsonify({r["category"]: float(r["limit_amount"]) for r in (res.data or [])})


@api.route("/category-budgets", methods=["PUT"])
@require_auth
def update_category_budgets(user_id, db):
    data   = request.get_json(force=True)   # { "Food": 2000, "Transport": 500, ... }
    month  = request.args.get("month", current_month())
    upserted = []
    for category, limit in data.items():
        row = {
            "user_id":      user_id,
            "category":     category,
            "limit_amount": float(limit),
            "month":        month,
        }
        res = db.table("budgets") \
                 .upsert(row, on_conflict="user_id,category,month") \
                 .execute()
        upserted.extend(res.data or [])
    return jsonify(upserted)


# ── /api/leaks ────────────────────────────────────────────────────────────────

@api.route("/leaks")
@require_auth
def get_leaks(user_id, db):
    month = request.args.get("month", current_month())
    start = f"{month}-01"
    year, mon = map(int, month.split("-"))
    next_mon  = f"{year}-{mon+1:02d}-01" if mon < 12 else f"{year+1}-01-01"

    exp_res = db.table("expenses") \
                 .select("amount, category, date, description") \
                 .eq("user_id", user_id) \
                 .gte("date", start) \
                 .lt("date", next_mon) \
                 .execute()

    bud_res = db.table("budgets") \
                 .select("category, limit_amount") \
                 .eq("user_id", user_id) \
                 .eq("month", month) \
                 .execute()

    usr_res = db.table("users").select("monthly_budget").eq("id", user_id).single().execute()

    expenses         = exp_res.data or []
    category_budgets = {r["category"]: float(r["limit_amount"]) for r in (bud_res.data or [])}
    monthly_budget   = float(usr_res.data.get("monthly_budget", 5000)) if usr_res.data else 5000.0

    leaks = detect_leaks(expenses, category_budgets, monthly_budget)
    return jsonify(leaks)


# ── /api/auth/me ─────────────────────────────────────────────────────────────

@api.route("/auth/me")
@require_auth
def get_me(user_id, db):
    """Return the current user's profile. Creates it if missing (first login)."""
    res = db.table("users").select("*").eq("id", user_id).single().execute()
    if res.data:
        return jsonify(res.data)

    # Fallback: create profile via admin client if trigger didn't fire
    user_meta = db.auth.get_user()
    name  = user_meta.user.user_metadata.get("full_name", "") if user_meta else ""
    email = user_meta.user.email if user_meta else ""
    admin_res = supabase_admin.table("users").insert({
        "id": user_id, "name": name, "email": email
    }).execute()
    return jsonify(admin_res.data[0] if admin_res.data else {"id": user_id})