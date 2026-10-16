// Subscriptions: Free / Premium / Business. Prices configurable via plans.json (no rebuild).
import { state, save } from "./store.js";
import { todayLocal, addDaysStr } from "./utils.js";

export const DEFAULT_PLANS = {
  currency: "₦",
  free: { monthly: 0, yearly: 0 },
  premium: { monthly: 1000, yearly: 10000 },
  business: { monthly: 3000, yearly: 30000 },
  paystackPublicKey: "",
  verifyUrl: "",
};

let PLANS = JSON.parse(JSON.stringify(DEFAULT_PLANS));

export async function loadPlansConfig() {
  try {
    const r = await fetch("plans.json");
    if (!r.ok) return PLANS;
    const j = await r.json();
    PLANS = {
      ...JSON.parse(JSON.stringify(DEFAULT_PLANS)),
      ...j,
      free: { ...DEFAULT_PLANS.free, ...(j.free || {}) },
      premium: { ...DEFAULT_PLANS.premium, ...(j.premium || {}) },
      business: { ...DEFAULT_PLANS.business, ...(j.business || {}) },
    };
  } catch (e) { /* offline or file:// — use defaults */ }
  return PLANS;
}

export function plans() {
  return PLANS;
}

export function priceFor(plan, cycle) {
  if (!PLANS[plan]) return 0;
  return Number(PLANS[plan][cycle] || 0);
}

export function currency() {
  return (state.user && state.user.currency) || PLANS.currency || "₦";
}

export function fmtPrice(naira, cur) {
  return (cur || currency()) + Number(naira || 0).toLocaleString("en-NG");
}

// Feature -> minimum plans. Unlisted features are free for everyone.
const FEATURE_PLANS = {
  reports: ["premium", "business"],
  insights: ["premium", "business"],
  savings: ["premium", "business"],
  recurring: ["premium", "business"],
  categoryBudgets: ["premium", "business"],
  customCategories: ["premium", "business"],
  alerts: ["premium", "business"],
  export: ["premium", "business"],
  businessProfile: ["business"],
  businessReports: ["business"],
};

export function defaultSubscription() {
  return { plan: "free", cycle: "monthly", status: "active", since: null, renews: null, ref: null, method: null };
}

// Effective plan today. Cancelled keeps access until renews; expired falls back to free.
// Records are never deleted on downgrade.
export function effectivePlan(todayStr = todayLocal()) {
  const s = state.subscription;
  if (!s || s.plan === "free") return "free";
  if (s.status === "active" || s.status === "pending_verification") {
    if (!s.renews || s.renews >= todayStr) return s.plan;
    return "free";
  }
  if (s.status === "cancelled") {
    if (s.renews && s.renews >= todayStr) return s.plan;
    return "free";
  }
  return "free";
}

export function canUse(feature, todayStr) {
  const need = FEATURE_PLANS[feature];
  if (!need) return true;
  return need.includes(effectivePlan(todayStr));
}

export function renewsDate(plan, cycle, fromStr) {
  if (cycle === "yearly") {
    let [y, m, d] = fromStr.split("-").map(Number);
    y += 1;
    const dim = new Date(y, m, 0).getDate();
    d = Math.min(d, dim);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return addDaysStr(fromStr, 30);
}

export function activateSubscription(plan, cycle, ref, method) {
  const today = todayLocal();
  state.subscription = {
    plan, cycle, status: "active", since: today,
    renews: renewsDate(plan, cycle, today), ref: ref || null, method: method || null,
  };
  return save();
}

export function recordPayment({ ref, plan, cycle, amountKobo, status, method }) {
  if (!Array.isArray(state.payments)) state.payments = [];
  state.payments.unshift({
    id: "pay_" + Date.now().toString(36), ref: ref || null, plan, cycle,
    amountKobo: amountKobo || 0, status, method: method || null, date: todayLocal(),
  });
  return save();
}

export function cancelSubscription() {
  if (state.subscription && state.subscription.plan !== "free") {
    state.subscription.status = "cancelled";
    return save();
  }
  return true;
}

export function subscriptionLabel() {
  const s = state.subscription || defaultSubscription();
  if (s.plan === "free") return "Free plan";
  const cyc = s.cycle === "yearly" ? "yearly" : "monthly";
  const eff = effectivePlan();
  if (eff === "free" && s.plan !== "free") return `${cap(s.plan)} (${s.status}, ended) — now on Free`;
  if (s.status === "cancelled") return `${cap(s.plan)} (${cyc}) — cancels ${s.renews || "soon"}`;
  if (s.status === "pending_verification") return `${cap(s.plan)} (${cyc}) — payment received, verifying`;
  return `${cap(s.plan)} (${cyc}) — renews ${s.renews || "—"}`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
