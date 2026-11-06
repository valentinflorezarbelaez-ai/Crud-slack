/**
 * GOOGLE OAUTH 2.0 / OPENID CONNECT SIGN-IN HANDLER
 * Validates Google ID Token, registers user in Neon Postgres, sets session cookie.
 * Also provides GET for public client id bootstrap (consolidated endpoint).
 */

import { sql } from "../_db.js";
import { signSession, createSessionCookieHeader } from "../_auth.js";

function requireGoogleClientId() {
  const id = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!id) {
    throw new Error("GOOGLE_CLIENT_ID_REQUIRED");
  }
  return id;
}

export async function GET() {
  try {
    const clientId = requireGoogleClientId();
    return Response.json(
      { ok: true, clientId },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
          "Content-Type": "application/json"
        }
      }
    );
  } catch {
    return Response.json(
      { ok: false, error: "GOOGLE_CLIENT_ID_REQUIRED" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
          "Content-Type": "application/json"
        }
      }
    );
  }
}

export async function POST(req) {
  try {
    const expectedClientId = requireGoogleClientId();
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

    if (payload.aud !== expectedClientId) {
      return new Response(JSON.stringify({ ok: false, error: "Token audience mismatch" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!payload.sub || !payload.email) {
      return new Response(JSON.stringify({ ok: false, error: "Malformed Google token payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const fullName = payload.name || email.split("@")[0];
    const avatarUrl = payload.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${googleId}`;

    const upsertRows = await sql(
      `
      INSERT INTO users (google_id, email, full_name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (google_id) DO UPDATE
      SET email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          avatar_url = EXCLUDED.avatar_url,
          last_active_at = NOW()
      RETURNING id, google_id, email, full_name, avatar_url, status_text;
    `,
      [googleId, email, fullName, avatarUrl]
    );

    const user = upsertRows[0];
    const sessionToken = await signSession(user);

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          statusText: user.status_text
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": createSessionCookieHeader(sessionToken)
        }
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
