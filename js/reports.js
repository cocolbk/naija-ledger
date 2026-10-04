// Read-only aggregations over expenses.
import { state } from "./store.js";
import { expensesForMonth } from "./expenses.js";

export function sumKobo(list) {
  return list.reduce((s, e) => s + (Number(e.amountKobo) || 0), 0);
}

export function byCategory(list) {
  const map = {};
  for (const e of list) map[e.categoryId] = (map[e.categoryId] || 0) + (Number(e.amountKobo) || 0);
  return Object.entries(map).sort((a, b) => b[1] - a[1]); // [catId, kobo] desc
}

export function totalsForMonth(month) {
  return sumKobo(expensesForMonth(month));
}

export function dailyTotals(lastDateStr, days) {
  const out = [];
  const [y, m, dd] = lastDateStr.split("-").map(Number);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(y, m - 1, dd);
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ date: ds, total: sumKobo(state.expenses.filter((e) => e.date === ds)) });
  }
  return out;
}
