/**
 * DOMAIN SERVICE: TASK AUDIT TRAIL & CHANGELOG TRACKER
 * Pure business logic conforming to Hexagonal Layer-0 (0 external dependencies).
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-021).
 */

import { escapeHtml } from "./taskEntities.mjs";

/**
 * Creates an immutable audit log record for a task state mutation.
 * @param {{
 *   taskId: string,
 *   action: "CREATE" | "STATUS_CHANGE" | "DATE_UPDATE" | "PRIORITY_CHANGE" | "ASSIGNEE_CHANGE" | "TIME_UPDATE" | "RESOLVE_CONFLICT",
 *   actorId?: string,
 *   actorName?: string,
 *   field?: string,
 *   oldValue?: any,
 *   newValue?: any,
 *   note?: string,
 *   timestamp?: string
 * }} params
 */
export function createAuditRecord({
  taskId,
  action,
  actorId = "usr_system",
  actorName = "Usuario",
  field = "",
  oldValue = null,
  newValue = null,
  note = "",
  timestamp = new Date().toISOString()
}) {
  return {
    id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    taskId: String(taskId || "").trim(),
    action,
    actorId,
    actorName,
    field,
    oldValue: oldValue !== null ? String(oldValue) : null,
    newValue: newValue !== null ? String(newValue) : null,
    note,
    timestamp
  };
}

/**
 * Formats a single audit entry into human-readable Spanish text.
 * @param {ReturnType<typeof createAuditRecord>} entry
 * @returns {string}
 */
export function formatAuditEntryDescription(entry) {
  if (!entry) return "";
  const who = entry.actorName || "Usuario";
  switch (entry.action) {
    case "CREATE":
      return `Tarea creada por ${who}.`;
    case "STATUS_CHANGE":
      return `Estado actualizado de ${entry.oldValue || "PENDING"} a ${entry.newValue || "IN_PROGRESS"} por ${who}.`;
    case "DATE_UPDATE":
      return `Fecha límite establecida a "${entry.newValue || "Sin fecha"}" por ${who}.`;
    case "PRIORITY_CHANGE":
      return `Prioridad cambiada de ${entry.oldValue} a ${entry.newValue} por ${who}.`;
    case "ASSIGNEE_CHANGE":
      return `Responsable reasignado a "${entry.newValue}" por ${who}.`;
    case "TIME_UPDATE":
      return `Horario programado ajustado a ${entry.newValue} por ${who}.`;
    case "RESOLVE_CONFLICT":
      return `Conflicto de horario resuelto automáticamente: reprogramada a ${entry.newValue}.`;
    default:
      return entry.note || `Modificación registrada por ${who}.`;
  }
}

/**
 * Renders audit entries as an accessible HTML list.
 * @param {Array<any>} entries
 * @returns {string}
 */
export function renderAuditTrailHtml(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) {
    return `<div class="audit-empty">No hay registros de cambios para esta tarea.</div>`;
  }

  const sorted = [...list].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return sorted
    .map((e) => {
      const timeStr = new Date(e.timestamp).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const desc = escapeHtml(formatAuditEntryDescription(e));
      return `
      <div class="audit-item" role="listitem">
        <div class="audit-dot" aria-hidden="true"></div>
        <div class="audit-content">
          <div class="audit-time">${timeStr}</div>
          <div class="audit-desc">${desc}</div>
        </div>
      </div>
    `.trim();
    })
    .join("");
}
