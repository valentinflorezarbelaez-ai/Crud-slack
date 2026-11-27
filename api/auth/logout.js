/**
 * LOGOUT HANDLER
 * Clears the session cookie.
 */

import { createClearSessionCookieHeader } from "../_auth.js";

export async function POST() {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store, max-age=0, must-revalidate"
  });
  headers.append("Set-Cookie", createClearSessionCookieHeader());
  headers.append("Set-Cookie", "neon_auth_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  headers.append("Set-Cookie", "neon_auth_cookie=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers
  });
}
