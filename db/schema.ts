import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull().default(""),
  name: text("name").notNull(),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  nextChargeDate: text("next_charge_date").notNull(),
  color: text("color").notNull().default("#28604F"),
  mark: text("mark").notNull().default("订"),
  note: text("note").notNull().default(""),
  reminderDays: integer("reminder_days").notNull().default(3),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("subscriptions_owner_email_idx").on(table.ownerEmail)]);

export const emailLoginCodes = sqliteTable("email_login_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const emailAuthRateLimits = sqliteTable("email_auth_rate_limits", {
  limitKey: text("limit_key").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  lastRequestAt: integer("last_request_at").notNull(),
});
