// All DOM rendering + modal + settings actions. No wiring of static buttons here (see main.js).
import { state, save, resetState, cur, catById, categoryName } from "./store.js";
import { esc, fmtKobo, koboToInput, parseAmountToKobo, todayLocal, addDaysStr, prevMonthKey, debounce, parseCsv, uid } from "./utils.js";
import { upsertExpense, deleteExpense, monthKey, expensesForMonth, sortedByRecency, sortTxns, PAYMENT_METHODS } from "./expenses.js";
import { pctUsed, statusFor, setMonthlyBudget, clearMonthlyBudget, setCategoryBudget } from "./budgets.js";
import { sumKobo, byCategory, totalsForMonth, dailyTotals } from "./reports.js";
import { buildMonthGrid, shiftMonthKey } from "./calendar.js";
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
  const todays = state.expenses.filter((e) => e.date === t);
  const months = expensesForMonth(mk);
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

  const recent = sortedByRecency(state.expenses).slice(0, 5);
  document.getElementById("recent-list").innerHTML = recent.length
    ? recent.map(txnHtml).join("")
    : `<p class="muted">No transactions yet.</p>`;
  bindTxnButtons(document.getElementById("recent-list"));
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
  save();
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
  save();
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
      save();
      renderSavedFilters();
    };
  });
}

// ---------- Budget ----------
export function refreshBudget() {
  const mb = state.budgets.monthlyKobo;
  const mk = viewMonth;
  const mTotal = totalsForMonth(mk);
  document.getElementById("budget-monthly-display").textContent = mb ? fmtKobo(mb, cur()) : "Not set";
  document.getElementById("monthly-budget-input").value = mb ? koboToInput(mb) : "";
  const prog = document.getElementById("budget-monthly-progress");
  const alertEl = document.getElementById("budget-alert");
  if (mb && mb > 0) {
    const pct = pctUsed(mTotal, mb);
    prog.style.width = pct + "%";
    prog.className = "progress-fill" + (statusFor(pct) ? " " + statusFor(pct) : "");
    document.getElementById("budget-monthly-note").textContent = `Spent ${fmtKobo(mTotal, cur())} of ${fmtKobo(mb, cur())} (${pct}%)`;
    if (pct >= 100) {
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

  const catTotals = Object.fromEntries(byCategory(expensesForMonth(mk)));
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
  const ts = todayLocal();
  const ys = addDaysStr(ts, -1);
  const tTotal = sumKobo(state.expenses.filter((e) => e.date === ts));
  const yTotal = sumKobo(state.expenses.filter((e) => e.date === ys));
  document.getElementById("rep-today-yesterday").innerHTML =
    `<p>Today: <strong>${esc(fmtKobo(tTotal, cur()))}</strong><br/>Yesterday: <strong>${esc(fmtKobo(yTotal, cur()))}</strong><br/><span class="muted">${tTotal >= yTotal ? "Up" : "Down"} by ${esc(fmtKobo(Math.abs(tTotal - yTotal), cur()))}</span></p>`;

  const mk = monthKey(ts);
  const mTotal = totalsForMonth(mk);
  const pTotal = totalsForMonth(prevMonthKey(mk));
  document.getElementById("rep-month-compare").innerHTML =
    `<p>This month: <strong>${esc(fmtKobo(mTotal, cur()))}</strong><br/>Last month: <strong>${esc(fmtKobo(pTotal, cur()))}</strong></p>`;

  const sorted = byCategory(expensesForMonth(mk));
  document.getElementById("rep-top-cats").innerHTML = sorted.length
    ? sorted.slice(0, 5).map(([cid, total]) => `<div class="cat-row"><span>${esc(catById(cid).icon)} ${esc(catById(cid).name)}</span><strong>${esc(fmtKobo(total, cur()))}</strong></div>`).join("")
    : `<p class="muted">No data.</p>`;
  document.getElementById("rep-breakdown").innerHTML = sorted.length && mTotal > 0
    ? sorted.map(([cid, total]) => {
        const pct = Math.round((total / mTotal) * 100);
        return `<div style="margin:8px 0"><div class="row-between"><span>${esc(catById(cid).icon)} ${esc(catById(cid).name)}</span><span>${pct}% • ${esc(fmtKobo(total, cur()))}</span></div><div class="bar"><div style="width:${pct}%"></div></div></div>`;
      }).join("")
    : `<p class="muted">No data.</p>`;

  document.getElementById("rep-weekly").innerHTML = dailyTotals(ts, 7)
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
      deleteGoal(g.id);
      refreshAll();
    };
  });
}

export function saveGoalFromForm() {
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
  for (const e of state.expenses) {
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

  const dayList = state.expenses.filter((e) => e.date === calDay);
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
    b.onclick = () => { toggleRecurring(b.dataset.rectoggle); refreshAll(); };
  });
  root.querySelectorAll("[data-recdel]").forEach((b) => {
    b.onclick = () => {
      const r = getRecurring().find((x) => x.id === b.dataset.recdel);
      if (!r) return;
      if (!confirm(`Delete the "${r.name}" schedule? Past expenses stay.`)) return;
      deleteRecurring(r.id);
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

// ---------- Settings ----------
export function refreshSettings() {
  document.getElementById("set-name").value = state.user.name || "";
  document.getElementById("set-profile").value = state.user.profileType || "Personal";
  document.getElementById("set-currency").value = cur();
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
      save();
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
      save();
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
  save();
  refreshAll();
  setSettingsNote("Profile saved.");
}

export function addCategoryFromInputs() {
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
  save();
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
  const rows = [["id", "amount", "category", "description", "date", "time", "paymentMethod", "location", "notes"]];
  for (const e of state.expenses) {
    rows.push([e.id, ((Number(e.amountKobo) || 0) / 100).toString(), categoryName(e.categoryId),
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
        const now = new Date().toISOString();
        state.expenses.push({
          id: uid(), amountKobo: kobo, categoryId: match ? match.id : "other",
          description: idx("description") >= 0 ? (r[idx("description")] || "").slice(0, 120) : "",
          date, time: idx("time") >= 0 ? (r[idx("time")] || "").slice(0, 5) : "",
          paymentMethod: idx("paymentmethod") >= 0 && PAYMENT_METHODS.includes(r[idx("paymentmethod")]) ? r[idx("paymentmethod")] : "Cash",
          location: idx("location") >= 0 ? (r[idx("location")] || "").slice(0, 120) : "",
          notes: idx("notes") >= 0 ? (r[idx("notes")] || "").slice(0, 500) : "",
          createdAt: now, updatedAt: now,
        });
        ok++;
      }
      save();
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
  resetState();
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
  deleteExpense(id);
  closeExpenseModal();
  if (onSavedCallback) onSavedCallback();
}

// ---------- Combined refresh ----------
export function refreshAll() {
  refreshCategorySelects();
  refreshDashboard();
  refreshTransactions();
  refreshBudget();
  refreshSavings();
  refreshCalendar();
  refreshRecurring();
  refreshReports();
  refreshSettings();
}
