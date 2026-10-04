// Budget math: percent-used + status thresholds (80% warn, 100% over).
import { state, save } from "./store.js";
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
  save();
  return null;
}

export function clearMonthlyBudget() {
  state.budgets.monthlyKobo = null;
  save();
}

export function setCategoryBudget(catId, nairaInput) {
  const raw = String(nairaInput ?? "").trim();
  if (raw === "") {
    delete state.budgets.categories[catId];
    save();
    return null;
  }
  const kobo = parseAmountToKobo(raw);
  if (kobo === null) return "Enter a valid limit (or clear the field to remove).";
  state.budgets.categories[catId] = kobo;
  save();
  return null;
}
