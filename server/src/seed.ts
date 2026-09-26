import "dotenv/config";
import { db } from "./db.js";
import { categories } from "./schema.js";

// The 11 Nigerian default categories (global rows, ownerId NULL).
const DEFAULTS = [
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

for (const c of DEFAULTS) {
  await db.insert(categories).values({ ...c, ownerId: null }).onConflictDoNothing();
}
console.log(`Seeded ${DEFAULTS.length} default categories.`);
process.exit(0);
