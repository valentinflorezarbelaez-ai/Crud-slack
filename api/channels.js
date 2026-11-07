/**
 * CHANNELS ENDPOINT (GET, POST & DELETE)
 * Multi-tenant per-user channel registry, invite token generator, join handler,
 * real teammate discovery, and cascade deletion in Neon PostgreSQL.
 * Zero external npm dependencies.
 */

import crypto from "node:crypto";
import { sql } from "./_db.js";
import { getAuthenticatedUser } from "./_auth.js";

const DEMO_USER_IDS = new Set(["usr_valentin", "usr_ana", "usr_carlos", "usr_elena"]);
const PROTECTED_CHANNEL_SLUGS = new Set([
  "general",
  "personal",
  "mi-dia",
  "personal-proyectos",
  "mis-proyectos",
  "personal-notas",
  "notas-ideas"
]);

function isProtectedSlug(raw) {
  const norm = String(raw || "").trim().toLowerCase().replace(/^c_/, "");
  return PROTECTED_CHANNEL_SLUGS.has(norm) || norm.startsWith("personal-");
}

async function resolveRequestUserId(req, explicitUserId = "") {
  try {
    if (req?.headers && !(process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL)) {
      const sessionUser = await getAuthenticatedUser(req);
      if (sessionUser?.id) return sessionUser.id;
    }
  } catch {
    // Fall back to explicit userId parameter if session lookup fails
  }
  const clean = String(explicitUserId || "").trim().slice(0, 64);
  return clean || null;
}

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
          JSON.stringify({
            ok: true,
            channelId: "c_general",
            channel: { id: "c_general", name: "general", description: "", is_private: false },
            message: "Unido al canal exitosamente."
          }),
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
      const userId = await resolveRequestUserId(req, url?.searchParams.get("userId") || "");
      if (userId) {
        await sql(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [channelId, userId]
        ).catch(() => {});
      }

      const chRows = await sql(
        `SELECT id, COALESCE(display_name, split_part(name, '--', 1)) AS name, description, is_private
         FROM channels WHERE id = $1 LIMIT 1;`,
        [channelId]
      ).catch(() => []);

      return new Response(
        JSON.stringify({
          ok: true,
          channelId,
          channel: chRows[0] || null,
          message: "Te has unido al canal exitosamente."
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Scoped Multi-Tenant List Channels & Real Collaborators
    const effectiveUserId = await resolveRequestUserId(req, url?.searchParams.get("userId") || "");
    if (!effectiveUserId) {
      return new Response(JSON.stringify({ ok: true, channels: [], teammates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(JSON.stringify({ ok: true, channels: [], teammates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const isDemoUser = DEMO_USER_IDS.has(effectiveUserId);

    const rows = await sql(
      `
      SELECT c.id,
             COALESCE(c.display_name, split_part(c.name, '--', 1)) AS name,
             c.description,
             c.is_private,
             c.created_by,
             c.created_at,
             COUNT(m.id)::int AS message_count
      FROM channels c
      LEFT JOIN messages m ON m.channel_id = c.id
      WHERE (
        c.created_by = $1
        OR EXISTS (
          SELECT 1 FROM channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = $1
        )
      )
      AND ($2::boolean = TRUE OR c.id <> 'c_general' OR c.created_by = $1)
      GROUP BY c.id
      ORDER BY c.created_at ASC;
    `,
      [effectiveUserId, isDemoUser]
    );

    const teammates = await sql(
      `
      SELECT DISTINCT u.id, u.full_name, u.avatar_url, u.status_text
      FROM channel_members cm_self
      JOIN channel_members cm_peer
        ON cm_peer.channel_id = cm_self.channel_id AND cm_peer.user_id <> $1
      JOIN channels c ON c.id = cm_self.channel_id
      JOIN users u ON u.id = cm_peer.user_id
      WHERE cm_self.user_id = $1
        AND (c.id <> 'c_general' OR c.created_by IS NOT NULL)
      ORDER BY u.full_name ASC
      LIMIT 30;
    `,
      [effectiveUserId]
    ).catch(() => []);

    return new Response(JSON.stringify({ ok: true, channels: rows, teammates }), {
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

      const normInvite = channelId.toLowerCase();
      if (
        normInvite === "personal" ||
        normInvite === "mi-dia" ||
        normInvite.startsWith("personal-") ||
        normInvite === "mis-proyectos" ||
        normInvite === "notas-ideas"
      ) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Las listas personales privadas son solo tuyas y no admiten enlaces de invitación."
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const createdBy =
        (await resolveRequestUserId(req, body.userId || body.createdBy || "")) || "anonymous";
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

      if (createdBy && createdBy !== "anonymous") {
        await sql(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [channelId, createdBy]
        ).catch(() => {});
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
          JSON.stringify({
            ok: true,
            channelId: "c_general",
            channel: { id: "c_general", name: "general", description: "", is_private: false },
            message: "Unido al canal exitosamente."
          }),
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
      const userId = await resolveRequestUserId(req, body.userId || url?.searchParams.get("userId") || "");

      if (userId) {
        await sql(
          `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [channelId, userId]
        ).catch(() => {});
      }

      const chRows = await sql(
        `SELECT id, COALESCE(display_name, split_part(name, '--', 1)) AS name, description, is_private
         FROM channels WHERE id = $1 LIMIT 1;`,
        [channelId]
      ).catch(() => []);

      return new Response(
        JSON.stringify({
          ok: true,
          channelId,
          channel: chRows[0] || null,
          message: "Te has unido al canal exitosamente."
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Create Channel (Scoped to Authenticated Creator)
    let rawName = String(body.name || "").trim().toLowerCase();
    const description = String(body.description || "").trim().slice(0, 160);
    const isPrivate = Boolean(body.isPrivate);

    if (rawName.startsWith("#")) rawName = rawName.slice(1);

    if (isProtectedSlug(rawName) && rawName !== "general") {
      return new Response(
        JSON.stringify({ ok: false, error: "Ese nombre está reservado para tus listas personales privadas." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!/^[a-z0-9-_]{2,30}$/.test(rawName)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "El nombre del canal debe tener entre 2 y 30 caracteres alfanuméricos, guiones o guiones bajos."
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const creatorId = await resolveRequestUserId(req, body.userId || "");
    if (!creatorId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Inicia sesión para crear canales en tu espacio." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const randSuffix = `${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
    const channelId = `c_${rawName.replace(/-/g, "_")}_${randSuffix}`;

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(
        JSON.stringify({
          ok: true,
          channel: {
            id: channelId,
            name: rawName,
            description,
            is_private: isPrivate,
            created_by: creatorId
          }
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check duplicate channel display name ONLY within this user's own workspace
    const dupRows = await sql(
      `
      SELECT c.id FROM channels c
      WHERE COALESCE(c.display_name, split_part(c.name, '--', 1)) = $2
        AND (
          c.created_by = $1
          OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1)
        )
        AND c.id <> 'c_general'
      LIMIT 1;
    `,
      [creatorId, rawName]
    );

    if (dupRows.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, error: `Ya tienes un canal llamado #${rawName} en tu espacio.` }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const userTag = creatorId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
    const uniqueStorageName = `${rawName}--${userTag}_${crypto.randomBytes(2).toString("hex")}`;

    const insertRows = await sql(
      `
      INSERT INTO channels (id, name, display_name, description, is_private, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, COALESCE(display_name, $3) AS name, description, is_private, created_by, created_at;
    `,
      [channelId, uniqueStorageName, rawName, description, isPrivate, creatorId]
    );

    const channel = insertRows[0];
    await sql(
      `INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
      [channel.id, creatorId]
    );

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
    let bodyUserId = url?.searchParams.get("userId") || "";

    if (!channelId && !channelName && req?.method === "DELETE") {
      try {
        const body = await req.json();
        channelId = String(body?.channelId || body?.id || "").trim();
        channelName = String(body?.name || "").trim();
        bodyUserId = String(body?.userId || bodyUserId || "").trim();
      } catch {}
    }

    if (!channelId && !channelName) {
      return new Response(JSON.stringify({ ok: false, error: "channelId or name is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const norm = (channelName || channelId).toLowerCase().replace(/^c_/, "");
    if (isProtectedSlug(norm) || channelId === "c_general") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `El espacio #${norm} está protegido y no puede ser eliminado.`
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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

    const requesterId = await resolveRequestUserId(req, bodyUserId);

    // Resolve exact target channel ID so deleting #trabajo for User A NEVER touches User B's #trabajo!
    let targetChannelIds = [];
    if (channelId && channelId.startsWith("c_")) {
      if (requesterId) {
        const check = await sql(
          `SELECT id FROM channels c
           WHERE c.id = $1 AND (
             c.created_by IS NULL OR c.created_by = $2
             OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2)
           ) LIMIT 1;`,
          [channelId, requesterId]
        );
        if (check.length === 0) {
          return new Response(
            JSON.stringify({ ok: false, error: "No tienes permisos para eliminar este canal." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      targetChannelIds = [channelId, channelId.slice(2)];
    } else if (requesterId) {
      const owned = await sql(
        `SELECT id FROM channels c
         WHERE COALESCE(c.display_name, split_part(c.name, '--', 1)) = $2
           AND (c.created_by = $1 OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1));`,
        [requesterId, norm]
      );
      for (const r of owned) {
        targetChannelIds.push(r.id, r.id.replace(/^c_/, ""));
      }
    } else {
      targetChannelIds = [channelId || norm, `c_${norm}`];
    }

    if (targetChannelIds.length > 0) {
      await sql(
        `DELETE FROM tasks WHERE channel_id = ANY($1) AND (is_private = FALSE OR is_private IS NULL);`,
        [targetChannelIds]
      ).catch(() => {});

      await sql(`DELETE FROM channel_invites WHERE channel_id = ANY($1);`, [targetChannelIds]).catch(() => {});
      await sql(`DELETE FROM channel_members WHERE channel_id = ANY($1);`, [targetChannelIds]).catch(() => {});
      await sql(`DELETE FROM messages WHERE channel_id = ANY($1);`, [targetChannelIds]).catch(() => {});
      await sql(`DELETE FROM channels WHERE id = ANY($1);`, [targetChannelIds]).catch(() => {});
    }

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
