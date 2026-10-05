// Recurring expenses: schedules, due status, payment recording. Local dates only.
import { state, save } from "./store.js";
import { uid, parseAmountToKobo, todayLocal } from "./utils.js";

export const FREQUENCIES = [
  { id: "weekly", label: "Weekly", days: 7 },
  { id: "monthly", label: "Monthly", months: 1 },
  { id: "quarterly", label: "Every 3 months", months: 3 },
  { id: "yearly", label: "Yearly", months: 12 },
  { id: "custom", label: "Every N days" },
];

export function getRecurring() {
  if (!Array.isArray(state.recurring)) state.recurring = [];
  return state.recurring;
}

export function daysInYm(y, m) {
  return new Date(y, m, 0).getDate();
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yy = dt.getFullYear();
  return `${yy}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Same calendar day N months ahead, clamped to month end (Jan 31 -> Feb 28).
export function addMonthsClamped(dateStr, n) {
  let [y, m, d] = dateStr.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  d = Math.min(d, daysInYm(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function nextDueFrom(dateStr, freq, intervalDays) {
  const f = FREQUENCIES.find((x) => x.id === freq) || FREQUENCIES[1];
  if (f.days) return addDays(dateStr, f.days);
  if (f.months) return addMonthsClamped(dateStr, f.months);
  const n = Math.max(1, Math.floor(Number(intervalDays) || 1));
  return addDays(dateStr, n);
}

// overdue | due | soon (within 7d) | later | paused
export function dueStatus(r, todayStr) {
  if (!r.active) return "paused";
  if (!r.nextDue) return "later";
  if (r.nextDue < todayStr) return "overdue";
  if (r.nextDue === todayStr) return "due";
  if (r.nextDue <= addDays(todayStr, 7)) return "soon";
  return "later";
}

export function validateRecurring({ name, amountKobo, categoryId, frequency, intervalDays, nextDue }) {
  if (!String(name || "").trim()) return "Name it (e.g. Rent, Electricity, DSTV).";
  if (!amountKobo || amountKobo <= 0) return "Enter a valid amount greater than zero.";
  if (!categoryId || !state.categories.some((c) => c.id === categoryId)) return "Select a valid category.";
  if (frequency === "custom" && !(Number(intervalDays) >= 1)) return "Enter every-how-many days (1 or more).";
  if (nextDue && !/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return "Enter a valid next-due date.";
  return null;
}

export function upsertRecurring({ id, name, amount, categoryId, frequency, intervalDays, nextDue, notes }) {
  const amountKobo = parseAmountToKobo(amount);
  const err = validateRecurring({ name, amountKobo, categoryId, frequency, intervalDays, nextDue });
  if (err) return { error: err };
  const now = new Date().toISOString();
  const clean = {
    name: String(name).trim().slice(0, 60), amountKobo, categoryId,
    frequency, intervalDays: frequency === "custom" ? Math.max(1, Math.floor(Number(intervalDays) || 1)) : null,
    nextDue: nextDue || todayLocal(), notes: String(notes || "").slice(0, 200), updatedAt: now,
  };
  if (id) {
    const r = getRecurring().find((x) => x.id === id);
    if (!r) return { error: "Schedule not found." };
    Object.assign(r, clean);
    save();
    return { item: r };
  }
  const item = { id: uid(), active: true, createdAt: now, ...clean };
  getRecurring().push(item);
  save();
  return { item };
}

export function deleteRecurring(id) {
  state.recurring = getRecurring().filter((r) => r.id !== id);
  save();
}

export function toggleRecurring(id) {
  const r = getRecurring().find((x) => x.id === id);
  if (!r) return;
  r.active = !r.active;
  save();
}

// Record a payment: creates the expense and advances the schedule past today.
export function recordPayment(id) {
  const r = getRecurring().find((x) => x.id === id);
  if (!r) return "Schedule not found.";
  const today = todayLocal();
  const now = new Date().toISOString();
  state.expenses.push({
    id: uid(), amountKobo: r.amountKobo, categoryId: r.categoryId,
    walletId: state.activeWalletId || "main",
    description: r.name, date: today, time: "",
    paymentMethod: "Cash", location: "", notes: "Recurring payment",
    createdAt: now, updatedAt: now,
  });
  let next = nextDueFrom(r.nextDue <= today ? r.nextDue : today, r.frequency, r.intervalDays);
  let guard = 0;
  while (next <= today && guard++ < 100) next = nextDueFrom(next, r.frequency, r.intervalDays);
  r.nextDue = next;
  r.updatedAt = now;
  save();
  return null;
}
