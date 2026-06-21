# 💸 Smart Expense Leak Detection System

**JIIT Academic Year 2025-26**  
**By**: Arnesh Singh · Shelly Sinha · Himani Kumari  
**Guide**: Mr. Vicky Gupta  
**Institution**: Jaypee Institute of Information Technology  

---

## 🏗 Project Structure

```
smart-expense/
├── app.py                   # Flask entry point
├── requirements.txt
├── .env                     # Environment variables (configured from template)
├── backend/
│   ├── __init__.py
│   ├── db.py                # Supabase client initialization & helpers
│   ├── ml.py                # Leak detection (Z-score + pattern rules)
│   ├── routes.py            # All Flask API routes (validates Supabase JWTs)
│   └── schema.sql           # Database schema & RLS policies for Supabase
└── frontend/
    ├── templates/
    │   ├── index.html       # Jinja2 HTML served by Flask (Dashboard UI)
    │   └── login.html       # Login page (authenticated via Supabase Google OAuth)
    └── static/
        ├── css/style.css    # Custom styles matching dark dashboard theme
        └── js/main.js       # Vanilla JS — fetches Flask API and manages state
```

---

## 🚀 Setup & Run

### 1. Install dependencies
Install the required packages listed in `requirements.txt`:
```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy and fill in the values in your `.env` file using the template below:
```env
# 1. Project API Settings (Project Settings -> API)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 2. JWT Settings (Project Settings -> API -> JWT Secret)
SUPABASE_JWT_SECRET=your-super-secret-jwt-key

# 3. Server Configuration (Optional)
PORT=5000
```

### 3. Initialize Supabase Database Tables
1. Go to your [Supabase Dashboard](https://supabase.com).
2. Navigate to the **SQL Editor** tab.
3. Copy the contents of [backend/schema.sql](file:///c:/anres/sem%204/swe/smart-expense-system(2)/smart-expense/backend/schema.sql) and paste them into the editor.
4. Run the queries to create `users`, `expenses`, and `budgets` tables, set up composite constraints, enable Row Level Security (RLS), and configure the auto-profile user trigger.

### 4. Enable Google Authentication in Supabase
1. In Supabase Dashboard, go to **Authentication** -> **Providers** -> **Google**.
2. Toggle on the Google provider.
3. Supply your **Google Client ID** and **Google Client Secret** (from the [Google Cloud Console](https://console.cloud.google.com/)).
4. Add the redirect URL shown in Supabase under Google provider settings to your Google Cloud Console's authorized redirect URIs.

### 5. Run the Flask Server
```bash
python app.py
```

### 6. Open in Browser
Open `http://127.0.0.1:5000` in your web browser. If not authenticated, you will be redirected to the newly themed login page.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/summary` | Dashboard stats (totals, category breakdown, trends) |
| GET | `/api/leaks` | ML-detected expense leaks |
| GET | `/api/expenses` | List all expenses (filtered by category) |
| POST | `/api/expenses` | Add a new expense |
| DELETE | `/api/expenses/<id>` | Delete an expense |
| GET/PUT | `/api/budget` | Get or update monthly budget |
| GET/PUT | `/api/category-budgets` | Get or update category specific limits |
| GET | `/api/auth/me` | Current user profile |

---

## 🧠 ML / Detection Logic (`backend/ml.py`)

1. **Z-score Anomaly Detection** — Flags days where spending is >2 standard deviations above average
2. **Category Overspend Rules** — Alerts when Food/Transport exceeds 35%, Subscriptions exceed 20% of budget
3. **Micro-expense Pattern** — Detects 10+ transactions under ₹100 (death by small cuts)
4. **Budget Breach Alert** — Warns at 85% budget consumption

---

## 🛠 Tech Stack

- **Backend**: Python + Flask
- **Database**: Supabase (PostgreSQL with RLS)
- **ML/Analysis**: NumPy (Z-score), rule-based pattern detection
- **Frontend**: Vanilla HTML/CSS/JS
- **Charts**: Chart.js
- **Fonts**: Space Grotesk + JetBrains Mono (via Google Fonts)
