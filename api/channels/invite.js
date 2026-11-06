/**
 * CHANNEL INVITE GENERATOR (POST)
 * Creates a cryptographic shareable invite link for team channels.
 * Zero external npm dependencies.
 */

import crypto from "node:crypto";
import { sql } from "../_db.js";
import { getAuthenticatedUser } from "../_auth.js";

export async function POST(req) {
  try {
    let body = {};
    try {
      if (typeof req.json === "function") body = await req.json();
    } catch {}

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
      `
      INSERT INTO channel_invites (token, channel_id, created_by, expires_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
      ON CONFLICT (token) DO NOTHING;
    `,
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
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
