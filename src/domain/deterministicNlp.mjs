/**
 * LAYER-0 DETERMINISTIC NEURO-SYMBOLIC NLP & TEMPORAL TRIAGE ENGINE
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-001, FR-CS-002, FR-CS-003, FR-CS-005).
 *
 * Extracts actionable tasks from unstructured Spanish/English workplace messages,
 * infers logical execution dependencies, anchors relative dates without fabricating
 * missing deadlines, and drafts clarification replies.
 * Zero external runtime dependencies.
 */

import {
  DEADLINE_STATES,
  createTaskEntity,
  sanitizePlainText
} from "./taskEntities.mjs";

const WEEKDAY_MAP_ES = Object.freeze({
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
});

const MONTH_MAP_ES = Object.freeze({
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
});

const ACTION_VERBS_REGEX =
  /\b(revisar|actualizar|enviar|preparar|agendar|programar|validar|auditar|corregir|desplegar|configurar|crear|documentar|compartir|aprobar|redactar|coordinar|subir|migrar|presentar|llamar|responder|analizar|verificar|organizar|definir|confirmar|entregar|completar|resolver|ajustar|construir|publicar|notificar|sincronizar|review|update|send|prepare|schedule|validate|audit|fix|deploy|create|share|submit|complete)\b/i;

const TRIGGER_PREFIX_REGEX =
  /^(?:hola[^,.!:\n]*[,.!:]?\s*)?(?:buenos\s+d[ií]as[^,.!:\n]*[,.!:]?\s*|buenas\s+tardes[^,.!:\n]*[,.!:]?\s*|equipo[,.!:]?\s*)?(?:por\s+favor[,.!:]?\s*|necesitamos\s+|hay\s+que\s+|debemos\s+|tenemos\s+que\s+|se\s+requiere\s+|se\s+debe\s+|favor\s+de\s+|urge\s+|es\s+necesario\s+|recuerden\s+|we\s+need\s+to\s+|please[,.!:]?\s*)/i;

const GREETING_ONLY_REGEX =
  /^(hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|saludos|gracias|muchas\s+gracias|por\s+favor|favor|quedo\s+atento|atentamente|hello|hi|thanks|please)[,!.\s]*$/i;

/**
 * Formats a UTC Date object into YYYY-MM-DD.
 * @param {Date} dateObj
 * @returns {string}
 */
function toIsoDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

/**
 * Parses YYYY-MM-DD into a UTC Date at noon to avoid timezone drift.
 * @param {string} isoStr
 * @returns {Date}
 */
function parseIsoRef(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
}

/**
 * Resolves the next occurrence of a target weekday (0=Sun..6=Sat) from referenceDate.
 * If today IS that weekday, returns today if "hoy" is present, otherwise +7 days if "próximo" or same week upcoming.
 * @param {string} referenceDate
 * @param {number} targetDow
 * @param {boolean} forceNextWeek
 * @returns {string}
 */
export function resolveUpcomingWeekday(referenceDate, targetDow, forceNextWeek = false) {
  const base = parseIsoRef(referenceDate);
  const currentDow = base.getUTCDay();
  let delta = (targetDow - currentDow + 7) % 7;
  if (delta === 0 && forceNextWeek) delta = 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return toIsoDate(base);
}

/**
 * Adds days to an ISO date string.
 * @param {string} referenceDate
 * @param {number} days
 * @returns {string}
 */
export function addDaysIso(referenceDate, days) {
  const base = parseIsoRef(referenceDate);
  base.setUTCDate(base.getUTCDate() + days);
  return toIsoDate(base);
}

/**
 * Detects whether a text contains ANY explicit or relative temporal anchor.
 * Used both by extraction and by the anti-hallucination verifier.
 * @param {string} text
 */
export function inspectTemporalSignals(text) {
  const lower = text.toLowerCase();
  const isoMatch = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const slashMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  const namedMonthMatch = lower.match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/
  );
  const weekdayMatch = lower.match(
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  const relativeDayMatch = lower.match(/\b(hoy|ma[ñn]ana|pasado\s+ma[ñn]ana|today|tomorrow|esta\s+tarde|esta\s+semana|fin\s+de\s+mes)\b/);
  const beforeEventMatch = lower.match(/\b(antes\s+de\s+la\s+reuni[oó]n|antes\s+del\s+evento|antes\s+de\s+entregar|previo\s+a\s+la\s+reuni[oó]n|before\s+the\s+meeting)\b/);
  const exactTimeMatch = lower.match(/\b(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)|mediod[ií]a)\b/);

  const hasAnyTemporal = Boolean(
    isoMatch || slashMatch || namedMonthMatch || weekdayMatch || relativeDayMatch || beforeEventMatch || exactTimeMatch
  );

  return {
    hasAnyTemporal,
    isoDate: isoMatch ? isoMatch[1] : null,
    slashMatch,
    namedMonthMatch,
    weekday: weekdayMatch ? weekdayMatch[1] : null,
    relativeDay: relativeDayMatch ? relativeDayMatch[1] : null,
    beforeEvent: beforeEventMatch ? beforeEventMatch[1] : null,
    exactTime: exactTimeMatch ? exactTimeMatch[1] : null
  };
}

/**
 * Resolves temporal expression for a specific clause given global message anchors.
 * Never fabricates dates when missing.
 * @param {string} clause
 * @param {string} referenceDate
 * @param {{ anchorDate: string|null, anchorLabel: string|null, hasExactTime: boolean }} globalAnchor
 */
function resolveClauseDeadline(clause, referenceDate, globalAnchor) {
  const sig = inspectTemporalSignals(clause);
  const baseYear = Number(referenceDate.slice(0, 4));

  if (sig.isoDate) {
    return {
      deadlineDate: sig.isoDate,
      deadlineState: sig.exactTime ? DEADLINE_STATES.CONFIRMED : DEADLINE_STATES.PARTIAL_ANCHOR,
      deadlineLabel: sig.exactTime ? `${sig.isoDate} · ${sig.exactTime}` : `${sig.isoDate} (hora no especificada)`,
      missingDetails: sig.exactTime ? "" : "Fecha indicada, pero falta especificar la hora exacta de corte."
    };
  }

  if (sig.namedMonthMatch) {
    const day = String(Number(sig.namedMonthMatch[1])).padStart(2, "0");
    const monthNum = String(MONTH_MAP_ES[sig.namedMonthMatch[2]]).padStart(2, "0");
    const dateStr = `${baseYear}-${monthNum}-${day}`;
    return {
      deadlineDate: dateStr,
      deadlineState: sig.exactTime ? DEADLINE_STATES.CONFIRMED : DEADLINE_STATES.PARTIAL_ANCHOR,
      deadlineLabel: sig.exactTime
        ? `${sig.namedMonthMatch[0]} (${dateStr} · ${sig.exactTime})`
        : `${sig.namedMonthMatch[0]} (${dateStr} · sin hora exacta)`,
      missingDetails: sig.exactTime ? "" : "Falta confirmar la hora exacta de entrega."
    };
  }

  if (sig.relativeDay) {
    const rel = sig.relativeDay;
    if (rel === "hoy" || rel === "today" || rel === "esta tarde") {
      return {
        deadlineDate: referenceDate,
        deadlineState: sig.exactTime ? DEADLINE_STATES.CONFIRMED : DEADLINE_STATES.PARTIAL_ANCHOR,
        deadlineLabel: sig.exactTime ? `Hoy (${referenceDate} · ${sig.exactTime})` : `Hoy (${referenceDate} · falta hora exacta)`,
        missingDetails: sig.exactTime ? "" : "Se solicita para hoy, pero no se especifica hora límite."
      };
    }
    if (rel.startsWith("ma") || rel === "tomorrow") {
      const d = addDaysIso(referenceDate, 1);
      return {
        deadlineDate: d,
        deadlineState: sig.exactTime ? DEADLINE_STATES.CONFIRMED : DEADLINE_STATES.PARTIAL_ANCHOR,
        deadlineLabel: sig.exactTime ? `Mañana (${d} · ${sig.exactTime})` : `Mañana (${d} · falta hora exacta)`,
        missingDetails: sig.exactTime ? "" : "Se solicita para mañana, pero falta definir hora límite."
      };
    }
  }

  if (sig.weekday) {
    const normDay = sig.weekday.toLowerCase();
    const dow = WEEKDAY_MAP_ES[normDay];
    const forceNext = /pr[oó]ximo|siguiente|next/i.test(clause);
    const resolved = resolveUpcomingWeekday(referenceDate, dow, forceNext);
    const capDay = normDay.charAt(0).toUpperCase() + normDay.slice(1);
    return {
      deadlineDate: resolved,
      deadlineState: sig.exactTime ? DEADLINE_STATES.CONFIRMED : DEADLINE_STATES.PARTIAL_ANCHOR,
      deadlineLabel: sig.exactTime
        ? `${capDay} (${resolved} · ${sig.exactTime})`
        : `${capDay} (${resolved} · hora por confirmar)`,
      missingDetails: sig.exactTime
        ? ""
        : `Se menciona "${sig.weekday}", pero falta confirmar hora exacta y si corresponde a ${resolved}.`
    };
  }

  if (sig.beforeEvent) {
    if (globalAnchor.anchorDate && globalAnchor.anchorLabel) {
      return {
        deadlineDate: null,
        deadlineState: DEADLINE_STATES.PARTIAL_ANCHOR,
        deadlineLabel: `Antes de ${globalAnchor.anchorLabel} (sin día/hora exacta)`,
        missingDetails: `Se indica "${sig.beforeEvent}" (${globalAnchor.anchorLabel}), pero falta definir fecha/hora exacta de antelación.`
      };
    }
    return {
      deadlineDate: null,
      deadlineState: DEADLINE_STATES.MISSING_INFO,
      deadlineLabel: "Antes de la reunión (fecha de reunión no especificada)",
      missingDetails: "Se indica 'antes de la reunión', pero no hay fecha ni hora exacta definida."
    };
  }

  if (globalAnchor.anchorDate && globalAnchor.anchorLabel) {
    return {
      deadlineDate: null,
      deadlineState: DEADLINE_STATES.MISSING_INFO,
      deadlineLabel: `Información faltante (previo a ${globalAnchor.anchorLabel})`,
      missingDetails: `No tiene fecha propia asignada; se infiere que es insumo previo a ${globalAnchor.anchorLabel}, pero falta definir su fecha límite exacta.`
    };
  }

  return {
    deadlineDate: null,
    deadlineState: DEADLINE_STATES.MISSING_INFO,
    deadlineLabel: "Información faltante (sin fecha límite)",
    missingDetails: "El mensaje no especifica fecha ni hora límite para esta tarea (no inventada)."
  };
}

/**
 * Extracts explicit @mention or named assignee if present in clause; otherwise returns "Por asignar".
 * @param {string} clause
 */
function extractAssignee(clause) {
  const mention = clause.match(/@([a-zA-Z0-9._-]{2,30})/);
  if (mention) return `@${mention[1]}`;
  const named = clause.match(/\b(?:asignad[oa]\s+a|encargad[oa]:?|responsable:?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
  if (named) return named[1];
  return "Por asignar";
}

/**
 * Splits unstructured Spanish/English prose into atomic actionable clauses.
 * Handles coordinated infinitive lists such as:
 * "Hay que revisar los resultados del mes, actualizar la presentación y enviar la agenda..."
 * @param {string} cleanMessage
 * @returns {Array<{ rawSpan: string, cleanAction: string }>}
 */
export function extractActionableClauses(cleanMessage) {
  const primaryChunks = cleanMessage
    .split(/(?:[\n;•]+|(?<=[.!?])\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && !GREETING_ONLY_REGEX.test(s));

  /** @type {Array<{ rawSpan: string, cleanAction: string }>} */
  const results = [];

  for (const chunk of primaryChunks) {
    const stripped = chunk.replace(TRIGGER_PREFIX_REGEX, "").replace(/[.!?]+$/, "").trim();
    if (!stripped || GREETING_ONLY_REGEX.test(stripped)) continue;

    // Split coordinated lists separated by commas or " y " / " e " / " además de " ONLY when the right side begins with an action verb
    const subParts = stripped.split(
      /,\s*(?=(?:revisar|actualizar|enviar|preparar|agendar|programar|validar|auditar|corregir|desplegar|configurar|crear|documentar|compartir|aprobar|redactar|coordinar|subir|migrar|presentar|llamar|responder|analizar|verificar|organizar|definir|confirmar|entregar|completar|resolver|ajustar|construir|publicar|notificar|sincronizar|review|update|send|prepare|schedule|validate|audit|fix|deploy|create|share|submit|complete)\b)|\s+(?:y\s+tambi[eé]n|y|e|adem[aá]s\s+de|and)\s+(?=(?:hay\s+que\s+|necesitamos\s+|debemos\s+)?(?:revisar|actualizar|enviar|preparar|agendar|programar|validar|auditar|corregir|desplegar|configurar|crear|documentar|compartir|aprobar|redactar|coordinar|subir|migrar|presentar|llamar|responder|analizar|verificar|organizar|definir|confirmar|entregar|completar|resolver|ajustar|construir|publicar|notificar|sincronizar|review|update|send|prepare|schedule|validate|audit|fix|deploy|create|share|submit|complete)\b)/i
    );

    for (const part of subParts) {
      const cleanPart = part.replace(TRIGGER_PREFIX_REGEX, "").trim();
      if (cleanPart.length < 4 || GREETING_ONLY_REGEX.test(cleanPart)) continue;
      if (ACTION_VERBS_REGEX.test(cleanPart) || subParts.length > 1 || TRIGGER_PREFIX_REGEX.test(chunk)) {
        const formatted = cleanPart.charAt(0).toUpperCase() + cleanPart.slice(1);
        results.push({
          rawSpan: cleanPart,
          cleanAction: formatted
        });
      }
    }
  }

  // Fallback if user wrote a terse noun-only task without standard verbs
  if (results.length === 0 && cleanMessage.length >= 4) {
    const fallback = cleanMessage.replace(TRIGGER_PREFIX_REGEX, "").replace(/[.!?]+$/, "").trim();
    if (fallback) {
      results.push({
        rawSpan: fallback,
        cleanAction: fallback.charAt(0).toUpperCase() + fallback.slice(1)
      });
    }
  }

  return results;
}

/**
 * Computes semantic phase rank so prerequisites naturally precede downstream deliverables & meetings:
 * Phase 1: Diagnostic / Data Review (revisar, auditar, analizar, verificar, validar)
 * Phase 2: Creation / Update / Fix (actualizar, crear, redactar, corregir, configurar, preparar material)
 * Phase 3: Pre-event Distribution / Notification (enviar agenda, compartir antes de, notificar)
 * Phase 4: Milestone Event / Final Meeting (preparar la reunión, realizar reunión, presentar)
 * @param {string} actionText
 */
function inferExecutionPhase(actionText) {
  const lower = actionText.toLowerCase();
  if (/\b(ca[ií]da|incidente|producci[oó]n|bloqueante|urgente|hotfix|cr[ií]tico)\b/.test(lower)) return 0;
  if (/\b(reuni[oó]n\s+del\s+equipo|preparar\s+la\s+reuni[oó]n|realizar\s+la\s+reuni[oó]n)\b/.test(lower)) return 4;
  if (/\b(revisar|analizar|auditar|verificar|diagnosticar|recopilar|consultar)\b/.test(lower)) return 1;
  if (/\b(actualizar|crear|redactar|corregir|ajustar|construir|configurar|migrar|documentar)\b/.test(lower)) return 2;
  if (/\b(enviar|compartir|notificar|distribuir|publicar)\b/.test(lower) && /\b(antes\s+de|agenda|convocatoria|participantes)\b/.test(lower)) return 3;
  return 2.5;
}

/**
 * Infers priority and human-readable Spanish justification.
 * @param {string} actionText
 * @param {number} phase
 * @param {number} totalTasks
 */
function inferPriority(actionText, phase, totalTasks) {
  const lower = actionText.toLowerCase();

  if (/\b(urgente|cr[ií]tic[oa]|inmediato|producci[oó]n|ca[ií]da|bloqueante|hoy\s+mismo|asap)\b/.test(lower)) {
    return {
      priority: "CRITICAL",
      priorityReason: "Contiene indicadores explícitos de urgencia crítica o impacto operativo inmediato."
    };
  }

  if (/\b(opcional|cuando\s+puedas|baja\s+prioridad|futuro|despu[eé]s)\b/.test(lower)) {
    return {
      priority: "LOW",
      priorityReason: "Actividad no bloqueante o marcada explícitamente sin urgencia inmediata."
    };
  }

  if (phase === 1 && totalTasks > 1) {
    return {
      priority: "HIGH",
      priorityReason: "Insumo base bloqueante: debe completarse primero para habilitar los entregables posteriores."
    };
  }

  if (phase === 3 || /\b(antes\s+de\s+la\s+reuni[oó]n|antes\s+del)\b/.test(lower)) {
    return {
      priority: "HIGH",
      priorityReason: "Restricción temporal explícita previa al hito principal; requerida para alinear a los participantes."
    };
  }

  if (phase === 2 && totalTasks > 1) {
    return {
      priority: "HIGH",
      priorityReason: "Entregable clave necesario antes de ejecutar el hito o reunión objetivo."
    };
  }

  if (phase === 4) {
    return {
      priority: "MEDIUM",
      priorityReason: "Hito consolidador que depende de la finalización previa de los insumos y envíos."
    };
  }

  return {
    priority: "MEDIUM",
    priorityReason: "Actividad operativa estándar dentro del flujo solicitado."
  };
}

/**
 * Synthesizes an executive summary of missing information and a ready-to-send clarification draft.
 * @param {string} cleanMessage
 * @param {Array<ReturnType<typeof createTaskEntity>>} tasks
 */
export function buildMissingInfoAudit(cleanMessage, tasks) {
  /** @type {Array<{ field: string, detail: string, severity: "HIGH"|"MEDIUM" }>} */
  const gaps = [];
  const lower = cleanMessage.toLowerCase();

  const missingDeadlineTasks = tasks.filter((t) => t.deadlineState === DEADLINE_STATES.MISSING_INFO);
  const partialAnchorTasks = tasks.filter((t) => t.deadlineState === DEADLINE_STATES.PARTIAL_ANCHOR);
  const unassignedTasks = tasks.filter((t) => t.assignee === "Por asignar");

  if (missingDeadlineTasks.length > 0) {
    gaps.push({
      field: "Fechas límite intermedias",
      detail: `${missingDeadlineTasks.length} tarea(s) no tienen fecha ni hora límite explícita en el mensaje (${missingDeadlineTasks.map((t) => `"${t.title}"`).join(", ")}).`,
      severity: "HIGH"
    });
  }

  if (partialAnchorTasks.length > 0) {
    gaps.push({
      field: "Hora exacta / antelación de referencias relativas",
      detail: `Se detectaron referencias parciales (${partialAnchorTasks.map((t) => t.deadlineLabel).join("; ")}), pero falta confirmar hora exacta o tiempo de anticipación.`,
      severity: "MEDIUM"
    });
  }

  if (unassignedTasks.length === tasks.length) {
    gaps.push({
      field: "Responsables (Owners)",
      detail: "La solicitud usa plural impersonal ('necesitamos', 'hay que') sin asignar responsable específico a cada tarea.",
      severity: "MEDIUM"
    });
  }

  if (/\b(participantes|asistentes|invitados|equipo)\b/.test(lower) && !/@/.test(cleanMessage)) {
    gaps.push({
      field: "Destinatarios / Logística",
      detail: "Se menciona a los participantes o reunión del equipo, pero no se adjunta lista de correos ni enlace/sala.",
      severity: "MEDIUM"
    });
  }

  const bulletQuestions = gaps.map((g, i) => `${i + 1}. ${g.field}: ${g.detail}`);
  const clarificationDraft =
    gaps.length > 0
      ? `Hola, ¡gracias! Ya organicé las ${tasks.length} tareas identificadas. Para dejar el cronograma cerrado sin asumir datos, ¿me confirmas por favor lo siguiente?\n` +
        gaps
          .map((g) => {
            if (g.field.includes("Fechas")) return "• ¿Qué fecha límite intermedia manejamos para cada entregable previo?";
            if (g.field.includes("Hora")) return "• ¿A qué hora exacta será el corte/reunión y con cuánta anticipación enviamos lo previo?";
            if (g.field.includes("Responsables")) return "• ¿Quién será el responsable directo de cada actividad?";
            return "• ¿Cuál es la lista de participantes y el canal/sala de reunión?";
          })
          .join("\n")
      : "¡Todo claro! Todas las tareas cuentan con fecha, hora y responsable confirmado.";

  return {
    gaps,
    clarificationDraft
  };
}

/**
 * Pure Layer-0 Deterministic Triage Execution.
 * @param {{ message: string, channel?: string, referenceDate?: string }} input
 */
export function runDeterministicTriage(input) {
  const cleanMessage = sanitizePlainText(input.message);
  const channel = input.channel || "slack";
  const referenceDate = input.referenceDate || new Date().toISOString().slice(0, 10);

  // Inspect global temporal anchor (e.g., "reunión del equipo para el viernes")
  const globalSig = inspectTemporalSignals(cleanMessage);
  let globalAnchor = { anchorDate: null, anchorLabel: null, hasExactTime: Boolean(globalSig.exactTime) };

  if (globalSig.weekday && /\b(reuni[oó]n|entrega|presentaci[oó]n|cierre|demo|comit[eé]|viernes|lunes|martes|mi[eé]rcoles|jueves)\b/i.test(cleanMessage)) {
    const dow = WEEKDAY_MAP_ES[globalSig.weekday.toLowerCase()];
    const resolved = resolveUpcomingWeekday(referenceDate, dow, false);
    globalAnchor = {
      anchorDate: resolved,
      anchorLabel: `el ${globalSig.weekday.toLowerCase()} (${resolved})`,
      hasExactTime: Boolean(globalSig.exactTime)
    };
  } else if (globalSig.isoDate) {
    globalAnchor = {
      anchorDate: globalSig.isoDate,
      anchorLabel: globalSig.isoDate,
      hasExactTime: Boolean(globalSig.exactTime)
    };
  }

  const rawClauses = extractActionableClauses(cleanMessage);

  // Enrich with phase rank and sort by logical dependency order while keeping stable tie-breaking
  const enriched = rawClauses
    .map((item, idx) => ({
      ...item,
      originalIdx: idx,
      phase: inferExecutionPhase(item.cleanAction)
    }))
    .sort((a, b) => (a.phase !== b.phase ? a.phase - b.phase : a.originalIdx - b.originalIdx));

  const tasks = enriched.map((item, sortedIdx) => {
    const temporal = resolveClauseDeadline(item.rawSpan, referenceDate, globalAnchor);
    const prio = inferPriority(item.cleanAction, item.phase, enriched.length);
    const assignee = extractAssignee(item.rawSpan);

    // Link sequential prerequisite dependency when phases progress (e.g. Review Results -> Update Presentation -> Meeting)
    let dependsOnOrder = null;
    if (sortedIdx > 0 && item.phase > enriched[sortedIdx - 1].phase) {
      dependsOnOrder = sortedIdx; // 1-based order of predecessor
    }

    return createTaskEntity(
      {
        order: sortedIdx + 1,
        title: item.cleanAction,
        description: `Extraída del canal ${channel.toUpperCase()} · Secuencia sugerida #${sortedIdx + 1}.`,
        priority: prio.priority,
        priorityReason: prio.priorityReason,
        status: "PENDING",
        deadlineDate: temporal.deadlineDate,
        deadlineLabel: temporal.deadlineLabel,
        deadlineState: temporal.deadlineState,
        missingDetails: temporal.missingDetails,
        assignee,
        sourceQuote: item.rawSpan,
        dependsOnOrder,
        grounded: true,
        channel,
        scheduledTime: extractHourlySchedule(item.rawSpan) || extractHourlySchedule(item.cleanAction)
      },
      sortedIdx
    );
  });

  const audit = buildMissingInfoAudit(cleanMessage, tasks);

  return {
    summary: `Se identificaron y organizaron ${tasks.length} tarea(s) accionables a partir del mensaje en ${channel.toUpperCase()}, priorizadas por dependencia lógica y auditadas contra invención de fechas.`,
    referenceDate,
    channel,
    tasks,
    missingInfoGaps: audit.gaps,
    clarificationDraft: audit.clarificationDraft
  };
}

/**
 * Extracts explicit hour references from text (e.g. "a las 09:30", "15:45", "2:00 pm", "10 am").
 * Returns normalized "HH:mm" in 24h format, or null if no explicit hour anchor exists.
 * @param {string} text
 * @returns {string|null}
 */
export function extractHourlySchedule(text) {
  if (typeof text !== "string") return null;

  // Match 12-hour format with am/pm: "a las 2:30 pm", "10:00 am", "2 pm"
  const m12 = text.match(/\b(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m12) {
    let hours = parseInt(m12[1], 10);
    const minutes = m12[2] ? parseInt(m12[2], 10) : 0;
    const meridian = m12[3].toLowerCase();
    if (meridian === "pm" && hours < 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  // Match 24-hour format: "a las 15:45", "09:30", "a las 9:30"
  const m24 = text.match(/\b(?:a\s+las\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (m24) {
    const hours = String(parseInt(m24[1], 10)).padStart(2, "0");
    const minutes = m24[2];
    return `${hours}:${minutes}`;
  }

  return null;
}
