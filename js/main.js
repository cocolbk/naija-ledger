// Entry point: tabs, theme, onboarding, static control wiring, boot.
import { state, save, PROFILE_TYPES, DEFAULT_CATEGORIES } from "./store.js";
import { parseAmountToKobo } from "./utils.js";
import { clearMonthlyBudget } from "./budgets.js";
import {
  refreshAll, refreshTransactions, clearFilters, showTodayTransactions,
  openExpenseModal, closeExpenseModal, setExpMode, saveExpenseFromModal, deleteExpenseFromModal,
  saveMonthlyBudgetFromInput, saveProfileFromInputs, addCategoryFromInputs,
  exportJson, exportCsv, importCsvFile, resetAllData,
  shiftViewMonth, resetViewMonth, bulkDeleteSelected, saveCurrentFilter,
  saveGoalFromForm, resetGoalForm, shiftCalMonth, resetCalMonth,
  saveRecFromForm, resetRecForm, setActiveWallet, addWalletFromInputs,
  setRefreshHook, setResetHook,
} from "./ui.js";

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});
export function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}
document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.filterToday) showTodayTransactions();
  showTab(b.dataset.goto);
}));

// ---------- Theme ----------
function applyTheme() {
  const t = (state.user && state.user.theme) || "auto";
  const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = dark ? "☀️" : "🌙";
}
document.getElementById("theme-toggle").onclick = () => {
  state.user.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  save();
  applyTheme();
};
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

// ---------- Onboarding ----------
const overlay = document.getElementById("onboarding-overlay");
const stepsEl = document.getElementById("onboard-steps");
let step = 0;

export function renderOnboarding() {
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
    stepsEl.querySelectorAll(".chip").forEach((c) => {
      c.onclick = () => { d.profileType = c.dataset.p; save(); renderOnboarding(); };
    });
    document.getElementById("ob-next").onclick = () => { step = 2; renderOnboarding(); };
  } else if (step === 2) {
    stepsEl.innerHTML = `
      <h2>Step 2/3 — Select relevant categories</h2>
      <p class="muted">You can add, rename or remove these later.</p>
      ${DEFAULT_CATEGORIES.map((c) => `<span class="chip ${d.categoryIds.includes(c.id) ? "selected" : ""}" data-c="${c.id}">${c.icon} ${c.name}</span>`).join("")}
      <div class="row"><button class="btn" id="ob-back">Back</button><button class="btn primary" id="ob-next">Continue</button></div>`;
    stepsEl.querySelectorAll(".chip").forEach((c) => {
      c.onclick = () => {
        const id = c.dataset.c;
        d.categoryIds = d.categoryIds.includes(id) ? d.categoryIds.filter((x) => x !== id) : [...d.categoryIds, id];
        save();
        renderOnboarding();
      };
    });
    document.getElementById("ob-back").onclick = () => { step = 1; renderOnboarding(); };
    document.getElementById("ob-next").onclick = () => { step = 3; renderOnboarding(); };
  } else {
    stepsEl.innerHTML = `
      <h2>Step 3/3 — Set a budget? (optional)</h2>
      <div class="row">
        ${["skip", "monthly", "category", "both"].map((m) => `<span class="chip ${d.budgetMode === m ? "selected" : ""}" data-m="${m}">${m}</span>`).join("")}
      </div>
      <div id="ob-budget-fields">
        <label>Monthly budget (₦) <input id="ob-monthly" type="number" min="0" step="0.01" value="${d.monthly || ""}" placeholder="e.g. 250000" /></label>
        <p id="ob-error" class="error-text hidden"></p>
      </div>
      <div class="row"><button class="btn" id="ob-back">Back</button><button class="btn primary" id="ob-done">Start Tracking</button></div>`;
    stepsEl.querySelectorAll("[data-m]").forEach((c) => {
      c.onclick = () => { d.budgetMode = c.dataset.m; save(); renderOnboarding(); };
    });
    document.getElementById("ob-back").onclick = () => { step = 2; renderOnboarding(); };
    document.getElementById("ob-done").onclick = () => {
      const raw = document.getElementById("ob-monthly").value.trim();
      const errEl = document.getElementById("ob-error");
      let monthlyKobo = null;
      if (["monthly", "both"].includes(d.budgetMode)) {
        if (raw === "") {
          errEl.textContent = "Enter a monthly amount, or choose skip.";
          errEl.classList.remove("hidden");
          return;
        }
        monthlyKobo = parseAmountToKobo(raw);
        if (monthlyKobo === null) {
          errEl.textContent = "Enter a valid amount greater than zero.";
          errEl.classList.remove("hidden");
          return;
        }
      }
      state.user.profileType = d.profileType;
      state.user.onboarded = true;
      state.categories = DEFAULT_CATEGORIES.filter((c) => d.categoryIds.includes(c.id)).map((c) => ({ ...c, custom: false }));
      if (!state.categories.length) state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, custom: false }));
      if (monthlyKobo) state.budgets.monthlyKobo = monthlyKobo;
      save();
      renderOnboarding();
      boot();
    };
  }
}

// ---------- Expense modal wiring ----------
document.getElementById("mode-quick").onclick = () => setExpMode("quick");
document.getElementById("mode-detailed").onclick = () => setExpMode("detailed");
document.getElementById("global-add-btn").onclick = () => openExpenseModal();
document.getElementById("expense-close").onclick = () => closeExpenseModal();
document.getElementById("expense-save").onclick = () => saveExpenseFromModal();
document.getElementById("expense-delete").onclick = () => deleteExpenseFromModal();
document.getElementById("expense-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("expense-modal")) closeExpenseModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("expense-modal").classList.contains("hidden")) closeExpenseModal();
});

// ---------- Transactions filters ----------
["f-search", "f-category", "f-wallet", "f-payment", "f-from", "f-to", "f-min", "f-max", "f-sort"].forEach((id) =>
  document.getElementById(id).addEventListener("input", refreshTransactions)
);
document.getElementById("f-clear").onclick = clearFilters;
document.getElementById("bulk-delete").onclick = bulkDeleteSelected;
document.getElementById("saved-add").onclick = saveCurrentFilter;

// ---------- Month navigation ----------
document.getElementById("month-prev").onclick = () => shiftViewMonth(-1);
document.getElementById("month-next").onclick = () => shiftViewMonth(1);
document.getElementById("month-reset").onclick = resetViewMonth;
document.getElementById("cal-prev").onclick = () => shiftCalMonth(-1);
document.getElementById("cal-next").onclick = () => shiftCalMonth(1);
document.getElementById("cal-reset").onclick = resetCalMonth;
document.getElementById("wallet-switch").onchange = (e) => setActiveWallet(e.target.value);
document.getElementById("add-wallet").onclick = addWalletFromInputs;
document.getElementById("print-reports").onclick = () => {
  showTab("reports");
  setTimeout(() => window.print(), 100);
};

// ---------- Budget / settings (static controls) ----------
document.getElementById("save-monthly-budget").onclick = saveMonthlyBudgetFromInput;
document.getElementById("clear-monthly-budget").onclick = () => {
  clearMonthlyBudget();
  refreshAll();
};
document.getElementById("save-profile").onclick = saveProfileFromInputs;
document.getElementById("add-category").onclick = addCategoryFromInputs;
document.getElementById("export-json").onclick = exportJson;
document.getElementById("export-csv").onclick = exportCsv;
document.getElementById("import-csv").addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) importCsvFile(e.target.files[0]);
  e.target.value = "";
});
document.getElementById("reset-data").onclick = resetAllData;
document.getElementById("goal-save").onclick = saveGoalFromForm;
document.getElementById("goal-cancel").onclick = resetGoalForm;
document.getElementById("rec-save").onclick = saveRecFromForm;
document.getElementById("rec-cancel").onclick = resetRecForm;
document.getElementById("rec-freq").onchange = (e) => {
  document.getElementById("rec-days-wrap").classList.toggle("hidden", e.target.value !== "custom");
};

// ---------- Boot ----------
function boot() {
  applyTheme();
  refreshAll();
  renderOnboarding();
}
setRefreshHook(boot);
setResetHook(() => { step = 0; renderOnboarding(); });
boot();

// ---------- Service worker (offline + installable; needs HTTPS or localhost) ----------
if ("serviceWorker" in navigator &&
    (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support unavailable */ });
  });
}

// ---------- Install prompt ----------
const installCard = document.getElementById("install-card");
const installBtn = document.getElementById("install-btn");
const installIosHint = document.getElementById("install-ios-hint");
const installText = document.getElementById("install-text");
let deferredPrompt = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
function dismissInstall() {
  installCard.classList.add("hidden");
  try { localStorage.setItem("naijaLedger.installDismissed", "1"); } catch (e) {}
}
function maybeShowInstall() {
  if (isStandalone()) return;
  let dismissed = null;
  try { dismissed = localStorage.getItem("naijaLedger.installDismissed"); } catch (e) {}
  if (dismissed) return;
  if (isIos()) {
    installText.classList.add("hidden");
    installIosHint.classList.remove("hidden");
    installBtn.classList.add("hidden");
    installCard.classList.remove("hidden");
  } else if (deferredPrompt) {
    installCard.classList.remove("hidden");
  }
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  maybeShowInstall();
});
installBtn.onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice.catch(() => null);
  if (choice && choice.outcome === "accepted") dismissInstall();
  deferredPrompt = null;
};
document.getElementById("install-dismiss").onclick = dismissInstall;
window.addEventListener("appinstalled", dismissInstall);
maybeShowInstall();
