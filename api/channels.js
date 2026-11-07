/**
 * CHANNELS ENDPOINT (GET & POST)
 * Reads, creates, invites, and joins channels in Neon PostgreSQL.
 * Consolidates channel membership and invitation routing to remain within Vercel function limits.
 * Zero external npm dependencies.
 */

import crypto from "node:crypto";
import { sql } from "./_db.js";
import { getAuthenticatedUser } from "./_auth.js";

export async function GET(req) {
  try {
    const url = req?.url ? new URL(req.url) : null;
    const action = url?.searchParams.get("action") || "";
    const token = (url?.searchParams.get("token") || "").trim();

    // 1. Join Channel Action via GET
    if (action === "join" || token) {
      if (!token) {
        return new Response(JSON.stringify({ ok: false, error: "token is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
        return new Response(
          JSON.stringify({ ok: true, channelId: "c_general", message: "Unido al canal exitosamente." }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const rows = await sql(
        `SELECT channel_id, expires_at FROM channel_invites WHERE token = $1 AND expires_at > NOW() LIMIT 1;`,
        [token]
      );
      if (rows.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "El enlace de invitación es inválido o ha expirado." }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const channelId = rows[0].channel_id;
      const user = await getAuthenticatedUser(req);
      const userId = user ? user.id : url?.searchParams.get("userId");
      if (userId) {
        await sql(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [channelId, userId]
        ).catch(() => {});
      }

      return new Response(
        JSON.stringify({ ok: true, channelId, message: "Te has unido al canal exitosamente." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Default: List Channels
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
    if (!body || typeof body !== "object") body = {};

    const url = req?.url ? new URL(req.url) : null;
    const action = url?.searchParams.get("action") || body.action || "";

    // 1. Generate Invite Token
    if (action === "invite" || (body.channelId && !body.name && !body.token)) {
      const channelId = String(body.channelId || "").trim();
      if (!channelId) {
        return new Response(JSON.stringify({ ok: false, error: "channelId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const user = await getAuthenticatedUser(req);
      const createdBy = user ? user.id : String(body.userId || "anonymous");
      const token = `inv_${crypto.randomBytes(16).toString("hex")}`;

      if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
        return new Response(
          JSON.stringify({
            ok: true,
            token,
            channelId,
            inviteUrl: `https://crud-slack.vercel.app/?join=${token}`
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      await sql(
        `INSERT INTO channel_invites (token, channel_id, created_by, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
         ON CONFLICT (token) DO NOTHING;`,
        [token, channelId, createdBy]
      );

      return new Response(
        JSON.stringify({
          ok: true,
          token,
          channelId,
          inviteUrl: `https://crud-slack.vercel.app/?join=${token}`
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Join Channel via POST
    if (action === "join" || body.token) {
      const token = (body.token || url?.searchParams.get("token") || "").trim();
      if (!token) {
        return new Response(JSON.stringify({ ok: false, error: "token is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
        return new Response(
          JSON.stringify({ ok: true, channelId: "c_general", message: "Unido al canal exitosamente." }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const rows = await sql(
        `SELECT channel_id, expires_at FROM channel_invites WHERE token = $1 AND expires_at > NOW() LIMIT 1;`,
        [token]
      );
      if (rows.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "El enlace de invitación es inválido o ha expirado." }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const channelId = rows[0].channel_id;
      const user = await getAuthenticatedUser(req);
      const userId = user ? user.id : (body.userId || url?.searchParams.get("userId"));

      if (userId) {
        await sql(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [channelId, userId]
        ).catch(() => {});
      }

      return new Response(
        JSON.stringify({ ok: true, channelId, message: "Te has unido al canal exitosamente." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Create Channel
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

    if (rawName.startsWith("#")) rawName = rawName.slice(1);

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


export async function DELETE(req) {
  try {
    const url = req?.url ? new URL(req.url) : null;
    let channelId = (url?.searchParams.get("channelId") || url?.searchParams.get("id") || "").trim();
    let channelName = (url?.searchParams.get("name") || "").trim();

    if (!channelId && !channelName && req.method === "DELETE") {
      try {
        const body = await req.json();
        channelId = String(body?.channelId || body?.id || "").trim();
        channelName = String(body?.name || "").trim();
      } catch {}
    }

    if (!channelId && !channelName) {
      return new Response(JSON.stringify({ ok: false, error: "channelId or name is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Protection for root canonical channel
    const norm = (channelName || channelId).toLowerCase().replace(/^c_/, "");
    if (norm === "general") {
      return new Response(JSON.stringify({ ok: false, error: "El canal #general no puede ser eliminado." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          channelId: channelId || norm,
          message: `Canal #${norm} eliminado exitosamente.`
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete dependent entities in Neon PostgreSQL
    await sql(
      `DELETE FROM tasks WHERE channel_id = $1 OR channel_id = $2 OR channel_id = $3;`,
      [channelId, norm, `c_${norm}`]
    ).catch(() => {});

    await sql(
      `DELETE FROM channel_invites WHERE channel_id = $1 OR channel_id = $2 OR channel_id = $3;`,
      [channelId, norm, `c_${norm}`]
    ).catch(() => {});

    await sql(
      `DELETE FROM channel_members WHERE channel_id = $1 OR channel_id = $2 OR channel_id = $3;`,
      [channelId, norm, `c_${norm}`]
    ).catch(() => {});

    await sql(
      `DELETE FROM messages WHERE channel_id = $1 OR channel_id = $2 OR channel_id = $3;`,
      [channelId, norm, `c_${norm}`]
    ).catch(() => {});

    await sql(
      `DELETE FROM channels WHERE id = $1 OR name = $2 OR id = $3;`,
      [channelId, norm, `c_${norm}`]
    ).catch(() => {});

    return new Response(
      JSON.stringify({
        ok: true,
        deleted: true,
        channelId: channelId || norm,
        message: `Canal #${norm} eliminado exitosamente.`
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
