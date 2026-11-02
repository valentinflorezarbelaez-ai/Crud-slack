/**
 * MESSAGES ENDPOINT (GET & POST)
 * Reads and persists real chat messages in Neon PostgreSQL.
 */

import { sql } from "./_db.js";
import { getAuthenticatedUser } from "./_auth.js";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const channelId = url.searchParams.get("channelId") || "c_general";
    const user = await getAuthenticatedUser(req);
    const currentUserId = user ? user.id : "";

    const messages = await sql(
      `
      SELECT 
        m.id, m.channel_id, m.text, m.parent_id, m.created_at,
        u.id AS author_id, u.full_name AS author_name, u.avatar_url AS author_avatar, u.email AS author_email
      FROM messages m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = $1
      ORDER BY m.created_at ASC
      LIMIT 100;
    `,
      [channelId]
    );

    // Retrieve reactions for messages in this channel
    const msgIds = messages.map((m) => m.id);
    let reactionsMap = {};

    if (msgIds.length > 0) {
      const rxRows = await sql(
        `
        SELECT 
          r.message_id, r.emoji, 
          COUNT(r.id)::int AS count,
          BOOL_OR(r.user_id = $2) AS user_reacted
        FROM reactions r
        WHERE r.message_id = ANY($1)
        GROUP BY r.message_id, r.emoji;
      `,
        [msgIds, currentUserId]
      );

      for (const rx of rxRows) {
        if (!reactionsMap[rx.message_id]) reactionsMap[rx.message_id] = [];
        reactionsMap[rx.message_id].push({
          emoji: rx.emoji,
          count: rx.count,
          userReacted: rx.user_reacted
        });
      }
    }

    const messagesWithReactions = messages.map((m) => ({
      ...m,
      reactions: reactionsMap[m.id] || []
    }));

    return new Response(JSON.stringify({ ok: true, messages: messagesWithReactions }), {
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
    if (!body || typeof body !== "object" || !body.text) {
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
        JSON.stringify({
          ok: false,
          error: "Debes seleccionar tu perfil de usuario para enviar mensajes."
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const channelId = String(body.channelId || "general").trim();
    const text = String(body.text || "").trim();
    const parentId = body.parentId ? String(body.parentId) : null;

    if (!text) {
      return new Response(
        JSON.stringify({ ok: false, error: "El mensaje no puede estar vacío." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (text.length > 4000) {
      return new Response(
        JSON.stringify({ ok: false, error: "El mensaje excede los 4000 caracteres." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const msgId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    const rows = await sql(
      `
      INSERT INTO messages (id, channel_id, user_id, text, parent_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *;
    `,
      [msgId, channelId, user.id, text, parentId]
    );

    const inserted = rows[0];

    return new Response(
      JSON.stringify({
        ok: true,
        message: {
          ...inserted,
          author_id: user.id,
          author_name: user.full_name,
          author_avatar: user.avatar_url,
          author_email: user.email,
          reactions: []
        }
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
