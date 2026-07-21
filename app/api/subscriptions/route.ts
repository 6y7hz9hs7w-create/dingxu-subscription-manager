import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SubscriptionInput = {
  id?: number;
  name?: string;
  category?: string;
  amount?: number;
  billingCycle?: "monthly" | "yearly";
  nextChargeDate?: string;
  color?: string;
  mark?: string;
  note?: string;
  reminderDays?: number;
  action?: "cancel" | "renew" | "restore";
};

function db() {
  if (!env.DB) throw new Error("DB binding unavailable");
  return env.DB;
}

async function ensureDatabase() {
  const database = db();
  await database
    .prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      next_charge_date TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#28604F',
      mark TEXT NOT NULL DEFAULT '订',
      note TEXT NOT NULL DEFAULT '',
      reminder_days INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`)
    .run();
}

export async function GET() {
  try {
    await ensureDatabase();
    const result = await db()
      .prepare("SELECT * FROM subscriptions ORDER BY next_charge_date ASC")
      .all();
    return NextResponse.json({ subscriptions: result.results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "暂时无法读取订阅" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabase();
    const body = (await request.json()) as SubscriptionInput;
    if (!body.name || !body.category || !body.amount || !body.nextChargeDate) {
      return NextResponse.json({ error: "请填写完整信息" }, { status: 400 });
    }
    await db()
      .prepare(`INSERT INTO subscriptions
        (name, category, amount_cents, billing_cycle, next_charge_date, color, mark, note, reminder_days, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
      .bind(
        body.name.trim(),
        body.category,
        Math.round(body.amount * 100),
        body.billingCycle ?? "monthly",
        body.nextChargeDate,
        body.color ?? "#28604F",
        (body.mark || body.name.trim().slice(0, 1)).slice(0, 2),
        body.note ?? "",
        body.reminderDays ?? 3,
        new Date().toISOString()
      )
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "添加失败，请稍后再试" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabase();
    const body = (await request.json()) as SubscriptionInput;
    if (!body.id || !body.action) {
      return NextResponse.json({ error: "操作无效" }, { status: 400 });
    }
    if (body.action === "cancel") {
      await db().prepare("UPDATE subscriptions SET status = 'cancel_pending' WHERE id = ?").bind(body.id).run();
    } else if (body.action === "restore") {
      await db().prepare("UPDATE subscriptions SET status = 'active' WHERE id = ?").bind(body.id).run();
    } else {
      const item = await db()
        .prepare("SELECT billing_cycle, next_charge_date FROM subscriptions WHERE id = ?")
        .bind(body.id)
        .first<{ billing_cycle: string; next_charge_date: string }>();
      if (!item) return NextResponse.json({ error: "订阅不存在" }, { status: 404 });
      const next = new Date(`${item.next_charge_date}T00:00:00`);
      if (item.billing_cycle === "yearly") next.setFullYear(next.getFullYear() + 1);
      else next.setMonth(next.getMonth() + 1);
      await db()
        .prepare("UPDATE subscriptions SET next_charge_date = ?, status = 'active' WHERE id = ?")
        .bind(next.toISOString().slice(0, 10), body.id)
        .run();
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "操作失败，请稍后再试" }, { status: 500 });
  }
}
