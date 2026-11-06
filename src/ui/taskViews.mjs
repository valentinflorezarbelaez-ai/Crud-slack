/**
 * PRESENTATION LAYER: MULTI-VIEW TEMPLATE RENDERERS
 * Governed by SPEC-CRUD-SLACK-001 (Table, SharePoint List & Teams Card views).
 * Strictly uses escapeHtml() for all user-provided data. Zero XSS.
 */

import {
  DEADLINE_STATES,
  PRIORITIES,
  TASK_STATUSES,
  escapeHtml
} from "../domain/taskEntities.mjs";

export function renderTableView(tasks) {
  const rows = tasks
    .map((task) => {
      const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
      const statusMeta = TASK_STATUSES[task.status] || TASK_STATUSES.PENDING;
      const isConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;
      return `
        <tr>
          <td><strong>#${escapeHtml(task.order)}</strong></td>
          <td>
            <strong>${escapeHtml(task.title)}</strong>
            <div class="task-card__quote">${escapeHtml(task.priorityReason)}</div>
          </td>
          <td><span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span></td>
          <td>
            <span class="date-badge ${isConfirmed ? "date-confirmed" : "date-missing"}">
              ${escapeHtml(task.deadlineLabel)}
            </span>
          </td>
          <td>${escapeHtml(task.assignee)}</td>
          <td>${escapeHtml(statusMeta.labelEs)}</td>
          <td>
            <div class="task-card__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-action="edit" data-id="${escapeHtml(task.id)}">Editar</button>
              <button type="button" class="btn btn--danger btn--sm" data-action="delete" data-id="${escapeHtml(task.id)}">✕</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table class="task-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Actividad &amp; Criterio</th>
            <th>Prioridad</th>
            <th>Fecha Límite / Faltante</th>
            <th>Responsable</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function renderSharePointListView(tasks) {
  const rows = tasks
    .map((task) => {
      const isConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;
      const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
      const statusMeta = TASK_STATUSES[task.status] || TASK_STATUSES.PENDING;
      const initials = (task.assignee && task.assignee !== "Por asignar" ? task.assignee : "PA")
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      return `
        <tr>
          <td>
            <input type="checkbox" data-action="cycle-status" data-id="${escapeHtml(task.id)}" ${task.status === "COMPLETED" ? "checked" : ""} aria-label="Marcar tarea #${task.order}" />
          </td>
          <td>
            <strong>#${escapeHtml(task.order)} ${escapeHtml(task.title)}</strong>
            ${task.sourceQuote ? `<div class="task-card__quote">Cita: "${escapeHtml(task.sourceQuote)}"</div>` : ""}
          </td>
          <td>
            <span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span>
          </td>
          <td>
            <span class="prio-badge badge--accent">${escapeHtml(statusMeta.labelEs)}</span>
          </td>
          <td>
            ${task.deadlineDate ? `<code>${escapeHtml(task.deadlineDate)}</code>` : `<span class="date-badge date-missing">Sin fecha</span>`}
          </td>
          <td>
            <span class="date-badge ${isConfirmed ? "date-confirmed" : "date-missing"}">
              ${isConfirmed ? "Confirmada" : "Info Faltante"}
            </span>
          </td>
          <td>
            <div class="sp-avatar-chip">
              <span class="sp-avatar-icon" aria-hidden="true">${escapeHtml(initials)}</span>
              <span>${escapeHtml(task.assignee)}</span>
            </div>
          </td>
          <td>
            <button type="button" class="btn btn--ghost btn--sm" data-action="edit" data-id="${escapeHtml(task.id)}">Editar</button>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="sp-list-container">
      <div class="sp-command-bar" role="toolbar" aria-label="Barra de comandos estilo SharePoint Modern">
        <button type="button" class="sp-command-btn sp-command-btn--primary" id="sp-new-btn">+ Nuevo ítem</button>
        <button type="button" class="sp-command-btn" id="sp-export-csv-btn">Exportar a Excel / CSV</button>
        <button type="button" class="sp-command-btn" id="sp-flow-btn">⚡ Flujo Power Automate</button>
      </div>
      <div class="sp-table-wrap">
        <table class="sp-table">
          <thead>
            <tr>
              <th scope="col">✓</th>
              <th scope="col">Nombre de la Actividad</th>
              <th scope="col">Prioridad</th>
              <th scope="col">Estado</th>
              <th scope="col">Vencimiento</th>
              <th scope="col">Confianza Fecha</th>
              <th scope="col">Asignado a</th>
              <th scope="col">Acción</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderTeamsCardPreview(container, tasks, summary = "Plan de tareas organizado.", draft = "") {
  if (!container) return;

  const taskRows = (tasks || [])
    .map((t) => {
      const isMissing = t.deadlineState !== DEADLINE_STATES.CONFIRMED;
      const dateText = isMissing
        ? `⚠️ ${escapeHtml(t.deadlineLabel)} (${escapeHtml(t.missingDetails || "Falta confirmar fecha u hora")})`
        : `📅 Vencimiento: ${escapeHtml(t.deadlineDate)} · Resp: ${escapeHtml(t.assignee)}`;
      return `
        <div class="teams-preview__task">
          <div><strong>#${t.order} ${escapeHtml(t.title)}</strong></div>
          <div class="task-card__quote">${escapeHtml(t.priority)} · ${escapeHtml(t.priorityReason || "")}</div>
          <div><small>${dateText}</small></div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="teams-preview__header">
      <span class="teams-preview__title">⚡ TaskFlow AI · Plan de Tareas en Teams</span>
      <span class="badge badge--accent">Adaptive Card v1.5</span>
    </div>
    <p>${escapeHtml(summary)}</p>
    <div class="teams-preview__tasks-box">${taskRows}</div>
    ${draft ? `<div class="teams-preview__draft"><strong>Borrador de aclaración:</strong><p>${escapeHtml(draft)}</p></div>` : ""}
    <div class="teams-preview__actions">
      <button type="button" class="teams-btn">Abrir en TaskFlow</button>
      <button type="button" class="teams-btn">Ver en SharePoint</button>
    </div>
  `;
}

export function renderHourlyTimelineView(tasks) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  const hours = [];
  for (let h = 6; h <= 22; h++) {
    hours.push(String(h).padStart(2, "0") + ":00");
  }

  const tasksByHour = new Map();
  const unscheduled = [];

  for (const t of safeTasks) {
    if (t.scheduledTime) {
      const slotHour = t.scheduledTime.slice(0, 2) + ":00";
      if (!tasksByHour.has(slotHour)) tasksByHour.set(slotHour, []);
      tasksByHour.get(slotHour).push(t);
    } else {
      unscheduled.push(t);
    }
  }

  let html = `<div class="timeline-container">`;

  if (unscheduled.length > 0) {
    html += `
      <div class="timeline-slot timeline-slot--unscheduled">
        <div class="timeline-slot__time">
          <span class="timeline-hour">📌 Sin Hora (${unscheduled.length})</span>
        </div>
        <div class="timeline-slot__cards">
          ${unscheduled.map((t) => renderTimelineTaskCard(t)).join("")}
        </div>
      </div>
    `;
  }

  for (const hour of hours) {
    const slotTasks = tasksByHour.get(hour) || [];
    const hasTasks = slotTasks.length > 0;
    html += `
      <div class="timeline-slot ${hasTasks ? "is-occupied" : ""}" data-hour="${escapeHtml(hour)}">
        <div class="timeline-slot__time">
          <span class="timeline-hour">${escapeHtml(hour)}</span>
        </div>
        <div class="timeline-slot__cards">
          ${hasTasks ? slotTasks.map((t) => renderTimelineTaskCard(t)).join("") : `<div class="timeline-empty-slot">Espacio disponible</div>`}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function renderTimelineTaskCard(task) {
  const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
  const isDone = task.status === "COMPLETED";
  return `
    <div class="timeline-card ${isDone ? "is-done" : ""}" data-id="${escapeHtml(task.id)}">
      <div class="timeline-card__header">
        <button type="button" class="btn-check" data-action="toggle-status" data-id="${escapeHtml(task.id)}" title="Cambiar estado">
          ${isDone ? "✓" : "○"}
        </button>
        <strong class="timeline-card__title">${escapeHtml(task.title)}</strong>
        <span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span>
      </div>
      <div class="timeline-card__footer">
        <span class="timeline-card__assignee">👤 ${escapeHtml(task.assignee)}</span>
        <label class="timeline-card__time-label">
          ⏰ <input type="time" class="timeline-time-input" data-action="quick-time" data-id="${escapeHtml(task.id)}" value="${escapeHtml(task.scheduledTime || "")}" />
        </label>
      </div>
    </div>
  `;
}
