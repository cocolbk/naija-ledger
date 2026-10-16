// All DOM rendering + modal + settings actions. No wiring of static buttons here (see main.js).
import { state, save, resetState, cur, catById, categoryName, STORE_ERROR_MSG } from "./store.js";
import { esc, fmtKobo, koboToInput, parseAmountToKobo, todayLocal, addDaysStr, prevMonthKey, debounce, parseCsv, uid } from "./utils.js";
import { upsertExpense, deleteExpense, monthKey, expensesForMonth, sortedByRecency, sortTxns, inWallet, visibleExpenses, walletById, PAYMENT_METHODS } from "./expenses.js";
import { pctUsed, statusFor, setMonthlyBudget, clearMonthlyBudget, setCategoryBudget } from "./budgets.js";
import { sumKobo, byCategory, totalsForMonth, dailyTotals } from "./reports.js";
import { buildMonthGrid, shiftMonthKey } from "./calendar.js";
import {
  plans, priceFor, fmtPrice, effectivePlan, canUse,
  activateSubscription, recordPayment as recordBillingPayment, cancelSubscription, subscriptionLabel, defaultSubscription,
} from "./billing.js";
import { generateInsights } from "./insights.js";
import { getRecurring, FREQUENCIES, dueStatus, upsertRecurring, deleteRecurring, toggleRecurring, recordPayment } from "./recurring.js";
import { getGoals, getContributions, goalPct, remainingKobo, daysLeft, upsertGoal, deleteGoal, recordContribution, savingsTotals } from "./savings.js";

// ---------- Category selects ----------
export function refreshCategorySelects() {
  const opts = state.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`).join("");
  document.getElementById("exp-category").innerHTML = opts;
  const f = document.getElementById("f-category");
  const prev = f.value;
  f.innerHTML = `<option value="">All categories</option>` + opts;
  f.value = prev;
}

export function refreshWalletOptions() {
  const opts = `<option value="">All wallets</option>` + state.wallets
    .map((w) => `<option value="${esc(w.id)}">${esc(w.icon)} ${esc(w.name)}</option>`).join("");
  const f = document.getElementById("f-wallet");
  if (f) {
    const filterVal = currentFiltersSafe();
    f.innerHTML = opts;
    f.value = filterVal;
  }
  const sw = document.getElementById("wallet-switch");
  if (sw) {
    sw.innerHTML = opts;
    sw.value = state.activeWalletId || "";
  }
}

function currentFiltersSafe() {
  try { return document.getElementById("f-wallet").value || ""; }
  catch (e) { return ""; }
}

// ---------- Transactions ----------
export function txnHtml(e, selectable = false) {
  const c = catById(e.categoryId);
  const label = e.description || c.name;
  return `<div class="txn">
    ${selectable ? `<input type="checkbox" data-select="${esc(e.id)}" ${selectedIds.has(e.id) ? "checked" : ""} aria-label="Select ${esc(label)}" />` : ""}
    <div style="flex:1"><div>${esc(c.icon)} ${esc(label)}</div>
    <div class="muted">${esc(c.name)} • ${esc(e.date)}${e.time ? " " + esc(e.time) : ""} • ${esc(e.paymentMethod || "")}</div></div>
    <div style="text-align:right"><div class="amt">${esc(fmtKobo(e.amountKobo, cur()))}</div>
    <div><button class="btn link" data-edit="${esc(e.id)}">Edit</button></div></div>
  </div>`;
}

export function bindTxnButtons(root) {
  root.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => openExpenseModal(b.dataset.edit);
  });
  root.querySelectorAll("[data-select]").forEach((box) => {
    box.onchange = () => {
      if (box.checked) selectedIds.add(box.dataset.select);
      else selectedIds.delete(box.dataset.select);
      renderBulkBar();
    };
  });
  const more = root.querySelector("[data-more]");
  if (more) more.onclick = () => showMoreTransactions();
}

// ---------- View month (dashboard + budget follow this) ----------
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
let viewMonth = monthKey(todayLocal());

export function monthLabel(mk) {
  if (mk === monthKey(todayLocal())) return "This Month";
  const [y, m] = mk.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function shiftViewMonth(delta) {
  let [y, m] = viewMonth.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  viewMonth = `${y}-${String(m).padStart(2, "0")}`;
  refreshDashboard();
  refreshBudget();
}

export function resetViewMonth() {
  viewMonth = monthKey(todayLocal());
  refreshDashboard();
  refreshBudget();
}

// ---------- Dashboard ----------
export function refreshDashboard() {
  const t = todayLocal();
  const mk = viewMonth;
  const inScope = visibleExpenses();
  const todays = inScope.filter((e) => e.date === t);
  const months = inScope.filter((e) => monthKey(e.date) === mk);
  const tTotal = sumKobo(todays);
  const mTotal = sumKobo(months);

  document.getElementById("today-total").textContent = fmtKobo(tTotal, cur());
  document.getElementById("today-count").textContent = `${todays.length} transaction${todays.length === 1 ? "" : "s"}`;
  document.getElementById("month-total").textContent = fmtKobo(mTotal, cur());
  document.getElementById("month-title").textContent = `Monthly Spending — ${monthLabel(mk)}`;
  document.getElementById("month-reset").classList.toggle("hidden", mk === monthKey(todayLocal()));
  document.getElementById("cat-summary-title").textContent = `Category Summary (${monthLabel(mk)})`;

  const mb = state.budgets.monthlyKobo;
  const prog = document.getElementById("month-progress");
  if (mb && mb > 0) {
    const pct = pctUsed(mTotal, mb);
    const remaining = mb - mTotal;
    document.getElementById("month-budget-line").textContent = `Budget: ${fmtKobo(mb, cur())} • ${pct}% used`;
    document.getElementById("month-remaining").textContent = remaining >= 0
      ? `${fmtKobo(remaining, cur())} remaining` : `${fmtKobo(-remaining, cur())} over budget`;
    prog.style.width = pct + "%";
    prog.className = "progress-fill" + (statusFor(pct) ? " " + statusFor(pct) : "");
  } else {
    document.getElementById("month-budget-line").textContent = "No monthly budget set";
    document.getElementById("month-remaining").textContent = "";
    prog.style.width = "0%";
    prog.className = "progress-fill";
  }

  const sorted = byCategory(months);
  document.getElementById("category-summary").innerHTML = sorted.length
    ? sorted.map(([cid, total]) => {
        const c = catById(cid);
        const cb = state.budgets.categories[cid];
        const extra = cb ? ` / ${fmtKobo(cb, cur())}` : "";
        return `<div class="cat-row"><span>${esc(c.icon)} ${esc(c.name)}</span><strong>${esc(fmtKobo(total, cur()))}${esc(extra)}</strong></div>`;
      }).join("")
    : `<p class="muted">No spending this month yet. Tap + Add Expense.</p>`;

  const recent = sortedByRecency(inScope).slice(0, 5);
  document.getElementById("recent-list").innerHTML = recent.length
    ? recent.map(txnHtml).join("")
    : `<p class="muted">No transactions yet.</p>`;
  bindTxnButtons(document.getElementById("recent-list"));
}

export function refreshAvatar() {
  const el = document.getElementById("avatar-initial");
  if (!el) return;
  const name = (state.user.name || "").trim();
  el.textContent = name ? name[0].toUpperCase() : "👤";
}

// ---------- Transaction history + filters/sort/paging/bulk/saved ----------
const PAGE = 100;
let txnLimit = PAGE;
const selectedIds = new Set();

export function currentFilters() {
  return {
    q: document.getElementById("f-search").value,
    category: document.getElementById("f-category").value,
    payment: document.getElementById("f-payment").value,
    from: document.getElementById("f-from").value,
    to: document.getElementById("f-to").value,
    min: document.getElementById("f-min").value,
    max: document.getElementById("f-max").value,
    wallet: document.getElementById("f-wallet").value,
    sort: document.getElementById("f-sort").value || "newest",
  };
}

export function applyFiltersToInputs(f) {
  document.getElementById("f-search").value = f.q || "";
  document.getElementById("f-category").value = f.category || "";
  document.getElementById("f-payment").value = f.payment || "";
  document.getElementById("f-from").value = f.from || "";
  document.getElementById("f-to").value = f.to || "";
  document.getElementById("f-min").value = f.min || "";
  document.getElementById("f-max").value = f.max || "";
  const wsel = document.getElementById("f-wallet");
  if (wsel) wsel.value = f.wallet || "";
  document.getElementById("f-sort").value = f.sort || "newest";
}

export function filteredTxns() {
  const f = currentFilters();
  const q = (f.q || "").toLowerCase();
  const minK = parseAmountToKobo(f.min || "") ?? 0;
  const maxK = (f.max || "").trim() === "" ? Infinity : (parseAmountToKobo(f.max) ?? Infinity);
  const list = state.expenses.filter((e) => {
    const c = catById(e.categoryId);
    const hay = `${e.description || ""} ${c.name} ${e.location || ""} ${e.paymentMethod || ""}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (f.category && e.categoryId !== f.category) return false;
    if (f.wallet && (e.walletId || "main") !== f.wallet) return false;
    if (f.payment && e.paymentMethod !== f.payment) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if (e.amountKobo < minK || e.amountKobo > maxK) return false;
    return true;
  });
  return sortTxns(list, f.sort);
}

export function refreshTransactions(resetLimit = true) {
  if (resetLimit) txnLimit = PAGE;
  for (const id of [...selectedIds]) {
    if (!state.expenses.some((e) => e.id === id)) selectedIds.delete(id);
  }
  const list = filteredTxns();
  const el = document.getElementById("txn-list");
  const shown = list.slice(0, txnLimit);
  el.innerHTML = list.length
    ? `<p class="muted">${list.length} result${list.length === 1 ? "" : "s"} • Total: ${esc(fmtKobo(sumKobo(list), cur()))}</p>`
      + shown.map((e) => txnHtml(e, true)).join("")
      + (list.length > txnLimit
        ? `<button class="btn" data-more="1">Show ${Math.min(PAGE, list.length - txnLimit)} more (${list.length - txnLimit} remaining)</button>` : "")
    : `<p class="muted">No transactions match.</p>`;
  bindTxnButtons(el);
  renderBulkBar();
  renderSavedFilters();
}

export function showMoreTransactions() {
  txnLimit += PAGE;
  refreshTransactions(false);
}

export function showTodayTransactions() {
  applyFiltersToInputs({ from: todayLocal(), to: todayLocal(), sort: "newest" });
  txnLimit = PAGE;
  selectedIds.clear();
  refreshTransactions();
}

export function clearFilters() {
  applyFiltersToInputs({ sort: "newest" });
  selectedIds.clear();
  refreshTransactions();
}

// ---------- Bulk select + delete ----------
export function renderBulkBar() {
  const bar = document.getElementById("bulk-bar");
  if (!bar) return;
  bar.classList.toggle("hidden", selectedIds.size === 0);
  document.getElementById("bulk-count").textContent =
    `${selectedIds.size} selected • ${fmtKobo(sumKobo(state.expenses.filter((e) => selectedIds.has(e.id))), cur())}`;
}

export function bulkDeleteSelected() {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} selected expense${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
  state.expenses = state.expenses.filter((e) => !selectedIds.has(e.id));
  if (!persistOk()) return;
  selectedIds.clear();
  refreshAll();
}

// ---------- Saved filters ----------
function getSavedFilters() {
  if (!Array.isArray(state.savedFilters)) state.savedFilters = [];
  return state.savedFilters;
}

export function saveCurrentFilter() {
  const nameInput = document.getElementById("saved-name");
  const name = nameInput.value.trim().slice(0, 40);
  if (!name) { nameInput.setCustomValidity("Name this filter first."); nameInput.reportValidity(); return; }
  nameInput.setCustomValidity("");
  getSavedFilters().push({ id: uid(), name, filters: currentFilters() });
  nameInput.value = "";
  if (!persistOk()) return;
  renderSavedFilters();
}

export function renderSavedFilters() {
  const el = document.getElementById("saved-list");
  if (!el) return;
  const saved = getSavedFilters();
  el.innerHTML = saved.length
    ? saved.map((s) => `<span class="chip" style="cursor:default">${esc(s.name)}
        <button class="btn link" data-sapply="${esc(s.id)}">Apply</button>
        <button class="btn link" data-sdel="${esc(s.id)}" aria-label="Delete saved filter ${esc(s.name)}">✕</button></span>`).join("")
    : `<span class="muted">No saved filters yet.</span>`;
  el.querySelectorAll("[data-sapply]").forEach((b) => {
    b.onclick = () => {
      const s = getSavedFilters().find((x) => x.id === b.dataset.sapply);
      if (!s) return;
      applyFiltersToInputs(s.filters);
      selectedIds.clear();
      refreshTransactions();
    };
  });
  el.querySelectorAll("[data-sdel]").forEach((b) => {
    b.onclick = () => {
      state.savedFilters = getSavedFilters().filter((x) => x.id !== b.dataset.sdel);
      if (!persistOk()) return;
      renderSavedFilters();
    };
  });
}

// ---------- Budget ----------
export function refreshBudget() {
  const mb = state.budgets.monthlyKobo;
  const mk = viewMonth;
  const inScopeMonth = visibleExpenses().filter((e) => monthKey(e.date) === mk);
  const mTotal = sumKobo(inScopeMonth);
  document.getElementById("budget-monthly-display").textContent = mb ? fmtKobo(mb, cur()) : "Not set";
  document.getElementById("monthly-budget-input").value = mb ? koboToInput(mb) : "";
  const prog = document.getElementById("budget-monthly-progress");
  const alertEl = document.getElementById("budget-alert");
  if (mb && mb > 0) {
    const pct = pctUsed(mTotal, mb);
    prog.style.width = pct + "%";
    prog.className = "progress-fill" + (statusFor(pct) ? " " + statusFor(pct) : "");
    document.getElementById("budget-monthly-note").textContent = `Spent ${fmtKobo(mTotal, cur())} of ${fmtKobo(mb, cur())} (${pct}%)`;
    if (!canUse("alerts")) {
      alertEl.textContent = "";
      alertEl.className = "alert hidden";
    } else if (pct >= 100) {
      alertEl.textContent = `Monthly budget exceeded by ${fmtKobo(mTotal - mb, cur())}.`;
      alertEl.className = "alert danger";
    } else if (pct >= 80) {
      alertEl.textContent = `Heads up: you've used ${pct}% of your monthly budget.`;
      alertEl.className = "alert";
    } else {
      alertEl.textContent = "";
      alertEl.className = "alert hidden";
    }
  } else {
    prog.style.width = "0%";
    prog.className = "progress-fill";
    document.getElementById("budget-monthly-note").textContent = `Spent ${fmtKobo(mTotal, cur())} this month (no limit set).`;
    alertEl.textContent = "";
    alertEl.className = "alert hidden";
  }

  const catTotals = Object.fromEntries(byCategory(inScopeMonth));
  if (!canUse("categoryBudgets")) {
    document.getElementById("category-budgets").innerHTML = upgradeNudge("Category budgets");
    return;
  }
  document.getElementById("category-budgets").innerHTML = state.categories.map((c) => {
    const spent = catTotals[c.id] || 0;
    const b = state.budgets.categories[c.id] || "";
    const pct = b ? pctUsed(spent, b) : 0;
    const st = statusFor(pct);
    return `<div class="budget-row">
      <div style="flex:1"><div>${esc(c.icon)} ${esc(c.name)} — <span class="muted">${esc(fmtKobo(spent, cur()))}${b ? " of " + esc(fmtKobo(b, cur())) : ""}</span></div>
      ${b ? `<div class="bar"><div style="width:${pct}%;${st === "over" ? "background:var(--red)" : st === "warn" ? "background:var(--amber)" : ""}"></div></div>` : ""}</div>
      <input type="number" min="0" step="0.01" placeholder="Limit" data-cat-budget="${esc(c.id)}" value="${b ? esc(koboToInput(b)) : ""}" style="max-width:130px" aria-label="${esc(c.name)} budget limit" />
    </div>`;
  }).join("");
  const saveCat = debounce((input) => {
    const err = setCategoryBudget(input.dataset.catBudget, input.value);
    if (err) { input.setCustomValidity(err); input.reportValidity(); return; }
    input.setCustomValidity("");
    refreshDashboard();
    refreshBudget();
  }, 400);
  document.querySelectorAll("[data-cat-budget]").forEach((inp) => {
    inp.addEventListener("input", () => saveCat(inp));
  });
}

export function saveMonthlyBudgetFromInput() {
  const input = document.getElementById("monthly-budget-input");
  const err = setMonthlyBudget(input.value);
  if (err) {
    input.setCustomValidity(err);
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
  refreshAll();
}

// ---------- Reports ----------
export function refreshReports() {
  if (!canUse("reports")) {
    for (const id of ["insights-list", "rep-today-yesterday", "rep-month-compare", "rep-top-cats", "rep-weekly", "rep-breakdown"]) {
      document.getElementById(id).innerHTML = "";
    }
    document.getElementById("insights-list").innerHTML = upgradeNudge("Advanced reports and insights");
    return;
  }
  const ts = todayLocal();
  const inScope = visibleExpenses();
  const names = Object.fromEntries(state.categories.map((c) => [c.id, `${c.icon} ${c.name}`]));
  document.getElementById("insights-list").innerHTML = generateInsights({
    expenses: inScope, monthlyKobo: state.budgets.monthlyKobo, today: ts, currency: cur(), names,
  }).map((i) => `<div class="cat-row"><span>${esc(i.icon)}</span><span style="flex:1">${esc(i.text)}</span></div>`).join("");

  const ys = addDaysStr(ts, -1);
  const tTotal = sumKobo(inScope.filter((e) => e.date === ts));
  const yTotal = sumKobo(inScope.filter((e) => e.date === ys));
  document.getElementById("rep-today-yesterday").innerHTML =
    `<p>Today: <strong>${esc(fmtKobo(tTotal, cur()))}</strong><br/>Yesterday: <strong>${esc(fmtKobo(yTotal, cur()))}</strong><br/><span class="muted">${tTotal >= yTotal ? "Up" : "Down"} by ${esc(fmtKobo(Math.abs(tTotal - yTotal), cur()))}</span></p>`;

  const mk = monthKey(ts);
  const inScopeMonth = inScope.filter((e) => monthKey(e.date) === mk);
  const mTotal = sumKobo(inScopeMonth);
  const pTotal = sumKobo(inScope.filter((e) => monthKey(e.date) === prevMonthKey(mk)));
  document.getElementById("rep-month-compare").innerHTML =
    `<p>This month: <strong>${esc(fmtKobo(mTotal, cur()))}</strong><br/>Last month: <strong>${esc(fmtKobo(pTotal, cur()))}</strong></p>`;

  const sorted = byCategory(inScopeMonth);
  document.getElementById("rep-top-cats").innerHTML = sorted.length
    ? sorted.slice(0, 5).map(([cid, total]) => `<div class="cat-row"><span>${esc(catById(cid).icon)} ${esc(catById(cid).name)}</span><strong>${esc(fmtKobo(total, cur()))}</strong></div>`).join("")
    : `<p class="muted">No data.</p>`;
  document.getElementById("rep-breakdown").innerHTML = sorted.length && mTotal > 0
    ? sorted.map(([cid, total]) => {
        const pct = Math.round((total / mTotal) * 100);
        return `<div style="margin:8px 0"><div class="row-between"><span>${esc(catById(cid).icon)} ${esc(catById(cid).name)}</span><span>${pct}% • ${esc(fmtKobo(total, cur()))}</span></div><div class="bar"><div style="width:${pct}%"></div></div></div>`;
      }).join("")
    : `<p class="muted">No data.</p>`;

  document.getElementById("rep-weekly").innerHTML = dailyTotals(ts, 7, inScope)
    .map(({ date, total }) => `<div class="cat-row"><span>${esc(date)}</span><strong>${esc(fmtKobo(total, cur()))}</strong></div>`)
    .join("");
}

// ---------- Savings goals ----------
function goalFormError(msg) {
  const el = document.getElementById("goal-error");
  if (!msg) { el.textContent = ""; el.classList.add("hidden"); return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

export function resetGoalForm() {
  document.getElementById("goal-id").value = "";
  document.getElementById("goal-name").value = "";
  document.getElementById("goal-target").value = "";
  document.getElementById("goal-date").value = "";
  document.getElementById("goal-form-title").textContent = "New Savings Goal";
  document.getElementById("goal-cancel").classList.add("hidden");
  goalFormError(null);
}

export function refreshSavings() {
  if (!canUse("savings")) {
    document.getElementById("savings-summary-line").innerHTML = "";
    document.getElementById("goal-list").innerHTML = upgradeNudge("Savings goals");
    return;
  }
  const t = savingsTotals();
  document.getElementById("savings-summary-line").textContent = t.count
    ? `${t.count} goal${t.count === 1 ? "" : "s"} • ${fmtKobo(t.saved, cur())} saved of ${fmtKobo(t.target, cur())}`
    : "No goals yet. Create one below — rent, school fees, emergency fund, anything.";
  const goals = getGoals();
  document.getElementById("goal-list").innerHTML = goals.length
    ? goals.map((g) => {
        const pct = goalPct(g);
        const dl = daysLeft(g.targetDate, todayLocal());
        const dlText = dl === null ? "" : dl < 0 ? `${-dl} day${-dl === 1 ? "" : "s"} past target` : dl === 0 ? "target is today" : `${dl} day${dl === 1 ? "" : "s"} left`;
        const hist = getContributions(g.id).slice(0, 3);
        return `<div class="budget-row" style="display:block">
          <div class="row-between"><strong>${esc(g.name)}</strong>
          <span class="muted">${g.targetDate ? esc(g.targetDate) + (dlText ? " • " + esc(dlText) : "") : "No target date"}</span></div>
          <p class="big" style="font-size:22px">${esc(fmtKobo(g.savedKobo, cur()))} <span class="muted" style="font-size:13px">of ${esc(fmtKobo(g.targetKobo, cur()))} • ${pct}%</span></p>
          <div class="bar"><div style="width:${pct}%;${pct >= 100 ? "background:var(--gold)" : ""}"></div></div>
          <p class="muted">${remainingKobo(g) > 0 ? esc(fmtKobo(remainingKobo(g), cur())) + " to go" : "Goal reached. Well done."}</p>
          <div class="row">
            <button class="btn" data-gact="in" data-gid="${esc(g.id)}">Contribute</button>
            <button class="btn" data-gact="out" data-gid="${esc(g.id)}">Withdraw</button>
            <button class="btn link" data-gedit="${esc(g.id)}">Edit</button>
            <button class="btn link" data-gdel="${esc(g.id)}">Delete</button>
          </div>
          <div class="row hidden" id="grow-${esc(g.id)}">
            <input type="number" min="0.01" step="0.01" placeholder="Amount ₦" data-gamt="${esc(g.id)}" style="max-width:150px" />
            <input type="text" placeholder="Note (optional)" datagnote="${esc(g.id)}" maxlength="120" style="max-width:200px" />
            <button class="btn primary" data-gok="${esc(g.id)}">Confirm</button>
          </div>
          <p class="error-text hidden" id="gerr-${esc(g.id)}" role="alert"></p>
          ${hist.length ? `<div class="muted" style="font-size:12px">Recent: ${hist.map((c) => `${c.kobo < 0 ? "−" : "+"}${esc(fmtKobo(Math.abs(c.kobo), cur()))}${c.note ? " — " + esc(c.note) : ""}`).join(" • ")}</div>` : ""}
        </div>`;
      }).join("")
    : "";
  const list = document.getElementById("goal-list");
  list.querySelectorAll("[data-gact]").forEach((b) => {
    b.onclick = () => {
      const row = document.getElementById("grow-" + b.dataset.gid);
      const kind = b.dataset.gact;
      const willOpen = row.classList.contains("hidden") || row.dataset.kind !== kind;
      row.dataset.kind = kind;
      row.classList.toggle("hidden", !willOpen);
      if (willOpen) row.querySelector("[data-gamt]").focus();
    };
  });
  list.querySelectorAll("[data-gok]").forEach((b) => {
    b.onclick = () => {
      const gid = b.dataset.gok;
      const row = document.getElementById("grow-" + gid);
      const amt = row.querySelector("[data-gamt]").value;
      const noteVal = row.querySelector("[datagnote]").value;
      const err = recordContribution(gid, row.dataset.kind || "in", amt, noteVal);
      const errEl = document.getElementById("gerr-" + gid);
      if (err) { errEl.textContent = err; errEl.classList.remove("hidden"); return; }
      refreshAll();
    };
  });
  list.querySelectorAll("[data-gedit]").forEach((b) => {
    b.onclick = () => {
      const g = getGoals().find((x) => x.id === b.dataset.gedit);
      if (!g) return;
      document.getElementById("goal-id").value = g.id;
      document.getElementById("goal-name").value = g.name;
      document.getElementById("goal-target").value = koboToInput(g.targetKobo);
      document.getElementById("goal-date").value = g.targetDate || "";
      document.getElementById("goal-form-title").textContent = "Edit Savings Goal";
      document.getElementById("goal-cancel").classList.remove("hidden");
      document.getElementById("goal-name").focus();
      window.scrollTo({ top: document.getElementById("goal-name").getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
    };
  });
  list.querySelectorAll("[data-gdel]").forEach((b) => {
    b.onclick = () => {
      const g = getGoals().find((x) => x.id === b.dataset.gdel);
      if (!g) return;
      if (!confirm(`Delete goal "${g.name}" and its contribution history?`)) return;
      if (!deleteGoal(g.id)) { setSettingsNote(STORE_ERROR_MSG); return; }
      refreshAll();
    };
  });
}

export function saveGoalFromForm() {
  if (!canUse("savings")) { setSettingsNote("Savings goals need Premium or Business — see Plans."); return; }
  const res = upsertGoal({
    id: document.getElementById("goal-id").value || undefined,
    name: document.getElementById("goal-name").value,
    target: document.getElementById("goal-target").value,
    targetDate: document.getElementById("goal-date").value,
  });
  if (res.error) { goalFormError(res.error); return; }
  resetGoalForm();
  refreshAll();
}

// ---------- Calendar ----------
let calMonth = monthKey(todayLocal());
let calDay = todayLocal();

const CAL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function shiftCalMonth(delta) {
  calMonth = shiftMonthKey(calMonth, delta);
  refreshCalendar();
}

export function resetCalMonth() {
  calMonth = monthKey(todayLocal());
  calDay = todayLocal();
  refreshCalendar();
}

export function selectCalDay(dateStr) {
  calDay = dateStr;
  refreshCalendar();
}

export function refreshCalendar() {
  const [y, m] = calMonth.split("-").map(Number);
  document.getElementById("cal-title").textContent = `${CAL_MONTH_NAMES[m - 1]} ${y}`;
  document.getElementById("cal-reset").classList.toggle("hidden", calMonth === monthKey(todayLocal()));
  const today = todayLocal();
  const totals = {};
  for (const e of visibleExpenses()) {
    if (monthKey(e.date) === calMonth) totals[e.date] = (totals[e.date] || 0) + (Number(e.amountKobo) || 0);
  }
  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  document.getElementById("cal-grid").innerHTML =
    dows.map((d) => `<div class="cal-dow">${d}</div>`).join("") +
    buildMonthGrid(y, m).map((ds) => {
      if (!ds) return `<div class="cal-day blank" aria-hidden="true"></div>`;
      const dayNum = Number(ds.slice(8, 10));
      const cls = "cal-day" + (ds === today ? " today" : "") + (ds === calDay ? " selected" : "");
      const t = totals[ds] ? `<span class="t">${esc(fmtKobo(totals[ds], cur()))}</span>` : "";
      return `<button class="${cls}" data-calday="${ds}" role="gridcell" aria-label="${ds}${totals[ds] ? ", spent " + fmtKobo(totals[ds], cur()) : ", no spending"}"><span class="d">${dayNum}</span>${t}</button>`;
    }).join("");
  document.getElementById("cal-grid").querySelectorAll("[data-calday]").forEach((b) => {
    b.onclick = () => selectCalDay(b.dataset.calday);
  });

  const dayList = visibleExpenses().filter((e) => e.date === calDay);
  const dayTotal = sumKobo(dayList);
  document.getElementById("cal-day-title").textContent =
    calDay === today ? "Today" : calDay === addDaysStr(today, -1) ? "Yesterday" : calDay;
  document.getElementById("cal-day-total").textContent = fmtKobo(dayTotal, cur());
  const el = document.getElementById("cal-day-list");
  el.innerHTML = dayList.length
    ? `<p class="muted">${dayList.length} expense${dayList.length === 1 ? "" : "s"}</p>` + sortedByRecency(dayList).map((e) => txnHtml(e)).join("")
    : `<p class="muted">No expenses recorded for this day.</p>`;
  bindTxnButtons(el);
}

// ---------- Recurring ----------
const REC_STATUS = {
  overdue: { label: "Overdue", cls: "health" },
  due: { label: "Due today", cls: "home" },
  soon: { label: "Due soon", cls: "transport" },
  later: { label: "Scheduled", cls: "financial" },
  paused: { label: "Paused", cls: "other" },
};

// Map our status onto existing badge tints: other=grey, home=gold, transport=blue, financial=green.
function recRow(r) {
  const st = dueStatus(r, todayLocal());
  const badge = REC_STATUS[st];
  const freq = FREQUENCIES.find((f) => f.id === r.frequency);
  const freqLabel = r.frequency === "custom" ? `Every ${r.intervalDays} days` : (freq ? freq.label : r.frequency);
  return `<div class="budget-row" style="display:block;${r.active ? "" : "opacity:0.6"}">
    <div class="row-between"><strong>${esc(r.name)}</strong><span class="badge ${badge.cls}">${badge.label}</span></div>
    <p style="margin:4px 0"><span class="amt">${esc(fmtKobo(r.amountKobo, cur()))}</span>
    <span class="muted"> • ${esc(catById(r.categoryId).name)} • ${esc(freqLabel)} • next: ${esc(r.nextDue || "—")}</span></p>
    <div class="row">
      ${r.active ? `<button class="btn primary" data-recpay="${esc(r.id)}">Record payment</button>` : ""}
      <button class="btn link" data-recedit="${esc(r.id)}">Edit</button>
      <button class="btn link" data-rectoggle="${esc(r.id)}">${r.active ? "Pause" : "Resume"}</button>
      <button class="btn link" data-recdel="${esc(r.id)}">Delete</button>
    </div>
  </div>`;
}

function bindRecButtons(root) {
  root.querySelectorAll("[data-recpay]").forEach((b) => {
    b.onclick = () => { recordPayment(b.dataset.recpay); refreshAll(); };
  });
  root.querySelectorAll("[data-recedit]").forEach((b) => {
    b.onclick = () => {
      const r = getRecurring().find((x) => x.id === b.dataset.recedit);
      if (!r) return;
      document.getElementById("rec-id").value = r.id;
      document.getElementById("rec-name").value = r.name;
      document.getElementById("rec-amount").value = koboToInput(r.amountKobo);
      refreshRecCategorySelect();
      document.getElementById("rec-category").value = r.categoryId;
      document.getElementById("rec-freq").value = r.frequency;
      document.getElementById("rec-days").value = r.intervalDays || 30;
      document.getElementById("rec-days-wrap").classList.toggle("hidden", r.frequency !== "custom");
      document.getElementById("rec-next").value = r.nextDue || "";
      document.getElementById("rec-notes").value = r.notes || "";
      document.getElementById("rec-form-title").textContent = "Edit Recurring Expense";
      document.getElementById("rec-cancel").classList.remove("hidden");
      document.getElementById("rec-name").focus();
    };
  });
  root.querySelectorAll("[data-rectoggle]").forEach((b) => {
    b.onclick = () => {
      if (!toggleRecurring(b.dataset.rectoggle)) { setSettingsNote(STORE_ERROR_MSG); return; }
      refreshAll();
    };
  });
  root.querySelectorAll("[data-recdel]").forEach((b) => {
    b.onclick = () => {
      const r = getRecurring().find((x) => x.id === b.dataset.recdel);
      if (!r) return;
      if (!confirm(`Delete the "${r.name}" schedule? Past expenses stay.`)) return;
      if (!deleteRecurring(r.id)) { setSettingsNote(STORE_ERROR_MSG); return; }
      refreshAll();
    };
  });
}

export function refreshRecCategorySelect() {
  document.getElementById("rec-category").innerHTML = state.categories
    .map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`).join("");
}

function recFormError(msg) {
  const el = document.getElementById("rec-error");
  if (!msg) { el.textContent = ""; el.classList.add("hidden"); return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

export function resetRecForm() {
  document.getElementById("rec-id").value = "";
  document.getElementById("rec-name").value = "";
  document.getElementById("rec-amount").value = "";
  document.getElementById("rec-freq").value = "monthly";
  document.getElementById("rec-days").value = "30";
  document.getElementById("rec-days-wrap").classList.add("hidden");
  document.getElementById("rec-next").value = "";
  document.getElementById("rec-notes").value = "";
  document.getElementById("rec-form-title").textContent = "New Recurring Expense";
  document.getElementById("rec-cancel").classList.add("hidden");
  recFormError(null);
}

export function saveRecFromForm() {
  if (!canUse("recurring")) { setSettingsNote("Recurring expenses need Premium or Business — see Plans."); return; }
  const res = upsertRecurring({
    id: document.getElementById("rec-id").value || undefined,
    name: document.getElementById("rec-name").value,
    amount: document.getElementById("rec-amount").value,
    categoryId: document.getElementById("rec-category").value,
    frequency: document.getElementById("rec-freq").value,
    intervalDays: document.getElementById("rec-days").value,
    nextDue: document.getElementById("rec-next").value,
    notes: document.getElementById("rec-notes").value,
  });
  if (res.error) { recFormError(res.error); return; }
  resetRecForm();
  refreshAll();
}

export function refreshRecurring() {
  if (!canUse("recurring")) {
    document.getElementById("rec-due").innerHTML = upgradeNudge("Recurring expenses");
    document.getElementById("rec-list").innerHTML = "";
    return;
  }
  refreshRecCategorySelect();
  const today = todayLocal();
  const items = getRecurring();
  const order = { overdue: 0, due: 1, soon: 2, later: 3, paused: 4 };
  const dueNow = items.filter((r) => ["overdue", "due", "soon"].includes(dueStatus(r, today)))
    .sort((a, b) => order[dueStatus(a, today)] - order[dueStatus(b, today)] || (a.nextDue || "").localeCompare(b.nextDue || ""));
  const dueEl = document.getElementById("rec-due");
  dueEl.innerHTML = dueNow.length
    ? dueNow.map(recRow).join("")
    : `<p class="muted">Nothing due in the next 7 days. Well planned.</p>`;
  bindRecButtons(dueEl);
  const listEl = document.getElementById("rec-list");
  listEl.innerHTML = items.length
    ? [...items].sort((a, b) => (a.nextDue || "").localeCompare(b.nextDue || "")).map(recRow).join("")
    : `<p class="muted">No schedules yet. Add rent, electricity, internet, subscriptions below.</p>`;
  bindRecButtons(listEl);
}

// ---------- Wallets ----------
export function setActiveWallet(id) {
  state.activeWalletId = id || null;
  if (!persistOk()) return;
  refreshAll();
}

export function refreshWalletsSettings() {
  const el = document.getElementById("settings-wallets");
  if (!el) return;
  el.innerHTML = state.wallets.map((w) => {
    const n = state.expenses.filter((e) => (e.walletId || "main") === w.id).length;
    return `<div class="cat-row"><span>${esc(w.icon)} ${esc(w.name)} <span class="muted">(${n} expense${n === 1 ? "" : "s"})</span></span>
    <span><input data-wrename="${esc(w.id)}" value="${esc(w.name)}" maxlength="40" style="max-width:150px" aria-label="Rename ${esc(w.name)}" />
    <button class="btn link" data-wdel="${esc(w.id)}">Remove</button></span></div>`;
  }).join("");
  el.querySelectorAll("[data-wrename]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const w = walletById(inp.dataset.wrename);
      if (!w || !w.id || w.id !== inp.dataset.wrename) return;
      const v = inp.value.trim().slice(0, 40);
      if (!v) { inp.value = w.name; return; }
      w.name = v;
      if (!persistOk()) { inp.value = w.name; return; }
      refreshAll();
    });
  });
  el.querySelectorAll("[data-wdel]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.wdel;
      if (state.wallets.length <= 1) { setSettingsNote("Keep at least one wallet."); return; }
      if (state.expenses.some((e) => (e.walletId || "main") === id)) {
        setSettingsNote("Cannot remove a wallet that has expenses. Delete or reassign those first.");
        return;
      }
      if (!confirm("Remove this wallet?")) return;
      state.wallets = state.wallets.filter((w) => w.id !== id);
      if (state.activeWalletId === id) state.activeWalletId = null;
      if (!persistOk()) return;
      refreshAll();
    };
  });
}

export function addWalletFromInputs() {
  const name = document.getElementById("new-wallet-name").value.trim().slice(0, 40);
  const icon = document.getElementById("new-wallet-icon").value.trim() || "👛";
  if (!name) { setSettingsNote("Enter a wallet name."); return; }
  if (state.wallets.some((w) => w.name.toLowerCase() === name.toLowerCase())) {
    setSettingsNote("That wallet already exists.");
    return;
  }
  state.wallets.push({ id: uid(), name, icon });
  document.getElementById("new-wallet-name").value = "";
  document.getElementById("new-wallet-icon").value = "";
  if (!persistOk()) return;
  refreshAll();
}

// ---------- Plans & billing ----------
let billCycle = "monthly";
let coPlan = null;
let coMethod = "card";

const PLAN_FEATURES = {
  free: [
    "Record, edit and delete daily expenses",
    "Standard categories",
    "Daily and monthly summaries",
    "Search and view history",
    "Basic monthly budget",
  ],
  premium: [
    "Everything in Free",
    "Advanced reports, insights and comparisons",
    "Custom categories",
    "Category budgets and budget alerts",
    "Savings goals and progress tracking",
    "Recurring expense reminders",
    "Export records to CSV",
  ],
  business: [
    "Everything in Premium",
    "Business profile (name and type)",
    "Business expenses kept separate",
    "Stock, rent, salaries, utilities tracking",
    "Business budgets and spending limits",
    "Daily, weekly, monthly and yearly business reports",
  ],
};

const PLAN_META = {
  free: { name: "Free", tag: "For basic expense tracking", rec: "" },
  premium: { name: "Premium", tag: "For individuals who want more control", rec: "Recommended for individuals" },
  business: { name: "Business", tag: "For shops, freelancers and small businesses", rec: "Recommended for business owners" },
};

function planBadge(plan) {
  if (plan === "business") return `<span class="badge financial">🏢 BUSINESS</span>`;
  if (plan === "premium") return `<span class="badge home">👑 PREMIUM</span>`;
  return `<span class="badge other">FREE</span>`;
}

export function upgradeNudge(featureLabel) {
  return `<div class="card"><p><strong>🔒 ${esc(featureLabel)} is a paid feature.</strong></p>
    <p class="muted">Upgrade to Premium or Business to unlock it. Your existing records stay safe.</p>
    <div class="row"><button class="btn primary" data-goto="premium">View plans</button></div></div>`;
}

export function setBillCycle(c) {
  billCycle = c === "yearly" ? "yearly" : "monthly";
  renderPlans();
}

export function startCheckout(plan) {
  if (plan === "free") return;
  coPlan = plan;
  renderPlans();
  const el = document.getElementById("co-email");
  if (el) el.focus();
}

export function backCheckout() {
  coPlan = null;
  renderPlans();
}

function coMsg(msg, isError) {
  const el = document.getElementById("co-msg");
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "error-text" : "muted";
}

export function payWithTestMode() {
  if (!coPlan) return;
  const amount = priceFor(coPlan, billCycle);
  if (!recordBillingPayment({ ref: "TEST-" + uid(), plan: coPlan, cycle: billCycle, amountKobo: amount * 100, status: "test", method: coMethod })) {
    coMsg(STORE_ERROR_MSG, true);
    return;
  }
  if (!activateSubscription(coPlan, billCycle, "TEST", "test")) {
    coMsg(STORE_ERROR_MSG, true);
    return;
  }
  coPlan = null;
  refreshAll();
}

export function payWithPaystack() {
  if (!coPlan) return;
  const key = (plans().paystackPublicKey || "").trim();
  const email = (document.getElementById("co-email").value || "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    coMsg("Enter a valid email for your receipt.", true);
    return;
  }
  if (!key) {
    coMsg("Online payment is not set up yet (no Paystack public key). Use test mode below, or ask the administrator to add payment keys.", true);
    return;
  }
  coMsg("Opening secure Paystack checkout…", false);
  loadPaystackInline()
    .then(() => {
      const amount = priceFor(coPlan, billCycle);
      const handler = window.PaystackPop.setup({
        key,
        email,
        amount: Math.round(amount * 100),
        currency: "NGN",
        metadata: { plan: coPlan, cycle: billCycle },
        callback: (res) => onPaystackSuccess(res && res.reference),
        onClose: () => coMsg("Payment window closed. No charge was made.", false),
      });
      handler.openIframe();
    })
    .catch(() => coMsg("Could not load Paystack. Check your connection and try again.", true));
}

let paystackLoading = null;
function loadPaystackInline() {
  if (window.PaystackPop) return Promise.resolve();
  if (paystackLoading) return paystackLoading;
  paystackLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return paystackLoading;
}

function onPaystackSuccess(reference) {
  if (!reference) {
    coMsg("Payment completed but no reference was returned. Contact support with your receipt email.", true);
    return;
  }
  const amount = priceFor(coPlan, billCycle);
  recordBillingPayment({ ref: reference, plan: coPlan, cycle: billCycle, amountKobo: amount * 100, status: "pending_verification", method: coMethod });
  const verifyUrl = (plans().verifyUrl || "").trim();
  if (!verifyUrl) {
    state.subscription.status = "pending_verification";
    if (!save()) { coMsg(STORE_ERROR_MSG, true); return; }
    coMsg(`Payment received (ref ${reference}). It stays pending until the server verifies it — connect a verification endpoint to activate automatically.`, false);
    refreshAll();
    return;
  }
  coMsg("Verifying payment with the server…", false);
  fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference, plan: coPlan, cycle: billCycle, email: (document.getElementById("co-email").value || "").trim() }),
  })
    .then((r) => r.json())
    .then((j) => {
      if (j && j.verified) {
        if (!recordBillingPayment({ ref: reference, plan: coPlan, cycle: billCycle, amountKobo: amount * 100, status: "verified", method: coMethod })) {
          coMsg(STORE_ERROR_MSG, true);
          return;
        }
        if (!activateSubscription(coPlan, billCycle, reference, coMethod)) {
          coMsg(STORE_ERROR_MSG, true);
          return;
        }
        coPlan = null;
        refreshAll();
      } else {
        coMsg("Server could not verify this payment yet. Your reference is saved under Payment history.", true);
        refreshAll();
      }
    })
    .catch(() => {
      coMsg("Verification server unreachable. Your reference is saved — activation happens after verification.", true);
      refreshAll();
    });
}

export function cancelSubscriptionAndRefresh() {
  if (!confirm("Cancel your subscription? You keep access until the end of the paid period. Your records are never deleted.")) return;
  cancelSubscription();
  if (!persistOk()) return;
  refreshAll();
}

export function saveBusinessProfile() {
  if (!canUse("businessProfile")) {
    setSettingsNote("Business profiles need the Business plan.");
    return;
  }
  const name = document.getElementById("biz-name").value.trim().slice(0, 60);
  const type = document.getElementById("biz-type").value;
  if (!name) {
    setSettingsNote("Enter your business name.");
    return;
  }
  state.business = { name, type, updatedAt: new Date().toISOString() };
  if (!state.wallets.some((w) => w.id === "business")) {
    state.wallets.push({ id: "business", name: name + " (Business)", icon: "💼" });
  }
  if (!persistOk()) return;
  refreshAll();
}

function renderBizProfile() {
  const el = document.getElementById("biz-profile");
  if (!canUse("businessProfile")) {
    el.innerHTML = `<p class="muted">Business profiles are part of the <strong>Business</strong> plan.</p>
      <div class="row"><button class="btn primary" data-goto="premium">View plans</button></div>`;
    return;
  }
  const b = state.business || { name: "", type: "Shop / Retail" };
  el.innerHTML = `
    <label>Business name <input id="biz-name" type="text" value="${esc(b.name)}" maxlength="60" placeholder="e.g. Adaeze Fashion Store" /></label>
    <label>Business type
      <select id="biz-type">
        ${["Shop / Retail", "Freelancer", "Food & Drinks", "Services", "Fashion & Beauty", "Other"].map((t) => `<option ${t === b.type ? "selected" : ""}>${t}</option>`).join("")}
      </select>
    </label>
    <div class="row"><button id="biz-save" class="btn primary">Save business profile</button></div>`;
  document.getElementById("biz-save").onclick = saveBusinessProfile;
}

function renderPayHistory() {
  const el = document.getElementById("pay-history");
  const pays = Array.isArray(state.payments) ? state.payments : [];
  el.innerHTML = pays.length
    ? pays.slice(0, 20).map((p) => `<div class="cat-row"><span>${p.status === "verified" || p.status === "test" ? "✅" : p.status === "failed" ? "❌" : "⏳"} ${esc(p.plan)} (${esc(p.cycle)})</span><strong>${esc(fmtKobo(p.amountKobo, cur()))}</strong></div>
      <p class="muted" style="font-size:12px;margin:0 0 6px">${esc(p.date || "")}${p.ref ? " • ref " + esc(p.ref) : ""} • ${esc(p.status || "")}</p>`).join("")
    : `<p class="muted">No payments yet.</p>`;
}

export function renderPlans() {
  const eff = effectivePlan();
  const sub = state.subscription || defaultSubscription();
  document.getElementById("sub-badge").textContent = eff === "free" ? "Free" : eff.charAt(0).toUpperCase() + eff.slice(1);
  document.getElementById("sub-status").textContent = subscriptionLabel() +
    (eff === "free" && sub.plan !== "free" ? " Your records are untouched." : "");
  document.getElementById("cycle-monthly").classList.toggle("active", billCycle !== "yearly");
  document.getElementById("cycle-yearly").classList.toggle("active", billCycle === "yearly");
  document.getElementById("cycle-monthly").onclick = () => setBillCycle("monthly");
  document.getElementById("cycle-yearly").onclick = () => setBillCycle("yearly");

  const grid = document.getElementById("plans-grid");
  grid.innerHTML = ["free", "premium", "business"].map((p) => {
    const price = priceFor(p, billCycle);
    const per = billCycle === "yearly" ? "/year" : "/month";
    const isCurrent = eff === p;
    const m = PLAN_META[p];
    return `<div class="card" style="margin-bottom:0">
      <div class="row-between"><h3 style="margin:0">${m.name}</h3>${m.rec ? `<span class="badge home">${esc(m.rec)}</span>` : ""}</div>
      <p class="muted">${esc(m.tag)}</p>
      <p class="big">${esc(fmtPrice(price, cur()))}<span class="muted" style="font-size:14px">${per}</span></p>
      <p class="muted" style="font-size:13px">${PLAN_FEATURES[p].map((f) => "• " + esc(f)).join("<br />")}</p>
      ${isCurrent
        ? `<button class="btn" disabled>Current plan</button>`
        : p === "free"
          ? `<button class="btn" data-downgrade="1">Downgrade to Free</button>`
          : `<button class="btn primary" data-plan="${p}">Upgrade — ${esc(fmtPrice(price, cur()))}${per}</button>`}
    </div>`;
  }).join("");
  grid.querySelectorAll("[data-plan]").forEach((b) => { b.onclick = () => startCheckout(b.dataset.plan); });
  grid.querySelectorAll("[data-downgrade]").forEach((b) => {
    b.onclick = () => {
      if (!confirm("Switch to the Free plan? Paid features lock, but all your records stay.")) return;
      state.subscription = { plan: "free", cycle: "monthly", status: "active", since: todayLocal(), renews: null, ref: null, method: null };
      save();
      refreshAll();
    };
  });

  // Checkout card.
  const co = document.getElementById("checkout-card");
  if (coPlan) {
    co.classList.remove("hidden");
    const amount = priceFor(coPlan, billCycle);
    document.getElementById("co-title").textContent = `Checkout — ${coPlan.charAt(0).toUpperCase() + coPlan.slice(1)} (${billCycle})`;
    document.getElementById("co-summary").textContent =
      `${fmtPrice(amount, cur())} for ${billCycle === "yearly" ? "12 months" : "30 days"}. Renews automatically; cancel anytime.`;
    document.getElementById("co-method").value = coMethod;
    document.getElementById("co-method").onchange = (e) => { coMethod = e.target.value; };
    document.getElementById("co-back").onclick = backCheckout;
    document.getElementById("co-pay").onclick = payWithPaystack;
    document.getElementById("co-test").onclick = payWithTestMode;
    const key = (plans().paystackPublicKey || "").trim();
    if (!key) {
      document.getElementById("co-pay").disabled = true;
      coMsg("Online payment is not set up yet (no Paystack key in plans.json). You can still try a clearly-labelled test activation below.", false);
    } else {
      document.getElementById("co-pay").disabled = false;
    }
  } else {
    co.classList.add("hidden");
  }

  // Active plan management.
  let manage = document.getElementById("sub-manage");
  if (!manage) {
    manage = document.createElement("div");
    manage.id = "sub-manage";
    manage.className = "row";
    document.getElementById("sub-status").after(manage);
  }
  const s = state.subscription || defaultSubscription();
  if (s.plan !== "free" && (s.status === "active" || s.status === "pending_verification")) {
    manage.innerHTML = `<button id="sub-cancel" class="btn danger">Cancel subscription</button>`;
    document.getElementById("sub-cancel").onclick = cancelSubscriptionAndRefresh;
  } else {
    manage.innerHTML = "";
  }

  renderBizProfile();
  renderPayHistory();

  // Business snapshot: Business-category spending this month (all wallets).
  const mk = monthKey(todayLocal());
  const biz = state.expenses.filter((e) => e.categoryId === "business" && monthKey(e.date) === mk);
  const total = biz.reduce((sum, e) => sum + (Number(e.amountKobo) || 0), 0);
  const top = [...biz].sort((a, b) => b.amountKobo - a.amountKobo)[0];
  document.getElementById("biz-snap").innerHTML = biz.length
    ? `<p class="big">${esc(fmtKobo(total, cur()))}</p>
       <p class="muted">${biz.length} business expense${biz.length === 1 ? "" : "s"} this month${top ? ` • largest: ${esc(fmtKobo(top.amountKobo, cur()))}${top.description ? " — " + esc(top.description) : ""}` : ""}</p>
       ${canUse("businessReports") ? "" : `<p class="muted">Business reports unlock with the Business plan.</p>`}`
    : `<p class="muted">No business expenses recorded this month. Tag spending under the Business category to track it here.</p>`;

  // Export card (Premium+).
  const ex = document.getElementById("export-body");
  if (canUse("export")) {
    ex.innerHTML = `<div class="row">
        <button id="re-export-json" class="btn">Export JSON</button>
        <button id="re-export-csv" class="btn">Export CSV</button>
      </div>
      <p class="muted">Your records, yours to keep — included with paid plans.</p>`;
    document.getElementById("re-export-json").onclick = exportJson;
    document.getElementById("re-export-csv").onclick = exportCsv;
  } else {
    ex.innerHTML = `<p class="muted">Export to JSON and CSV is included with Premium and Business plans.</p>
      <div class="row"><button class="btn primary" data-goto="premium">View plans</button></div>`;
  }
}

// ---------- Storage health ----------
// Returns true when a save actually persisted. Shows a visible error otherwise,
// so a blocked/full browser store can never fail silently again.
export function persistOk() {
  if (save()) {
    updateStoreBanner(true);
    return true;
  }
  updateStoreBanner(false);
  setSettingsNote(STORE_ERROR_MSG);
  return false;
}

export function updateStoreBanner(ok) {
  const el = document.getElementById("store-banner");
  if (el) el.classList.toggle("hidden", !!ok);
}

// ---------- Settings ----------
export function refreshSettings() {
  document.getElementById("set-name").value = state.user.name || "";
  document.getElementById("set-profile").value = state.user.profileType || "Personal";
  document.getElementById("set-currency").value = cur();
  refreshWalletsSettings();
  if (!canUse("customCategories")) {
    document.getElementById("settings-categories").innerHTML =
      state.categories.map((c) => `<div class="cat-row"><span>${esc(c.icon)} ${esc(c.name)}</span></div>`).join("") +
      `<p class="muted">Custom categories (add, rename, remove) need Premium or Business.</p>
       <div class="row"><button class="btn primary" data-goto="premium">View plans</button></div>`;
    return;
  }
  document.getElementById("settings-categories").innerHTML = state.categories.map((c) => `
    <div class="cat-row"><span>${esc(c.icon)} ${esc(c.name)}${c.custom ? ' <span class="muted">(custom)</span>' : ""}</span>
    <span><input data-rename="${esc(c.id)}" value="${esc(c.name)}" maxlength="40" style="max-width:150px" aria-label="Rename ${esc(c.name)}" />
    <button class="btn link" data-delcat="${esc(c.id)}">Remove</button></span></div>
  `).join("");
  document.querySelectorAll("[data-rename]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const c = catById(inp.dataset.rename);
      if (!c || !c.id) return;
      const v = inp.value.trim();
      if (!v) { inp.value = c.name; return; }
      c.name = v.slice(0, 40);
      if (!persistOk()) { inp.value = c.name; return; }
      refreshAll();
    });
  });
  document.querySelectorAll("[data-delcat]").forEach((b) => {
    b.onclick = () => {
      if (state.expenses.some((e) => e.categoryId === b.dataset.delcat)) {
        setSettingsNote("Cannot remove a category that has transactions. Delete or reassign those first.");
        return;
      }
      if (!confirm("Remove this category?")) return;
      state.categories = state.categories.filter((c) => c.id !== b.dataset.delcat);
      if (!persistOk()) return;
      refreshAll();
    };
  });
}

export function setSettingsNote(msg) {
  let el = document.getElementById("settings-note");
  if (!el) return;
  el.textContent = msg;
}

export function saveProfileFromInputs() {
  state.user.name = document.getElementById("set-name").value.trim().slice(0, 60);
  state.user.profileType = document.getElementById("set-profile").value;
  state.user.currency = document.getElementById("set-currency").value.trim().slice(0, 3) || "₦";
  if (!persistOk()) return;
  refreshAll();
  setSettingsNote("Profile saved ✓ — it now shows on your avatar.");
}

export function addCategoryFromInputs() {
  if (!canUse("customCategories")) { setSettingsNote("Custom categories need Premium or Business — see Plans."); return; }
  const name = document.getElementById("new-cat-name").value.trim().slice(0, 40);
  const icon = document.getElementById("new-cat-icon").value.trim() || "📁";
  if (!name) { setSettingsNote("Enter a category name."); return; }
  if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    setSettingsNote("That category already exists.");
    return;
  }
  state.categories.push({ id: uid(), name, icon, group: "Custom", custom: true });
  document.getElementById("new-cat-name").value = "";
  document.getElementById("new-cat-icon").value = "";
  if (!persistOk()) return;
  refreshAll();
}

export function exportJson() {
  const payload = { app: "naija-ledger", version: 2, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "naija-ledger-export.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv() {
  const rows = [["id", "amount", "category", "wallet", "description", "date", "time", "paymentMethod", "location", "notes"]];
  for (const e of state.expenses) {
    rows.push([e.id, ((Number(e.amountKobo) || 0) / 100).toString(), categoryName(e.categoryId), walletById(e.walletId || "main").name,
      e.description || "", e.date, e.time || "", e.paymentMethod || "", e.location || "", e.notes || ""]);
  }
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "naija-ledger-export.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function importCsvFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCsv(String(reader.result || ""));
      if (!rows.length) { setSettingsNote("CSV is empty."); return; }
      const head = rows[0].map((h) => h.trim().toLowerCase());
      const need = ["amount", "category", "date"];
      if (!need.every((c) => head.includes(c))) {
        setSettingsNote("CSV must have amount, category and date columns (use an exported file).");
        return;
      }
      const idx = (n) => head.indexOf(n);
      let ok = 0, skipped = 0;
      for (const r of rows.slice(1)) {
        if (!r.length || r.every((c) => c === "")) continue;
        const kobo = parseAmountToKobo(r[idx("amount")] || "");
        const date = (r[idx("date")] || "").trim();
        if (kobo === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
        const catName = (r[idx("category")] || "").trim().toLowerCase();
        const match = state.categories.find((c) => c.name.toLowerCase() === catName);
        let walletId = state.activeWalletId || "main";
        if (idx("wallet") >= 0 && (r[idx("wallet")] || "").trim()) {
          const wmatch = state.wallets.find((w) => w.name.toLowerCase() === (r[idx("wallet")] || "").trim().toLowerCase());
          if (wmatch) walletId = wmatch.id;
        }
        const now = new Date().toISOString();
        state.expenses.push({
          id: uid(), amountKobo: kobo, categoryId: match ? match.id : "other", walletId,
          description: idx("description") >= 0 ? (r[idx("description")] || "").slice(0, 120) : "",
          date, time: idx("time") >= 0 ? (r[idx("time")] || "").slice(0, 5) : "",
          paymentMethod: idx("paymentmethod") >= 0 && PAYMENT_METHODS.includes(r[idx("paymentmethod")]) ? r[idx("paymentmethod")] : "Cash",
          location: idx("location") >= 0 ? (r[idx("location")] || "").slice(0, 120) : "",
          notes: idx("notes") >= 0 ? (r[idx("notes")] || "").slice(0, 500) : "",
          createdAt: now, updatedAt: now,
        });
        ok++;
      }
      if (!save()) { setSettingsNote(STORE_ERROR_MSG); return; }
      refreshAll();
      setSettingsNote(`Imported ${ok} expense${ok === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} invalid row${skipped === 1 ? "" : "s"}` : ""}.`);
    } catch (e) {
      setSettingsNote("Could not read that file.");
    }
  };
  reader.readAsText(file);
}

export function resetAllData() {
  if (!confirm("Reset ALL Naija Ledger data? This cannot be undone.")) return;
  if (!resetState()) { setSettingsNote(STORE_ERROR_MSG); return; }
  refreshAll();
  if (onResetCallback) onResetCallback();
}

let onResetCallback = null;
export function setResetHook(fn) {
  onResetCallback = fn;
}

// ---------- Expense modal ----------
const expModal = () => document.getElementById("expense-modal");
let expMode = "quick";
let lastFocused = null;
let onSavedCallback = null;

export function setRefreshHook(fn) {
  onSavedCallback = fn;
}

function modalError(msg) {
  const el = document.getElementById("exp-error");
  if (!el) return;
  if (!msg) { el.textContent = ""; el.classList.add("hidden"); return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

export function setExpMode(m) {
  expMode = m;
  document.getElementById("mode-quick").classList.toggle("active", m === "quick");
  document.getElementById("mode-detailed").classList.toggle("active", m === "detailed");
  document.getElementById("detailed-fields").style.display = m === "detailed" ? "block" : "none";
}

export function openExpenseModal(editId = null) {
  modalError(null);
  document.getElementById("exp-id").value = editId || "";
  document.getElementById("expense-modal-title").textContent = editId ? "Edit Expense" : "Add Expense";
  document.getElementById("expense-delete").classList.toggle("hidden", !editId);
  refreshCategorySelects();
  if (editId) {
    const e = state.expenses.find((x) => x.id === editId);
    if (!e) return;
    document.getElementById("exp-amount").value = koboToInput(e.amountKobo);
    document.getElementById("exp-category").value = e.categoryId;
    document.getElementById("exp-description").value = e.description || "";
    document.getElementById("exp-date").value = e.date;
    document.getElementById("exp-time").value = e.time || "";
    document.getElementById("exp-payment").value = PAYMENT_METHODS.includes(e.paymentMethod) ? e.paymentMethod : "Cash";
    document.getElementById("exp-location").value = e.location || "";
    document.getElementById("exp-notes").value = e.notes || "";
    setExpMode(e.location || e.notes || e.paymentMethod !== "Cash" ? "detailed" : "quick");
  } else {
    document.getElementById("exp-amount").value = "";
    document.getElementById("exp-description").value = "";
    document.getElementById("exp-date").value = todayLocal();
    document.getElementById("exp-time").value = "";
    document.getElementById("exp-payment").value = "Cash";
    document.getElementById("exp-location").value = "";
    document.getElementById("exp-notes").value = "";
    setExpMode("quick");
  }
  lastFocused = document.activeElement;
  expModal().classList.remove("hidden");
  document.getElementById("exp-amount").focus();
}

export function closeExpenseModal() {
  expModal().classList.add("hidden");
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

export function saveExpenseFromModal() {
  const res = upsertExpense({
    id: document.getElementById("exp-id").value || undefined,
    amount: document.getElementById("exp-amount").value,
    categoryId: document.getElementById("exp-category").value,
    description: document.getElementById("exp-description").value,
    date: document.getElementById("exp-date").value,
    time: document.getElementById("exp-time").value,
    paymentMethod: document.getElementById("exp-payment").value,
    location: document.getElementById("exp-location").value,
    notes: document.getElementById("exp-notes").value,
  });
  if (res.error) { modalError(res.error); return; }
  closeExpenseModal();
  if (onSavedCallback) onSavedCallback();
}

export function deleteExpenseFromModal() {
  const id = document.getElementById("exp-id").value;
  if (!id || !confirm("Delete this expense?")) return;
  if (!deleteExpense(id)) { modalError(STORE_ERROR_MSG); return; }
  closeExpenseModal();
  if (onSavedCallback) onSavedCallback();
}

// ---------- Combined refresh ----------
export function refreshAll() {
  refreshCategorySelects();
  refreshWalletOptions();
  refreshAvatar();
  refreshDashboard();
  refreshTransactions();
  refreshBudget();
  refreshSavings();
  refreshCalendar();
  refreshRecurring();
  renderPlans();
  refreshReports();
  refreshSettings();
}
