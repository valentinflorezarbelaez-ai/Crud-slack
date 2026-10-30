/**
 * APPLICATION LAYER USE CASE: ENTERPRISE TASK EXPORT (SHAREPOINT LISTS CSV, SLACK MD, TEAMS ADAPTIVE CARD, JSON)
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
 * Generates an official Microsoft Teams Adaptive Card (v1.5) payload for Microsoft 365 / Power Automate.
 * @param {{
 *   tasks: Array<Record<string, any>>,
 *   summary?: string,
 *   clarificationDraft?: string,
 *   channel?: string,
 *   referenceDate?: string
 * }} params
 * @returns {Record<string, any>}
 */
export function exportToTeamsAdaptiveCard({
  tasks,
  summary = "",
  clarificationDraft = "",
  channel = "email",
  referenceDate = ""
}) {
  const cardBody = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: "⚡ TaskFlow AI · Plan de Tareas Extraído",
      color: "Accent"
    },
    {
      type: "TextBlock",
      wrap: true,
      spacing: "None",
      isSubtle: true,
      text: summary || "Solicitud de correo/chat procesada y auditada contra invención de fechas."
    },
    {
      type: "FactSet",
      spacing: "Small",
      facts: [
        { title: "Canal Origen", value: channel.toUpperCase() },
        { title: "Fecha Referencia", value: referenceDate || "Hoy" },
        { title: "Total Actividades", value: String(tasks?.length || 0) },
        { title: "Motor", value: "Gemini 3.8 Flash + Verificador Anti-Alucinación" }
      ]
    },
    {
      type: "TextBlock",
      text: "📋 Actividades Priorizadas por Dependencia Lógica:",
      weight: "Bolder",
      spacing: "Medium"
    }
  ];

  for (const t of tasks || []) {
    const isMissing = t.deadlineState !== DEADLINE_STATES.CONFIRMED;
    const prioColor =
      t.priority === "CRITICAL"
        ? "Attention"
        : t.priority === "HIGH"
          ? "Warning"
          : t.priority === "MEDIUM"
            ? "Good"
            : "Default";

    cardBody.push({
      type: "Container",
      separator: true,
      spacing: "Small",
      items: [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "auto",
              items: [
                {
                  type: "TextBlock",
                  text: `#${t.order}`,
                  weight: "Bolder",
                  color: "Accent"
                }
              ]
            },
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "TextBlock",
                  text: t.title,
                  weight: "Bolder",
                  wrap: true
                },
                {
                  type: "TextBlock",
                  spacing: "None",
                  isSubtle: true,
                  size: "Small",
                  wrap: true,
                  text: `${t.priority} · ${t.priorityReason || "Sin justificación adicional"}`
                },
                {
                  type: "TextBlock",
                  spacing: "None",
                  size: "Small",
                  color: isMissing ? "Attention" : "Good",
                  text: isMissing
                    ? `⚠️ ${t.deadlineLabel} (${t.missingDetails || "Falta confirmar fecha u hora"})`
                    : `📅 Vencimiento: ${t.deadlineDate} · Resp: ${t.assignee || "Por asignar"}`
                }
              ]
            }
          ]
        }
      ]
    });
  }

  if (clarificationDraft) {
    cardBody.push(
      {
        type: "TextBlock",
        text: "❓ Borrador de Aclaración para el Remitente:",
        weight: "Bolder",
        spacing: "Medium"
      },
      {
        type: "TextBlock",
        wrap: true,
        spacing: "Small",
        isSubtle: true,
        text: clarificationDraft
      }
    );
  }

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    msTeams: {
      width: "Full"
    },
    body: cardBody,
    actions: [
      {
        type: "Action.OpenUrl",
        title: "Abrir en TaskFlow Web",
        url: "https://crud-slack.vercel.app"
      },
      {
        type: "Action.OpenUrl",
        title: "Ver en Lista de SharePoint",
        url: "https://crud-slack.vercel.app?view=sharepoint"
      }
    ]
  };
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
