/**
 * TEAM MEMBERS AUTHENTICATION ENDPOINT
 * Allows instant sign-in as any of the 4 designated team members
 * or retrieves available team profiles for the Slack Workspace login gate.
 */

import { sql } from "../_db.js";
import { signSession, createSessionCookieHeader } from "../_auth.js";

const CANONICAL_TEAM = Object.freeze([
  {
    id: "usr_valentin",
    google_id: "demo_valentin_01",
    email: "valentin.florez@crud-slack.internal",
    full_name: "Valentín Flórez Arbelaez",
    avatar_url: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%234A154B'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-family='Segoe UI,sans-serif' font-size='16' font-weight='700'%3EVF%3C/text%3E%3C/svg%3E",
    status_text: "Coordinador General · Activo"
  },
  {
    id: "usr_ana",
    google_id: "demo_jacobo_02",
    email: "jacobo.florez@crud-slack.internal",
    full_name: "Jacobo Flórez Galeano",
    avatar_url: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%23007A5A'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-family='Segoe UI,sans-serif' font-size='16' font-weight='700'%3EJF%3C/text%3E%3C/svg%3E",
    status_text: "Diseño UX/UI · Activo"
  },
  {
    id: "usr_carlos",
    google_id: "demo_edison_03",
    email: "edison.florez@crud-slack.internal",
    full_name: "Edison Flórez López",
    avatar_url: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%231264A3'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23fff' font-family='Segoe UI,sans-serif' font-size='16' font-weight='700'%3EEF%3C/text%3E%3C/svg%3E",
    status_text: "Ingeniero Backend · Activo"
  },
  {
    id: "usr_elena",
    google_id: "demo_roberto_04",
    email: "roberto.urrea@crud-slack.internal",
    full_name: "Roberto Urrea",
    avatar_url: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Ccircle cx='24' cy='24' r='24' fill='%23ECB22E'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%231D1C1D' font-family='Segoe UI,sans-serif' font-size='16' font-weight='700'%3ERU%3C/text%3E%3C/svg%3E",
    status_text: "QA & Testing · Activo"
  }
]);

async function syncCanonicalTeam() {
  for (const u of CANONICAL_TEAM) {
    await sql(
      `
      INSERT INTO users (id, google_id, email, full_name, avatar_url, status_text, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        google_id = EXCLUDED.google_id,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        status_text = EXCLUDED.status_text
      `,
      [u.id, u.google_id, u.email, u.full_name, u.avatar_url, u.status_text]
    );
  }
}

export async function GET() {
  try {
    await syncCanonicalTeam();

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
    let body = {};
    try {
      if (typeof req.json === "function") body = await req.json();
    } catch {}
    if (!body || typeof body !== "object" || !body.userId) {
      try {
        if (typeof req.text === "function") {
          const text = await req.text();
          body = JSON.parse(text);
        }
      } catch {}
    }
    if (!body || typeof body !== "object") {
      body = req.body || {};
    }
    const userId = String(body.userId || "").trim();

    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing userId parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    await syncCanonicalTeam();

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
