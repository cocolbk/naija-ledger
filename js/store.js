// Central state: load (v1->v2 migration), save, lookups. Money in kobo ints.
import { todayLocal } from "./utils.js";

const LS_V2 = "naijaLedger.v2";
const LS_V1 = "naijaLedger.v1";

export const PROFILE_TYPES = ["Personal", "Student", "Family", "Business", "Personal + Business"];

export const DEFAULT_CATEGORIES = [
  { id: "food", name: "Food & Drinks", icon: "🍔", group: "Food & Drinks" },
  { id: "transport", name: "Transportation", icon: "🚌", group: "Transportation" },
  { id: "comms", name: "Communication", icon: "📱", group: "Communication" },
  { id: "home", name: "Home & Utilities", icon: "💡", group: "Home & Utilities" },
  { id: "personal", name: "Personal", icon: "👕", group: "Personal" },
  { id: "health", name: "Health", icon: "🏥", group: "Health" },
  { id: "education", name: "Education", icon: "📚", group: "Education" },
  { id: "family", name: "Family", icon: "👨‍👩‍👧", group: "Family" },
  { id: "financial", name: "Financial", icon: "💰", group: "Financial" },
  { id: "business", name: "Business", icon: "💼", group: "Business" },
  { id: "other", name: "Other", icon: "📦", group: "Other" },
];

export function defaultState() {
  return {
    version: 2,
    user: { name: "", profileType: "Personal", currency: "₦", onboarded: false, theme: "auto" },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, custom: false })),
    expenses: [],
    budgets: { monthlyKobo: null, categories: {} },
    savedFilters: [],
    savings: [],
    contributions: [],
    onboardDraft: {
      profileType: "Personal",
      categoryIds: DEFAULT_CATEGORIES.map((c) => c.id),
      budgetMode: "skip",
      monthly: "",
    },
  };
}

function migrateV1(v1) {
  const s = defaultState();
  if (v1.user) {
    s.user.name = v1.user.name || "";
    s.user.profileType = v1.user.profileType || "Personal";
    s.user.currency = v1.user.currency || "₦";
    s.user.onboarded = !!v1.user.onboarded;
    s.user.theme = v1.user.theme || "auto";
  }
  if (Array.isArray(v1.categories) && v1.categories.length) {
    s.categories = v1.categories.map((c) => ({
      id: String(c.id), name: String(c.name || "Unnamed"),
      icon: c.icon || "📁", group: c.group || "Custom", custom: !!c.custom,
    }));
  }
  if (Array.isArray(v1.expenses)) {
    s.expenses = v1.expenses
      .map((e) => ({
        id: String(e.id), ownerId: "", amountKobo: Math.round(Number(e.amount || 0) * 100),
        categoryId: String(e.categoryId || "other"), description: e.description || "",
        date: e.date || todayLocal(), time: e.time || "",
        paymentMethod: e.paymentMethod || "Cash", location: e.location || "", notes: e.notes || "",
        createdAt: e.createdAt || new Date().toISOString(), updatedAt: e.updatedAt || new Date().toISOString(),
      }))
      .filter((e) => e.amountKobo > 0);
  }
  if (v1.budgets) {
    if (Number(v1.budgets.monthly) > 0) s.budgets.monthlyKobo = Math.round(Number(v1.budgets.monthly) * 100);
    for (const [k, v] of Object.entries(v1.budgets.categories || {})) {
      if (Number(v) > 0) s.budgets.categories[k] = Math.round(Number(v) * 100);
    }
  }
  return s;
}

function load() {
  try {
    const raw2 = localStorage.getItem(LS_V2);
    if (raw2) {
      const s = JSON.parse(raw2);
      if (s && s.version === 2) {
        if (!Array.isArray(s.savedFilters)) s.savedFilters = [];
        if (!Array.isArray(s.savings)) s.savings = [];
        if (!Array.isArray(s.contributions)) s.contributions = [];
        return s;
      }
    }
    const raw1 = localStorage.getItem(LS_V1);
    if (raw1) {
      const migrated = migrateV1(JSON.parse(raw1));
      localStorage.setItem(LS_V2, JSON.stringify(migrated));
      return migrated;
    }
  } catch (e) { /* corrupted storage -> fresh state */ }
  const fresh = defaultState();
  if (!Array.isArray(fresh.savedFilters)) fresh.savedFilters = [];
  return fresh;
}

export let state = load();

export function save() {
  localStorage.setItem(LS_V2, JSON.stringify(state));
}

export function resetState() {
  state = defaultState();
  save();
}

export function cur() {
  return (state.user && state.user.currency) || "₦";
}

export function catById(id) {
  return state.categories.find((c) => c.id === id) || { id, name: "Unknown", icon: "❓" };
}

export function categoryName(id) {
  return catById(id).name;
}
