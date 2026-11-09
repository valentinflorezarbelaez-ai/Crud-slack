/**
 * SERVERLESS TASKS API ENDPOINT (GET & POST)
 * Reads and persists shared task boards and per-user private personal spaces in Neon PostgreSQL.
 * Enforces Cookie-Only HMAC-SHA256 verification for real accounts + channel_members check.
 * Clean / Hexagonal Layer-0: zero external npm dependencies.
 */

import { sql } from "./_db.js";
import { canAccessChannel, resolveVerifiedUserId } from "./_auth.js";
import { createTaskEntity } from "../src/domain/taskEntities.mjs";
import { computeTasksChecksum } from "../src/domain/taskBoardStore.mjs";

let tableEnsured = false;

export async function ensureTasksTable() {
  if (tableEnsured) return;
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(64) PRIMARY KEY,
        channel_id VARCHAR(64) NOT NULL,
        order_idx INT DEFAULT 0,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        priority VARCHAR(16) NOT NULL,
        priority_reason TEXT DEFAULT '',
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        deadline_date VARCHAR(16),
        deadline_label TEXT DEFAULT '',
        deadline_state VARCHAR(24) DEFAULT 'MISSING_INFO',
        missing_details TEXT DEFAULT '',
        assignee TEXT DEFAULT 'Por asignar',
        source_quote TEXT DEFAULT '',
        depends_on_order INT,
        grounded BOOLEAN DEFAULT TRUE,
        channel_type VARCHAR(24) DEFAULT 'slack',
        scheduled_time VARCHAR(8) DEFAULT NULL,
        duration_minutes INT DEFAULT 60,
        is_private BOOLEAN DEFAULT FALSE,
        user_id VARCHAR(64) DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_channel_id ON tasks(channel_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_private_user_channel ON tasks(user_id, channel_id) WHERE is_private = TRUE;
    `);
    tableEnsured = true;
  } catch {
    // If DB is offline or table already initializing in parallel, proceed gracefully
  }
}

export function normalizeChannelId(raw) {
  let ch = String(raw || "general").trim().toLowerCase();
  if (ch.startsWith("c_")) ch = ch.slice(2);
  if (ch === "mi-dia") return "personal";
  if (ch === "mis-proyectos") return "personal-proyectos";
  if (ch === "notas-ideas") return "personal-notas";
  return ch || "general";
}

export function buildBulkTaskUpsert(chunk, canonicalChannel, startGlobalOrder = 1) {
  const valuesRows = [];
  const flatParams = [];
  let pIdx = 1;

  for (let i = 0; i < chunk.length; i++) {
    const t = chunk[i];
    const globalOrder = startGlobalOrder + i;
    const rowParams = [
      t.id,
      canonicalChannel,
      globalOrder,
      t.title,
      t.description || "",
      t.priority,
      t.priorityReason || "",
      t.status,
      t.deadlineDate || null,
      t.deadlineLabel || "",
      t.deadlineState || "MISSING_INFO",
      t.missingDetails || "",
      t.assignee || "Por asignar",
      t.sourceQuote || "",
      t.dependsOnOrder ?? null,
      t.grounded !== false,
      t.channel || "slack",
      t.scheduledTime || null,
      t.durationMinutes ?? 60,
      Boolean(t.isPrivate),
      t.userId || null
    ];

    const placeholders = rowParams.map(() => `$${pIdx++}`);
    valuesRows.push(`(${placeholders.join(", ")}, NOW())`);
    flatParams.push(...rowParams);
  }

  const queryText = `
    INSERT INTO tasks (
      id, channel_id, order_idx, title, description, priority, priority_reason,
      status, deadline_date, deadline_label, deadline_state, missing_details,
      assignee, source_quote, depends_on_order, grounded, channel_type,
      scheduled_time, duration_minutes, is_private, user_id, updated_at
    ) VALUES ${valuesRows.join(", ")}
    ON CONFLICT (id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id,
      order_idx = EXCLUDED.order_idx,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      priority = EXCLUDED.priority,
      priority_reason = EXCLUDED.priority_reason,
      status = EXCLUDED.status,
      deadline_date = EXCLUDED.deadline_date,
      deadline_label = EXCLUDED.deadline_label,
      deadline_state = EXCLUDED.deadline_state,
      missing_details = EXCLUDED.missing_details,
      assignee = EXCLUDED.assignee,
      source_quote = EXCLUDED.source_quote,
      depends_on_order = EXCLUDED.depends_on_order,
      grounded = EXCLUDED.grounded,
      channel_type = EXCLUDED.channel_type,
      scheduled_time = EXCLUDED.scheduled_time,
      duration_minutes = EXCLUDED.duration_minutes,
      is_private = EXCLUDED.is_private,
      user_id = EXCLUDED.user_id,
      updated_at = NOW()
    WHERE tasks.user_id IS NOT DISTINCT FROM EXCLUDED.user_id;
  `;

  return { queryText, flatParams, valuesRows };
}

export function isPersonalChannelId(canonicalChannel, rawChannel = "", explicitPrivate = false) {
  const c = String(canonicalChannel || "").toLowerCase();
  return (
    c === "personal" ||
    c.startsWith("personal-") ||
    String(rawChannel || "").startsWith("usr_") ||
    Boolean(explicitPrivate)
  );
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const rawChannel = url.searchParams.get("channelId") || "general";
    const canonicalChannel = normalizeChannelId(rawChannel);
    const rawUserId = url.searchParams.get("userId") || (rawChannel.startsWith("usr_") ? rawChannel : "");
    const isPrivate = isPersonalChannelId(
      canonicalChannel,
      rawChannel,
      url.searchParams.get("isPrivate") === "true"
    );

    const effectiveUserId = await resolveVerifiedUserId(req, rawUserId);
    if (isPrivate && !effectiveUserId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Sesión autenticada requerida para acceder a tus listas personales privadas."
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(
        JSON.stringify({
          ok: true,
          channelId: canonicalChannel,
          isPrivate,
          userId: effectiveUserId,
          checksum: computeTasksChecksum([]),
          tasks: []
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (!isPrivate) {
      const allowed = await canAccessChannel(rawChannel, effectiveUserId);
      if (!allowed) {
        return new Response(
          JSON.stringify({ ok: false, error: "No eres miembro de este canal privado." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    await ensureTasksTable();

    let rows;
    if (isPrivate && effectiveUserId) {
      rows = await sql(
        `
        SELECT 
          id, channel_id, order_idx, title, description, priority, priority_reason,
          status, deadline_date, deadline_label, deadline_state, missing_details,
          assignee, source_quote, depends_on_order, grounded, channel_type,
          scheduled_time, duration_minutes, is_private, user_id, updated_at
        FROM tasks
        WHERE is_private = TRUE AND user_id = $1 AND channel_id = $2
        ORDER BY scheduled_time ASC NULLS LAST, order_idx ASC, created_at ASC
        LIMIT 200;
      `,
        [effectiveUserId, canonicalChannel]
      );
    } else {
      rows = await sql(
        `
        SELECT 
          id, channel_id, order_idx, title, description, priority, priority_reason,
          status, deadline_date, deadline_label, deadline_state, missing_details,
          assignee, source_quote, depends_on_order, grounded, channel_type,
          scheduled_time, duration_minutes, is_private, user_id, updated_at
        FROM tasks
        WHERE (channel_id = $1 OR channel_id = $2) AND (is_private = FALSE OR is_private IS NULL)
        ORDER BY scheduled_time ASC NULLS LAST, order_idx ASC, created_at ASC
        LIMIT 200;
      `,
        [canonicalChannel, `c_${canonicalChannel}`]
      );
    }

    const tasks = (rows || []).map((row, idx) =>
      createTaskEntity(
        {
          id: row.id,
          order: row.order_idx ?? idx + 1,
          title: row.title,
          description: row.description,
          priority: row.priority,
          priorityReason: row.priority_reason,
          status: row.status,
          deadlineDate: row.deadline_date ? String(row.deadline_date).slice(0, 10) : null,
          deadlineLabel: row.deadline_label,
          deadlineState: row.deadline_state,
          missingDetails: row.missing_details,
          assignee: row.assignee,
          sourceQuote: row.source_quote,
          dependsOnOrder: row.depends_on_order,
          grounded: row.grounded !== false,
          channel: row.channel_type || "slack",
          scheduledTime: row.scheduled_time || null,
          durationMinutes: row.duration_minutes ?? 60,
          isPrivate: Boolean(row.is_private),
          userId: row.user_id || null,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
        },
        idx
      )
    );

    return new Response(
      JSON.stringify({
        ok: true,
        channelId: canonicalChannel,
        checksum: computeTasksChecksum(tasks),
        tasks
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
      if (typeof req.json === "function") {
        body = await req.json();
      }
    } catch {}

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const rawChannel = body.channelId;
    if (!rawChannel || typeof rawChannel !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "channelId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!Array.isArray(body.tasks)) {
      return new Response(JSON.stringify({ ok: false, error: "tasks must be an array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const canonicalChannel = normalizeChannelId(rawChannel);
    const rawUserId = body.userId || (rawChannel.startsWith("usr_") ? rawChannel : "");
    const isPrivate = isPersonalChannelId(canonicalChannel, rawChannel, body.isPrivate);

    const effectiveUserId = await resolveVerifiedUserId(req, rawUserId);
    if (isPrivate && !effectiveUserId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Sesión autenticada requerida para guardar tareas en tu lista privada."
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    if (body.tasks.length > 200) {
      return new Response(JSON.stringify({ ok: false, error: "Exceeded maximum of 200 tasks per channel." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const sanitizedTasks = body.tasks.map((raw, idx) =>
      createTaskEntity(
        {
          ...raw,
          isPrivate,
          userId: isPrivate ? effectiveUserId : effectiveUserId || raw.userId || null
        },
        idx
      )
    );

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(
        JSON.stringify({
          ok: true,
          channelId: canonicalChannel,
          isPrivate,
          userId: effectiveUserId,
          checksum: computeTasksChecksum(sanitizedTasks),
          count: sanitizedTasks.length
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isPrivate) {
      const allowed = await canAccessChannel(rawChannel, effectiveUserId);
      if (!allowed) {
        return new Response(
          JSON.stringify({ ok: false, error: "No eres miembro de este canal privado." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    await ensureTasksTable();

    if (sanitizedTasks.length === 0) {
      if (isPrivate && effectiveUserId) {
        await sql(
          `DELETE FROM tasks WHERE is_private = TRUE AND user_id = $1 AND channel_id = $2;`,
          [effectiveUserId, canonicalChannel]
        );
      } else {
        await sql(
          `DELETE FROM tasks WHERE (channel_id = $1 OR channel_id = $2) AND (is_private = FALSE OR is_private IS NULL);`,
          [canonicalChannel, `c_${canonicalChannel}`]
        );
      }
    } else {
      const CHUNK_SIZE = 40;
      for (let c = 0; c < sanitizedTasks.length; c += CHUNK_SIZE) {
        const chunk = sanitizedTasks.slice(c, c + CHUNK_SIZE);
        const { queryText, flatParams } = buildBulkTaskUpsert(chunk, canonicalChannel, c + 1);
        await sql(queryText, flatParams);
      }

      const activeTaskIds = sanitizedTasks.map((t) => t.id);
      if (isPrivate && effectiveUserId) {
        await sql(
          `DELETE FROM tasks WHERE is_private = TRUE AND user_id = $1 AND channel_id = $2 AND NOT (id = ANY($3));`,
          [effectiveUserId, canonicalChannel, activeTaskIds]
        );
      } else {
        await sql(
          `DELETE FROM tasks WHERE (channel_id = $1 OR channel_id = $2) AND (is_private = FALSE OR is_private IS NULL) AND NOT (id = ANY($3));`,
          [canonicalChannel, `c_${canonicalChannel}`, activeTaskIds]
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        channelId: canonicalChannel,
        checksum: computeTasksChecksum(sanitizedTasks),
        count: sanitizedTasks.length
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
