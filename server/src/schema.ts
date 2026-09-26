import { pgTable, text, integer, timestamp, date, jsonb } from "drizzle-orm/pg-core";

// Global defaults have ownerId NULL; user copies get their ownerId stamped at seed/signup.
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("📁"),
  group: text("group").notNull().default("Custom"),
});

// Money stored as integer kobo. Never floats.
export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  categoryId: text("category_id").references(() => categories.id),
  description: text("description").notNull().default(""),
  date: date("date").notNull(), // YYYY-MM-DD, local (Africa/Lagos) calendar day
  time: text("time").notNull().default(""),
  paymentMethod: text("payment_method").notNull().default("Cash"),
  location: text("location").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// One row per user. categories column: { [categoryId]: koboLimit }
export const budgets = pgTable("budgets", {
  ownerId: text("owner_id").primaryKey(),
  monthlyKobo: integer("monthly_kobo"),
  categories: jsonb("categories").notNull().default({}),
});

// Receipts live in Cloudflare R2; only the key + metadata live here.
export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  expenseId: text("expense_id").references(() => expenses.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
