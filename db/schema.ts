import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
});
