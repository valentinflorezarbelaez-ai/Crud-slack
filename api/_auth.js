/**
 * LAYER-0 SESSION & AUTHENTICATION HELPER
 * HMAC-SHA256 session token signer using native Web Crypto API.
 * Zero external npm dependencies.
 */

import { sql } from "./_db.js";

const SESSION_SECRET = process.env.SESSION_SECRET || "taskflow-secure-hmac-secret-key-2026-production";
const COOKIE_NAME = "taskflow_session";

async function getHmacKey() {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload) {
  const encoder = new TextEncoder();
  const dataStr = JSON.stringify(payload);
  const b64Data = Buffer.from(dataStr).toString("base64url");
  const key = await getHmacKey();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(b64Data));
  const b64Sig = Buffer.from(sigBuffer).toString("base64url");
  return `${b64Data}.${b64Sig}`;
}

export async function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64Data, b64Sig] = parts;
  try {
    const encoder = new TextEncoder();
    const key = await getHmacKey();
    const sigBuffer = Buffer.from(b64Sig, "base64url");
    const isValid = await crypto.subtle.verify("HMAC", key, sigBuffer, encoder.encode(b64Data));
    if (!isValid) return null;
    const jsonStr = Buffer.from(b64Data, "base64url").toString("utf8");
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function getSessionCookie(req) {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getAuthenticatedUser(req) {
  const token = getSessionCookie(req);
  if (!token) return null;
  const session = await verifySession(token);
  if (!session || !session.userId) return null;
  const rows = await sql(
    "SELECT id, google_id, email, full_name, avatar_url, status_text FROM users WHERE id = $1 LIMIT 1",
    [session.userId]
  );
  return rows[0] || null;
}

export function createSessionCookieHeader(token, maxAgeSeconds = 2592000) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function createClearSessionCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
