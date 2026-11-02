/**
 * GET CURRENT AUTHENTICATED USER PROFILE
 */

import { getAuthenticatedUser } from "../_auth.js";

export async function GET(req) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, user: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, user }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
