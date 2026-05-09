from flask import request, jsonify
from datetime import datetime
from backend.db import get_db
from backend.ml import detect_leaks, get_spending_summary

DEFAULT_USER_ID = 1

def register_routes(app):

    @app.route('/api/summary', methods=['GET'])
    def summary():
        user_id = request.args.get('user_id', DEFAULT_USER_ID, type=int)
        data = get_spending_summary(user_id)
        return jsonify(data)

    @app.route('/api/leaks', methods=['GET'])
    def leaks():
        user_id = request.args.get('user_id', DEFAULT_USER_ID, type=int)
        alerts = detect_leaks(user_id)
        return jsonify({"leaks": alerts, "count": len(alerts)})

    @app.route('/api/expenses', methods=['GET'])
    def get_expenses():
        user_id = request.args.get('user_id', DEFAULT_USER_ID, type=int)
        limit = request.args.get('limit', 50, type=int)
        category = request.args.get('category', None)
        conn = get_db()
        cursor = conn.cursor()
        if category:
            cursor.execute("SELECT * FROM expenses WHERE user_id=? AND category=? ORDER BY date DESC LIMIT ?", (user_id, category, limit))
        else:
            cursor.execute("SELECT * FROM expenses WHERE user_id=? ORDER BY date DESC LIMIT ?", (user_id, limit))
        expenses = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(expenses)

    @app.route('/api/expenses', methods=['POST'])
    def add_expense():
        data = request.get_json()
        required = ['amount', 'category', 'description', 'date']
        if not all(k in data for k in required):
            return jsonify({"error": "Missing fields"}), 400
        user_id = data.get('user_id', DEFAULT_USER_ID)
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO expenses (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)",
            (user_id, float(data['amount']), data['category'], data['description'], data['date'])
        )
        expense_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return jsonify({"success": True, "id": expense_id, "message": "Expense added!"}), 201

    @app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
    def delete_expense(expense_id):
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM expenses WHERE id=?", (expense_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})

    @app.route('/api/budget', methods=['GET', 'PUT'])
    def budget():
        user_id = request.args.get('user_id', DEFAULT_USER_ID, type=int)
        conn = get_db()
        cursor = conn.cursor()
        if request.method == 'PUT':
            data = request.get_json()
            new_budget = float(data.get('monthly_budget', 8000))
            cursor.execute("UPDATE users SET monthly_budget=? WHERE id=?", (new_budget, user_id))
            conn.commit()
            conn.close()
            return jsonify({"success": True, "monthly_budget": new_budget})
        cursor.execute("SELECT name, email, monthly_budget FROM users WHERE id=?", (user_id,))
        user = dict(cursor.fetchone())
        conn.close()
        return jsonify(user)

    @app.route('/api/categories', methods=['GET'])
    def categories():
        return jsonify({"categories": ["Food", "Transport", "Subscriptions", "Entertainment", "Study Materials", "Miscellaneous"]})

    # ── GET Category Budgets ──
    @app.route('/api/category-budgets', methods=['GET'])
    def get_category_budgets():
        user_id = request.args.get('user_id', DEFAULT_USER_ID, type=int)
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT category, limit_amount FROM budgets WHERE user_id=?", (user_id,))
        rows = cursor.fetchall()
        conn.close()
        return jsonify({row['category']: row['limit_amount'] for row in rows})

    # ── PUT Category Budgets (upsert) ──
    @app.route('/api/category-budgets', methods=['PUT'])
    def set_category_budgets():
        user_id = request.args.get('user_id', DEFAULT_USER_ID, type=int)
        data = request.get_json()  # { "Food": 2000, "Transport": 1000 ... }
        conn = get_db()
        cursor = conn.cursor()
        for category, amount in data.items():
            cursor.execute(
                """INSERT INTO budgets (user_id, category, limit_amount, month)
                   VALUES (?, ?, ?, strftime('%Y-%m', 'now'))
                   ON CONFLICT(user_id, category) DO UPDATE SET limit_amount=excluded.limit_amount""",
                (user_id, category, float(amount))
            )
        conn.commit()
        conn.close()
        return jsonify({"success": True})
