/**
 * REACTIONS ENDPOINT (POST)
 * Toggles an emoji reaction on a message in Neon PostgreSQL.
 */

import { sql } from "./_db.js";
import { getAuthenticatedUser } from "./_auth.js";

export async function POST(req) {
  try {
    let body = {};
    try {
      if (typeof req.json === "function") body = await req.json();
    } catch {}
    if (!body || typeof body !== "object" || !body.messageId) {
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

    let user = await getAuthenticatedUser(req);
    if (!user && body.userId) {
      const rows = await sql(
        "SELECT id, google_id, email, full_name, avatar_url, status_text FROM users WHERE id = $1 LIMIT 1",
        [body.userId]
      );
      if (rows.length > 0) user = rows[0];
    }

    if (!user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Debes iniciar sesión para reaccionar." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const messageId = String(body.messageId || "").trim();
    const emoji = String(body.emoji || "").trim();

    if (!messageId || !emoji) {
      return new Response(
        JSON.stringify({ ok: false, error: "Faltan messageId o emoji" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if reaction already exists
    const existing = await sql(
      `SELECT id FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3 LIMIT 1;`,
      [messageId, user.id, emoji]
    );

    if (existing.length > 0) {
      // Toggle off
      await sql(`DELETE FROM reactions WHERE id = $1;`, [existing[0].id]);
    } else {
      // Toggle on
      const rxId = `rx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await sql(
        `INSERT INTO reactions (id, message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT DO NOTHING;`,
        [rxId, messageId, user.id, emoji]
      );
    }

    // Return updated reaction count
    const updated = await sql(
      `
      SELECT 
        r.emoji, 
        COUNT(r.id)::int AS count,
        BOOL_OR(r.user_id = $2) AS user_reacted
      FROM reactions r
      WHERE r.message_id = $1
      GROUP BY r.emoji;
    `,
      [messageId, user.id]
    );

    return new Response(JSON.stringify({ ok: true, reactions: updated }), {
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
