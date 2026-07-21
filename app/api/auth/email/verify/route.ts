import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import {
  createEmailCodeHash,
  createEmailSessionToken,
  EMAIL_SESSION_COOKIE,
  EMAIL_SESSION_MAX_AGE,
  getEmailAuthConfiguration,
  normalizeEmail,
  timingSafeEqual,
} from "../../../../email-auth";

export const dynamic = "force-dynamic";

type LoginCodeRow = {
  attempts: number;
  code_hash: string;
  expires_at: number;
};

function db() {
  if (!env.DB) throw new Error("DB binding unavailable");
  return env.DB;
}

async function ensureLoginCodeDatabase() {
  await db().prepare(`CREATE TABLE IF NOT EXISTS email_login_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`).run();
}

export async function POST(request: NextRequest) {
  try {
    const configuration = getEmailAuthConfiguration();
    if (!configuration) return NextResponse.json({ error: "邮箱登录暂未配置完成" }, { status: 503 });

    const body = await request.json() as { code?: unknown; email?: unknown };
    const email = normalizeEmail(body.email);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "请输入邮箱收到的 6 位验证码" }, { status: 400 });
    }

    await ensureLoginCodeDatabase();
    const record = await db().prepare("SELECT code_hash, expires_at, attempts FROM email_login_codes WHERE email = ?")
      .bind(email).first<LoginCodeRow>();
    if (!record || record.expires_at <= Date.now()) {
      if (record) await db().prepare("DELETE FROM email_login_codes WHERE email = ?").bind(email).run();
      return NextResponse.json({ error: "验证码已失效，请重新获取" }, { status: 400 });
    }
    if (record.attempts >= 5) {
      await db().prepare("DELETE FROM email_login_codes WHERE email = ?").bind(email).run();
      return NextResponse.json({ error: "尝试次数已达上限，请重新获取验证码" }, { status: 429 });
    }

    const submittedHash = await createEmailCodeHash(email, code, configuration.authSecret);
    if (!timingSafeEqual(record.code_hash, submittedHash)) {
      await db().prepare("UPDATE email_login_codes SET attempts = attempts + 1 WHERE email = ?").bind(email).run();
      const remaining = Math.max(0, 4 - record.attempts);
      return NextResponse.json({ error: `验证码不正确，还可尝试 ${remaining} 次` }, { status: 400 });
    }

    const token = await createEmailSessionToken(email, configuration.authSecret);
    await db().prepare("DELETE FROM email_login_codes WHERE email = ?").bind(email).run();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(EMAIL_SESSION_COOKIE, token, {
      httpOnly: true,
      maxAge: EMAIL_SESSION_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Email code verification failed", error);
    return NextResponse.json({ error: "登录没有成功，请稍后再试" }, { status: 500 });
  }
}
