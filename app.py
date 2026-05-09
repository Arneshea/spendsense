from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime, timedelta
from backend.db import init_db, get_db
from backend.ml import detect_leaks, get_spending_summary
from backend.routes import register_routes

app = Flask(__name__, template_folder='frontend/templates', static_folder='frontend/static')
CORS(app)

# Initialize database on startup
init_db()

# Register all routes
register_routes(app)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
