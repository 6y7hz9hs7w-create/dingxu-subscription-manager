import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import {
  createEmailCodeHash,
  createRateLimitKey,
  getEmailAuthConfiguration,
  normalizeEmail,
} from "../../../../email-auth";

export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;

type RateLimitRow = {
  last_request_at: number;
  request_count: number;
  window_started_at: number;
};

function db() {
  if (!env.DB) throw new Error("DB binding unavailable");
  return env.DB;
}

async function ensureEmailAuthDatabase() {
  await db().batch([
    db().prepare(`CREATE TABLE IF NOT EXISTS email_login_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    db().prepare(`CREATE TABLE IF NOT EXISTS email_auth_rate_limits (
      limit_key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      last_request_at INTEGER NOT NULL
    )`),
  ]);
}

export async function POST(request: NextRequest) {
  try {
    const configuration = getEmailAuthConfiguration();
    if (!configuration) {
      return NextResponse.json({ error: "邮箱登录暂未配置完成" }, { status: 503 });
    }

    const body = await request.json() as { email?: unknown };
    const email = normalizeEmail(body.email);
    if (!email) return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });

    await ensureEmailAuthDatabase();
    const now = Date.now();
    const sourceAddress = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";
    const [emailLimitKey, sourceLimitKey] = await Promise.all([
      createRateLimitKey(`email:${email}`, configuration.authSecret),
      createRateLimitKey(`source:${sourceAddress}`, configuration.authSecret),
    ]);
    const [emailLimit, sourceLimit] = await Promise.all([
      db().prepare("SELECT window_started_at, request_count, last_request_at FROM email_auth_rate_limits WHERE limit_key = ?")
        .bind(emailLimitKey).first<RateLimitRow>(),
      db().prepare("SELECT window_started_at, request_count, last_request_at FROM email_auth_rate_limits WHERE limit_key = ?")
        .bind(sourceLimitKey).first<RateLimitRow>(),
    ]);

    const retryAfter = Math.max(
      remainingCooldown(emailLimit, now),
      remainingCooldown(sourceLimit, now),
    );
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: `请求过于频繁，请 ${retryAfter} 秒后再试`, retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    if (isHourlyLimitReached(emailLimit, now, 5) || isHourlyLimitReached(sourceLimit, now, 20)) {
      return NextResponse.json({ error: "本小时发送次数已达上限，请稍后再试" }, { status: 429 });
    }

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const codeHash = await createEmailCodeHash(email, code, configuration.authSecret);
    await db().batch([
      db().prepare(`INSERT INTO email_login_codes (email, code_hash, expires_at, attempts, created_at)
        VALUES (?, ?, ?, 0, ?)
        ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
          attempts = 0, created_at = excluded.created_at`)
        .bind(email, codeHash, now + CODE_TTL_MS, now),
      upsertRateLimit(emailLimitKey, emailLimit, now),
      upsertRateLimit(sourceLimitKey, sourceLimit, now),
    ]);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `dingxu-login-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        from: configuration.resendFromEmail,
        to: [email],
        subject: `${code}｜订序登录验证码`,
        html: `<div style="font-family:Arial,'PingFang SC',sans-serif;color:#17382f;max-width:520px;margin:auto;padding:32px"><h1 style="font-size:24px">登录订序</h1><p>你的登录验证码是：</p><p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:24px 0">${code}</p><p style="color:#6d7c75">验证码 10 分钟内有效，请勿转发给他人。如果不是你本人操作，可以忽略这封邮件。</p></div>`,
        text: `订序登录验证码：${code}\n\n验证码 10 分钟内有效，请勿转发给他人。`,
      }),
    });

    if (!resendResponse.ok) {
      await db().prepare("DELETE FROM email_login_codes WHERE email = ? AND code_hash = ?").bind(email, codeHash).run();
      console.error("Resend email request failed", resendResponse.status);
      return NextResponse.json({ error: "验证码暂时无法发送，请稍后再试" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, expiresIn: CODE_TTL_MS / 1000 });
  } catch (error) {
    console.error("Email code request failed", error);
    return NextResponse.json({ error: "验证码暂时无法发送，请稍后再试" }, { status: 500 });
  }
}

function remainingCooldown(row: RateLimitRow | null, now: number): number {
  if (!row || now - row.last_request_at >= MIN_REQUEST_INTERVAL_MS) return 0;
  return Math.ceil((MIN_REQUEST_INTERVAL_MS - (now - row.last_request_at)) / 1000);
}

function isHourlyLimitReached(row: RateLimitRow | null, now: number, maximum: number): boolean {
  return Boolean(row && now - row.window_started_at < RATE_WINDOW_MS && row.request_count >= maximum);
}

function upsertRateLimit(limitKey: string, row: RateLimitRow | null, now: number) {
  const inCurrentWindow = Boolean(row && now - row.window_started_at < RATE_WINDOW_MS);
  const windowStartedAt = inCurrentWindow && row ? row.window_started_at : now;
  const requestCount = inCurrentWindow && row ? row.request_count + 1 : 1;
  return db().prepare(`INSERT INTO email_auth_rate_limits (limit_key, window_started_at, request_count, last_request_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(limit_key) DO UPDATE SET window_started_at = excluded.window_started_at,
      request_count = excluded.request_count, last_request_at = excluded.last_request_at`)
    .bind(limitKey, windowStartedAt, requestCount, now);
}
