// Budget math: percent-used + status thresholds (80% warn, 100% over).
import { state, save, STORE_ERROR_MSG } from "./store.js";
import { parseAmountToKobo } from "./utils.js";

export function pctUsed(spentKobo, limitKobo) {
  if (!limitKobo || limitKobo <= 0) return 0;
  return Math.min(100, Math.round((spentKobo / limitKobo) * 100));
}

export function statusFor(pct) {
  if (pct >= 100) return "over";
  if (pct >= 80) return "warn";
  return "";
}

export function setMonthlyBudget(nairaInput) {
  const kobo = parseAmountToKobo(nairaInput);
  if (kobo === null) return "Enter a valid budget amount.";
  state.budgets.monthlyKobo = kobo;
  if (!save()) return STORE_ERROR_MSG;
  return null;
}

export function clearMonthlyBudget() {
  state.budgets.monthlyKobo = null;
  return save();
}

export function setCategoryBudget(catId, nairaInput) {
  const raw = String(nairaInput ?? "").trim();
  if (raw === "") {
    delete state.budgets.categories[catId];
    if (!save()) return STORE_ERROR_MSG;
    return null;
  }
  const kobo = parseAmountToKobo(raw);
  if (kobo === null) return "Enter a valid limit (or clear the field to remove).";
  state.budgets.categories[catId] = kobo;
  if (!save()) return STORE_ERROR_MSG;
  return null;
}
