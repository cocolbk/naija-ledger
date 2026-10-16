// Premium (Naija Ledger for business owners): ₦3,000/month, local demo billing.
import { state, save } from "./store.js";
import { todayLocal, addDaysStr } from "./utils.js";

export const PREMIUM_PRICE_NGN = 3000;
export const PREMIUM_DAYS = 30;

export function premiumStatus(todayStr = todayLocal()) {
  const p = state.premium;
  if (!p || !p.active) return { active: false };
  if (p.renews && p.renews < todayStr) return { active: false, expired: true, renews: p.renews };
  return { active: true, since: p.since, renews: p.renews, method: p.method };
}

export function activatePremium(method) {
  const today = todayLocal();
  state.premium = { active: true, since: today, renews: addDaysStr(today, PREMIUM_DAYS), method: method || "card" };
  save();
  return state.premium;
}

export function cancelPremium() {
  if (state.premium) {
    state.premium.active = false;
    save();
  }
}

export function premiumPriceLabel(currency = "₦") {
  return `${currency}3,000/month`;
}
