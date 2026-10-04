// Spending insights: descriptive, numbers-first, never shaming.
// Pure: generateInsights({ expenses, monthlyKobo, today, currency }) — no DOM, no store.
import { fmtKobo, addDaysStr } from "./utils.js";

function sum(list) {
  return list.reduce((s, e) => s + (Number(e.amountKobo) || 0), 0);
}

function prevMonth(mk) {
  let [y, m] = mk.split("-").map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function money(kobo, currency) {
  return fmtKobo(kobo, currency);
}

function deltaLine(now, before, currency) {
  const d = now - before;
  if (d === 0) return "same as before";
  const pct = before > 0 ? ` (${Math.round((Math.abs(d) / before) * 100)}%)` : "";
  return `${d > 0 ? "up" : "down"} by ${money(Math.abs(d), currency)}${pct}`;
}

export function generateInsights({ expenses, monthlyKobo, today, currency = "₦", names = {} }) {
  const out = [];
  if (!expenses.length) {
    return [{ icon: "🌱", text: "No spending recorded yet. Add your first expense and insights will appear here." }];
  }
  const mk = today.slice(0, 7);
  const lastMk = prevMonth(mk);
  const dayN = Number(today.slice(8, 10));
  const [yy, mm] = mk.split("-").map(Number);
  const dim = new Date(yy, mm, 0).getDate();

  const thisMonth = expenses.filter((e) => e.date.slice(0, 7) === mk);
  const lastMonth = expenses.filter((e) => e.date.slice(0, 7) === lastMk);
  const mTotal = sum(thisMonth);
  const pTotal = sum(lastMonth);

  // 1. Month vs last month
  if (pTotal > 0 || mTotal > 0) {
    out.push({
      icon: "📅",
      text: `This month: ${money(mTotal, currency)} vs ${money(pTotal, currency)} last month — ${deltaLine(mTotal, pTotal, currency)}.`,
    });
  }

  // 2. Daily average + projection
  if (mTotal > 0 && dayN > 0) {
    const avg = mTotal / dayN;
    const proj = avg * dim;
    out.push({
      icon: "📈",
      text: `Averaging ${money(Math.round(avg), currency)} per day — on pace for about ${money(Math.round(proj), currency)} this month.`,
    });
  }

  // 3. Top category
  const byCat = {};
  for (const e of thisMonth) byCat[e.categoryId] = (byCat[e.categoryId] || 0) + (Number(e.amountKobo) || 0);
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  if (top && mTotal > 0) {
    const pct = Math.round((top[1] / mTotal) * 100);
    const label = names[top[0]] || top[0];
    out.push({ icon: "🏆", text: `Biggest category: ${label} at ${money(top[1], currency)} (${pct}% of this month).` });
  }

  // 4. Biggest single expense this month
  if (thisMonth.length) {
    const big = [...thisMonth].sort((a, b) => b.amountKobo - a.amountKobo)[0];
    out.push({
      icon: "🧾",
      text: `Largest single expense: ${money(big.amountKobo, currency)}${big.description ? ` — ${big.description}` : ""} on ${big.date}.`,
    });
  }

  // 5. Today vs yesterday
  const tTotal = sum(expenses.filter((e) => e.date === today));
  const yTotal = sum(expenses.filter((e) => e.date === addDaysStr(today, -1)));
  if (tTotal > 0 || yTotal > 0) {
    out.push({ icon: "🔁", text: `Today: ${money(tTotal, currency)} vs yesterday ${money(yTotal, currency)} — ${deltaLine(tTotal, yTotal, currency)}.` });
  }

  // 6. Last 7 days vs prior 7
  const week = [], prior = [];
  for (let i = 0; i < 7; i++) {
    const d = addDaysStr(today, -i);
    week.push(...expenses.filter((e) => e.date === d));
    const d2 = addDaysStr(today, -i - 7);
    prior.push(...expenses.filter((e) => e.date === d2));
  }
  const wTotal = sum(week), prTotal = sum(prior);
  if (wTotal > 0 || prTotal > 0) {
    out.push({ icon: "📊", text: `Last 7 days: ${money(wTotal, currency)} vs prior 7 days ${money(prTotal, currency)} — ${deltaLine(wTotal, prTotal, currency)}.` });
  }

  // 7. Budget position (factual, no judgment)
  if (monthlyKobo && monthlyKobo > 0) {
    const pct = Math.min(100, Math.round((mTotal / monthlyKobo) * 100));
    const left = monthlyKobo - mTotal;
    const daysLeft = dim - dayN;
    const perDay = daysLeft > 0 && left > 0 ? ` About ${money(Math.round(left / daysLeft), currency)} per remaining day.` : "";
    out.push({
      icon: pct >= 100 ? "🛑" : pct >= 80 ? "⚠️" : "✅",
      text: left >= 0
        ? `Budget: ${money(mTotal, currency)} of ${money(monthlyKobo, currency)} used (${pct}%).${perDay}`
        : `Budget: ${money(-left, currency)} over the ${money(monthlyKobo, currency)} monthly budget.`,
    });
  }

  // 8. Busiest day in the last 7
  const perDay = {};
  for (let i = 0; i < 7; i++) {
    const d = addDaysStr(today, -i);
    perDay[d] = sum(expenses.filter((e) => e.date === d));
  }
  const busy = Object.entries(perDay).sort((a, b) => b[1] - a[1])[0];
  if (busy && busy[1] > 0) {
    out.push({ icon: "📌", text: `Busiest recent day: ${busy[0]} with ${money(busy[1], currency)}.` });
  }

  return out;
}
