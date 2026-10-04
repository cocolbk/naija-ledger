// Savings goals: CRUD + contributions. Money in kobo ints.
import { state, save } from "./store.js";
import { uid, parseAmountToKobo, todayLocal } from "./utils.js";

export function getGoals() {
  if (!Array.isArray(state.savings)) state.savings = [];
  return state.savings;
}

export function getContributions(goalId) {
  if (!Array.isArray(state.contributions)) state.contributions = [];
  return state.contributions
    .filter((c) => c.goalId === goalId)
    .sort((a, b) => (b.date + (b.createdAt || "")).localeCompare(a.date + (a.createdAt || "")));
}

export function goalPct(g) {
  if (!g.targetKobo || g.targetKobo <= 0) return 0;
  return Math.min(100, Math.round(((Number(g.savedKobo) || 0) / g.targetKobo) * 100));
}

export function remainingKobo(g) {
  return Math.max(0, (Number(g.targetKobo) || 0) - (Number(g.savedKobo) || 0));
}

export function daysLeft(targetDate, todayStr) {
  if (!targetDate) return null;
  const [y1, m1, d1] = todayStr.split("-").map(Number);
  const [y2, m2, d2] = targetDate.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export function validateGoal({ name, targetKobo, targetDate }) {
  if (!String(name || "").trim()) return "Give the goal a name (e.g. Rent, New phone).";
  if (!targetKobo || targetKobo <= 0) return "Enter a target amount greater than zero.";
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return "Enter a valid target date.";
  return null;
}

export function upsertGoal({ id, name, target, targetDate }) {
  const targetKobo = parseAmountToKobo(target);
  const err = validateGoal({ name, targetKobo, targetDate });
  if (err) return { error: err };
  const now = new Date().toISOString();
  const clean = {
    name: String(name).trim().slice(0, 60),
    targetKobo,
    targetDate: targetDate || "",
    updatedAt: now,
  };
  if (id) {
    const g = getGoals().find((x) => x.id === id);
    if (!g) return { error: "Goal not found." };
    Object.assign(g, clean);
    save();
    return { goal: g };
  }
  const goal = { id: uid(), savedKobo: 0, createdAt: now, ...clean };
  getGoals().push(goal);
  save();
  return { goal };
}

export function deleteGoal(id) {
  state.savings = getGoals().filter((g) => g.id !== id);
  state.contributions = (state.contributions || []).filter((c) => c.goalId !== id);
  save();
}

// kind: "in" (contribute) | "out" (withdraw)
export function recordContribution(goalId, kind, amountInput, note = "") {
  const g = getGoals().find((x) => x.id === goalId);
  if (!g) return "Goal not found.";
  const kobo = parseAmountToKobo(amountInput);
  if (kobo === null) return "Enter a valid amount greater than zero.";
  if (kind === "out" && kobo > (Number(g.savedKobo) || 0)) {
    return `Only ${((Number(g.savedKobo) || 0) / 100).toLocaleString("en-NG")} saved so far — withdraw less.`;
  }
  const now = new Date().toISOString();
  state.contributions.push({
    id: uid(), goalId, kobo: kind === "out" ? -kobo : kobo,
    date: todayLocal(), note: String(note || "").slice(0, 120), createdAt: now,
  });
  g.savedKobo = (Number(g.savedKobo) || 0) + (kind === "out" ? -kobo : kobo);
  g.updatedAt = now;
  save();
  return null;
}

export function savingsTotals() {
  const goals = getGoals();
  return {
    count: goals.length,
    saved: goals.reduce((s, g) => s + (Number(g.savedKobo) || 0), 0),
    target: goals.reduce((s, g) => s + (Number(g.targetKobo) || 0), 0),
  };
}
