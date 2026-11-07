/**
 * MESSAGES & TASK DISCUSSION THREADS ENDPOINT (GET & POST)
 * Reads and persists channel chat messages AND per-task discussion threads (?taskId=...)
 * in Neon PostgreSQL with strict membership & Cookie-Only anti-spoofing guards.
 */

import { sql } from "./_db.js";
import { canAccessChannel, getAuthenticatedUser, resolveVerifiedUserId } from "./_auth.js";
import { sanitizePlainText } from "../src/domain/taskEntities.mjs";

let commentsTableEnsured = false;

async function ensureTaskCommentsTable() {
  if (commentsTableEnsured) return;
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL,
        channel_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_private BOOLEAN DEFAULT FALSE,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_comments_channel_id ON task_comments(channel_id);
    `);
    commentsTableEnsured = true;
  } catch {
    // Proceed gracefully if already created
  }
}

function isPersonalSpaceId(raw) {
  const ch = String(raw || "").trim().toLowerCase();
  return (
    ch === "personal" ||
    ch === "mi-dia" ||
    ch.startsWith("personal-") ||
    ch === "mis-proyectos" ||
    ch === "notas-ideas"
  );
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const channelId = (url.searchParams.get("channelId") || "c_general").trim();
    const taskId = (url.searchParams.get("taskId") || "").trim();
    const currentUserId = await resolveVerifiedUserId(req, url.searchParams.get("userId") || "");

    // 1. Task-Level Discussion Thread (💬 Hilo)
    if (taskId) {
      const isPriv = isPersonalSpaceId(channelId);
      if (isPriv && !currentUserId) {
        return new Response(
          JSON.stringify({ ok: false, error: "Sesión autenticada requerida para ver comentarios privados." }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
        return new Response(JSON.stringify({ ok: true, taskId, comments: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (!isPriv) {
        const allowed = await canAccessChannel(channelId, currentUserId);
        if (!allowed) {
          return new Response(
            JSON.stringify({ ok: false, error: "No eres miembro de este canal." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      await ensureTaskCommentsTable();

      const rows = isPriv
        ? await sql(
            `
            SELECT tc.id, tc.task_id, tc.channel_id, tc.text, tc.created_at,
                   u.id AS author_id, u.full_name AS author_name, u.avatar_url AS author_avatar
            FROM task_comments tc
            LEFT JOIN users u ON u.id = tc.user_id
            WHERE tc.task_id = $1 AND tc.is_private = TRUE AND tc.user_id = $2
            ORDER BY tc.created_at ASC
            LIMIT 100;
          `,
            [taskId, currentUserId]
          )
        : await sql(
            `
            SELECT tc.id, tc.task_id, tc.channel_id, tc.text, tc.created_at,
                   u.id AS author_id, u.full_name AS author_name, u.avatar_url AS author_avatar
            FROM task_comments tc
            LEFT JOIN users u ON u.id = tc.user_id
            WHERE tc.task_id = $1 AND (tc.is_private = FALSE OR tc.is_private IS NULL)
            ORDER BY tc.created_at ASC
            LIMIT 100;
          `,
            [taskId]
          );

      return new Response(JSON.stringify({ ok: true, taskId, comments: rows }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Collaborative Channel Chat Feed
    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(JSON.stringify({ ok: true, messages: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const allowed = await canAccessChannel(channelId, currentUserId);
    if (!allowed) {
      return new Response(
        JSON.stringify({ ok: false, error: "No tienes acceso a los mensajes de este canal privado." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const altChannelId = channelId.startsWith("c_") ? channelId.slice(2) : "c_" + channelId;

    const messages = await sql(
      `
      SELECT 
        m.id, m.channel_id, m.text, m.parent_id, m.created_at,
        u.id AS author_id, u.full_name AS author_name, u.avatar_url AS author_avatar, u.email AS author_email
      FROM messages m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE (m.channel_id = $1 OR m.channel_id = $2)
        AND m.parent_id IS NULL
      ORDER BY m.created_at ASC
      LIMIT 100;
    `,
      [channelId, altChannelId]
    );

    const msgIds = messages.map((m) => m.id);
    const reactionsMap = {};

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
        [msgIds, currentUserId || ""]
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
    if (!body || typeof body !== "object") body = {};

    const channelId = String(body.channelId || "general").trim();
    const taskId = String(body.taskId || "").trim();
    const text = sanitizePlainText(String(body.text || "")).trim();
    const parentId = body.parentId ? String(body.parentId).trim() : null;

    if (!text) {
      return new Response(
        JSON.stringify({ ok: false, error: "El comentario o mensaje no puede estar vacío." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (text.length > 4000) {
      return new Response(
        JSON.stringify({ ok: false, error: "El mensaje excede los 4000 caracteres." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const verifiedUserId = await resolveVerifiedUserId(req, body.userId || "");
    if (!verifiedUserId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Debes iniciar sesión para enviar mensajes o comentarios."
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      const mockEntry = {
        id: `cmt_${Date.now().toString(36)}`,
        task_id: taskId || null,
        channel_id: channelId,
        text,
        author_id: verifiedUserId,
        author_name: "Usuario",
        created_at: new Date().toISOString()
      };
      return new Response(
        JSON.stringify(taskId ? { ok: true, comment: mockEntry } : { ok: true, message: mockEntry }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    let user = await getAuthenticatedUser(req);
    if (!user) {
      const uRows = await sql(
        "SELECT id, google_id, email, full_name, avatar_url, status_text FROM users WHERE id = $1 LIMIT 1",
        [verifiedUserId]
      );
      user = uRows[0] || null;
    }

    if (!user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Perfil de usuario no encontrado." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Persist Task Discussion Comment (💬 Hilo)
    if (taskId) {
      const isPriv = isPersonalSpaceId(channelId);
      if (!isPriv) {
        const allowed = await canAccessChannel(channelId, user.id);
        if (!allowed) {
          return new Response(
            JSON.stringify({ ok: false, error: "No eres miembro de este canal." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      await ensureTaskCommentsTable();
      const cmtId = `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const cRows = await sql(
        `
        INSERT INTO task_comments (id, task_id, channel_id, user_id, is_private, text, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *;
      `,
        [cmtId, taskId, channelId, user.id, isPriv, text]
      );

      return new Response(
        JSON.stringify({
          ok: true,
          comment: {
            ...cRows[0],
            author_id: user.id,
            author_name: user.full_name,
            author_avatar: user.avatar_url
          }
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Persist Collaborative Channel Chat Message
    const allowed = await canAccessChannel(channelId, user.id);
    if (!allowed) {
      return new Response(
        JSON.stringify({ ok: false, error: "No tienes acceso para publicar en este canal." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
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
