/**
 * GET & POST CURRENT AUTHENTICATED USER PROFILE + PERSONALIZED PREFERENCES
 * Consolidated in api/auth/me.js to stay within Vercel Hobby 12-function limit.
 * Zero external npm dependencies.
 */

import { sql } from "../_db.js";
import { getAuthenticatedUser } from "../_auth.js";
import { sanitizePlainText } from "../../src/domain/taskEntities.mjs";

const ALLOWED_THEMES = new Set(["light", "warm", "dark"]);
const ALLOWED_SCALES = new Set(["md", "xl"]);
const ALLOWED_LAYOUTS = new Set(["split", "focus"]);

function sanitizePreferencesPatch(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean = {};
  if (typeof raw.theme === "string" && ALLOWED_THEMES.has(raw.theme)) {
    clean.theme = raw.theme;
  }
  if (typeof raw.scale === "string" && ALLOWED_SCALES.has(raw.scale)) {
    clean.scale = raw.scale;
  }
  if (typeof raw.layout === "string" && ALLOWED_LAYOUTS.has(raw.layout)) {
    clean.layout = raw.layout;
  }
  return clean;
}

export async function GET(req) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, user: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          ...user,
          preferences: user.preferences || {}
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
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

    const sessionUser = await getAuthenticatedUser(req);
    const effectiveUserId = sessionUser?.id || sanitizePlainText(String(body.userId || "")).slice(0, 64);

    if (!effectiveUserId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Autenticación requerida para actualizar tu perfil." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const prefPatch = sanitizePreferencesPatch(body.preferences);
    const hasStatusPatch = typeof body.statusText === "string" || typeof body.status_text === "string";
    const cleanStatus = hasStatusPatch
      ? sanitizePlainText(String(body.statusText ?? body.status_text ?? "")).slice(0, 80) || "En línea"
      : null;

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: effectiveUserId,
            status_text: cleanStatus || "En línea",
            preferences: prefPatch
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const rows = await sql(
      `
      UPDATE users
      SET status_text = COALESCE($2, status_text),
          preferences = COALESCE(preferences, '{}'::jsonb) || $3::jsonb,
          last_seen_at = NOW()
      WHERE id = $1
      RETURNING id, google_id, email, full_name, avatar_url, status_text,
                COALESCE(preferences, '{}'::jsonb) AS preferences;
    `,
      [effectiveUserId, cleanStatus, JSON.stringify(prefPatch)]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Usuario no encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, user: rows[0] }), {
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

export const PATCH = POST;
