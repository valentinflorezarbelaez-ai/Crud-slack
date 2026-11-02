/**
 * LOGOUT HANDLER
 * Clears the session cookie.
 */

import { createClearSessionCookieHeader } from "../_auth.js";

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": createClearSessionCookieHeader()
    }
  });
}
