// ─────────────────────────────────────────────
// Smart Expense Leak Detection System
// Frontend JS — talks to Flask API
// ─────────────────────────────────────────────

const API = 'http://127.0.0.1:5000/api';
const USER_ID = 1;

// ── State ──
let allExpenses = [];
let summaryData = {};
let leakData = [];
let spendChart = null;
let trendChart = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    setupExpenseForm();
    setupBudgetForm();
    setupCatBudgetForm();
    await loadCategoryBudgets();
});

async function loadAll() {
    showLoading(true);
    await Promise.all([loadSummary(), loadLeaks(), loadExpenses()]);
    showLoading(false);
}

// ─────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────

async function loadSummary() {
    try {
        const res = await fetch(`${API}/summary?user_id=${USER_ID}`);
        summaryData = await res.json();
        renderSummaryCards(summaryData);
        renderCategoryChart(summaryData.categories);
        renderTrendChart(summaryData.daily_trend);
    } catch (e) {
        console.error('Summary load failed:', e);
    }
}

async function loadLeaks() {
    try {
        const res = await fetch(`${API}/leaks?user_id=${USER_ID}`);
        leakData = await res.json();
        renderLeaks(leakData.leaks);
        updateLeakBadge(leakData.count);
        const formLeaks = document.getElementById('form-leaks');
        if (formLeaks) formLeaks.textContent = leakData.count + ' found';
    } catch (e) {
        console.error('Leaks load failed:', e);
    }
}

async function loadExpenses() {
    try {
        const res = await fetch(`${API}/expenses?user_id=${USER_ID}&limit=50`);
        allExpenses = await res.json();
        renderExpenseTable(allExpenses);
    } catch (e) {
        console.error('Expenses load failed:', e);
    }
}

async function addExpense(data) {
    const res = await fetch(`${API}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, user_id: USER_ID })
    });
    return await res.json();
}

async function deleteExpense(id) {
    const res = await fetch(`${API}/expenses/${id}`, { method: 'DELETE' });
    return await res.json();
}

async function updateBudget(amount) {
    const res = await fetch(`${API}/budget?user_id=${USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_budget: amount })
    });
    return await res.json();
}

async function loadCategoryBudgets() {
    try {
        const res = await fetch(`${API}/category-budgets?user_id=${USER_ID}`);
        const data = await res.json();
        const cats = ['Food', 'Transport', 'Subscriptions', 'Entertainment', 'Study Materials', 'Miscellaneous'];
        cats.forEach(cat => {
            const el = document.getElementById('cb-' + cat);
            if (el && data[cat] !== undefined) el.value = data[cat];
        });
    } catch (e) { console.error('Category budgets load failed:', e); }
}

async function saveCategoryBudgets(payload) {
    const res = await fetch(`${API}/category-budgets?user_id=${USER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return await res.json();
}

// ─────────────────────────────────────────────
// RENDER FUNCTIONS
// ─────────────────────────────────────────────

function renderSummaryCards(data) {
    setEl('monthly-total', `₹${fmt(data.monthly_total)}`);
    setEl('weekly-total', `₹${fmt(data.weekly_total)}`);
    setEl('budget-amount', `₹${fmt(data.budget)}`);

    // Show remaining correctly — negative means over budget
    const remaining = data.budget_remaining;
    const remainEl = document.getElementById('budget-remaining');
    if (remainEl) {
        if (remaining < 0) {
            remainEl.textContent = `-₹${fmt(Math.abs(remaining))}`;
            remainEl.style.color = '#FF6B6B';
        } else {
            remainEl.textContent = `₹${fmt(remaining)}`;
            remainEl.style.color = '#A8E6CF';
        }
    }

    // Also update form-remaining on Add tab
    const formRem = document.getElementById('form-remaining');
    if (formRem) {
        formRem.textContent = remaining < 0 ? `-₹${fmt(Math.abs(remaining))}` : `₹${fmt(remaining)}`;
        formRem.style.color = remaining < 0 ? '#FF6B6B' : '#e3e0f1';
    }

    const pct = Math.min((data.monthly_total / data.budget) * 100, 100);
    const bar = document.getElementById('budget-bar');
    if (bar) {
        bar.style.width = pct + '%';
        bar.style.background = pct > 90 ? '#FF6B6B' : pct > 70 ? '#FFE66D' : '#A8E6CF';
    }

    const budgetPct = document.getElementById('budget-pct');
    if (budgetPct) budgetPct.textContent = Math.round((data.monthly_total / data.budget) * 100) + '%';
}

function renderLeaks(leaks) {
    const container = document.getElementById('leaks-container');
    if (!container) return;

    if (!leaks || leaks.length === 0) {
        container.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid #2a2a45;border-radius:12px;padding:64px;text-align:center;">
                <div style="font-size:48px;margin-bottom:12px;">✅</div>
                <p style="color:#64748b;font-family:'Space Grotesk',sans-serif;">No expense leaks detected! You're doing great.</p>
            </div>`;
        return;
    }

    const borderColor = { high: '#FF6B6B', medium: '#FFE66D', low: '#A8E6CF' };
    const badgeBg    = { high: 'rgba(255,107,107,0.15)', medium: 'rgba(255,230,109,0.15)', low: 'rgba(168,230,207,0.15)' };
    const badgeColor = { high: '#FF6B6B', medium: '#FFE66D', low: '#A8E6CF' };

    container.innerHTML = leaks.map(leak => `
        <div style="background:#1a1a2e;border:1px solid #2a2a45;border-left:4px solid ${borderColor[leak.severity]};border-radius:12px;padding:20px 24px;transition:transform 0.2s;" onmouseover="this.style.transform='translateX(4px)'" onmouseout="this.style.transform='translateX(0)'">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="font-size:16px;">${severityIcon(leak.severity)}</span>
                <span style="font-weight:700;font-size:15px;font-family:'Space Grotesk',sans-serif;flex:1;">${leak.category}</span>
                <span style="font-size:10px;font-weight:700;padding:2px 10px;border-radius:4px;letter-spacing:1px;background:${badgeBg[leak.severity]};color:${badgeColor[leak.severity]};">${leak.severity.toUpperCase()}</span>
            </div>
            <p style="font-size:14px;color:#e3e0f1;line-height:1.5;margin-bottom:8px;font-family:'Space Grotesk',sans-serif;">${leak.message}</p>
            <p style="font-size:13px;color:#64748b;font-style:italic;font-family:'Space Grotesk',sans-serif;">💡 ${leak.tip}</p>
        </div>
    `).join('');
}

function renderExpenseTable(expenses) {
    const tbody = document.getElementById('expense-tbody');
    if (!tbody) return;

    if (expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:48px;color:#475569;font-family:'Space Grotesk',sans-serif;">No expenses found.</td></tr>`;
        return;
    }

    const catEmoji = { 'Food':'🍜','Transport':'🚌','Subscriptions':'📱','Entertainment':'🎬','Study Materials':'📚','Miscellaneous':'🛒' };

    tbody.innerHTML = expenses.map(e => `
        <tr style="border-top:1px solid #2a2a45;transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding:14px 24px;font-size:13px;color:#64748b;font-family:'Space Grotesk',sans-serif;">${e.date}</td>
            <td style="padding:14px 24px;">
                <span style="font-size:12px;font-weight:600;padding:3px 10px;border-radius:6px;background:rgba(78,205,196,0.1);color:#4ECDC4;font-family:'Space Grotesk',sans-serif;">
                    ${catEmoji[e.category] || '📌'} ${e.category}
                </span>
            </td>
            <td style="padding:14px 24px;font-size:14px;color:#bcc9c7;font-family:'Space Grotesk',sans-serif;">${e.description || '—'}</td>
            <td style="padding:14px 24px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;font-size:15px;color:#e3e0f1;">₹${fmt(e.amount)}</td>
            <td style="padding:14px 24px;">
                <button onclick="handleDelete(${e.id})" style="background:none;border:none;cursor:pointer;font-size:16px;opacity:0.4;transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'">🗑</button>
            </td>
        </tr>
    `).join('');
}

function renderCategoryChart(categories) {
    const canvas = document.getElementById('category-chart');
    if (!canvas || !categories || categories.length === 0) return;

    const labels = categories.map(c => c.category);
    const data = categories.map(c => c.total);
    const colors = ['#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF','#FF8B94','#C7CEEA'];

    if (spendChart) spendChart.destroy();

    spendChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#1a1a2e' }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#e0e0e0', font: { size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₹${fmt(ctx.raw)} (${((ctx.raw / data.reduce((a,b)=>a+b,0))*100).toFixed(1)}%)`
                    }
                }
            }
        }
    });
}

function renderTrendChart(daily) {
    const canvas = document.getElementById('trend-chart');
    if (!canvas || !daily || daily.length === 0) return;

    if (trendChart) trendChart.destroy();

    trendChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: daily.map(d => d.date.slice(5)),
            datasets: [{
                label: 'Daily Spend (₹)',
                data: daily.map(d => d.total),
                backgroundColor: 'rgba(78, 205, 196, 0.6)',
                borderColor: '#4ECDC4',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#e0e0e0' } } },
            scales: {
                x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#aaa', callback: v => '₹' + v }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

// ─────────────────────────────────────────────
// FORMS
// ─────────────────────────────────────────────

function setupExpenseForm() {
    const form = document.getElementById('expense-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        btn.textContent = 'Adding...';
        btn.disabled = true;

        const data = {
            amount: parseFloat(document.getElementById('exp-amount').value),
            category: document.getElementById('exp-category').value,
            description: document.getElementById('exp-description').value,
            date: document.getElementById('exp-date').value
        };

        const result = await addExpense(data);
        if (result.success) {
            showToast('✅ Expense added!');
            form.reset();
            document.getElementById('exp-date').value = today();
            await loadAll();
        } else {
            showToast('❌ Failed to add. Check fields.', 'error');
        }

        btn.textContent = 'Add Expense';
        btn.disabled = false;
    });

    // Set today's date as default
    const dateInput = document.getElementById('exp-date');
    if (dateInput) dateInput.value = today();
}

function setupBudgetForm() {
    const form = document.getElementById('budget-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('new-budget').value);
        if (!amount || amount < 100) return showToast('Enter a valid budget', 'error');

        const result = await updateBudget(amount);
        if (result.success) {
            showToast('✅ Budget updated!');
            await loadSummary();
        }
    });
}

function setupCatBudgetForm() {
    const form = document.getElementById('cat-budget-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cats = ['Food', 'Transport', 'Subscriptions', 'Entertainment', 'Study Materials', 'Miscellaneous'];
        const payload = {};
        let valid = true;
        cats.forEach(cat => {
            const el = document.getElementById('cb-' + cat);
            const val = parseFloat(el?.value);
            if (el?.value && !isNaN(val) && val >= 0) {
                payload[cat] = val;
            } else if (el?.value) {
                valid = false;
            }
        });
        if (!valid) return showToast('Enter valid amounts (numbers only)', 'error');
        if (Object.keys(payload).length === 0) return showToast('Enter at least one category budget', 'error');

        const btn = form.querySelector('button[type="submit"]');
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const result = await saveCategoryBudgets(payload);
        if (result.success) {
            showToast('✅ Category budgets saved! Leak detection updated.');
            await loadLeaks(); // re-run leak detection with new limits
        } else {
            showToast('❌ Failed to save', 'error');
        }
        btn.textContent = 'Save Category Budgets';
        btn.disabled = false;
    });
}

async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return;
    await deleteExpense(id);
    showToast('🗑 Expense removed');
    await loadAll();
}

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabName)?.classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function fmt(n) { return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function today() { return new Date().toISOString().split('T')[0]; }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function updateLeakBadge(count) { const b = document.getElementById('leak-badge'); if (b) { b.textContent = count; b.style.display = count > 0 ? 'inline' : 'none'; } }
function severityIcon(s) { return s === 'high' ? '🔴' : s === 'medium' ? '🟡' : '🟢'; }
function showLoading(show) { const el = document.getElementById('loading'); if (el) el.style.display = show ? 'flex' : 'none'; }

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2500);
}
