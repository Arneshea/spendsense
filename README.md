# 💸 Smart Expense Leak Detection System

**JIIT Academic Year 2025-26**  
By: Shreyas Singh, Divya Pratap Singh, Akshat Singh Bhardwaj  
Guide: Ms. Kashish Mahajan

---

## 🏗 Project Structure

```
smart-expense/
├── app.py                   # Flask entry point
├── requirements.txt
├── expenses.db              # SQLite DB (auto-created on first run)
├── backend/
│   ├── __init__.py
│   ├── db.py                # SQLite init & connection helper
│   ├── ml.py                # Leak detection (Z-score + pattern rules)
│   └── routes.py            # All Flask API routes
└── frontend/
    ├── templates/
    │   └── index.html       # Jinja2 HTML served by Flask
    └── static/
        ├── css/style.css
        └── js/main.js       # Vanilla JS — fetches Flask API
```

---

## 🚀 Setup & Run

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Flask server
```bash
python app.py
```

### 3. Open in browser
```
http://127.0.0.1:5000
```

That's it! The SQLite database (`expenses.db`) is auto-created with sample data.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/summary` | Dashboard stats (totals, category breakdown, trends) |
| GET | `/api/leaks` | ML-detected expense leaks |
| GET | `/api/expenses` | List all expenses (filter by category) |
| POST | `/api/expenses` | Add a new expense |
| DELETE | `/api/expenses/<id>` | Delete an expense |
| GET/PUT | `/api/budget` | Get or update monthly budget |
| GET | `/api/categories` | List all categories |

---

## 🧠 ML / Detection Logic (`backend/ml.py`)

1. **Z-score Anomaly Detection** — Flags days where spending is >2 standard deviations above average
2. **Category Overspend Rules** — Alerts when Food/Transport exceeds 35%, Subscriptions exceed 20% of budget
3. **Micro-expense Pattern** — Detects 10+ transactions under ₹100 (death by small cuts)
4. **Budget Breach Alert** — Warns at 85% budget consumption

---

## 🛠 Tech Stack

- **Backend**: Python + Flask
- **Database**: SQLite (single `.db` file, zero setup)
- **ML/Analysis**: NumPy (Z-score), rule-based pattern detection
- **Frontend**: Vanilla HTML/CSS/JS
- **Charts**: Chart.js
- **Fonts**: Space Grotesk + JetBrains Mono (via Google Fonts)
