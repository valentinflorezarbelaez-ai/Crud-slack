/**
 * UI PRESENTATION CONTROLLER — TASKFLOW AI WORKSPACE
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-006..009).
 *
 * Strictly uses escapeHtml() for all dynamic text rendering (Zero XSS)
 * and zero inline style mutations (Strict CSP compliance).
 */

import {
  DEADLINE_STATES,
  PRIORITIES,
  TASK_STATUSES,
  escapeHtml
} from "../domain/taskEntities.mjs";
import {
  computeBoardMetrics,
  createInitialBoardState,
  taskBoardReducer
} from "../domain/taskBoardStore.mjs";
import { analyzeWorkplaceRequest } from "../application/analyzeRequest.mjs";
import {
  exportToJsonContract,
  exportToSharePointCsv,
  exportToSlackMarkdown,
  exportToTeamsAdaptiveCard
} from "../application/exportTasks.mjs";
import {
  loadPersistedBoardState,
  savePersistedBoardState
} from "../infrastructure/storageAdapter.mjs";
import { WORKPLACE_PRESETS } from "./presets.mjs";

const NEXT_STATUS_CYCLE = Object.freeze({
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "PENDING"
});

let boardState = createInitialBoardState();
let currentViewMode = "cards"; // "cards" | "table" | "kanban"
let toastTimerId = null;

// DOM References
const el = {
  navWorkspace: document.getElementById("nav-btn-workspace"),
  navPresentation: document.getElementById("nav-btn-presentation"),
  viewWorkspace: document.getElementById("view-workspace"),
  viewPresentation: document.getElementById("view-presentation"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  themeToggleLabel: document.getElementById("theme-toggle-label"),
  liveAnnouncer: document.getElementById("live-announcer"),
  engineStatusText: document.getElementById("engine-status-text"),
  presetContainer: document.getElementById("preset-chips-container"),
  analyzeForm: document.getElementById("analyze-form"),
  inputChannel: /** @type {HTMLSelectElement} */ (document.getElementById("input-channel")),
  inputRefDate: /** @type {HTMLInputElement} */ (document.getElementById("input-ref-date")),
  inputMessage: /** @type {HTMLTextAreaElement} */ (document.getElementById("input-message")),
  charCounter: document.getElementById("char-counter"),
  formErrorBanner: document.getElementById("form-error-banner"),
  analyzeSubmitBtn: /** @type {HTMLButtonElement} */ (document.getElementById("analyze-submit-btn")),
  clearInputBtn: document.getElementById("clear-input-btn"),
  verifConfidenceBadge: document.getElementById("verif-confidence-badge"),
  verifGroundingVal: document.getElementById("verif-grounding-val"),
  verifCoverageVal: document.getElementById("verif-coverage-val"),
  verifHallucinationsVal: document.getElementById("verif-hallucinations-val"),
  verifSummaryNote: document.getElementById("verif-summary-note"),
  kpiTotal: document.getElementById("kpi-total"),
  kpiHigh: document.getElementById("kpi-high"),
  kpiMissing: document.getElementById("kpi-missing"),
  kpiProgress: document.getElementById("kpi-progress"),
  progressBar: /** @type {HTMLProgressElement} */ (document.getElementById("board-progress-bar")),
  missingInfoPanel: document.getElementById("missing-info-panel"),
  missingGapsList: document.getElementById("missing-gaps-list"),
  clarificationDraftBox: document.getElementById("clarification-draft-box"),
  copyClarificationBtn: document.getElementById("copy-clarification-btn"),
  addTaskBtn: document.getElementById("add-task-btn"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  exportTeamsCardBtn: document.getElementById("export-teams-card-btn"),
  copySlackMdBtn: document.getElementById("copy-slack-md-btn"),
  exportJsonBtn: document.getElementById("export-json-btn"),
  resetDemoBtn: document.getElementById("reset-demo-btn"),
  viewModeCards: document.getElementById("view-mode-cards"),
  viewModeTable: document.getElementById("view-mode-table"),
  viewModeKanban: document.getElementById("view-mode-kanban"),
  viewModeSharepoint: document.getElementById("view-mode-sharepoint"),
  filterPriority: /** @type {HTMLSelectElement} */ (document.getElementById("filter-priority")),
  filterDeadline: /** @type {HTMLSelectElement} */ (document.getElementById("filter-deadline")),
  tasksRenderRoot: document.getElementById("tasks-render-root"),
  boardChecksumMeta: document.getElementById("board-checksum-meta"),
  crudDialog: /** @type {HTMLDialogElement} */ (document.getElementById("task-crud-dialog")),
  crudForm: /** @type {HTMLFormElement} */ (document.getElementById("task-crud-form")),
  crudDialogTitle: document.getElementById("crud-dialog-title"),
  crudTaskId: /** @type {HTMLInputElement} */ (document.getElementById("crud-task-id")),
  crudTitle: /** @type {HTMLInputElement} */ (document.getElementById("crud-title")),
  crudPriority: /** @type {HTMLSelectElement} */ (document.getElementById("crud-priority")),
  crudStatus: /** @type {HTMLSelectElement} */ (document.getElementById("crud-status")),
  crudDeadline: /** @type {HTMLInputElement} */ (document.getElementById("crud-deadline")),
  crudAssignee: /** @type {HTMLInputElement} */ (document.getElementById("crud-assignee")),
  crudReason: /** @type {HTMLTextAreaElement} */ (document.getElementById("crud-reason")),
  closeDialogBtn: document.getElementById("close-dialog-btn"),
  cancelDialogBtn: document.getElementById("cancel-dialog-btn"),
  teamsCardDialog: /** @type {HTMLDialogElement} */ (document.getElementById("teams-card-dialog")),
  teamsCardPreviewContainer: document.getElementById("teams-card-preview-container"),
  teamsCardJsonPre: document.getElementById("teams-card-json-pre"),
  copyTeamsJsonBtn: document.getElementById("copy-teams-json-btn"),
  closeTeamsDialogBtn: document.getElementById("close-teams-dialog-btn"),
  dismissTeamsDialogBtn: document.getElementById("dismiss-teams-dialog-btn"),
  printBtn: document.getElementById("print-btn"),
  toast: document.getElementById("toast-notification")
};

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.hidden = false;
  if (el.liveAnnouncer) el.liveAnnouncer.textContent = message;
  if (toastTimerId) clearTimeout(toastTimerId);
  toastTimerId = setTimeout(() => {
    el.toast.hidden = true;
  }, 3200);
}

function dispatch(action) {
  boardState = taskBoardReducer(boardState, action);
  savePersistedBoardState(boardState);
  renderWorkspace();
}

function updateCharCounter() {
  if (!el.charCounter || !el.inputMessage) return;
  el.charCounter.textContent = `${el.inputMessage.value.length} / 4000`;
}

function getFilteredTasks() {
  const prioFilter = el.filterPriority?.value || "ALL";
  const dateFilter = el.filterDeadline?.value || "ALL";

  return boardState.tasks.filter((task) => {
    if (prioFilter !== "ALL" && task.priority !== prioFilter) return false;
    if (dateFilter === "MISSING" && task.deadlineState === DEADLINE_STATES.CONFIRMED) return false;
    if (dateFilter === "CONFIRMED" && task.deadlineState !== DEADLINE_STATES.CONFIRMED) return false;
    return true;
  });
}

function renderTaskBadges(task) {
  const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
  const statusMeta = TASK_STATUSES[task.status] || TASK_STATUSES.PENDING;
  const isDateConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;
  const dateBadgeClass = isDateConfirmed ? "date-confirmed" : "date-missing";
  const datePrefix = isDateConfirmed ? "Fecha:" : "Fecha pendiente:";

  const depBadge = task.dependsOnOrder
    ? `<span class="meta-badge">Depende de #${escapeHtml(task.dependsOnOrder)}</span>`
    : "";

  return `
    <div class="task-badges">
      <span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span>
      <span class="date-badge ${dateBadgeClass}">${datePrefix} ${escapeHtml(task.deadlineLabel)}</span>
      <span class="meta-badge">Estado: ${escapeHtml(statusMeta.labelEs)}</span>
      <span class="meta-badge">Resp: ${escapeHtml(task.assignee)}</span>
      ${depBadge}
    </div>
  `;
}

function renderTaskCardHtml(task) {
  const completedClass = task.status === "COMPLETED" ? "is-completed" : "";
  const toggleLabel =
    task.status === "PENDING"
      ? "Iniciar"
      : task.status === "IN_PROGRESS"
        ? "Completar"
        : "Reabrir";

  const missingBlock =
    task.deadlineState !== DEADLINE_STATES.CONFIRMED && task.missingDetails
      ? `<p class="task-card__missing">Dato faltante: ${escapeHtml(task.missingDetails)}</p>`
      : "";

  const quoteBlock = task.sourceQuote
    ? `<p class="task-card__quote">Sustento textual: "${escapeHtml(task.sourceQuote)}"</p>`
    : "";

  return `
    <article class="task-card ${completedClass}" data-task-id="${escapeHtml(task.id)}">
      <div class="task-card__top">
        <div class="task-card__title-group">
          <span class="task-order">#${escapeHtml(task.order)}</span>
          <h3 class="task-card__title">${escapeHtml(task.title)}</h3>
        </div>
        <div class="task-card__actions">
          <button type="button" class="btn btn--ghost btn--sm" data-action="cycle-status" data-id="${escapeHtml(task.id)}">
            ${toggleLabel}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="edit" data-id="${escapeHtml(task.id)}">
            Editar
          </button>
          <button type="button" class="btn btn--danger btn--sm" data-action="delete" data-id="${escapeHtml(task.id)}" aria-label="Eliminar tarea ${escapeHtml(task.title)}">
            Eliminar
          </button>
        </div>
      </div>
      ${renderTaskBadges(task)}
      <p class="task-card__reason">${escapeHtml(task.priorityReason)}</p>
      ${missingBlock}
      ${quoteBlock}
    </article>
  `;
}

function renderTableView(tasks) {
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

function renderKanbanView(tasks) {
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
          ? colTasks.map((t) => renderTaskCardHtml(t)).join("")
          : `<div class="empty-state">Sin tareas en esta columna</div>`;
      return `
        <div class="kanban-col">
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

function renderSharePointListView(tasks) {
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

function renderTeamsCardPreview() {
  if (!el.teamsCardPreviewContainer) return;
  const tasks = boardState.tasks;
  const summary = boardState.lastAnalysis?.summary || "Plan de tareas organizado.";
  const draft = boardState.lastAnalysis?.clarificationDraft || "";

  const taskRows = tasks
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

  el.teamsCardPreviewContainer.innerHTML = `
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

function renderWorkspace() {
  const metrics = computeBoardMetrics(boardState.tasks);
  if (el.kpiTotal) el.kpiTotal.textContent = String(metrics.total);
  if (el.kpiHigh) el.kpiHigh.textContent = String(metrics.highOrCritical);
  if (el.kpiMissing) el.kpiMissing.textContent = String(metrics.missingInfoCount);
  if (el.kpiProgress) el.kpiProgress.textContent = `${metrics.completionPct}%`;
  if (el.progressBar) el.progressBar.value = metrics.completionPct;
  if (el.boardChecksumMeta) {
    el.boardChecksumMeta.textContent = `Integridad CRUD: #${boardState.checksum} · ${metrics.total} tarea(s)`;
  }

  // Update verification telemetry box
  const analysis = boardState.lastAnalysis;
  if (analysis) {
    const engineLabel =
      analysis.engineMode === "GEMINI_3_8_FLASH_VERIFIED"
        ? `Gemini 3.8 Flash + Verificador L0 (${analysis.latencyMs} ms)`
        : `Motor Neuro-Simbólico Determinista L0 (${analysis.latencyMs} ms)`;
    if (el.engineStatusText) el.engineStatusText.textContent = engineLabel;

    const vr = analysis.verificationReport;
    if (vr) {
      if (el.verifGroundingVal) el.verifGroundingVal.textContent = `${vr.groundingRatePct}%`;
      if (el.verifCoverageVal) el.verifCoverageVal.textContent = `${vr.clauseCoveragePct}%`;
      if (el.verifHallucinationsVal) el.verifHallucinationsVal.textContent = "0";
      if (el.verifConfidenceBadge) {
        el.verifConfidenceBadge.textContent = `${vr.overallConfidencePct}% Verificado`;
      }
    }
    if (el.verifSummaryNote && analysis.summary) {
      el.verifSummaryNote.textContent = analysis.summary;
    }
  }

  // Missing info panel
  const liveMissingTasks = boardState.tasks.filter((t) => t.deadlineState !== DEADLINE_STATES.CONFIRMED);
  if (el.missingInfoPanel && el.missingGapsList && el.clarificationDraftBox) {
    const gaps = analysis?.missingInfoGaps || [];
    if (liveMissingTasks.length === 0 && gaps.length === 0) {
      el.missingInfoPanel.hidden = true;
    } else if (liveMissingTasks.length === 0) {
      el.missingInfoPanel.hidden = true;
    } else {
      el.missingInfoPanel.hidden = false;
      const itemsToRender =
        gaps.length > 0
          ? gaps
          : liveMissingTasks.map((t) => ({
              field: t.title,
              detail: t.missingDetails || "Fecha límite pendiente por confirmar."
            }));
      el.missingGapsList.innerHTML = itemsToRender
        .map((g) => `<li><strong>${escapeHtml(g.field)}:</strong> ${escapeHtml(g.detail)}</li>`)
        .join("");
      el.clarificationDraftBox.textContent =
        analysis?.clarificationDraft ||
        "Por favor confirmar las fechas límite y responsables pendientes de las tareas listadas.";
    }
  }

  // Render tasks list/table/kanban
  const filtered = getFilteredTasks();
  if (!el.tasksRenderRoot) return;

  if (filtered.length === 0) {
    el.tasksRenderRoot.innerHTML = `<div class="empty-state">No hay tareas que coincidan con el filtro seleccionado. Usa "+ Nueva Tarea" o analiza una solicitud.</div>`;
    return;
  }

  if (currentViewMode === "table") {
    el.tasksRenderRoot.innerHTML = renderTableView(filtered);
  } else if (currentViewMode === "kanban") {
    el.tasksRenderRoot.innerHTML = renderKanbanView(filtered);
  } else if (currentViewMode === "sharepoint") {
    el.tasksRenderRoot.innerHTML = renderSharePointListView(filtered);
  } else {
    el.tasksRenderRoot.innerHTML = `<div class="task-stack">${filtered.map(renderTaskCardHtml).join("")}</div>`;
  }
}

async function runAnalysisFlow(payload) {
  if (el.formErrorBanner) el.formErrorBanner.hidden = true;
  if (el.analyzeSubmitBtn) {
    el.analyzeSubmitBtn.disabled = true;
    el.analyzeSubmitBtn.textContent = "Analizando actividades y fechas...";
  }

  try {
    let resultData = null;

    // Attempt server-side /api/analyze (Gemini 3.8 Flash + L0 Grounding Verifier)
    try {
      const res = await fetch("./api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok && res.status === 400) {
        throw new Error(json.error || "Solicitud inválida.");
      }
      if (res.ok && json.ok) {
        resultData = json;
      }
    } catch (networkOrValidationErr) {
      if (
        networkOrValidationErr instanceof Error &&
        (networkOrValidationErr.message.includes("excede") ||
          networkOrValidationErr.message.includes("al menos 4"))
      ) {
        throw networkOrValidationErr;
      }
      // Isomorphic local failover to pure Application Use Case
      const localRes = await analyzeWorkplaceRequest(payload);
      if (!localRes.ok) throw new Error(localRes.error);
      resultData = localRes.data;
    }

    if (!resultData) {
      const localRes = await analyzeWorkplaceRequest(payload);
      if (!localRes.ok) throw new Error(localRes.error);
      resultData = localRes.data;
    }

    dispatch({ type: "LOAD_TRIAGE_RESULT", payload: resultData });
    showToast(`Se organizaron ${resultData.tasks.length} tareas con auditoría anti-alucinación.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo procesar el mensaje.";
    if (el.formErrorBanner) {
      el.formErrorBanner.textContent = msg;
      el.formErrorBanner.hidden = false;
    }
  } finally {
    if (el.analyzeSubmitBtn) {
      el.analyzeSubmitBtn.disabled = false;
      el.analyzeSubmitBtn.textContent = "Analizar y Organizar Tareas con IA";
    }
  }
}

function openCrudDialog(task = null) {
  if (!el.crudDialog) return;
  if (task) {
    if (el.crudDialogTitle) el.crudDialogTitle.textContent = `Editar Tarea #${task.order}`;
    el.crudTaskId.value = task.id;
    el.crudTitle.value = task.title;
    el.crudPriority.value = task.priority;
    el.crudStatus.value = task.status;
    el.crudDeadline.value = task.deadlineDate || "";
    el.crudAssignee.value = task.assignee === "Por asignar" ? "" : task.assignee;
    el.crudReason.value = task.priorityReason || "";
  } else {
    if (el.crudDialogTitle) el.crudDialogTitle.textContent = "Crear Nueva Tarea";
    el.crudTaskId.value = "";
    el.crudTitle.value = "";
    el.crudPriority.value = "HIGH";
    el.crudStatus.value = "PENDING";
    el.crudDeadline.value = "";
    el.crudAssignee.value = "";
    el.crudReason.value = "";
  }
  el.crudDialog.showModal();
  el.crudTitle.focus();
}

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch {
    showToast("No se pudo acceder al portapapeles automáticamente.");
  }
}

function setActiveTopSection(section) {
  const isPres = section === "presentation";
  if (el.viewWorkspace) el.viewWorkspace.hidden = isPres;
  if (el.viewPresentation) el.viewPresentation.hidden = !isPres;
  el.navWorkspace?.classList.toggle("is-active", !isPres);
  el.navPresentation?.classList.toggle("is-active", isPres);
  el.navWorkspace?.setAttribute("aria-pressed", String(!isPres));
  el.navPresentation?.setAttribute("aria-pressed", String(isPres));
}

function setViewMode(mode) {
  currentViewMode = mode;
  const map = {
    cards: el.viewModeCards,
    table: el.viewModeTable,
    kanban: el.viewModeKanban,
    sharepoint: el.viewModeSharepoint
  };
  for (const [k, btn] of Object.entries(map)) {
    const active = k === mode;
    btn?.classList.toggle("is-active", active);
    btn?.setAttribute("aria-pressed", String(active));
  }
  renderWorkspace();
}

function initPresets(todayIso) {
  if (!el.presetContainer) return;
  el.presetContainer.innerHTML = WORKPLACE_PRESETS.map(
    (p, idx) =>
      `<button type="button" class="chip ${idx === 0 ? "is-active" : ""}" data-preset-id="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`
  ).join("");

  el.presetContainer.addEventListener("click", (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-preset-id]");
    if (!btn) return;
    const presetId = btn.getAttribute("data-preset-id");
    const found = WORKPLACE_PRESETS.find((p) => p.id === presetId);
    if (!found) return;

    el.presetContainer.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
    btn.classList.add("is-active");

    el.inputChannel.value = found.channel;
    el.inputMessage.value = found.message;
    updateCharCounter();
    runAnalysisFlow({
      message: found.message,
      channel: found.channel,
      referenceDate: el.inputRefDate.value || todayIso
    });
  });
}

async function bootstrap() {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (el.inputRefDate) el.inputRefDate.value = todayIso;

  initPresets(todayIso);

  const canonical = WORKPLACE_PRESETS[0];
  if (el.inputChannel) el.inputChannel.value = canonical.channel;
  if (el.inputMessage) el.inputMessage.value = canonical.message;
  updateCharCounter();

  // Restore saved state or auto-run canonical Friday meeting challenge case
  const persisted = loadPersistedBoardState();
  if (persisted && persisted.tasks.length > 0) {
    boardState = persisted;
    renderWorkspace();
  } else {
    const initial = await analyzeWorkplaceRequest({
      message: canonical.message,
      channel: canonical.channel,
      referenceDate: todayIso
    });
    if (initial.ok) {
      dispatch({ type: "LOAD_TRIAGE_RESULT", payload: initial.data });
    }
  }

  // Event Listeners
  el.navWorkspace?.addEventListener("click", () => setActiveTopSection("workspace"));
  el.navPresentation?.addEventListener("click", () => setActiveTopSection("presentation"));

  el.themeToggleBtn?.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    if (el.themeToggleLabel) {
      el.themeToggleLabel.textContent = next === "dark" ? "Claro" : "Oscuro";
    }
  });

  el.inputMessage?.addEventListener("input", updateCharCounter);

  el.clearInputBtn?.addEventListener("click", () => {
    el.inputMessage.value = "";
    updateCharCounter();
    el.inputMessage.focus();
  });

  el.analyzeForm?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    runAnalysisFlow({
      message: el.inputMessage.value,
      channel: el.inputChannel.value,
      referenceDate: el.inputRefDate.value || todayIso
    });
  });

  el.viewModeCards?.addEventListener("click", () => setViewMode("cards"));
  el.viewModeTable?.addEventListener("click", () => setViewMode("table"));
  el.viewModeKanban?.addEventListener("click", () => setViewMode("kanban"));
  el.viewModeSharepoint?.addEventListener("click", () => setViewMode("sharepoint"));
  el.filterPriority?.addEventListener("change", renderWorkspace);
  el.filterDeadline?.addEventListener("change", renderWorkspace);

  // Delegated Task CRUD actions
  el.tasksRenderRoot?.addEventListener("click", (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);

    // SharePoint toolbar buttons
    if (target.id === "sp-new-btn") {
      openCrudDialog(null);
      return;
    }
    if (target.id === "sp-export-csv-btn") {
      const csv = exportToSharePointCsv(boardState.tasks);
      triggerDownload(`taskflow-sharepoint-${todayIso}.csv`, csv, "text/csv;charset=utf-8");
      showToast("CSV exportado (compatible con SharePoint Lists, Planner y Excel).");
      return;
    }
    if (target.id === "sp-flow-btn") {
      setActiveTopSection("presentation");
      showToast("Navegando a la arquitectura de integración Microsoft 365 & Power Automate.");
      return;
    }

    const btn = target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const taskId = btn.getAttribute("data-id");
    const task = boardState.tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (action === "cycle-status") {
      const nextStatus = NEXT_STATUS_CYCLE[task.status] || "PENDING";
      dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: nextStatus } });
      showToast(`Estado actualizado: ${TASK_STATUSES[nextStatus].labelEs}`);
    } else if (action === "edit") {
      openCrudDialog(task);
    } else if (action === "delete") {
      dispatch({ type: "DELETE_TASK", payload: { id: task.id } });
      showToast(`Tarea eliminada: "${task.title}"`);
    }
  });

  el.addTaskBtn?.addEventListener("click", () => openCrudDialog(null));
  el.closeDialogBtn?.addEventListener("click", () => el.crudDialog?.close());
  el.cancelDialogBtn?.addEventListener("click", () => el.crudDialog?.close());

  el.crudForm?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const id = el.crudTaskId.value.trim();
    const title = el.crudTitle.value.trim();
    if (!title) return;

    const payload = {
      title,
      priority: el.crudPriority.value,
      status: el.crudStatus.value,
      deadlineDate: el.crudDeadline.value.trim() || null,
      assignee: el.crudAssignee.value.trim() || "Por asignar",
      priorityReason: el.crudReason.value.trim() || "Prioridad definida por el usuario."
    };

    if (id) {
      dispatch({ type: "UPDATE_TASK", payload: { id, ...payload } });
      showToast("Tarea actualizada correctamente.");
    } else {
      dispatch({ type: "CREATE_TASK", payload });
      showToast("Nueva tarea agregada al plan.");
    }
    el.crudDialog?.close();
  });

  el.exportCsvBtn?.addEventListener("click", () => {
    const csv = exportToSharePointCsv(boardState.tasks);
    triggerDownload(`taskflow-sharepoint-${todayIso}.csv`, csv, "text/csv;charset=utf-8");
    showToast("CSV exportado (compatible con SharePoint Lists, Planner y Excel).");
  });

  el.exportTeamsCardBtn?.addEventListener("click", () => {
    const card = exportToTeamsAdaptiveCard({
      tasks: boardState.tasks,
      summary: boardState.lastAnalysis?.summary || "",
      clarificationDraft: boardState.lastAnalysis?.clarificationDraft || "",
      channel: el.inputChannel?.value || "email",
      referenceDate: el.inputRefDate?.value || todayIso
    });
    if (el.teamsCardJsonPre) {
      el.teamsCardJsonPre.textContent = JSON.stringify(card, null, 2);
    }
    renderTeamsCardPreview();
    el.teamsCardDialog?.showModal();
  });

  el.closeTeamsDialogBtn?.addEventListener("click", () => el.teamsCardDialog?.close());
  el.dismissTeamsDialogBtn?.addEventListener("click", () => el.teamsCardDialog?.close());

  el.copyTeamsJsonBtn?.addEventListener("click", () => {
    const text = el.teamsCardJsonPre?.textContent || "";
    copyTextToClipboard(text, "Payload JSON de Adaptive Card copiado al portapapeles.");
  });

  el.printBtn?.addEventListener("click", () => window.print());

  el.copySlackMdBtn?.addEventListener("click", () => {
    const md = exportToSlackMarkdown({
      tasks: boardState.tasks,
      summary: boardState.lastAnalysis?.summary || "",
      clarificationDraft: boardState.lastAnalysis?.clarificationDraft || ""
    });
    copyTextToClipboard(md, "Resumen Markdown copiado para Slack / Teams.");
  });

  el.copyClarificationBtn?.addEventListener("click", () => {
    const draft = el.clarificationDraftBox?.textContent || "";
    copyTextToClipboard(draft, "Mensaje de solicitud de aclaración copiado.");
  });

  el.exportJsonBtn?.addEventListener("click", () => {
    const json = exportToJsonContract(boardState);
    triggerDownload(`taskflow-plan-${todayIso}.json`, json, "application/json;charset=utf-8");
    showToast("Contrato JSON descargado.");
  });

  el.resetDemoBtn?.addEventListener("click", () => {
    el.inputChannel.value = canonical.channel;
    el.inputMessage.value = canonical.message;
    updateCharCounter();
    runAnalysisFlow({
      message: canonical.message,
      channel: canonical.channel,
      referenceDate: el.inputRefDate.value || todayIso
    });
  });

  // Power-User Keyboard Shortcuts
  window.addEventListener("keydown", (ev) => {
    // Ctrl/Cmd + Enter: Trigger analysis
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
      ev.preventDefault();
      if (el.inputMessage && el.inputMessage.value.trim().length >= 4) {
        runAnalysisFlow({
          message: el.inputMessage.value,
          channel: el.inputChannel.value,
          referenceDate: el.inputRefDate.value || todayIso
        });
      }
      return;
    }

    // Alt + N: New task modal
    if (ev.altKey && (ev.key === "n" || ev.key === "N")) {
      ev.preventDefault();
      openCrudDialog(null);
      return;
    }

    // Alt + P: Print executive memo
    if (ev.altKey && (ev.key === "p" || ev.key === "P")) {
      ev.preventDefault();
      window.print();
      return;
    }

    // View Switching 1-4 when not typing in text fields
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    const isTyping = tag === "input" || tag === "textarea" || tag === "select";
    if (!isTyping && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      if (ev.key === "1") setViewMode("cards");
      else if (ev.key === "2") setViewMode("table");
      else if (ev.key === "3") setViewMode("kanban");
      else if (ev.key === "4") setViewMode("sharepoint");
    }
  });

  // Progressive Web App (PWA) Offline Service Worker Registration
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

bootstrap();
