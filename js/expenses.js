// Expense validation + CRUD. All amounts in kobo ints.
import { state, save } from "./store.js";
import { uid, parseAmountToKobo, todayLocal } from "./utils.js";

export const PAYMENT_METHODS = ["Cash", "Bank transfer", "Debit card", "POS", "Mobile payment", "Other"];

// Returns an error string, or null when valid.
export function validateExpense({ amountKobo, categoryId, date }) {
  if (!amountKobo || amountKobo <= 0) return "Enter a valid amount greater than zero (up to 2 decimals).";
  if (!categoryId || !state.categories.some((c) => c.id === categoryId)) return "Select a valid category.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "Enter a valid date.";
  if (date > todayLocal()) return "Date cannot be in the future.";
  return null;
}

export function upsertExpense(input) {
  const amountKobo = typeof input.amountKobo === "number" ? input.amountKobo : parseAmountToKobo(input.amount);
  const err = validateExpense({ amountKobo, categoryId: input.categoryId, date: input.date || todayLocal() });
  if (err) return { error: err };
  const now = new Date().toISOString();
  const existing = input.id ? state.expenses.find((x) => x.id === input.id) : null;
  if (existing) {
    Object.assign(existing, {
      amountKobo, categoryId: input.categoryId, description: (input.description || "").trim(),
      date: input.date || todayLocal(), time: input.time || "",
      paymentMethod: input.paymentMethod || "Cash", location: (input.location || "").trim(),
      notes: (input.notes || "").trim(), updatedAt: now,
    });
    save();
    return { expense: existing };
  }
  const expense = {
    id: uid(), amountKobo, categoryId: input.categoryId, description: (input.description || "").trim(),
    date: input.date || todayLocal(), time: input.time || "",
    paymentMethod: input.paymentMethod || "Cash", location: (input.location || "").trim(),
    notes: (input.notes || "").trim(), createdAt: now, updatedAt: now,
  };
  state.expenses.push(expense);
  save();
  return { expense };
}

export function deleteExpense(id) {
  state.expenses = state.expenses.filter((x) => x.id !== id);
  save();
}

export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

export function expensesForMonth(key) {
  return state.expenses.filter((e) => monthKey(e.date) === key);
}

export function sortedByRecency(list) {
  return sortTxns(list, "newest");
}

export function sortTxns(list, mode = "newest") {
  const arr = [...list];
  const key = (e) => (e.date || "") + (e.time || "") + (e.id || "");
  switch (mode) {
    case "oldest":
      return arr.sort((a, b) => key(a).localeCompare(key(b)));
    case "amount-desc":
      return arr.sort((a, b) => b.amountKobo - a.amountKobo || key(b).localeCompare(key(a)));
    case "amount-asc":
      return arr.sort((a, b) => a.amountKobo - b.amountKobo || key(a).localeCompare(key(b)));
    default:
      return arr.sort((a, b) => key(b).localeCompare(key(a)));
  }
}
