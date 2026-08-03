import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BINDING_COOKIE = "dingxu_web_binding";
const SESSION_COOKIE = "dingxu_web_session";

type CloudResult = {
  ok?: boolean;
  error?: string;
  authExpired?: boolean;
  code?: string;
  expiresAt?: string;
  requestToken?: string;
  sessionToken?: string;
  status?: "pending" | "confirmed";
  user?: Record<string, unknown>;
  subscriptions?: Array<Record<string, unknown>>;
};

function runtimeValue(name: string): string {
  const bindings = env as unknown as Record<string, unknown>;
  const value = bindings[name] ?? process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

async function callCloud(payload: Record<string, unknown>): Promise<CloudResult> {
  const url = runtimeValue("CLOUDBASE_SYNC_URL");
  const secret = runtimeValue("CLOUDBASE_SYNC_SECRET");
  if (!/^https:\/\//.test(url) || secret.length < 32) {
    throw new Error("网页同步尚未完成云端配置");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const result = (await response.json()) as CloudResult;
  if (!response.ok && !result.error) throw new Error("云端同步请求失败");
  return result;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

async function bootstrap(sessionToken: string) {
  return callCloud({ action: "session", sessionToken, request: { action: "bootstrap" } });
}

export async function GET() {
  const store = await cookies();
  const sessionToken = store.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ authenticated: false });
  try {
    const result = await bootstrap(sessionToken);
    if (!result.ok) {
      const response = NextResponse.json({ authenticated: false, error: result.error }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    return NextResponse.json({
      authenticated: true,
      subscriptions: result.subscriptions ?? [],
      user: result.user ?? null,
    });
  } catch (error) {
    return NextResponse.json({
      authenticated: false,
      error: error instanceof Error ? error.message : "同步服务暂时不可用",
    }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    operation?: string;
    snoozeDays?: number;
  };
  const store = await cookies();
  try {
    if (body.action === "createBinding") {
      const result = await callCloud({ action: "createBinding" });
      if (!result.ok || !result.requestToken || !result.code) {
        return NextResponse.json({ error: result.error || "无法生成绑定码" }, { status: 400 });
      }
      const response = NextResponse.json({ code: result.code, expiresAt: result.expiresAt });
      response.cookies.set(BINDING_COOKIE, result.requestToken, cookieOptions(10 * 60));
      return response;
    }
    if (body.action === "checkBinding") {
      const requestToken = store.get(BINDING_COOKIE)?.value;
      if (!requestToken) return NextResponse.json({ error: "绑定请求已过期，请重新生成" }, { status: 400 });
      const result = await callCloud({ action: "checkBinding", requestToken });
      if (!result.ok) return NextResponse.json({ error: result.error || "绑定失败" }, { status: 400 });
      if (result.status !== "confirmed" || !result.sessionToken) {
        return NextResponse.json({ status: "pending" });
      }
      const data = await bootstrap(result.sessionToken);
      if (!data.ok) return NextResponse.json({ error: data.error || "读取数据失败" }, { status: 400 });
      const response = NextResponse.json({
        authenticated: true,
        status: "confirmed",
        subscriptions: data.subscriptions ?? [],
        user: data.user ?? null,
      });
      response.cookies.set(SESSION_COOKIE, result.sessionToken, cookieOptions(30 * 24 * 60 * 60));
      response.cookies.delete(BINDING_COOKIE);
      return response;
    }
    if (body.action === "logout") {
      const sessionToken = store.get(SESSION_COOKIE)?.value;
      if (sessionToken) {
        await callCloud({ action: "session", sessionToken, request: { action: "logout" } }).catch(() => null);
      }
      const response = NextResponse.json({ ok: true });
      response.cookies.delete(SESSION_COOKIE);
      response.cookies.delete(BINDING_COOKIE);
      return response;
    }
    if (["updateStatus", "delete"].includes(body.action || "")) {
      const sessionToken = store.get(SESSION_COOKIE)?.value;
      if (!sessionToken) return NextResponse.json({ error: "请先绑定微信数据" }, { status: 401 });
      const result = await callCloud({
        action: "session",
        sessionToken,
        request: {
          action: body.action,
          id: body.id,
          operation: body.operation,
          snoozeDays: body.snoozeDays,
        },
      });
      if (!result.ok) {
        const response = NextResponse.json({ error: result.error || "操作失败" }, { status: result.authExpired ? 401 : 400 });
        if (result.authExpired) response.cookies.delete(SESSION_COOKIE);
        return response;
      }
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "同步服务暂时不可用",
    }, { status: 503 });
  }
}
