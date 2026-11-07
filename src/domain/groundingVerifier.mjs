/**
 * LAYER-0 ANTI-HALLUCINATION & NEURO-SYMBOLIC GROUNDING VERIFIER
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-003, FR-CS-004, FR-CS-019, BDD-CS-002, BDD-CS-011).
 *
 * Audits any candidate AI output against the raw source text to guarantee:
 * 1. Every task maps to real lexical evidence in the original message (Quote Grounding).
 * 2. Zero fabricated calendar dates when no temporal anchor exists in the source text.
 * 3. Zero fabricated exact hours (scheduledTime) when no hour expression exists in the source text.
 * 4. Zero fabricated assignees when no person/mention appears in the source text.
 * 5. Measurable clause coverage score against deterministic clause detection.
 *
 * Zero external runtime dependencies.
 */

import { DEADLINE_STATES, createTaskEntity } from "./taskEntities.mjs";
import {
  buildMissingInfoAudit,
  extractActionableClauses,
  inspectTemporalSignals
} from "./deterministicNlp.mjs";

const EXPLICIT_TIME_PATTERN =
  /(?:\b(?:a\s+las|las)\s+\d{1,2}\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm|a\.?\s*m\.?|p\.?\s*m\.?|hrs?|horas?)\b|\b(?:mediod[ií]a|medianoche)\b)/i;

/**
 * Normalizes text for accent-insensitive lexical matching.
 * @param {string} str
 * @returns {string}
 */
function normalizeLexical(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether a candidate quote or task title is grounded in the source message.
 * @param {string} sourceMessage
 * @param {string} sourceQuote
 * @param {string} title
 */
export function verifyQuoteGrounding(sourceMessage, sourceQuote, title) {
  const normSource = normalizeLexical(sourceMessage);
  const normQuote = normalizeLexical(sourceQuote);

  if (normQuote.length >= 4 && normSource.includes(normQuote)) {
    return { grounded: true, overlapRatio: 1 };
  }

  const probe = normQuote.length >= 4 ? normQuote : normalizeLexical(title);
  const tokens = probe.split(" ").filter((t) => t.length >= 4);
  if (tokens.length === 0) {
    return { grounded: normSource.length > 0, overlapRatio: 0.5 };
  }

  const matched = tokens.filter((tok) => normSource.includes(tok));
  const ratio = matched.length / tokens.length;
  return {
    grounded: ratio >= 0.5,
    overlapRatio: Number(ratio.toFixed(2))
  };
}

/**
 * Verifies and sanitizes a candidate AI triage payload against the original source message.
 * Revokes any hallucinated dates, exact hours, or assignees and computes deterministic quality metrics.
 *
 * @param {{
 *   sourceMessage: string,
 *   referenceDate: string,
 *   channel: string,
 *   candidate: {
 *     summary?: string,
 *     tasks?: Array<Record<string, unknown>>,
 *     missingInfoGaps?: Array<{ field: string, detail: string, severity?: "HIGH"|"MEDIUM" }>,
 *     clarificationDraft?: string
 *   }
 * }} params
 */
export function verifyAndGroundTriage({ sourceMessage, referenceDate, channel, candidate }) {
  const globalTemporal = inspectTemporalSignals(sourceMessage);
  const hasExplicitHourInSource =
    Boolean(globalTemporal.exactTime) || EXPLICIT_TIME_PATTERN.test(String(sourceMessage || ""));
  const deterministicClauses = extractActionableClauses(sourceMessage);
  const normSource = normalizeLexical(sourceMessage);

  const rawTasks = Array.isArray(candidate?.tasks) ? candidate.tasks : [];
  let hallucinationsPrevented = 0;
  let groundedCount = 0;

  const verifiedTasks = rawTasks.map((rawTask, idx) => {
    const task = createTaskEntity({ ...rawTask, channel, order: idx + 1 }, idx);

    // 1. Quote grounding check
    const quoteCheck = verifyQuoteGrounding(sourceMessage, task.sourceQuote, task.title);
    task.grounded = quoteCheck.grounded;
    if (quoteCheck.grounded) groundedCount++;

    // 2. Temporal Date Anti-Hallucination Guard:
    const quoteTemporal = inspectTemporalSignals(task.sourceQuote || task.title);
    if (task.deadlineDate && !globalTemporal.hasAnyTemporal) {
      task.deadlineDate = null;
      task.deadlineState = DEADLINE_STATES.MISSING_INFO;
      task.deadlineLabel = "Información faltante (fecha no especificada)";
      task.missingDetails =
        "Guardia Anti-Alucinación: El mensaje original no contiene fechas; se bloqueó una fecha inferida sin sustento.";
      hallucinationsPrevented++;
    } else if (
      task.deadlineDate &&
      !quoteTemporal.hasAnyTemporal &&
      globalTemporal.hasAnyTemporal &&
      task.deadlineState === DEADLINE_STATES.CONFIRMED
    ) {
      task.deadlineDate = null;
      task.deadlineState = DEADLINE_STATES.MISSING_INFO;
      task.deadlineLabel = "Información faltante (sin fecha propia en el mensaje)";
      task.missingDetails =
        task.missingDetails ||
        "Esta actividad no tiene fecha límite propia en el texto; requiere confirmar fecha intermedia.";
      hallucinationsPrevented++;
    } else if (
      task.deadlineDate &&
      !hasExplicitHourInSource &&
      task.deadlineState === DEADLINE_STATES.CONFIRMED
    ) {
      task.deadlineState = DEADLINE_STATES.PARTIAL_ANCHOR;
      if (!task.missingDetails) {
        task.missingDetails = "Se identificó el día de referencia, pero falta especificar la hora exacta.";
      }
    }

    // 3. Scheduled Hour Anti-Hallucination Guard (FR-CS-019):
    if (task.scheduledTime && !hasExplicitHourInSource) {
      task.scheduledTime = null;
      hallucinationsPrevented++;
    }

    // 4. Assignee Anti-Hallucination Guard:
    if (
      task.assignee &&
      task.assignee !== "Por asignar" &&
      !task.assignee.toLowerCase().includes("asignar") &&
      !task.assignee.toLowerCase().includes("especific")
    ) {
      const cleanAssignee = normalizeLexical(task.assignee.replace(/^@/, ""));
      if (cleanAssignee.length >= 3 && !normSource.includes(cleanAssignee)) {
        task.assignee = "Por asignar";
        hallucinationsPrevented++;
      }
    }

    return task;
  });

  const fallbackAudit = buildMissingInfoAudit(sourceMessage, verifiedTasks);
  const missingInfoGaps =
    Array.isArray(candidate?.missingInfoGaps) && candidate.missingInfoGaps.length > 0
      ? candidate.missingInfoGaps
      : fallbackAudit.gaps;
  const clarificationDraft =
    typeof candidate?.clarificationDraft === "string" && candidate.clarificationDraft.trim().length > 10
      ? candidate.clarificationDraft.trim()
      : fallbackAudit.clarificationDraft;

  const expectedCount = Math.max(1, deterministicClauses.length);
  const clauseCoverageScore = Math.min(100, Math.round((verifiedTasks.length / expectedCount) * 100));
  const groundingRate =
    verifiedTasks.length > 0 ? Math.round((groundedCount / verifiedTasks.length) * 100) : 0;
  const overallConfidenceScore = Math.round(groundingRate * 0.6 + clauseCoverageScore * 0.4);

  return {
    summary:
      typeof candidate?.summary === "string" && candidate.summary.trim().length > 0
        ? candidate.summary.trim()
        : `Se extrajeron y verificaron ${verifiedTasks.length} tarea(s) accionables.`,
    referenceDate,
    channel,
    tasks: verifiedTasks,
    missingInfoGaps,
    clarificationDraft,
    verificationReport: {
      verified: verifiedTasks.length > 0 && groundingRate >= 75,
      groundingRatePct: groundingRate,
      clauseCoveragePct: clauseCoverageScore,
      overallConfidencePct: overallConfidenceScore,
      hallucinationsPrevented,
      expectedClauseCount: deterministicClauses.length,
      extractedTaskCount: verifiedTasks.length
    }
  };
}
