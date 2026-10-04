// All DOM rendering + modal + settings actions. No wiring of static buttons here (see main.js).
import { state, save, resetState, cur, catById, categoryName } from "./store.js";
import { esc, fmtKobo, koboToInput, parseAmountToKobo, todayLocal, addDaysStr, prevMonthKey, debounce, parseCsv, uid } from "./utils.js";
import { upsertExpense, deleteExpense, monthKey, expensesForMonth, sortedByRecency, sortTxns, PAYMENT_METHODS } from "./expenses.js";
import { pctUsed, statusFor, setMonthlyBudget, clearMonthlyBudget, setCategoryBudget } from "./budgets.js";
import { sumKobo, byCategory, totalsForMonth, dailyTotals } from "./reports.js";

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
  refreshReports();
  refreshSettings();
}
