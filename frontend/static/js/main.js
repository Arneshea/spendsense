/**
 * frontend/static/js/main.js
 * SpendSense — Vanilla JS Controller aligned with Tailwind templates & Supabase Auth
 */

// ── Supabase SDK Initialization ──────────────────────────────────────────────
const SUPABASE_URL = document.body.dataset.supabaseUrl;
const SUPABASE_ANON = document.body.dataset.supabaseAnon;
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

let currentSession = null;
let currentUser = null;

// ── Auth Bootstrap ────────────────────────────────────────────────────────────
async function initAuth() {
    // Wait for Supabase to process any OAuth hash in the URL before checking
    // session — without this, getSession() fires too early → redirect loop.
    await new Promise((resolve) => {
        const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
            currentSession = session;
            subscription.unsubscribe();
            resolve();
        });
        setTimeout(resolve, 2000); // fallback if no auth event fires
    });

    const { data } = await sb.auth.getSession();

    if (!data.session) {
        window.location.href = "/login";
        return;
    }

    currentSession = data.session;
    currentUser = data.session.user;

    // Keep session refreshed
    sb.auth.onAuthStateChange((_event, session) => {
        currentSession = session;
    });

    // Display user profile in UI header
    const nameEl = document.getElementById("userName");
    if (nameEl) {
        nameEl.textContent =
            currentUser.user_metadata?.full_name ||
            currentUser.email ||
            "User";
    }

    const avatarEl = document.getElementById("userAvatar");
    if (avatarEl && currentUser.user_metadata?.avatar_url) {
        avatarEl.src = currentUser.user_metadata.avatar_url;
        avatarEl.classList.remove("hidden");
    }

    // Initialize application logic
    initApp();
}

// ── Sign Out ──────────────────────────────────────────────────────────────────
async function signOut() {
    await sb.auth.signOut();
    window.location.href = "/login";
}

// ── Authenticated API Fetch Wrapper ───────────────────────────────────────────
async function apiFetch(path, options = {}) {
    const token = currentSession?.access_token;
    if (!token) {
        window.location.href = "/login";
        throw new Error("No auth token");
    }

    const res = await fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    if (res.status === 401) {
        // Access token expired, attempt session refresh
        const { data } = await sb.auth.refreshSession();
        if (data.session) {
            currentSession = data.session;
            return apiFetch(path, options); // Retry fetch
        }
        window.location.href = "/login";
        throw new Error("Session expired");
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
}

// ── Application State ─────────────────────────────────────────────────────────
let state = {
    activeTab: "dashboard",
    currentMonth: new Date().toISOString().slice(0, 7), // Format: 'YYYY-MM'
    summary: null,
    expenses: [],
    leaks: [],
    budget: 5000,
    categoryBudgets: {},
};
function fmt(n) {
    return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ── Navigation (Toggling Active Tabs) ─────────────────────────────────────────
function setTab(tab) {
    state.activeTab = tab;

    // Toggle active class on sidebar navigation buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    // Toggle active class on tab contents
    document.querySelectorAll(".tab-content").forEach(el => {
        el.classList.toggle("active", el.id === `tab-${tab}`);
    });

    // Update Topbar Title
    const PAGE_TITLES = {
        dashboard: "Dashboard",
        leaks: "Leak Detector",
        expenses: "Expenses",
        add: "Log Transaction",
        settings: "Settings"
    };
    const titleEl = document.getElementById("page-title");
    if (titleEl) {
        titleEl.textContent = PAGE_TITLES[tab] || "Dashboard";
    }

    loadTabData(tab);
}

// Bind to window for HTML onclick attributes
window.setTab = setTab;

async function loadTabData(tab) {
    try {
        const loader = document.getElementById("loading");
        if (loader) loader.style.display = "flex";

        if (tab === "dashboard") {
            await loadDashboard();
        } else if (tab === "expenses") {
            await loadExpenses();
        } else if (tab === "leaks") {
            await loadLeaks();
        } else if (tab === "add") {
            await loadAddExpenseTab();
        } else if (tab === "settings") {
            await loadBudget();
        }
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        const loader = document.getElementById("loading");
        if (loader) loader.style.display = "none";
    }
}

// ── Dashboard Calculations & Render ──────────────────────────────────────────
async function loadDashboard() {
    const data = await apiFetch(`/api/summary?month=${state.currentMonth}`);
    state.summary = data;

    // Update KPI Card values
    document.getElementById("monthly-total").textContent = `₹${fmt(data.total_spent)}`;
    document.getElementById("budget-amount").textContent = `₹${fmt(data.monthly_budget)}`;

    const remaining = data.budget_remaining;
    const remEl = document.getElementById("budget-remaining");
    if (remEl) {
        remEl.textContent = `₹${fmt(Math.abs(remaining))}`;
        remEl.className = remaining < 0 ? "font-data-lg text-[32px] text-red-400" : "font-data-lg text-[32px] text-green-400";
    }

    // Calculate dynamic 7-day weekly spend
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);
    const weeklyTotal = data.daily_chart
        .filter(item => new Date(item.date) >= oneWeekAgo)
        .reduce((sum, item) => sum + item.amount, 0);
    document.getElementById("weekly-total").textContent = `₹${fmt(weeklyTotal)}`;

    // Budget progress bar and percentage
    const pct = Math.min((data.total_spent / data.monthly_budget) * 100, 100);
    const pctEl = document.getElementById("budget-pct");
    if (pctEl) pctEl.textContent = `${pct.toFixed(0)}%`;

    const bar = document.getElementById("budget-bar");
    if (bar) {
        bar.style.width = `${pct}%`;
        bar.style.background = pct >= 100 ? "#FF6B6B" : pct >= 85 ? "#FFE66D" : "#A8E6CF";
    }

    // Update leak badge in sidebar
    const leaksData = await apiFetch(`/api/leaks?month=${state.currentMonth}`);
    const badge = document.getElementById("leak-badge");
    if (badge) {
        if (leaksData.length > 0) {
            badge.textContent = leaksData.length;
            badge.style.display = "inline-block";
        } else {
            badge.style.display = "none";
        }
    }

    renderCategoryChart(data.category_totals);
    renderDailyChart(data.daily_chart);
}

// ── Expenses List ─────────────────────────────────────────────────────────────
async function loadExpenses() {
    state.expenses = await apiFetch(`/api/expenses?month=${state.currentMonth}`);
    renderExpenseTable(state.expenses);
}

function renderExpenseTable(expenses) {
    const tbody = document.getElementById("expense-tbody");
    if (!tbody) return;

    if (expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-slate-500 py-12 font-nav-item">
      No transactions recorded this semester.</td></tr>`;
        return;
    }

    tbody.innerHTML = expenses.map(e => `
        <tr class="border-b border-[#2a2a45] hover:bg-white/5 transition-colors">
            <td class="px-6 py-4 text-sm text-slate-300 font-nav-item">${e.date}</td>
            <td class="px-6 py-4 text-sm">
                <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#4ECDC4]/10 text-[#4ECDC4]">
                    ${e.category}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-slate-300 font-nav-item">${e.description || '—'}</td>
            <td class="px-6 py-4 text-right font-data-lg text-[#4ECDC4] font-medium">₹${fmt(e.amount)}</td>
            <td class="px-6 py-4 text-right">
                <button onclick="deleteExpense('${e.id}')"
                    class="text-[#FF6B6B] hover:opacity-80 text-xs transition-opacity font-nav-item border border-[#FF6B6B]/20 rounded-md px-2 py-1">
                    Delete
                </button>
            </td>
        </tr>
    `).join("");
}

async function addExpense(formData) {
    await apiFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify(formData),
    });
    showToast("Expense logged successfully ✓");
    await loadAddExpenseTab();
}

async function deleteExpense(id) {
    if (!confirm("Are you sure you want to delete this transaction record?")) return;
    await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
    showToast("Transaction deleted");
    await loadExpenses();
}

// Bind to window for HTML table deletes
window.deleteExpense = deleteExpense;

// ── Log Transaction Tab (Loads secondary cards details) ───────────────────────
async function loadAddExpenseTab() {
    const [budgetData, leaksData] = await Promise.all([
        apiFetch("/api/summary?month=${state.currentMonth}"),
        apiFetch(`/api/leaks?month=${state.currentMonth}`),
    ]);

    const remEl = document.getElementById("form-remaining");
    if (remEl) {
        remEl.textContent = `₹${fmt(budgetData.budget_remaining)}`;
        remEl.className = budgetData.budget_remaining < 0 ? "font-data-lg text-red-400 text-xl" : "font-data-lg text-green-400 text-xl";
    }

    const leakEl = document.getElementById("form-leaks");
    if (leakEl) {
        leakEl.textContent = leaksData.length;
        leakEl.className = leaksData.length > 0 ? "font-data-lg text-red-400 text-xl" : "font-data-lg text-green-400 text-xl";
    }
}

// ── Leaks Analysis View ───────────────────────────────────────────────────────
async function loadLeaks() {
    state.leaks = await apiFetch(`/api/leaks?month=${state.currentMonth}`);
    renderLeaks(state.leaks);
}

function renderLeaks(leaks) {
    const container = document.getElementById("leaks-container");
    if (!container) return;

    if (leaks.length === 0) {
        container.innerHTML = `
          <div class="bg-[#1a1a2e] border border-[#2a2a45] rounded-xl p-12 text-center">
            <div class="text-5xl mb-4">✅</div>
            <p class="text-[#4ECDC4] font-medium text-lg font-headline-md">No spending leaks detected!</p>
            <p class="text-slate-500 text-sm mt-2 font-nav-item">Your spending looks healthy this month.</p>
          </div>`;
        return;
    }

    const severityColors = {
        High: "border-l-[#FF6B6B] bg-[#FF6B6B]/5",
        Medium: "border-l-[#FFE66D] bg-[#FFE66D]/5",
        Low: "border-l-[#4ECDC4] bg-[#4ECDC4]/5",
    };
    const severityBadge = {
        High: "bg-[#FF6B6B]/20 text-[#FF6B6B]",
        Medium: "bg-[#FFE66D]/20 text-[#FFE66D]",
        Low: "bg-[#4ECDC4]/20 text-[#4ECDC4]",
    };

    container.innerHTML = leaks.map(leak => `
        <div class="bg-[#1a1a2e] border border-[#2a2a45] border-l-4 rounded-xl p-6 ${severityColors[leak.severity] || "border-l-slate-500 bg-slate-500/5"} transition-all hover:translate-x-1 duration-200">
            <div class="flex items-start justify-between gap-4">
                <div class="space-y-1">
                    <span class="inline-block text-[10px] font-bold font-nav-item uppercase tracking-widest px-2.5 py-1 rounded-full ${severityBadge[leak.severity] || "bg-slate-500/20 text-slate-300"}">
                        ${leak.severity} Leak
                    </span>
                    <h3 class="text-white font-bold font-headline-md text-base mt-2">${leak.title}</h3>
                    <p class="text-slate-400 text-sm font-nav-item leading-relaxed mt-1">${leak.description}</p>
                </div>
                ${leak.amount ? `
                <div class="text-right">
                    <p class="text-xs uppercase font-nav-item tracking-wider text-slate-500">Estimated Leak</p>
                    <p class="text-[#FF6B6B] font-data-lg text-lg font-bold mt-1">₹${fmt(leak.amount)}</p>
                </div>` : ""}
            </div>
        </div>
    `).join("");
}

// ── Budget & Configuration Settings ─────────────────────────────────────────
async function loadBudget() {
    const [budgetData, catData] = await Promise.all([
        apiFetch("/api/budget"),
        apiFetch(`/api/category-budgets?month=${state.currentMonth}`),
    ]);
    state.budget = budgetData.monthly_budget;
    state.categoryBudgets = catData;

    const monthlyInput = document.getElementById("new-budget");
    if (monthlyInput) monthlyInput.value = state.budget;

    const categories = ["Food", "Transport", "Subscriptions",
        "Entertainment", "Study-Materials", "Miscellaneous"];
    categories.forEach(cat => {
        // Map hyphens to spaces for storage keys
        const apiKey = cat.replace("-", " ");
        const el = document.getElementById(`cb-${cat}`);
        if (el) el.value = catData[apiKey] || "";
    });
}

// ── Charts Handler (Chart.js Integration) ────────────────────────────────────
let categoryChart = null;
let dailyChart = null;

function renderCategoryChart(totals) {
    const ctx = document.getElementById("category-chart");
    if (!ctx) return;
    if (categoryChart) categoryChart.destroy();

    const labels = Object.keys(totals);
    const data = Object.values(totals);

    // Curated dark dashboard colors
    const colors = ["#4ECDC4", "#FF6B6B", "#FFE66D", "#A8E6CF", "#C7CEEA", "#8b5cf6"];

    categoryChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: "#bcc9c7", font: { family: "Space Grotesk", size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ₹${fmt(ctx.parsed)}`,
                    },
                },
            },
        },
    });
}

function renderDailyChart(daily) {
    const ctx = document.getElementById("trend-chart");
    if (!ctx) return;
    if (dailyChart) dailyChart.destroy();

    dailyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: daily.map(d => d.date.slice(5)), // Show 'MM-DD'
            datasets: [{
                label: "Daily Spend",
                data: daily.map(d => d.amount),
                backgroundColor: "rgba(78, 205, 196, 0.4)",
                borderColor: "#4ECDC4",
                borderWidth: 1,
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: "#8888a8", font: { family: "Space Grotesk" } }, grid: { color: "rgba(255,255,255,0.04)" } },
                y: { ticks: { color: "#8888a8", font: { family: "Space Grotesk" }, callback: v => `₹${v}` }, grid: { color: "rgba(255,255,255,0.04)" } },
            },
        },
    });
}

// ── Toast Notifications ───────────────────────────────────────────────────────
function showToast(msg, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast ${type === "error" ? "error" : "success"} show`;
    setTimeout(() => toast.classList.remove("show"), 3000);
}

// ── Form Submit Handlers Setup ───────────────────────────────────────────────
function setupExpenseForm() {
    const form = document.getElementById("expense-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            await addExpense({
                amount: parseFloat(document.getElementById("exp-amount").value),
                category: document.getElementById("exp-category").value,
                description: document.getElementById("exp-description").value,
                date: document.getElementById("exp-date").value,
            });
            form.reset();
            const dateInput = document.getElementById("exp-date");
            if (dateInput) {
                dateInput.value = new Date().toISOString().slice(0, 10);
            }
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

function setupBudgetForms() {
    const mForm = document.getElementById("budget-form");
    if (mForm) {
        mForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const val = parseFloat(document.getElementById("new-budget").value);
            if (!val || val <= 0) { showToast("Enter a valid budget", "error"); return; }
            try {
                await apiFetch("/api/budget", {
                    method: "PUT",
                    body: JSON.stringify({ monthly_budget: val }),
                });
                state.budget = val;
                showToast("Monthly budget updated ✓");
                if (state.activeTab === "dashboard") await loadDashboard();
            } catch (err) {
                showToast(err.message, "error");
            }
        });
    }

    const cForm = document.getElementById("cat-budget-form");
    if (cForm) {
        cForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const categories = ["Food", "Transport", "Subscriptions",
                "Entertainment", "Study-Materials", "Miscellaneous"];
            const payload = {};
            categories.forEach(cat => {
                const el = document.getElementById(`cb-${cat}`);
                if (el && el.value) {
                    const apiKey = cat.replace("-", " ");
                    payload[apiKey] = parseFloat(el.value);
                }
            });
            try {
                await apiFetch(`/api/category-budgets?month=${state.currentMonth}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                showToast("Category thresholds updated ✓");
            } catch (err) {
                showToast(err.message, "error");
            }
        });
    }
}

// ── App Initialization ────────────────────────────────────────────────────────
function initApp() {
    setupExpenseForm();
    setupBudgetForms();

    const signOutBtn = document.getElementById("signOutBtn");
    if (signOutBtn) signOutBtn.addEventListener("click", signOut);

    // Initial load defaults to dashboard
    setTab("dashboard");
}

// Boot application when DOM is loaded
document.addEventListener("DOMContentLoaded", initAuth);