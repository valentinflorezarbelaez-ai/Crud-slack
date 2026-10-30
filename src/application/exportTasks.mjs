/**
 * APPLICATION LAYER USE CASE: ENTERPRISE TASK EXPORT (SHAREPOINT LISTS CSV, SLACK MD, JSON)
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-007, BDD-CS-005).
 * Zero external runtime dependencies.
 */

import {
  DEADLINE_STATES,
  PRIORITIES,
  TASK_STATUSES,
  sanitizeCsvCell
} from "../domain/taskEntities.mjs";

/**
 * Generates an RFC 4180 UTF-8 BOM CSV ready for Microsoft SharePoint Lists, Planner, or Excel.
 * Protected against OWASP CSV Formula Injection.
 * @param {Array<Record<string, any>>} tasks
 * @returns {string}
 */
export function exportToSharePointCsv(tasks) {
  const headers = [
    "Orden",
    "Título de la Tarea",
    "Prioridad",
    "Estado",
    "Fecha Límite (ISO)",
    "Estado de Fecha",
    "Detalle Temporal / Faltante",
    "Responsable",
    "Justificación de Prioridad",
    "Cita Textual Fuente"
  ];

  const rows = [headers.map(sanitizeCsvCell).join(",")];

  for (const t of tasks || []) {
    const prioLabel = PRIORITIES[t.priority]?.labelEs || t.priority;
    const statusLabel = TASK_STATUSES[t.status]?.labelEs || t.status;
    const dateStateLabel =
      t.deadlineState === DEADLINE_STATES.CONFIRMED
        ? "Confirmada"
        : t.deadlineState === DEADLINE_STATES.PARTIAL_ANCHOR
          ? "Referencia Parcial"
          : "Información Faltante";

    const row = [
      t.order,
      t.title,
      prioLabel,
      statusLabel,
      t.deadlineDate || "SIN_FECHA",
      dateStateLabel,
      t.missingDetails || t.deadlineLabel || "",
      t.assignee || "Por asignar",
      t.priorityReason || "",
      t.sourceQuote || ""
    ];
    rows.push(row.map(sanitizeCsvCell).join(","));
  }

  return `\uFEFF${rows.join("\r\n")}`;
}

/**
 * Generates a structured Markdown digest suitable for posting directly into Slack or Microsoft Teams.
 * @param {{
 *   tasks: Array<Record<string, any>>,
 *   summary?: string,
 *   clarificationDraft?: string
 * }} params
 * @returns {string}
 */
export function exportToSlackMarkdown({ tasks, summary = "", clarificationDraft = "" }) {
  const prioEmoji = {
    CRITICAL: "[CRÍTICA · P0]",
    HIGH: "[ALTA · P1]",
    MEDIUM: "[MEDIA · P2]",
    LOW: "[BAJA · P3]"
  };

  const lines = [
    "# Plan de Tareas Organizado con IA (TaskFlow AI)",
    summary ? `> ${summary}` : "",
    "",
    "## Lista de Actividades Priorizadas"
  ].filter((l, idx) => !(idx === 1 && !l));

  for (const t of tasks || []) {
    const check = t.status === "COMPLETED" ? "[x]" : t.status === "IN_PROGRESS" ? "[-]" : "[ ]";
    const tag = prioEmoji[t.priority] || "[MEDIA]";
    const deadlineInfo =
      t.deadlineState === DEADLINE_STATES.CONFIRMED
        ? `Fecha: ${t.deadlineDate}`
        : `Fecha: ${t.deadlineLabel} *(Info faltante)*`;

    lines.push(
      `- ${check} **#${t.order} ${t.title}** — ${tag} | ${deadlineInfo} | Resp: *${t.assignee}*`
    );
    if (t.missingDetails) {
      lines.push(`  - *Dato faltante detectado:* ${t.missingDetails}`);
    }
  }

  if (clarificationDraft) {
    lines.push("", "## Preguntas de Aclaración Sugeridas", "```text", clarificationDraft, "```");
  }

  return lines.join("\n");
}

/**
 * Serializes board state into a clean, verifiable JSON contract.
 * @param {Record<string, any>} boardState
 * @returns {string}
 */
export function exportToJsonContract(boardState) {
  return JSON.stringify(
    {
      schemaVersion: "1.0.0",
      exportedAt: new Date().toISOString(),
      checksum: boardState?.checksum || null,
      analysisMeta: boardState?.lastAnalysis || null,
      tasks: boardState?.tasks || []
    },
    null,
    2
  );
}
