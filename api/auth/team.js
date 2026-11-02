/**
 * TEAM MEMBERS AUTHENTICATION ENDPOINT
 * Allows instant sign-in as any of the 4 designated team members
 * or retrieves available team profiles for the Slack Workspace login gate.
 */

import { sql } from "../_db.js";
import { signSession, createSessionCookieHeader } from "../_auth.js";

export async function GET() {
  try {
    const rows = await sql(`
      SELECT id, full_name, email, avatar_url, status_text
      FROM users
      WHERE id IN ('usr_valentin', 'usr_ana', 'usr_carlos', 'usr_elena')
      ORDER BY 
        CASE id 
          WHEN 'usr_valentin' THEN 1
          WHEN 'usr_ana' THEN 2
          WHEN 'usr_carlos' THEN 3
          WHEN 'usr_elena' THEN 4
          ELSE 5
        END;
    `);

    return new Response(JSON.stringify({ ok: true, users: rows }), {
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

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId || "").trim();

    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing userId parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const rows = await sql(
      `SELECT id, google_id, email, full_name, avatar_url, status_text FROM users WHERE id = $1 LIMIT 1;`,
      [userId]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Usuario no encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const user = rows[0];

    // Update last_seen_at
    await sql(`UPDATE users SET last_seen_at = NOW() WHERE id = $1;`, [user.id]);

    const sessionToken = await signSession({
      userId: user.id,
      googleId: user.google_id || `demo_${user.id}`,
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
