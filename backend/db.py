import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'expenses.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            monthly_budget REAL DEFAULT 5000.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            limit_amount REAL NOT NULL,
            month TEXT NOT NULL,
            UNIQUE(user_id, category),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    ''')

    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            "INSERT INTO users (name, email, monthly_budget) VALUES (?, ?, ?)",
            ("Demo Student", "demo@jiit.ac.in", 8000.0)
        )
        user_id = cursor.lastrowid

        # Seed default category budgets
        default_cat_budgets = {
            "Food": 2500, "Transport": 1000, "Subscriptions": 500,
            "Entertainment": 800, "Study Materials": 1200, "Miscellaneous": 500
        }
        for cat, amt in default_cat_budgets.items():
            cursor.execute(
                "INSERT INTO budgets (user_id, category, limit_amount, month) VALUES (?, ?, ?, strftime('%Y-%m', 'now'))",
                (user_id, cat, amt)
            )

        import random
        from datetime import datetime, timedelta
        categories = list(default_cat_budgets.keys())
        today = datetime.today()
        for i in range(40):
            date = (today - timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%d')
            cat = random.choice(categories)
            amount = round(random.uniform(30, 500), 2)
            cursor.execute(
                "INSERT INTO expenses (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)",
                (user_id, amount, cat, f"Sample {cat} expense", date)
            )

    conn.commit()
    conn.close()
    print("✅ Database initialized.")
