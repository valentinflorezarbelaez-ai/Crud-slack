/**
 * CHANNELS ENDPOINT (GET & POST)
 * Reads and creates channels in Neon PostgreSQL.
 */

import { sql } from "./_db.js";
import { getAuthenticatedUser } from "./_auth.js";

export async function GET() {
  try {
    const rows = await sql(`
      SELECT c.id, c.name, c.description, c.is_private, c.created_at,
             COUNT(m.id)::int AS message_count
      FROM channels c
      LEFT JOIN messages m ON m.channel_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at ASC;
    `);

    return new Response(JSON.stringify({ ok: true, channels: rows }), {
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
    if (!body || typeof body !== "object" || !body.name) {
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

    let rawName = String(body.name || "").trim().toLowerCase();
    const description = String(body.description || "").trim();

    // Remove leading # if user typed it
    if (rawName.startsWith("#")) rawName = rawName.slice(1);

    // Validate channel slug
    if (!/^[a-z0-9-_]{2,30}$/.test(rawName)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "El nombre del canal debe tener entre 2 y 30 caracteres alfanuméricos, guiones o guiones bajos."
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const channelId = `c_${rawName.replace(/-/g, "_")}_${Date.now().toString(36)}`;
    const creatorId = user ? user.id : null;

    const insertRows = await sql(
      `
      INSERT INTO channels (id, name, description, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO NOTHING
      RETURNING *;
    `,
      [channelId, rawName, description, creatorId]
    );

    if (insertRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: `Ya existe un canal con el nombre #${rawName}` }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const channel = insertRows[0];
    if (creatorId) {
      await sql(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
        [channel.id, creatorId]
      );
    }

    return new Response(JSON.stringify({ ok: true, channel }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
