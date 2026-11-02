/**
 * GOOGLE OAUTH 2.0 / OPENID CONNECT SIGN-IN HANDLER
 * Validates Google ID Token, registers user in Neon Postgres, sets session cookie.
 */

import { sql } from "../_db.js";
import { signSession, createSessionCookieHeader } from "../_auth.js";

const EXPECTED_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "600439007156-q6ku9a6fnm3dcmbkakgv5fi9b57enm89.apps.googleusercontent.com";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const credential = body.credential;

    if (!credential || typeof credential !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "Missing credential token" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const gRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!gRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid Google credential token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const payload = await gRes.json();

    if (payload.aud !== EXPECTED_CLIENT_ID) {
      return new Response(JSON.stringify({ ok: false, error: "Token audience mismatch" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (
      payload.iss !== "accounts.google.com" &&
      payload.iss !== "https://accounts.google.com"
    ) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid token issuer" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const googleId = payload.sub;
    const email = payload.email || "";
    const fullName = payload.name || payload.given_name || "Usuario de Google";
    const avatarUrl = payload.picture || "";
    const userId = `usr_${googleId.slice(0, 16)}`;

    const upsertQuery = `
      INSERT INTO users (id, google_id, email, full_name, avatar_url, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (google_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        last_seen_at = NOW()
      RETURNING id, google_id, email, full_name, avatar_url, status_text;
    `;

    const rows = await sql(upsertQuery, [userId, googleId, email, fullName, avatarUrl]);
    const user = rows[0];

    const sessionToken = await signSession({
      userId: user.id,
      googleId: user.google_id,
      email: user.email,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      issuedAt: Date.now()
    });

    const cookieHeader = createSessionCookieHeader(sessionToken);

    return new Response(JSON.stringify({ ok: true, user }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieHeader
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
