/**
 * LAYER-0 PURE DOMAIN ENTITIES, VALUE OBJECTS & SECURITY SANITIZERS
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-001..009) & EOS Law V / Law VI.
 * Zero external runtime dependencies.
 */

export const MAX_MESSAGE_LENGTH = 4000;

export const PRIORITIES = Object.freeze({
  CRITICAL: { code: "CRITICAL", rank: 0, labelEs: "Crítica (P0)", badgeClass: "prio-critical" },
  HIGH: { code: "HIGH", rank: 1, labelEs: "Alta (P1)", badgeClass: "prio-high" },
  MEDIUM: { code: "MEDIUM", rank: 2, labelEs: "Media (P2)", badgeClass: "prio-medium" },
  LOW: { code: "LOW", rank: 3, labelEs: "Baja (P3)", badgeClass: "prio-low" }
});

export const TASK_STATUSES = Object.freeze({
  PENDING: { code: "PENDING", labelEs: "Pendiente" },
  IN_PROGRESS: { code: "IN_PROGRESS", labelEs: "En progreso" },
  COMPLETED: { code: "COMPLETED", labelEs: "Completada" }
});

export const DEADLINE_STATES = Object.freeze({
  CONFIRMED: "CONFIRMED",
  PARTIAL_ANCHOR: "PARTIAL_ANCHOR",
  MISSING_INFO: "MISSING_INFO"
});

export const SUPPORTED_CHANNELS = Object.freeze(["slack", "teams", "email", "whatsapp"]);

const HTML_ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;"
});

/**
 * Escapes untrusted strings for safe HTML rendering (OWASP XSS Prevention).
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"'`]/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Sanitizes free-text input by removing control characters and neutralizing script/HTML tags.
 * @param {unknown} input
 * @returns {string}
 */
export function sanitizePlainText(input) {
  if (typeof input !== "string") return "";
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Neutralizes OWASP CSV Formula Injection (=, +, -, @, tab, CR) and applies RFC 4180 quoting.
 * @param {unknown} rawValue
 * @returns {string}
 */
export function sanitizeCsvCell(rawValue) {
  let text = String(rawValue ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Validates incoming request payload before invoking AI or deterministic triage.
 * @param {Record<string, unknown>} payload
 */
export function validateAnalysisInput(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Payload must be a JSON object." };
  }

  const rawMessage = typeof payload.message === "string" ? payload.message : "";
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `El mensaje excede el límite permitido de ${MAX_MESSAGE_LENGTH} caracteres.`
    };
  }

  const message = sanitizePlainText(rawMessage);
  if (message.length < 4) {
    return {
      valid: false,
      error: "Ingresa una solicitud o mensaje con al menos 4 caracteres."
    };
  }

  const rawChannel = String(payload.channel || "slack").toLowerCase();
  const channel = SUPPORTED_CHANNELS.includes(rawChannel) ? rawChannel : "slack";

  const todayIso = new Date().toISOString().slice(0, 10);
  const rawRef = typeof payload.referenceDate === "string" ? payload.referenceDate.trim() : todayIso;
  const referenceDate = /^\d{4}-\d{2}-\d{2}$/.test(rawRef) ? rawRef : todayIso;

  return {
    valid: true,
    value: {
      message,
      channel,
      referenceDate
    }
  };
}

/**
 * Normalizes priority codes safely.
 * @param {unknown} raw
 * @returns {"CRITICAL"|"HIGH"|"MEDIUM"|"LOW"}
 */
export function normalizePriority(raw) {
  const key = String(raw || "MEDIUM").toUpperCase().trim();
  if (key in PRIORITIES) return /** @type {"CRITICAL"|"HIGH"|"MEDIUM"|"LOW"} */ (key);
  if (key.includes("CRIT") || key === "P0") return "CRITICAL";
  if (key.includes("ALT") || key === "P1") return "HIGH";
  if (key.includes("BAJ") || key === "P3") return "LOW";
  return "MEDIUM";
}

/**
 * Normalizes task execution status safely.
 * @param {unknown} raw
 * @returns {"PENDING"|"IN_PROGRESS"|"COMPLETED"}
 */
export function normalizeStatus(raw) {
  const key = String(raw || "PENDING").toUpperCase().trim();
  if (key in TASK_STATUSES) return /** @type {"PENDING"|"IN_PROGRESS"|"COMPLETED"} */ (key);
  return "PENDING";
}

/**
 * Normalizes deadline state safely.
 * @param {unknown} raw
 * @param {string|null} deadlineDate
 * @returns {"CONFIRMED"|"PARTIAL_ANCHOR"|"MISSING_INFO"}
 */
export function normalizeDeadlineState(raw, deadlineDate) {
  const key = String(raw || "").toUpperCase().trim();
  if (key === DEADLINE_STATES.CONFIRMED && deadlineDate) return DEADLINE_STATES.CONFIRMED;
  if (key === DEADLINE_STATES.PARTIAL_ANCHOR) return DEADLINE_STATES.PARTIAL_ANCHOR;
  if (key === DEADLINE_STATES.MISSING_INFO) return DEADLINE_STATES.MISSING_INFO;
  return deadlineDate ? DEADLINE_STATES.PARTIAL_ANCHOR : DEADLINE_STATES.MISSING_INFO;
}

/**
 * Deterministic lightweight hash for task IDs and state integrity.
 * @param {string} input
 * @returns {string}
 */
export function fnv1aHex(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Factory producing a strictly typed, immutable-shape TaskEntity.
 * @param {Record<string, unknown>} raw
 * @param {number} index
 */
export function createTaskEntity(raw, index = 0) {
  const title = sanitizePlainText(String(raw.title || "")).slice(0, 180) || `Tarea #${index + 1}`;
  const description = sanitizePlainText(String(raw.description || "")).slice(0, 500);
  const priority = normalizePriority(raw.priority);
  const priorityReason =
    sanitizePlainText(String(raw.priorityReason || "")).slice(0, 320) ||
    "Prioridad sugerida según impacto operativo y secuencia de ejecución.";
  const status = normalizeStatus(raw.status);

  const rawDate = typeof raw.deadlineDate === "string" ? raw.deadlineDate.trim() : "";
  const deadlineDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  const deadlineState = normalizeDeadlineState(raw.deadlineState, deadlineDate);

  const defaultDeadlineLabel =
    deadlineState === DEADLINE_STATES.MISSING_INFO
      ? "Información faltante (sin fecha especificada)"
      : deadlineDate
        ? `${deadlineDate}`
        : "Referencia parcial (falta fecha exacta)";

  const deadlineLabel = sanitizePlainText(String(raw.deadlineLabel || defaultDeadlineLabel)).slice(0, 180);
  const missingDetails = sanitizePlainText(
    String(
      raw.missingDetails ||
        (deadlineState === DEADLINE_STATES.CONFIRMED
          ? ""
          : "No se especifica fecha/hora exacta o responsable en el mensaje original.")
    )
  ).slice(0, 320);

  const assignee = sanitizePlainText(String(raw.assignee || "")).slice(0, 80) || "Por asignar";
  const sourceQuote = sanitizePlainText(String(raw.sourceQuote || "")).slice(0, 280);
  const order = typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index + 1;
  const dependsOnOrder =
    typeof raw.dependsOnOrder === "number" && Number.isFinite(raw.dependsOnOrder)
      ? raw.dependsOnOrder
      : null;

  const id =
    typeof raw.id === "string" && raw.id.trim().length > 0
      ? sanitizePlainText(raw.id).slice(0, 48)
      : `tsk_${fnv1aHex(`${order}:${title}:${Date.now()}:${index}`)}`;

  return {
    id,
    order,
    title,
    description,
    priority,
    priorityReason,
    status,
    deadlineDate,
    deadlineLabel,
    deadlineState,
    missingDetails,
    assignee,
    sourceQuote,
    dependsOnOrder,
    grounded: raw.grounded !== false,
    channel: SUPPORTED_CHANNELS.includes(String(raw.channel || "")) ? String(raw.channel) : "slack",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString()
  };
}
