/* Naija Ledger MVP — vanilla JS + localStorage */
const LS_KEY = "naijaLedger.v1";

const DEFAULT_CATEGORIES = [
  { id: "food", name: "Food & Drinks", icon: "🍔", group: "Food & Drinks" },
  { id: "transport", name: "Transportation", icon: "🚌", group: "Transportation" },
  { id: "comms", name: "Communication", icon: "📱", group: "Communication" },
  { id: "home", name: "Home & Utilities", icon: "💡", group: "Home & Utilities" },
  { id: "personal", name: "Personal", icon: "👕", group: "Personal" },
  { id: "health", name: "Health", icon: "🏥", group: "Health" },
  { id: "education", name: "Education", icon: "📚", group: "Education" },
  { id: "family", name: "Family", icon: "👨‍👩‍👧", group: "Family" },
  { id: "financial", name: "Financial", icon: "💰", group: "Financial" },
  { id: "business", name: "Business", icon: "💼", group: "Business" },
  { id: "other", name: "Other", icon: "📦", group: "Other" },
];

const PROFILE_TYPES = ["Personal", "Student", "Family", "Business", "Personal + Business"];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function fmtMoney(n, cur = "₦") {
  n = Number(n) || 0;
  return cur + n.toLocaleString("en-NG");
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}
function defaultState() {
  return {
    user: { name: "", profileType: "Personal", currency: "₦", onboarded: false },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, custom: false })),
    expenses: [],
    budgets: { monthly: null, categories: {} },
    onboardDraft: { profileType: "Personal", categoryIds: DEFAULT_CATEGORIES.map((c) => c.id), budgetMode: "skip", monthly: "", catBudgets: {} },
  };
}
let state = loadState() || defaultState();
function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function cur() {
  return state.user.currency || "₦";
}
function catById(id) {
  return state.categories.find((c) => c.id === id) || { id, name: "Unknown", icon: "❓" };
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});
function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}
document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.goto)));

// ---------- Onboarding ----------
const overlay = document.getElementById("onboarding-overlay");
const stepsEl = document.getElementById("onboard-steps");
let step = 0;

function renderOnboarding() {
  if (state.user.onboarded) {
    overlay.classList.add("hidden");
    return;
  }
  overlay.classList.remove("hidden");
  const d = state.onboardDraft;
  if (step === 0) {
    stepsEl.innerHTML = `
      <h2>Welcome to Naija Ledger.</h2>
      <p>Track daily spending, understand monthly patterns, stay within budget.</p>
      <button class="btn primary" id="ob-next">Get Started</button>`;
    document.getElementById("ob-next").onclick = () => { step = 1; renderOnboarding(); };
  } else if (step === 1) {
    stepsEl.innerHTML = `
      <h2>Step 1/3 — How will you use the app?</h2>
      ${PROFILE_TYPES.map((p) => `<span class="chip ${d.profileType === p ? "selected" : ""}" data-p="${p}">${p}</span>`).join("")}
      <div class="row"><button class="btn primary" id="ob-next">Continue</button></div>`;
    stepsEl.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { d.profileType = c.dataset.p; save(); renderOnboarding(); }));
    document.getElementById("ob-next").onclick = () => { step = 2; renderOnboarding(); };
  } else if (step === 2) {
    stepsEl.innerHTML = `
      <h2>Step 2/3 — Select relevant categories</h2>
      <p class="muted">You can add, rename or remove these later.</p>
      ${DEFAULT_CATEGORIES.map((c) => `<span class="chip ${d.categoryIds.includes(c.id) ? "selected" : ""}" data-c="${c.id}">${c.icon} ${c.name}</span>`).join("")}
      <div class="row"><button class="btn" id="ob-back">Back</button><button class="btn primary" id="ob-next">Continue</button></div>`;
    stepsEl.querySelectorAll(".chip").forEach((c) => (c.onclick = () => {
      const id = c.dataset.c;
      d.categoryIds = d.categoryIds.includes(id) ? d.categoryIds.filter((x) => x !== id) : [...d.categoryIds, id];
      save(); renderOnboarding();
    }));
    document.getElementById("ob-back").onclick = () => { step = 1; renderOnboarding(); };
    document.getElementById("ob-next").onclick = () => { step = 3; renderOnboarding(); };
  } else {
    stepsEl.innerHTML = `
      <h2>Step 3/3 — Set a budget? (optional)</h2>
      <div class="row">
        ${["skip", "monthly", "category", "both"].map((m) => `<span class="chip ${d.budgetMode === m ? "selected" : ""}" data-m="${m}">${m}</span>`).join("")}
      </div>
      <div id="ob-budget-fields">
        <label>Monthly budget (₦) <input id="ob-monthly" type="number" min="0" value="${d.monthly || ""}" placeholder="e.g. 250000" /></label>
      </div>
      <div class="row"><button class="btn" id="ob-back">Back</button><button class="btn primary" id="ob-done">Start Tracking</button></div>`;
    stepsEl.querySelectorAll("[data-m]").forEach((c) => (c.onclick = () => { d.budgetMode = c.dataset.m; save(); renderOnboarding(); }));
    document.getElementById("ob-back").onclick = () => { step = 2; renderOnboarding(); };
    document.getElementById("ob-done").onclick = () => {
      d.monthly = document.getElementById("ob-monthly").value;
      // Apply draft
      state.user.profileType = d.profileType;
      state.user.onboarded = true;
      state.categories = DEFAULT_CATEGORIES.filter((c) => d.categoryIds.includes(c.id)).map((c) => ({ ...c, custom: false }));
      if (state.categories.length === 0) state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, custom: false }));
      if (["monthly", "both"].includes(d.budgetMode) && Number(d.monthly) > 0) {
        state.budgets.monthly = Number(d.monthly);
      }
      save();
      renderOnboarding();
      refreshAll();
    };
  }
}

// ---------- Expense modal ----------
const expModal = document.getElementById("expense-modal");
let expMode = "quick";

function openExpenseModal(editId = null) {
  document.getElementById("exp-id").value = editId || "";
  document.getElementById("expense-modal-title").textContent = editId ? "Edit Expense" : "Add Expense";
  document.getElementById("expense-delete").classList.toggle("hidden", !editId);
  refreshCategorySelects();
  if (editId) {
    const e = state.expenses.find((x) => x.id === editId);
    if (!e) return;
    document.getElementById("exp-amount").value = e.amount;
    document.getElementById("exp-category").value = e.categoryId;
    document.getElementById("exp-description").value = e.description || "";
    document.getElementById("exp-date").value = e.date;
    document.getElementById("exp-time").value = e.time || "";
    document.getElementById("exp-payment").value = e.paymentMethod || "Cash";
    document.getElementById("exp-location").value = e.location || "";
    document.getElementById("exp-notes").value = e.notes || "";
    setExpMode(e.location || e.notes || e.paymentMethod !== "Cash" ? "detailed" : "quick");
  } else {
    document.getElementById("exp-amount").value = "";
    document.getElementById("exp-description").value = "";
    document.getElementById("exp-date").value = todayStr();
    document.getElementById("exp-time").value = "";
    document.getElementById("exp-payment").value = "Cash";
    document.getElementById("exp-location").value = "";
    document.getElementById("exp-notes").value = "";
    setExpMode("quick");
  }
  expModal.classList.remove("hidden");
}
function setExpMode(m) {
  expMode = m;
  document.getElementById("mode-quick").classList.toggle("active", m === "quick");
  document.getElementById("mode-detailed").classList.toggle("active", m === "detailed");
  document.getElementById("detailed-fields").style.display = m === "detailed" ? "block" : "none";
}
document.getElementById("mode-quick").onclick = () => setExpMode("quick");
document.getElementById("mode-detailed").onclick = () => setExpMode("detailed");
document.getElementById("global-add-btn").onclick = () => openExpenseModal();
document.getElementById("expense-close").onclick = () => expModal.classList.add("hidden");
expModal.addEventListener("click", (e) => { if (e.target === expModal) expModal.classList.add("hidden"); });

document.getElementById("expense-save").onclick = () => {
  const id = document.getElementById("exp-id").value || uid();
  const amount = Number(document.getElementById("exp-amount").value);
  const categoryId = document.getElementById("exp-category").value;
  if (!amount || amount <= 0) { alert("Enter a valid amount."); return; }
  if (!categoryId) { alert("Select a category."); return; }
  const existing = state.expenses.find((x) => x.id === id);
  const obj = {
    id,
    amount,
    categoryId,
    description: document.getElementById("exp-description").value.trim(),
    date: document.getElementById("exp-date").value || todayStr(),
    time: document.getElementById("exp-time").value || "",
    paymentMethod: document.getElementById("exp-payment").value || "Cash",
    location: document.getElementById("exp-location").value.trim(),
    notes: document.getElementById("exp-notes").value.trim(),
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, obj);
  else state.expenses.push(obj);
  save();
  expModal.classList.add("hidden");
  refreshAll();
};
document.getElementById("expense-delete").onclick = () => {
  const id = document.getElementById("exp-id").value;
  if (!id || !confirm("Delete this expense?")) return;
  state.expenses = state.expenses.filter((x) => x.id !== id);
  save();
  expModal.classList.add("hidden");
  refreshAll();
};

// ---------- Category selects ----------
function refreshCategorySelects() {
  const opts = state.categories.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  document.getElementById("exp-category").innerHTML = opts;
  const f = document.getElementById("f-category");
  const prev = f.value;
  f.innerHTML = `<option value="">All categories</option>` + opts;
  f.value = prev;
}

// ---------- Dashboard / lists ----------
function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}
function expensesForMonth(key) {
  return state.expenses.filter((e) => monthKey(e.date) === key);
}

function refreshDashboard() {
  const t = todayStr();
  const mk = monthKey(t);
  const todays = state.expenses.filter((e) => e.date === t);
  const months = expensesForMonth(mk);
  const tTotal = todays.reduce((s, e) => s + e.amount, 0);
  const mTotal = months.reduce((s, e) => s + e.amount, 0);

  document.getElementById("today-total").textContent = fmtMoney(tTotal, cur());
  document.getElementById("today-count").textContent = `${todays.length} transaction${todays.length === 1 ? "" : "s"}`;
  document.getElementById("month-total").textContent = fmtMoney(mTotal, cur());

  const mb = state.budgets.monthly;
  const prog = document.getElementById("month-progress");
  if (mb && mb > 0) {
    const pct = Math.min(100, Math.round((mTotal / mb) * 100));
    const remaining = mb - mTotal;
    document.getElementById("month-budget-line").textContent = `Budget: ${fmtMoney(mb, cur())} • ${pct}% used`;
    document.getElementById("month-remaining").textContent = remaining >= 0 ? `${fmtMoney(remaining, cur())} remaining` : `${fmtMoney(-remaining, cur())} over budget`;
    prog.style.width = pct + "%";
    prog.className = "progress-fill" + (pct >= 100 ? " over" : pct >= 80 ? " warn" : "");
  } else {
    document.getElementById("month-budget-line").textContent = "No monthly budget set";
    document.getElementById("month-remaining").textContent = "";
    prog.style.width = "0%";
  }

  // Category summary
  const byCat = {};
  months.forEach((e) => { byCat[e.categoryId] = (byCat[e.categoryId] || 0) + e.amount; });
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  document.getElementById("category-summary").innerHTML = sorted.length
    ? sorted.map(([cid, total]) => {
        const c = catById(cid);
        const cb = state.budgets.categories[cid];
        const extra = cb ? ` / ${fmtMoney(cb, cur())}` : "";
        return `<div class="cat-row"><span>${c.icon} ${c.name}</span><strong>${fmtMoney(total, cur())}${extra}</strong></div>`;
      }).join("")
    : `<p class="muted">No spending this month yet. Tap + Add Expense.</p>`;

  // Recent
  const recent = [...state.expenses].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || ""))).slice(0, 5);
  document.getElementById("recent-list").innerHTML = recent.length
    ? recent.map(txnHtml).join("")
    : `<p class="muted">No transactions yet.</p>`;
  bindTxnButtons(document.getElementById("recent-list"));
}

function txnHtml(e) {
  const c = catById(e.categoryId);
  return `<div class="txn">
    <div><div>${c.icon} ${e.description || c.name}</div>
    <div class="muted">${c.name} • ${e.date}${e.time ? " " + e.time : ""} • ${e.paymentMethod || ""}</div></div>
    <div style="text-align:right"><div class="amt">${fmtMoney(e.amount, cur())}</div>
    <div><button class="btn link" data-edit="${e.id}">Edit</button></div></div>
  </div>`;
}
function bindTxnButtons(root) {
  root.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openExpenseModal(b.dataset.edit)));
}

// ---------- Transactions + filters ----------
["f-search", "f-category", "f-payment", "f-from", "f-to", "f-min", "f-max"].forEach((id) =>
  document.getElementById(id).addEventListener("input", refreshTransactions)
);
document.getElementById("f-clear").onclick = () => {
  ["f-search", "f-category", "f-payment", "f-from", "f-to", "f-min", "f-max"].forEach((id) => (document.getElementById(id).value = ""));
  refreshTransactions();
};

function refreshTransactions() {
  const q = document.getElementById("f-search").value.toLowerCase();
  const fc = document.getElementById("f-category").value;
  const fp = document.getElementById("f-payment").value;
  const from = document.getElementById("f-from").value;
  const to = document.getElementById("f-to").value;
  const min = Number(document.getElementById("f-min").value) || 0;
  const max = Number(document.getElementById("f-max").value) || Infinity;

  let list = [...state.expenses].sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  list = list.filter((e) => {
    const c = catById(e.categoryId);
    const hay = `${e.description || ""} ${c.name} ${e.location || ""} ${e.paymentMethod || ""}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (fc && e.categoryId !== fc) return false;
    if (fp && e.paymentMethod !== fp) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (e.amount < min || e.amount > max) return false;
    return true;
  });
  const el = document.getElementById("txn-list");
  el.innerHTML = list.length
    ? `<p class="muted">${list.length} result${list.length === 1 ? "" : "s"} • Total: ${fmtMoney(list.reduce((s, e) => s + e.amount, 0), cur())}</p>` + list.map(txnHtml).join("")
    : `<p class="muted">No transactions match.</p>`;
  bindTxnButtons(el);
}

// ---------- Budget ----------
document.getElementById("save-monthly-budget").onclick = () => {
  const v = Number(document.getElementById("monthly-budget-input").value);
  if (!v || v <= 0) { alert("Enter a valid budget amount."); return; }
  state.budgets.monthly = v;
  save(); refreshAll();
};
document.getElementById("clear-monthly-budget").onclick = () => {
  state.budgets.monthly = null;
  save(); refreshAll();
};

function refreshBudget() {
  const mb = state.budgets.monthly;
  const mk = monthKey(todayStr());
  const mTotal = expensesForMonth(mk).reduce((s, e) => s + e.amount, 0);
  document.getElementById("budget-monthly-display").textContent = mb ? fmtMoney(mb, cur()) : "Not set";
  document.getElementById("monthly-budget-input").value = mb || "";
  const prog = document.getElementById("budget-monthly-progress");
  const alertEl = document.getElementById("budget-alert");
  if (mb && mb > 0) {
    const pct = Math.min(100, Math.round((mTotal / mb) * 100));
    prog.style.width = pct + "%";
    prog.className = "progress-fill" + (pct >= 100 ? " over" : pct >= 80 ? " warn" : "");
    document.getElementById("budget-monthly-note").textContent = `Spent ${fmtMoney(mTotal, cur())} of ${fmtMoney(mb, cur())} (${pct}%)`;
    if (pct >= 100) {
      alertEl.textContent = `⚠️ Monthly budget exceeded by ${fmtMoney(mTotal - mb, cur())}.`;
      alertEl.className = "alert danger";
    } else if (pct >= 80) {
      alertEl.textContent = `Heads up: you've used ${pct}% of your monthly budget.`;
      alertEl.className = "alert";
    } else {
      alertEl.className = "alert hidden";
    }
  } else {
    prog.style.width = "0%";
    document.getElementById("budget-monthly-note").textContent = `Spent ${fmtMoney(mTotal, cur())} this month (no limit set).`;
    alertEl.className = "alert hidden";
  }

  // Category budgets
  const byCat = {};
  expensesForMonth(mk).forEach((e) => { byCat[e.categoryId] = (byCat[e.categoryId] || 0) + e.amount; });
  document.getElementById("category-budgets").innerHTML = state.categories.map((c) => {
    const spent = byCat[c.id] || 0;
    const b = state.budgets.categories[c.id] || "";
    const pct = b ? Math.min(100, Math.round((spent / b) * 100)) : 0;
    return `<div class="budget-row">
      <div style="flex:1"><div>${c.icon} ${c.name} — <span class="muted">${fmtMoney(spent, cur())}${b ? " of " + fmtMoney(b, cur()) : ""}</span></div>
      ${b ? `<div class="bar"><div style="width:${pct}%;${pct >= 100 ? "background:var(--red)" : pct >= 80 ? "background:var(--amber)" : ""}"></div></div>` : ""}</div>
      <input type="number" min="0" placeholder="Limit" data-cat-budget="${c.id}" value="${b}" style="max-width:130px" />
    </div>`;
  }).join("");
  document.querySelectorAll("[data-cat-budget]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const v = Number(inp.value);
      if (v > 0) state.budgets.categories[inp.dataset.catBudget] = v;
      else delete state.budgets.categories[inp.dataset.catBudget];
      save(); refreshAll();
    });
  });
}

// ---------- Reports (basic) ----------
function refreshReports() {
  const t = new Date();
  const ts = todayStr(t);
  const y = new Date(t); y.setDate(y.getDate() - 1);
  const ys = todayStr(y);
  const sum = (arr) => arr.reduce((s, e) => s + e.amount, 0);
  const tTotal = sum(state.expenses.filter((e) => e.date === ts));
  const yTotal = sum(state.expenses.filter((e) => e.date === ys));
  document.getElementById("rep-today-yesterday").innerHTML = `<p>Today: <strong>${fmtMoney(tTotal, cur())}</strong><br/>Yesterday: <strong>${fmtMoney(yTotal, cur())}</strong><br/><span class="muted">${tTotal >= yTotal ? "Up" : "Down"} by ${fmtMoney(Math.abs(tTotal - yTotal), cur())}</span></p>`;

  const mk = ts.slice(0, 7);
  const prev = new Date(t.getFullYear(), t.getMonth() - 1, 1).toISOString().slice(0, 7);
  const mTotal = sum(expensesForMonth(mk));
  const pTotal = sum(expensesForMonth(prev));
  document.getElementById("rep-month-compare").innerHTML = `<p>This month: <strong>${fmtMoney(mTotal, cur())}</strong><br/>Last month: <strong>${fmtMoney(pTotal, cur())}</strong></p>`;

  const byCat = {};
  expensesForMonth(mk).forEach((e) => { byCat[e.categoryId] = (byCat[e.categoryId] || 0) + e.amount; });
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 1;
  document.getElementById("rep-top-cats").innerHTML = sorted.length
    ? sorted.slice(0, 5).map(([cid, total]) => `<div class="cat-row"><span>${catById(cid).icon} ${catById(cid).name}</span><strong>${fmtMoney(total, cur())}</strong></div>`).join("")
    : `<p class="muted">No data.</p>`;
  document.getElementById("rep-breakdown").innerHTML = sorted.length
    ? sorted.map(([cid, total]) => {
        const pct = Math.round((total / mTotal) * 100);
        return `<div style="margin:8px 0"><div class="row-between"><span>${catById(cid).icon} ${catById(cid).name}</span><span>${pct}% • ${fmtMoney(total, cur())}</span></div><div class="bar"><div style="width:${pct}%"></div></div></div>`;
      }).join("")
    : `<p class="muted">No data.</p>`;

  let week = "";
  for (let i = 6; i >= 0; i--) {
    const d = new Date(t); d.setDate(d.getDate() - i);
    const ds = todayStr(d);
    const total = sum(state.expenses.filter((e) => e.date === ds));
    week += `<div class="cat-row"><span>${ds}</span><strong>${fmtMoney(total, cur())}</strong></div>`;
  }
  document.getElementById("rep-weekly").innerHTML = week || `<p class="muted">No data. Max was ${fmtMoney(max, cur())}.</p>`;
}

// ---------- Settings ----------
function refreshSettings() {
  document.getElementById("set-name").value = state.user.name || "";
  document.getElementById("set-profile").value = state.user.profileType || "Personal";
  document.getElementById("set-currency").value = cur();
  document.getElementById("settings-categories").innerHTML = state.categories.map((c) => `
    <div class="cat-row"><span>${c.icon} ${c.name}${c.custom ? ' <span class="muted">(custom)</span>' : ""}</span>
    <span><button class="btn link" data-rename="${c.id}">Rename</button> <button class="btn link" data-delcat="${c.id}">Remove</button></span></div>
  `).join("");
  document.querySelectorAll("[data-rename]").forEach((b) => (b.onclick = () => {
    const c = catById(b.dataset.rename);
    const v = prompt("Rename category:", c.name);
    if (v && v.trim()) { c.name = v.trim(); save(); refreshAll(); }
  }));
  document.querySelectorAll("[data-delcat]").forEach((b) => (b.onclick = () => {
    if (state.expenses.some((e) => e.categoryId === b.dataset.delcat)) { alert("Cannot remove a category that has transactions. Reassign or delete those first."); return; }
    if (!confirm("Remove this category?")) return;
    state.categories = state.categories.filter((c) => c.id !== b.dataset.delcat);
    save(); refreshAll();
  }));
}
document.getElementById("save-profile").onclick = () => {
  state.user.name = document.getElementById("set-name").value.trim();
  state.user.profileType = document.getElementById("set-profile").value;
  state.user.currency = document.getElementById("set-currency").value.trim() || "₦";
  save(); refreshAll();
  alert("Profile saved.");
};
document.getElementById("add-category").onclick = () => {
  const name = document.getElementById("new-cat-name").value.trim();
  const icon = document.getElementById("new-cat-icon").value.trim() || "📁";
  if (!name) { alert("Enter a category name."); return; }
  state.categories.push({ id: uid(), name, icon, group: "Custom", custom: true });
  document.getElementById("new-cat-name").value = "";
  document.getElementById("new-cat-icon").value = "";
  save(); refreshAll();
};
document.getElementById("export-json").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "naija-ledger-export.json";
  a.click();
};
document.getElementById("export-csv").onclick = () => {
  const rows = [["id", "amount", "category", "description", "date", "time", "paymentMethod", "location", "notes"]];
  state.expenses.forEach((e) => rows.push([e.id, e.amount, catById(e.categoryId).name, `"${(e.description || "").replace(/"/g, '""')}"`, e.date, e.time || "", e.paymentMethod || "", `"${(e.location || "").replace(/"/g, '""')}"`, `"${(e.notes || "").replace(/"/g, '""')}"`]));
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "naija-ledger-export.csv";
  a.click();
};
document.getElementById("reset-data").onclick = () => {
  if (!confirm("Reset ALL Naija Ledger data? This cannot be undone.")) return;
  localStorage.removeItem(LS_KEY);
  state = defaultState();
  save();
  step = 0;
  refreshAll();
};

// ---------- Boot ----------
function refreshAll() {
  refreshCategorySelects();
  refreshDashboard();
  refreshTransactions();
  refreshBudget();
  refreshReports();
  refreshSettings();
  renderOnboarding();
}
refreshAll();
