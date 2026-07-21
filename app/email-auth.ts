import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

export type AuthUser = ChatGPTUser & {
  authProvider: "chatgpt" | "email";
};

export const EMAIL_SESSION_COOKIE = "dingxu_email_session";
export const EMAIL_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

type SessionPayload = {
  email: string;
  expiresAt: number;
  version: 1;
};

type EmailAuthConfiguration = {
  authSecret: string;
  resendApiKey: string;
  resendFromEmail: string;
};

const encoder = new TextEncoder();

export async function getCurrentUser(): Promise<AuthUser | null> {
  const chatGPTUser = await getChatGPTUser();
  if (chatGPTUser) return { ...chatGPTUser, authProvider: "chatgpt" };

  return getEmailSessionUser();
}

export async function getEmailSessionUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(EMAIL_SESSION_COOKIE)?.value;
  const secret = runtimeValue("EMAIL_AUTH_SECRET");
  if (!token || !secret) return null;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const expectedSignature = await hmac(secret, `session:${encodedPayload}`);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;
    const email = normalizeEmail(payload.email);
    if (!email || payload.version !== 1 || payload.expiresAt <= Date.now()) return null;

    return {
      authProvider: "email",
      displayName: email,
      email,
      fullName: null,
    };
  } catch {
    return null;
  }
}

export function getEmailAuthConfiguration(): EmailAuthConfiguration | null {
  const authSecret = runtimeValue("EMAIL_AUTH_SECRET");
  const resendApiKey = runtimeValue("RESEND_API_KEY");
  const resendFromEmail = runtimeValue("RESEND_FROM_EMAIL");
  if (!authSecret || !resendApiKey || !resendFromEmail) return null;

  return { authSecret, resendApiKey, resendFromEmail };
}

export function isEmailAuthConfigured(): boolean {
  return getEmailAuthConfiguration() !== null;
}

export async function createEmailSessionToken(email: string, secret: string): Promise<string> {
  const payload: SessionPayload = {
    email: normalizeEmail(email) ?? "",
    expiresAt: Date.now() + EMAIL_SESSION_MAX_AGE * 1000,
    version: 1,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await hmac(secret, `session:${encodedPayload}`);
  return `${encodedPayload}.${signature}`;
}

export async function createEmailCodeHash(email: string, code: string, secret: string): Promise<string> {
  return hmac(secret, `code:${normalizeEmail(email) ?? ""}:${code}`);
}

export async function createRateLimitKey(value: string, secret: string): Promise<string> {
  return hmac(secret, `rate:${value}`);
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function runtimeValue(key: string): string | null {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function encodeBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
