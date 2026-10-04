// Shared helpers: ids, escaping, local dates, kobo money, debounce.
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Local calendar day YYYY-MM-DD (never UTC-shifted).
export function todayLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function addDaysStr(dateStr, n) {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() + n);
  return todayLocal(d);
}

export function prevMonthKey(mk) {
  let [y, m] = mk.split("-").map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Money is stored as integer kobo. Display in naira with up to 2 decimals.
export function fmtKobo(kobo, cur = "₦") {
  const n = (Number(kobo) || 0) / 100;
  return cur + n.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Strict naira input -> kobo int. Returns null when invalid.
export function parseAmountToKobo(str) {
  const s = String(str ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const k = Math.round(parseFloat(s) * 100);
  return k > 0 ? k : null;
}

export function koboToInput(kobo) {
  return ((Number(kobo) || 0) / 100).toString();
}

export function debounce(fn, ms = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Minimal CSV parser honoring double-quoted fields (matches our exporter).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
