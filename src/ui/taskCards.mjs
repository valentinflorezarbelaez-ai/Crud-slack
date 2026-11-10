/**
 * PRESENTATION: dense list cards, compact Kanban tiles, ES dates & assignee picks.
 * Kept outside main.mjs to preserve the CWV UI JS budget (< 55 KB).
 */
import {
  DEADLINE_STATES,
  PRIORITIES,
  TASK_STATUSES,
  escapeHtml
} from "../domain/taskEntities.mjs";
import { TEAM_PROFILES } from "./realtimeSlack.mjs";

/** @param {string|null|undefined} iso */
export function formatIsoDateEs(iso) {
  const raw = String(iso || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** @param {string|null|undefined} value */
export function parseEsDateToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
    return null;
  }
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * @param {{ full_name?: string, fullName?: string }|null} currentUser
 * @param {string[]} [extraNames]
 */
export function listAssigneeChoices(currentUser = null, extraNames = []) {
  const names = new Set(["Por asignar"]);
  for (const profile of Object.values(TEAM_PROFILES)) {
    if (profile.full_name) names.add(profile.full_name);
  }
  const selfName = currentUser?.full_name || currentUser?.fullName;
  if (selfName) names.add(String(selfName));
  for (const name of extraNames) {
    const clean = String(name || "").trim();
    if (clean) names.add(clean);
  }
  return [...names];
}

function renderAssigneeSelect(task, choices) {
  const id = escapeHtml(task.id);
  const current = task.assignee || "Por asignar";
  const opts = new Set(choices);
  opts.add(current);
  const optionsHtml = [...opts]
    .map((name) => {
      const selected = name === current ? " selected" : "";
      return `<option value="${escapeHtml(name)}"${selected}>${escapeHtml(name)}</option>`;
    })
    .join("");
  return `
    <label class="sr-only" for="qa-${id}">Responsable de ${escapeHtml(task.title)}</label>
    <select id="qa-${id}" class="field__control field__control--sm quick-assignee" data-action="quick-assignee" data-id="${id}" title="Asignar a un contacto del espacio">
      ${optionsHtml}
    </select>
  `;
}

function renderQuickBar(task, assigneeChoices) {
  const id = escapeHtml(task.id);
  const isConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;
  const isDone = task.status === "COMPLETED";
  const esDate = formatIsoDateEs(task.deadlineDate);
  return `
    <div class="task-quick-bar">
      <span class="task-quick-bar__label">Agenda:</span>
      <label class="sr-only" for="qd-${id}">Fecha límite dd/mm/aaaa de ${escapeHtml(task.title)}</label>
      <input
        type="text"
        id="qd-${id}"
        class="field__control field__control--sm quick-date"
        data-action="quick-date-es"
        data-id="${id}"
        inputmode="numeric"
        placeholder="dd/mm/aaaa"
        maxlength="10"
        value="${escapeHtml(esDate)}"
        title="Fecha en formato dd/mm/aaaa"
      />
      <label class="sr-only" for="qt-${id}">Hora programada de ${escapeHtml(task.title)}</label>
      <input type="time" id="qt-${id}" class="field__control field__control--sm quick-date" data-action="quick-time" data-id="${id}" value="${escapeHtml(task.scheduledTime || "")}" title="Hora exacta con alarma" />
      ${renderAssigneeSelect(task, assigneeChoices)}
      ${isConfirmed ? "" : `<button type="button" class="btn btn--ghost btn--sm" data-action="quick-friday" data-id="${id}">📅 Viernes</button>`}
      ${isDone ? "" : `<button type="button" class="btn btn--secondary btn--sm" data-action="quick-complete" data-id="${id}">✅ Completar</button>`}
    </div>
  `;
}

function renderTaskBadges(task) {
  const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
  const statusMeta = TASK_STATUSES[task.status] || TASK_STATUSES.PENDING;
  const isDateConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;
  const dateBadgeClass = isDateConfirmed ? "date-confirmed" : "date-missing";
  const esDate = formatIsoDateEs(task.deadlineDate);
  const dateText = esDate
    ? `${isDateConfirmed ? "Fecha:" : "Fecha pendiente:"} ${esDate}`
    : `${isDateConfirmed ? "Fecha:" : "Fecha pendiente:"} ${task.deadlineLabel || "Sin fecha"}`;
  const timeBadge = task.scheduledTime
    ? `<span class="meta-badge">⏰ ${escapeHtml(task.scheduledTime)}</span>`
    : "";
  const depBadge = task.dependsOnOrder
    ? `<span class="meta-badge">Depende de #${escapeHtml(task.dependsOnOrder)}</span>`
    : "";
  return `
    <div class="task-badges">
      <span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span>
      ${timeBadge}
      <span class="date-badge ${dateBadgeClass}">${escapeHtml(dateText)}</span>
      <span class="meta-badge">Estado: ${escapeHtml(statusMeta.labelEs)}</span>
      <span class="meta-badge">Resp: ${escapeHtml(task.assignee)}</span>
      ${depBadge}
    </div>
  `;
}

/**
 * @param {any} task
 * @param {string[]} [assigneeChoices]
 */
export function renderTaskCardHtml(task, assigneeChoices = listAssigneeChoices()) {
  const isCompleted = task.status === "COMPLETED";
  const completedClass = isCompleted ? "is-completed" : "";
  const needsDate = task.deadlineState !== DEADLINE_STATES.CONFIRMED;
  const toggleLabel =
    task.status === "PENDING" ? "Iniciar" : task.status === "IN_PROGRESS" ? "Completar" : "Reabrir";
  const missingBlock =
    needsDate && task.missingDetails
      ? `<p class="task-card__missing">⚠️ ${escapeHtml(task.missingDetails)}</p>`
      : "";
  const quoteBlock = task.sourceQuote
    ? `<p class="task-card__quote">💬 "${escapeHtml(task.sourceQuote)}"</p>`
    : "";
  const checkMark = isCompleted ? "✓" : task.status === "IN_PROGRESS" ? "⚡" : "";
  return `
    <article class="task-card task-card--dense ${completedClass}${needsDate ? " has-gap" : ""}" data-task-id="${escapeHtml(task.id)}" data-id="${escapeHtml(task.id)}" draggable="true">
      <div class="task-card__top">
        <div class="task-card__slack-row">
          <button type="button" class="slack-check-circle ${isCompleted ? "is-checked" : ""}" data-action="cycle-status" data-id="${escapeHtml(task.id)}" title="Cambiar estado (${escapeHtml(task.status)})" aria-label="Cambiar estado de ${escapeHtml(task.title)}">
            ${checkMark}
          </button>
          <div class="task-card__title-group">
            <span class="task-order">#${escapeHtml(task.order)}</span>
            <h3 class="task-card__title">${escapeHtml(task.title)}</h3>
          </div>
        </div>
        <div class="task-card__actions">
          <button type="button" class="btn btn--ghost btn--sm" data-action="cycle-status" data-id="${escapeHtml(task.id)}">
            ${toggleLabel}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="edit" data-id="${escapeHtml(task.id)}">
            Editar
          </button>
          <button type="button" class="btn btn--danger btn--sm" data-action="delete" data-id="${escapeHtml(task.id)}" aria-label="Eliminar tarea ${escapeHtml(task.title)}">
            ✕
          </button>
        </div>
      </div>
      ${renderTaskBadges(task)}
      ${missingBlock}
      <div class="task-card__inline-fix">${renderQuickBar(task, assigneeChoices)}</div>
      <details class="task-card__more">
        <summary>Detalle</summary>
        <p class="task-card__reason">${escapeHtml(task.priorityReason)}</p>
        ${quoteBlock}
        <button type="button" class="btn btn--ghost btn--sm slack-thread-btn" data-action="open-thread" data-id="${escapeHtml(task.id)}" title="Abrir hilo">
          💬 Hilo
        </button>
      </details>
    </article>
  `;
}

/**
 * Compact Kanban tile: status + title + badges + assignee, no inline editors.
 * @param {any} task
 * @param {string[]} [assigneeChoices]
 */
export function renderKanbanCardHtml(task, assigneeChoices = listAssigneeChoices()) {
  const isCompleted = task.status === "COMPLETED";
  const needsDate = task.deadlineState !== DEADLINE_STATES.CONFIRMED;
  const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
  const esDate = formatIsoDateEs(task.deadlineDate);
  const dateChip = esDate
    ? `<span class="date-badge ${needsDate ? "date-missing" : "date-confirmed"}">${escapeHtml(esDate)}</span>`
    : `<span class="date-badge date-missing">Sin fecha</span>`;
  const checkMark = isCompleted ? "✓" : task.status === "IN_PROGRESS" ? "⚡" : "";
  return `
    <article class="task-card task-card--kanban ${isCompleted ? "is-completed" : ""}${needsDate ? " has-gap" : ""}" data-task-id="${escapeHtml(task.id)}" data-id="${escapeHtml(task.id)}" draggable="true">
      <div class="task-card__top">
        <div class="task-card__slack-row">
          <button type="button" class="slack-check-circle ${isCompleted ? "is-checked" : ""}" data-action="cycle-status" data-id="${escapeHtml(task.id)}" aria-label="Cambiar estado de ${escapeHtml(task.title)}">
            ${checkMark}
          </button>
          <div class="task-card__title-group">
            <span class="task-order">#${escapeHtml(task.order)}</span>
            <h3 class="task-card__title">${escapeHtml(task.title)}</h3>
          </div>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" data-action="edit" data-id="${escapeHtml(task.id)}" title="Editar">✎</button>
      </div>
      <div class="kanban-card__meta">
        <span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span>
        ${dateChip}
      </div>
      ${renderAssigneeSelect(task, assigneeChoices)}
    </article>
  `;
}

/**
 * @param {any[]} tasks
 * @param {string[]} [assigneeChoices]
 */
export function renderKanbanView(tasks, assigneeChoices = listAssigneeChoices()) {
  const columns = [
    { code: "PENDING", title: "Pendientes" },
    { code: "IN_PROGRESS", title: "En Progreso" },
    { code: "COMPLETED", title: "Completadas" }
  ];
  const colsHtml = columns
    .map((col) => {
      const colTasks = tasks.filter((t) => t.status === col.code);
      const itemsHtml =
        colTasks.length > 0
          ? colTasks.map((t) => renderKanbanCardHtml(t, assigneeChoices)).join("")
          : `<div class="empty-state">Sin tareas en esta columna</div>`;
      return `
        <div class="kanban-col" data-col-status="${escapeHtml(col.code)}">
          <h3 class="kanban-col__title">
            <span>${escapeHtml(col.title)}</span>
            <span>(${colTasks.length})</span>
          </h3>
          <div class="kanban-col__items">${itemsHtml}</div>
        </div>
      `;
    })
    .join("");
  return `<div class="kanban-grid">${colsHtml}</div>`;
}

/**
 * @param {HTMLSelectElement|null} selectEl
 * @param {string[]} choices
 * @param {string} [selected]
 */
export function fillAssigneeSelectElement(selectEl, choices, selected = "Por asignar") {
  if (!selectEl) return;
  const current = selected || "Por asignar";
  const opts = new Set(choices);
  opts.add(current);
  selectEl.replaceChildren();
  for (const name of opts) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (name === current) option.selected = true;
    selectEl.append(option);
  }
}
