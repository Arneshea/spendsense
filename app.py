"""
app.py — SpendSense Flask entry point
"""

import os
from flask import Flask, render_template, redirect, url_for
from dotenv import load_dotenv

load_dotenv()

from backend.routes import api

app = Flask(
    __name__,
    template_folder="frontend/templates",
    static_folder="frontend/static",
)

app.register_blueprint(api)


@app.route("/")
def index():
    return render_template(
        "index.html",
        supabase_url=os.environ["SUPABASE_URL"],
        supabase_anon_key=os.environ["SUPABASE_ANON_KEY"],
    )


@app.route("/login")
def login():
    return render_template(
        "login.html",
        supabase_url=os.environ["SUPABASE_URL"],
        supabase_anon_key=os.environ["SUPABASE_ANON_KEY"],
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)