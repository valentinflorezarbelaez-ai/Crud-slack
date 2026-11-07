/**
 * GOOGLE OAUTH 2.0 / OPENID CONNECT SIGN-IN HANDLER
 * Validates Google ID Token, registers isolated per-user profile in Neon Postgres,
 * restores per-user preferences & custom status, and sets HttpOnly session cookie.
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

    const googleId = String(payload.sub).trim();
    const email = String(payload.email).trim().toLowerCase();
    const fullName = String(payload.name || email.split("@")[0]).trim();
    const avatarUrl =
      payload.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(googleId)}`;
    const defaultStatus = "Espacio personal activo";

    const existingRows = await sql(
      `SELECT id FROM users WHERE google_id = $1 OR email = $2 LIMIT 1;`,
      [googleId, email]
    );
    const targetUserId =
      existingRows.length > 0
        ? existingRows[0].id
        : `usr_g_${googleId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}`;

    const upsertRows = await sql(
      `
      INSERT INTO users (id, google_id, email, full_name, avatar_url, status_text, preferences, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE
      SET google_id = EXCLUDED.google_id,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          avatar_url = EXCLUDED.avatar_url,
          last_seen_at = NOW()
      RETURNING id, google_id, email, full_name, avatar_url, status_text,
                COALESCE(preferences, '{}'::jsonb) AS preferences;
    `,
      [targetUserId, googleId, email, fullName, avatarUrl, defaultStatus]
    );

    const user = upsertRows[0];

    const sessionToken = await signSession({
      userId: user.id,
      googleId: user.google_id,
      email: user.email,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      issuedAt: Date.now()
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: user.id,
          google_id: user.google_id,
          email: user.email,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          status_text: user.status_text || defaultStatus,
          preferences: user.preferences || {},
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          statusText: user.status_text || defaultStatus
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
