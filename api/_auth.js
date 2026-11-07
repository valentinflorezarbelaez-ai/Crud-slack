/**
 * LAYER-0 SESSION, ANTI-SPOOFING & CHANNEL MEMBERSHIP HELPER
 * HMAC-SHA256 session token signer using native Web Crypto API.
 * Enforces Cookie-Only cryptographic proof for all real Google OAuth accounts (usr_g_*).
 * Zero external npm dependencies.
 */

import { sql } from "./_db.js";

function requireSessionSecret() {
  const value = (process.env.SESSION_SECRET || "").trim();
  if (value.length < 32) {
    throw new Error("SESSION_SECRET_REQUIRED_MIN_32_CHARS");
  }
  return value;
}

const COOKIE_NAME = "taskflow_session";
export const PUBLIC_DEMO_USER_IDS = new Set([
  "usr_valentin",
  "usr_ana",
  "usr_carlos",
  "usr_elena"
]);

async function getHmacKey() {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(requireSessionSecret()),
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
  const cookieHeader = req?.headers?.get?.("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getAuthenticatedUser(req) {
  const token = getSessionCookie(req);
  if (!token) return null;
  const session = await verifySession(token);
  if (!session || !session.userId) return null;
  if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
    return {
      id: session.userId,
      google_id: session.googleId || null,
      email: session.email || "",
      full_name: session.fullName || "Usuario",
      avatar_url: session.avatarUrl || "",
      status_text: "En línea",
      preferences: {}
    };
  }
  try {
    const rows = await sql(
      `SELECT id, google_id, email, full_name, avatar_url, status_text,
              COALESCE(preferences, '{}'::jsonb) AS preferences
       FROM users WHERE id = $1 LIMIT 1`,
      [session.userId]
    );
    return rows[0] || null;
  } catch {
    const rows = await sql(
      "SELECT id, google_id, email, full_name, avatar_url, status_text FROM users WHERE id = $1 LIMIT 1",
      [session.userId]
    );
    return rows[0] ? { ...rows[0], preferences: {} } : null;
  }
}

/**
 * Resolves a verified userId for API requests (FR-CS-016 / BDD-CS-009).
 * Real Google accounts (usr_g_*) strictly require a valid HMAC-SHA256 HttpOnly session cookie;
 * unauthenticated query/body userId spoofing for real accounts is rejected.
 */
export async function resolveVerifiedUserId(req, fallbackUserId = "") {
  const isHermeticNoDb =
    process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL;

  try {
    if (req?.headers) {
      const sessionUser = await getAuthenticatedUser(req);
      if (sessionUser?.id) return sessionUser.id;
    }
  } catch {
    // Proceed to fallback rules below
  }

  const cleanFallback = String(fallbackUserId || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 64);

  if (!cleanFallback) return null;

  // Never allow unauthenticated spoofing of real Google accounts (usr_g_*)
  if (cleanFallback.startsWith("usr_g_")) {
    return null;
  }

  // Allow explicit showcase demo profiles or hermetic unit test IDs
  if (PUBLIC_DEMO_USER_IDS.has(cleanFallback) || isHermeticNoDb) {
    return cleanFallback;
  }

  return null;
}

/**
 * Verifies whether a user can read/write a collaborative channel.
 * Showcase preset channels (general, operaciones, etc.) are open; user-created custom
 * channels (created_by IS NOT NULL) require creator ownership or channel_members entry.
 */
export async function canAccessChannel(rawChannelId, userId) {
  const ch = String(rawChannelId || "").trim();
  if (!ch || ch === "general" || ch === "c_general") return true;
  if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) return true;

  const candidateId = ch.startsWith("c_") ? ch : `c_${ch}`;
  try {
    const rows = await sql(
      `SELECT id, created_by FROM channels WHERE id = $1 OR id = $2 LIMIT 1;`,
      [ch, candidateId]
    );
    if (rows.length === 0 || !rows[0].created_by) {
      return true;
    }
    if (!userId) return false;
    if (rows[0].created_by === userId) return true;

    const mem = await sql(
      `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2 LIMIT 1;`,
      [rows[0].id, userId]
    );
    return mem.length > 0;
  } catch {
    return true;
  }
}

export function createSessionCookieHeader(token, maxAgeSeconds = 2592000) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function createClearSessionCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
