// Month-grid builder (Monday-first). Pure: no DOM, no state.
export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

// Monday-first offset of the 1st: Mon=0..Sun=6.
export function leadingBlanks(y, m) {
  return (new Date(y, m - 1, 1).getDay() + 6) % 7;
}

export function fmtDay(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Flat cells: null (blank) or YYYY-MM-DD. Length always a multiple of 7.
export function buildMonthGrid(y, m) {
  const cells = [];
  for (let i = 0; i < leadingBlanks(y, m); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push(fmtDay(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonthKey(mk, delta) {
  let [y, m] = mk.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}
