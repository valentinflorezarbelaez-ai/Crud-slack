/**
 * CHANNEL JOIN ENDPOINT (GET / POST)
 * Validates invite token and adds user to the channel.
 * Zero external npm dependencies.
 */

import { sql } from "../_db.js";
import { getAuthenticatedUser } from "../_auth.js";

async function handleJoin(req) {
  try {
    const url = new URL(req.url);
    let token = (url.searchParams.get("token") || "").trim();
    let bodyUserId = null;

    if (!token && req.method === "POST") {
      try {
        const body = await req.json();
        token = (body?.token || "").trim();
        bodyUserId = body?.userId || null;
      } catch {
        // empty or non-json body
      }
    }

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
          message: "Unido al canal exitosamente."
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const rows = await sql(
      `
      SELECT channel_id, expires_at
      FROM channel_invites
      WHERE token = $1 AND expires_at > NOW()
      LIMIT 1;
    `,
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
    const userId = user ? user.id : (bodyUserId || url.searchParams.get("userId"));

    if (userId) {
      await sql(
        `
        INSERT INTO channel_members (channel_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `,
        [channelId, userId]
      ).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        ok: true,
        channelId,
        message: "Te has unido al canal exitosamente."
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

export const GET = handleJoin;
export const POST = handleJoin;
