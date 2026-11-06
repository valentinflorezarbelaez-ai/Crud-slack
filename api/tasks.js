/**
 * SERVERLESS TASKS API ENDPOINT (GET & POST)
 * Reads and persists shared task boards in Neon PostgreSQL per channel.
 * Clean / Hexagonal Layer-0: zero external npm dependencies.
 */

import { sql } from "./_db.js";
import { createTaskEntity, sanitizePlainText } from "../src/domain/taskEntities.mjs";

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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_channel_id ON tasks(channel_id);
    `);
    tableEnsured = true;
  } catch (err) {
    // If DB is offline or table already initializing in parallel, proceed gracefully
  }
}

export function normalizeChannelId(raw) {
  let ch = String(raw || "general").trim().toLowerCase();
  if (ch.startsWith("c_")) ch = ch.slice(2);
  return ch || "general";
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const rawChannel = url.searchParams.get("channelId") || "general";
    const canonicalChannel = normalizeChannelId(rawChannel);

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(JSON.stringify({ ok: true, channelId: canonicalChannel, tasks: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    await ensureTasksTable();

    const rows = await sql(
      `
      SELECT 
        id, channel_id, order_idx, title, description, priority, priority_reason,
        status, deadline_date, deadline_label, deadline_state, missing_details,
        assignee, source_quote, depends_on_order, grounded, channel_type,
        updated_at
      FROM tasks
      WHERE channel_id = $1 OR channel_id = $2
      ORDER BY order_idx ASC, created_at ASC
      LIMIT 200;
    `,
      [canonicalChannel, `c_${canonicalChannel}`]
    );

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
          deadlineDate: row.deadline_date,
          deadlineLabel: row.deadline_label,
          deadlineState: row.deadline_state,
          missingDetails: row.missing_details,
          assignee: row.assignee,
          sourceQuote: row.source_quote,
          dependsOnOrder: row.depends_on_order,
          grounded: row.grounded !== false,
          channel: row.channel_type || "slack",
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
        },
        idx
      )
    );

    return new Response(JSON.stringify({ ok: true, channelId: canonicalChannel, tasks }), {
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

    if (body.tasks.length > 200) {
      return new Response(JSON.stringify({ ok: false, error: "Exceeded maximum of 200 tasks per channel." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const sanitizedTasks = body.tasks.map((raw, idx) => createTaskEntity(raw, idx));

    if (process.env.TASKFLOW_HERMETIC_TEST === "1" && !process.env.DATABASE_URL) {
      return new Response(
        JSON.stringify({ ok: true, channelId: canonicalChannel, count: sanitizedTasks.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    await ensureTasksTable();

    // Replace tasks for this channel cleanly to synchronize deletions and order updates
    await sql(
      `DELETE FROM tasks WHERE channel_id = $1 OR channel_id = $2;`,
      [canonicalChannel, `c_${canonicalChannel}`]
    );

    for (let idx = 0; idx < sanitizedTasks.length; idx++) {
      const t = sanitizedTasks[idx];
      await sql(
        `
        INSERT INTO tasks (
          id, channel_id, order_idx, title, description, priority, priority_reason,
          status, deadline_date, deadline_label, deadline_state, missing_details,
          assignee, source_quote, depends_on_order, grounded, channel_type, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, NOW()
        )
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
          updated_at = NOW();
      `,
        [
          t.id,
          canonicalChannel,
          idx + 1,
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
          t.channel || "slack"
        ]
      );
    }

    return new Response(
      JSON.stringify({ ok: true, channelId: canonicalChannel, count: sanitizedTasks.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
