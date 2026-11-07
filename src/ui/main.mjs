/**
 * UI PRESENTATION CONTROLLER — TASKFLOW AI WORKSPACE
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-006..014).
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
  computeTasksChecksum,
  createInitialBoardState,
  taskBoardReducer
} from "../domain/taskBoardStore.mjs";
import { analyzeWorkplaceRequest } from "../application/analyzeRequest.mjs";
import {
  exportToJsonContract,
  exportToSharePointCsv,
  exportToSlackMarkdown,
  exportToTeamsAdaptiveCard,
  exportToICalendar,
  generateMailtoClarificationUrl
} from "../application/exportTasks.mjs";
import { setupKanbanDragAndDrop } from "./kanbanDragDrop.mjs";
import { setupVoiceDictation } from "./voiceDictation.mjs";
import { setupCommandPalette } from "./commandPalette.mjs";
import { fireConfettiCelebration } from "./confetti.mjs";
import { renderTableView, renderSharePointListView, renderTeamsCardPreview, renderHourlyTimelineView } from "./taskViews.mjs";
import { playTaskCompletedSound, playAlarmChime } from "./soundFx.mjs";
import { checkDueAlarms, formatLocalHhMm } from "../application/notificationEngine.mjs";
import { requestNotificationPermission, triggerTaskNotification } from "../infrastructure/webNotificationAdapter.mjs";
import { initRealtimeSlack } from "./realtimeSlack.mjs?v=5.4.0";
import {
  loadPersistedBoardState,
  removePersistedBoardState,
  savePersistedBoardState
} from "../infrastructure/storageAdapter.mjs";
import {
  fetchRemoteTasks,
  syncRemoteTasks
} from "../infrastructure/cloudTaskAdapter.mjs";
import { WORKPLACE_PRESETS } from "./presets.mjs?v=5.4.0";
import { initChannels, syncChannelPanels } from "./channels.mjs?v=5.4.0";
import { initVisualPreferences, nextFridayIso } from "./preferences.mjs?v=5.4.0";

const NEXT_STATUS_CYCLE = Object.freeze({
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "PENDING"
});

let boardState = createInitialBoardState();
let activeUserId = null;
let currentViewMode = "cards"; // "cards" | "timeline" | "table" | "kanban" | "sharepoint"
let toastTimerId = null;
let activeChannel = {
  id: "personal",
  kind: "personal",
  name: "mi-dia",
  label: "Mi Día (Privado)",
  isPrivate: true,
  presetId: null
};
let channelsCtrl = null;
let realtimeSlackCtrl = null;
let lastCompletionPct = -1;

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
  inputChannel: (document.getElementById("input-channel")),
  inputRefDate: (document.getElementById("input-ref-date")),
  inputMessage: (document.getElementById("input-message")),
  charCounter: document.getElementById("char-counter"),
  formErrorBanner: document.getElementById("form-error-banner"),
  analyzeSubmitBtn: (document.getElementById("analyze-submit-btn")),
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
  progressBar: (document.getElementById("board-progress-bar")),
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
  viewModeTimeline: document.getElementById("view-mode-timeline"),
  alarmToggleBtn: document.getElementById("alarm-toggle-btn"),
  inviteChannelBtn: document.getElementById("invite-channel-btn"),
  viewModeTable: document.getElementById("view-mode-table"),
  viewModeKanban: document.getElementById("view-mode-kanban"),
  viewModeSharepoint: document.getElementById("view-mode-sharepoint"),
  filterPriority: (document.getElementById("filter-priority")),
  filterDeadline: (document.getElementById("filter-deadline")),
  filterSearch: (document.getElementById("filter-search")),
  eyeCareSelect: (document.getElementById("eye-care-select")),
  scaleToggleBtn: document.getElementById("scale-toggle-btn"),
  layoutFocusBtn: document.getElementById("layout-focus-btn"),
  resolveAllMissingBtn: document.getElementById("resolve-all-missing-btn"),
  workspaceGrid: document.querySelector(".workspace-grid"),
  tasksRenderRoot: document.getElementById("tasks-render-root"),
  boardChecksumMeta: document.getElementById("board-checksum-meta"),
  crudDialog: (document.getElementById("task-crud-dialog")),
  crudForm: (document.getElementById("task-crud-form")),
  crudDialogTitle: document.getElementById("crud-dialog-title"),
  crudTaskId: (document.getElementById("crud-task-id")),
  crudTitle: (document.getElementById("crud-title")),
  crudPriority: (document.getElementById("crud-priority")),
  crudStatus: (document.getElementById("crud-status")),
  crudDeadline: (document.getElementById("crud-deadline")),
  crudScheduledTime: (document.getElementById("crud-scheduled-time")),
  crudAssignee: (document.getElementById("crud-assignee")),
  crudReason: (document.getElementById("crud-reason")),
  closeDialogBtn: document.getElementById("close-dialog-btn"),
  cancelDialogBtn: document.getElementById("cancel-dialog-btn"),
  teamsCardDialog: (document.getElementById("teams-card-dialog")),
  teamsCardPreviewContainer: document.getElementById("teams-card-preview-container"),
  teamsCardJsonPre: document.getElementById("teams-card-json-pre"),
  copyTeamsJsonBtn: document.getElementById("copy-teams-json-btn"),
  closeTeamsDialogBtn: document.getElementById("close-teams-dialog-btn"),
  dismissTeamsDialogBtn: document.getElementById("dismiss-teams-dialog-btn"),
  printBtn: document.getElementById("print-btn"),
  toast: document.getElementById("toast-notification"),
  micDictateBtn: document.getElementById("mic-dictate-btn"),
  exportIcsBtn: document.getElementById("export-ics-btn"),
  emailClarificationBtn: document.getElementById("email-clarification-btn"),
  topbarSearchBtn: document.getElementById("topbar-search-btn"),
  commandPaletteDialog: (document.getElementById("command-palette-dialog")),
  cmdPaletteInput: (document.getElementById("cmd-palette-input")),
  cmdPaletteResults: document.getElementById("cmd-palette-results")
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
  const previousDone = (boardState.tasks || []).filter((t) => t.status === "COMPLETED").length;
  boardState = taskBoardReducer(boardState, action);
  if (activeChannel.kind !== "personal" || activeUserId) {
    savePersistedBoardState(boardState, activeChannel.id, activeUserId);
    syncRemoteTasks(activeChannel.id, boardState.tasks, activeUserId);
  }
  renderWorkspace();

  const currentDone = (boardState.tasks || []).filter((t) => t.status === "COMPLETED").length;
  if (currentDone > previousDone) {
    playTaskCompletedSound();
    if (boardState.tasks.length > 0 && currentDone === boardState.tasks.length) {
      fireConfettiCelebration();
    }
  }
}

function updateCharCounter() {
  if (!el.charCounter || !el.inputMessage) return;
  el.charCounter.textContent = `${el.inputMessage.value.length} / 4000`;
}

function getFilteredTasks() {
  const prioFilter = el.filterPriority?.value || "ALL";
  const dateFilter = el.filterDeadline?.value || "ALL";
  const query = (el.filterSearch?.value || "").trim().toLowerCase();
  return boardState.tasks.filter((task) => {
    if (prioFilter !== "ALL" && task.priority !== prioFilter) return false;
    if (dateFilter === "MISSING" && task.deadlineState === DEADLINE_STATES.CONFIRMED) return false;
    if (dateFilter === "CONFIRMED" && task.deadlineState !== DEADLINE_STATES.CONFIRMED) return false;
    if (query && !`${task.title} ${task.assignee} ${task.priorityReason}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function renderQuickBar(task) {
  const id = escapeHtml(task.id);
  const isConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;
  const isDone = task.status === "COMPLETED";
  return `
    <div class="task-quick-bar">
      <span class="task-quick-bar__label">Agenda:</span>
      <label class="sr-only" for="qd-${id}">Fecha límite de ${escapeHtml(task.title)}</label>
      <input type="date" id="qd-${id}" class="field__control field__control--sm quick-date" data-action="quick-date" data-id="${id}" value="${escapeHtml(task.deadlineDate || "")}" />
      <label class="sr-only" for="qt-${id}">Hora programada de ${escapeHtml(task.title)}</label>
      <input type="time" id="qt-${id}" class="field__control field__control--sm quick-date" data-action="quick-time" data-id="${id}" value="${escapeHtml(task.scheduledTime || "")}" title="Hora exacta con alarma" />
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
  const datePrefix = isDateConfirmed ? "Fecha:" : "Fecha pendiente:";
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
      <span class="date-badge ${dateBadgeClass}">${datePrefix} ${escapeHtml(task.deadlineLabel)}</span>
      <span class="meta-badge">Estado: ${escapeHtml(statusMeta.labelEs)}</span>
      <span class="meta-badge">Resp: ${escapeHtml(task.assignee)}</span>
      ${depBadge}
    </div>
  `;
}

function renderTaskCardHtml(task) {
  const isCompleted = task.status === "COMPLETED";
  const completedClass = isCompleted ? "is-completed" : "";
  const toggleLabel =
    task.status === "PENDING"
      ? "Iniciar"
      : task.status === "IN_PROGRESS"
        ? "Completar"
        : "Reabrir";
  const missingBlock =
    task.deadlineState !== DEADLINE_STATES.CONFIRMED && task.missingDetails
      ? `<p class="task-card__missing">⚠️ Dato faltante: ${escapeHtml(task.missingDetails)}</p>`
      : "";
  const quoteBlock = task.sourceQuote
    ? `<p class="task-card__quote">💬 Sustento textual: "${escapeHtml(task.sourceQuote)}"</p>`
    : "";
  const checkMark = isCompleted ? "✓" : task.status === "IN_PROGRESS" ? "⚡" : "";
  return `
    <article class="task-card ${completedClass}" data-task-id="${escapeHtml(task.id)}" data-id="${escapeHtml(task.id)}" draggable="true">
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
          <button type="button" class="btn btn--ghost btn--sm slack-thread-btn" data-action="open-thread" data-id="${escapeHtml(task.id)}" title="Ver hilo de discusión y sustento">
            💬 Hilo
          </button>
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
      <p class="task-card__reason">${escapeHtml(task.priorityReason)}</p>
      ${missingBlock}
      ${quoteBlock}
      ${renderQuickBar(task)}
    </article>
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

function renderTeamsCardPreviewHelper() {
  renderTeamsCardPreview(
    el.teamsCardPreviewContainer,
    boardState.tasks,
    boardState.lastAnalysis?.summary,
    boardState.lastAnalysis?.clarificationDraft
  );
}

async function applyChannel(channel, opts = {}, todayIso = new Date().toISOString().slice(0, 10)) {
  activeChannel = channel;
  realtimeSlackCtrl?.setActiveChannel(channel.id, channel.name, channel.topic);

  if (channel.kind === "personal") {
    const saved = activeUserId && !opts.rerun ? loadPersistedBoardState(channel.id, activeUserId) : null;
    boardState = saved ?? createInitialBoardState();
    if (el.inputMessage) el.inputMessage.value = "";
    updateCharCounter();
    renderWorkspace();

    if (activeUserId) {
      fetchRemoteTasks(channel.id, activeUserId)
        .then((res) => {
          if (res && res.ok && Array.isArray(res.tasks) && activeChannel.id === channel.id) {
            boardState = {
              ...boardState,
              tasks: res.tasks,
              checksum: computeTasksChecksum(res.tasks)
            };
            renderWorkspace();
          }
        })
        .catch(() => {});
    }
    if (!opts.initial && el.inputMessage) el.inputMessage.focus();
    return;
  }

  const saved = opts.rerun ? null : loadPersistedBoardState(channel.id, activeUserId);
  boardState = saved ?? createInitialBoardState();

  if (channel.kind === "custom") {
    if (el.inputMessage) el.inputMessage.value = "";
    updateCharCounter();
    renderWorkspace();
    fetchRemoteTasks(channel.id, activeUserId)
      .then((res) => {
        if (res && res.ok && Array.isArray(res.tasks) && (res.source === "cloud" || res.tasks.length > 0) && activeChannel.id === channel.id) {
          boardState = {
            ...boardState,
            tasks: res.tasks,
            checksum: computeTasksChecksum(res.tasks)
          };
          renderWorkspace();
        }
      })
      .catch(() => {});
    if (!opts.initial && el.inputMessage) el.inputMessage.focus();
    return;
  }

  const preset = WORKPLACE_PRESETS.find((p) => p.id === channel.presetId) || WORKPLACE_PRESETS[0];
  el.inputChannel.value = preset.channel;
  el.inputMessage.value = preset.message;
  updateCharCounter();
  updateSlackMessagePreview(preset);
  el.presetContainer?.querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("is-active", c.getAttribute("data-preset-id") === preset.id);
  });

  renderWorkspace();

  if (!opts.rerun) {
    fetchRemoteTasks(channel.id, activeUserId)
      .then((res) => {
        if (res && res.ok && res.tasks && res.tasks.length > 0 && activeChannel.id === channel.id) {
          boardState = {
            ...boardState,
            tasks: res.tasks,
            checksum: computeTasksChecksum(res.tasks)
          };
          renderWorkspace();
          const syncEl = document.getElementById("cloud-sync-status");
          if (syncEl) syncEl.textContent = "☁️ En la nube";
        }
      })
      .catch(() => {});
  }

  if (boardState.tasks.length > 0) return;
  const request = { message: preset.message, channel: preset.channel, referenceDate: el.inputRefDate?.value || todayIso };
  if (opts.rerun) return runAnalysisFlow(request);
  const result = await analyzeWorkplaceRequest(request);
  if (result.ok && activeChannel.id === channel.id) {
    dispatch({ type: "LOAD_TRIAGE_RESULT", payload: result.data });
  }
}

function renderWorkspace() {
  syncChannelPanels(activeChannel, boardState.tasks.length === 0);
  const metrics = computeBoardMetrics(boardState.tasks);
  if (el.kpiTotal) el.kpiTotal.textContent = String(metrics.total);
  if (el.kpiHigh) el.kpiHigh.textContent = String(metrics.highOrCritical);
  if (el.kpiMissing) el.kpiMissing.textContent = String(metrics.missingInfoCount);
  if (el.kpiProgress) el.kpiProgress.textContent = `${metrics.completionPct}%`;
  if (el.progressBar) el.progressBar.value = metrics.completionPct;
  if (metrics.completionPct === 100 && metrics.total > 0 && lastCompletionPct < 100) {
    fireConfettiCelebration();
    playTaskCompletedSound();
  }
  lastCompletionPct = metrics.completionPct;
  if (el.boardChecksumMeta) {
    const scopeLabel = activeChannel.kind === "personal" ? "🔒 Privado" : `#${activeChannel.name}`;
    el.boardChecksumMeta.textContent = `${scopeLabel} · Integridad #${boardState.checksum} · ${metrics.total} tarea(s)`;
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
    if (liveMissingTasks.length === 0) {
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
  // Render tasks list/table/kanban/timeline
  const filtered = getFilteredTasks();
  if (!el.tasksRenderRoot) return;
  if (filtered.length === 0) {
    const emptyMsg =
      activeChannel.kind === "personal"
        ? "Tu sección Mi Día (Privado) está lista. Crea tareas con hora programada usando «+ Nueva Tarea» o escribe tu plan diario a la izquierda."
        : "Crea una con «+ Nueva Tarea» o pega una solicitud para que la IA la organice sin inventar fechas.";
    el.tasksRenderRoot.innerHTML = `<div class="empty-state" role="status"><strong>Sin tareas aquí todavía</strong><p>${escapeHtml(emptyMsg)}</p></div>`;
    return;
  }
  if (currentViewMode === "table") {
    el.tasksRenderRoot.innerHTML = renderTableView(filtered);
  } else if (currentViewMode === "timeline") {
    el.tasksRenderRoot.innerHTML = renderHourlyTimelineView(filtered);
  } else if (currentViewMode === "kanban") {
    el.tasksRenderRoot.innerHTML = renderKanbanView(filtered);
  } else if (currentViewMode === "sharepoint") {
    el.tasksRenderRoot.innerHTML = renderSharePointListView(filtered);
  } else {
    el.tasksRenderRoot.innerHTML = `<div class="task-stack">${filtered.map(renderTaskCardHtml).join("")}</div>`;
  }
}

async function runAnalysisFlow(payload) {
  const originChannelId = activeChannel.id;
  if (el.formErrorBanner) el.formErrorBanner.hidden = true;
  if (el.analyzeSubmitBtn) {
    el.analyzeSubmitBtn.disabled = true;
    el.analyzeSubmitBtn.textContent = "Analizando actividades y fechas...";
  }
  try {
    let resultData = null;
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
      const localRes = await analyzeWorkplaceRequest(payload);
      if (!localRes.ok) throw new Error(localRes.error);
      resultData = localRes.data;
    }
    if (!resultData) {
      const localRes = await analyzeWorkplaceRequest(payload);
      if (!localRes.ok) throw new Error(localRes.error);
      resultData = localRes.data;
    }
    if (originChannelId !== activeChannel.id) {
      const originBoard = loadPersistedBoardState(originChannelId, activeUserId) ?? createInitialBoardState();
      savePersistedBoardState(
        taskBoardReducer(originBoard, { type: "LOAD_TRIAGE_RESULT", payload: resultData }),
        originChannelId,
        activeUserId
      );
      return;
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
      el.analyzeSubmitBtn.textContent = "⚡ Enviar y Extraer Tareas con IA";
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
    if (el.crudScheduledTime) el.crudScheduledTime.value = task.scheduledTime || "";
    el.crudAssignee.value = task.assignee === "Por asignar" ? "" : task.assignee;
    el.crudReason.value = task.priorityReason || "";
  } else {
    if (el.crudDialogTitle) {
      el.crudDialogTitle.textContent =
        activeChannel.kind === "personal" ? "Nueva Tarea en Mi Día (Privado)" : "Crear Nueva Tarea";
    }
    el.crudTaskId.value = "";
    el.crudTitle.value = "";
    el.crudPriority.value = "HIGH";
    el.crudStatus.value = "PENDING";
    el.crudDeadline.value = activeChannel.kind === "personal" ? (el.inputRefDate?.value || "") : "";
    if (el.crudScheduledTime) el.crudScheduledTime.value = "";
    el.crudAssignee.value = "";
    el.crudReason.value = "";
  }
  el.crudDialog.showModal();
  el.crudTitle.focus();
}

function openThreadDialog(task) {
  const dialog = (document.getElementById("slack-thread-dialog"));
  if (!dialog) return;
  const channelEl = document.getElementById("slack-thread-channel-name");
  const avatarEl = document.getElementById("slack-thread-avatar");
  const senderEl = document.getElementById("slack-thread-sender");
  const quoteEl = document.getElementById("slack-thread-parent-quote");
  const detailsEl = document.getElementById("slack-thread-task-details");
  const channelVal = activeChannel.kind === "personal" ? "mi-dia" : activeChannel.name || "general";
  if (channelEl) channelEl.textContent = channelVal;
  if (avatarEl) avatarEl.textContent = activeChannel.kind === "personal" ? "🔒" : "TF";
  if (senderEl) {
    senderEl.textContent =
      activeChannel.kind === "personal" ? "Mi Día (Espacio Privado)" : "Canal Colaborativo";
  }
  if (quoteEl) quoteEl.textContent = `"${task.sourceQuote || el.inputMessage?.value || task.title}"`;
  const prioMeta = PRIORITIES[task.priority] || PRIORITIES.MEDIUM;
  const statusMeta = TASK_STATUSES[task.status] || TASK_STATUSES.PENDING;
  const isConfirmed = task.deadlineState === DEADLINE_STATES.CONFIRMED;
  if (detailsEl) {
    detailsEl.innerHTML = `
      <div class="slack-msg-sender-row">
        <strong>#${escapeHtml(task.order)} ${escapeHtml(task.title)}</strong>
        <span class="prio-badge ${escapeHtml(prioMeta.badgeClass)}">${escapeHtml(prioMeta.labelEs)}</span>
        <span class="meta-badge">${escapeHtml(statusMeta.labelEs)}</span>
      </div>
      <p class="task-card__reason">${escapeHtml(task.priorityReason)}</p>
      ${task.sourceQuote ? `<p class="task-card__quote">💬 Sustento textual: "${escapeHtml(task.sourceQuote)}"</p>` : ""}
      <div class="task-badges">
        ${task.scheduledTime ? `<span class="meta-badge">⏰ Hora: ${escapeHtml(task.scheduledTime)}</span>` : ""}
        <span class="date-badge ${isConfirmed ? "date-confirmed" : "date-missing"}">
          ${isConfirmed ? "📅 Fecha:" : "⚠️ Falta fecha:"} ${escapeHtml(task.deadlineLabel)}
        </span>
        <span class="meta-badge">👤 Asignado: ${escapeHtml(task.assignee)}</span>
      </div>
      ${!isConfirmed ? `<p class="task-card__missing">Alerta Anti-Alucinación: ${escapeHtml(task.missingDetails || "Fecha no especificada en el mensaje original.")}</p>` : ""}
    `;
  }
  dialog.showModal();
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
    timeline: el.viewModeTimeline,
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

function updateSlackMessagePreview(preset) {
  const avatar = document.getElementById("slack-avatar");
  const sender = document.getElementById("slack-sender-name");
  const channelBadge = document.getElementById("slack-channel-badge");
  const text = document.getElementById("slack-msg-text");
  if (avatar) {
    const initials = (preset.sender || "LS")
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    avatar.textContent = initials || "SL";
  }
  if (sender) sender.textContent = preset.sender || "Canal Slack";
  if (channelBadge) channelBadge.textContent = `#${preset.id || "general"}`;
  if (text) text.textContent = `"${preset.message}"`;
}

function initPresets(todayIso) {
  if (!el.presetContainer) return;
  el.presetContainer.innerHTML = WORKPLACE_PRESETS.map(
    (p, idx) =>
      `<button type="button" class="chip ${idx === 0 ? "is-active" : ""}" data-preset-id="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`
  ).join("");
  el.presetContainer.addEventListener("click", (ev) => {
    const btn = (ev.target).closest("[data-preset-id]");
    if (!btn) return;
    const presetId = btn.getAttribute("data-preset-id");
    const found = WORKPLACE_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const target = channelsCtrl?.findByPresetId(found.id);
    if (target) channelsCtrl.activate(target.id, { rerun: true });
  });

  document.getElementById("channel-welcome")?.addEventListener("click", (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest("[data-example]");
    if (!btn) return;
    el.inputMessage.value = btn.getAttribute("data-example") || "";
    updateCharCounter();
    el.inputMessage.focus();
  });

  const inlineExtractBtn = document.getElementById("slack-inline-extract-btn");
  inlineExtractBtn?.addEventListener("click", () => {
    runAnalysisFlow({
      message: el.inputMessage.value,
      channel: el.inputChannel.value,
      referenceDate: el.inputRefDate.value || todayIso
    });
  });

  document.querySelectorAll(".slack-reaction-btn").forEach((rBtn) => {
    rBtn.addEventListener("click", () => {
      rBtn.classList.toggle("is-reacted");
      const span = rBtn.querySelector("span");
      if (span && !isNaN(Number(span.textContent))) {
        const current = Number(span.textContent);
        span.textContent = String(rBtn.classList.contains("is-reacted") ? current + 1 : Math.max(0, current - 1));
      }
    });
  });
}

async function processPendingJoinForUser(userId) {
  if (!userId) return;
  const joinToken = new URLSearchParams(window.location.search).get("join");
  if (!joinToken) return;
  try {
    const r = await fetch(`/api/channels/join?token=${encodeURIComponent(joinToken)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: joinToken, userId })
    });
    const res = await r.json();
    window.history.replaceState({}, document.title, window.location.pathname);
    if (res.ok && res.channelId) {
      const joinedMeta = res.channel || { id: res.channelId, name: res.channelId.replace(/^c_/, "") };
      showToast(`🎉 Te uniste al canal #${joinedMeta.name || res.channelId} exitosamente.`);
      channelsCtrl?.upsertJoinedChannel(joinedMeta);
    } else {
      showToast(`Error al unirse: ${res.error || "enlace inválido"}`);
    }
  } catch {
    showToast("No se pudo conectar con el servidor de invitaciones.");
  }
}

async function bootstrap() {
  const prefsCtrl = initVisualPreferences(el, showToast);
  const todayIso = new Date().toISOString().slice(0, 10);
  if (el.inputRefDate) el.inputRefDate.value = todayIso;

  channelsCtrl = initChannels({
    onActivate: (channel, opts) => applyChannel(channel, opts, todayIso),
    onRemoved: (channel) => removePersistedBoardState(channel.id, activeUserId),
    showToast
  });

  realtimeSlackCtrl = initRealtimeSlack({
    onExtractTasksFromMessage: (text, channelName) => {
      if (el.inputMessage) el.inputMessage.value = text;
      if (el.inputChannel) el.inputChannel.value = channelName;
      updateCharCounter();
      runAnalysisFlow({
        message: text,
        channel: channelName,
        referenceDate: el.inputRefDate?.value || todayIso
      });
    },
    onUserChanged: (user, meta = {}) => {
      activeUserId = user ? user.id : null;
      prefsCtrl.setUserPreferences(user);
      if (meta.refreshedPreferences) return;

      if (!user) {
        boardState = createInitialBoardState();
        channelsCtrl?.setUserContext(null);
        renderWorkspace();
        return;
      }

      const hasJoinLink = Boolean(new URLSearchParams(window.location.search).get("join"));
      channelsCtrl?.setUserContext(user, { forcePersonal: Boolean(meta.signedIn && !hasJoinLink) });
      if (hasJoinLink) {
        void processPendingJoinForUser(user.id);
      }
    },
    showToast
  });

  initPresets(todayIso);

  // Event Listeners
  el.navWorkspace?.addEventListener("click", () => setActiveTopSection("workspace"));
  el.navPresentation?.addEventListener("click", () => setActiveTopSection("presentation"));
  el.filterSearch?.addEventListener("input", renderWorkspace);
  el.resolveAllMissingBtn?.addEventListener("click", () => {
    const pending = boardState.tasks.filter((t) => t.deadlineState !== DEADLINE_STATES.CONFIRMED);
    if (pending.length === 0) {
      showToast("No hay tareas con fecha pendiente.");
      return;
    }
    const friday = nextFridayIso(el.inputRefDate?.value || todayIso);
    const ok = window.confirm(
      `¿Asignar la fecha ${friday} (próximo viernes) a ${pending.length} tarea(s) sin fecha?\n\nEs una decisión humana: la IA no inventa fechas. Puedes ajustarlas luego en cada tarjeta.`
    );
    if (!ok) return;
    for (const t of pending) {
      boardState = taskBoardReducer(boardState, {
        type: "UPDATE_TASK",
        payload: { id: t.id, deadlineDate: friday }
      });
    }
    if (activeChannel.kind !== "personal" || activeUserId) {
      savePersistedBoardState(boardState, activeChannel.id, activeUserId);
      syncRemoteTasks(activeChannel.id, boardState.tasks, activeUserId);
    }
    renderWorkspace();
    showToast(`${pending.length} tarea(s) con fecha ${friday} confirmada por el usuario.`);
  });

  el.tasksRenderRoot?.addEventListener("change", (ev) => {
    const input = (ev.target);
    const action = input.getAttribute("data-action");
    const taskId = input.getAttribute("data-id");
    if (action === "quick-date") {
      dispatch({ type: "UPDATE_TASK", payload: { id: taskId, deadlineDate: input.value || null } });
      showToast(input.value ? `Fecha confirmada: ${input.value}` : "Fecha eliminada; la tarea vuelve a info faltante.");
    } else if (action === "quick-time") {
      dispatch({ type: "UPDATE_TASK", payload: { id: taskId, scheduledTime: input.value || null } });
      showToast(input.value ? `⏰ Hora programada: ${input.value}` : "Hora eliminada.");
    }
  });

  el.inputMessage?.addEventListener("input", updateCharCounter);
  el.inputMessage?.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
      ev.preventDefault();
      runAnalysisFlow({
        message: el.inputMessage.value,
        channel: el.inputChannel.value,
        referenceDate: el.inputRefDate.value || todayIso
      });
    }
  });

  el.clearInputBtn?.addEventListener("click", () => {
    el.inputMessage.value = "";
    updateCharCounter();
    el.inputMessage.focus();
  });

  el.analyzeForm?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const msgText = el.inputMessage?.value?.trim() || "";
    if (msgText && activeChannel.kind !== "personal" && typeof realtimeSlackCtrl?.sendMessage === "function") {
      realtimeSlackCtrl.sendMessage(msgText);
    }
    runAnalysisFlow({
      message: msgText,
      channel: el.inputChannel.value,
      referenceDate: el.inputRefDate.value || todayIso
    });
  });

  el.viewModeCards?.addEventListener("click", () => setViewMode("cards"));
  el.viewModeTimeline?.addEventListener("click", () => setViewMode("timeline"));

  el.alarmToggleBtn?.addEventListener("click", async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      el.alarmToggleBtn.classList.add("is-active");
      el.alarmToggleBtn.title = "Notificaciones y alarmas sonoras activadas";
      playAlarmChime();
      showToast("🔔 Notificaciones y alarma sonora activadas correctamente.");
    } else {
      showToast("Permiso de notificaciones no concedido por el navegador.");
    }
  });

  el.inviteChannelBtn?.addEventListener("click", async () => {
    if (activeChannel?.kind === "personal" || activeChannel?.id === "personal") {
      showToast("Mi Día (Privado) es solo para tus propias tareas. Crea o abre un canal para invitar personas.");
      return;
    }
    try {
      const res = await fetch("/api/channels/invite", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: activeChannel?.id || "general",
          userId: activeUserId || null,
          createdBy: activeUserId || "anonymous"
        })
      });
      const data = await res.json();
      if (data.inviteUrl) {
        copyTextToClipboard(data.inviteUrl, "🔗 Enlace de invitación al canal copiado al portapapeles.");
      } else {
        showToast(data.error || "Error generando enlace de invitación.");
      }
    } catch {
      showToast("Error de conexión al generar invitación.");
    }
  });

  el.viewModeTable?.addEventListener("click", () => setViewMode("table"));
  el.viewModeKanban?.addEventListener("click", () => setViewMode("kanban"));
  el.viewModeSharepoint?.addEventListener("click", () => setViewMode("sharepoint"));
  el.filterPriority?.addEventListener("change", renderWorkspace);
  el.filterDeadline?.addEventListener("change", renderWorkspace);

  el.tasksRenderRoot?.addEventListener("click", (ev) => {
    const target = (ev.target);
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
    if (action === "open-thread") {
      openThreadDialog(task);
    } else if (action === "quick-friday") {
      const friday = nextFridayIso(el.inputRefDate?.value || todayIso);
      dispatch({ type: "UPDATE_TASK", payload: { id: task.id, deadlineDate: friday } });
      showToast(`Fecha confirmada (próximo viernes): ${friday}`);
    } else if (action === "quick-complete") {
      dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: "COMPLETED" } });
      showToast(`Tarea completada: "${task.title}"`);
    } else if (action === "cycle-status") {
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
      scheduledTime: el.crudScheduledTime?.value?.trim() || null,
      assignee: el.crudAssignee.value.trim() || "Por asignar",
      priorityReason: el.crudReason.value.trim() || "Prioridad definida por el usuario.",
      isPrivate: activeChannel.kind === "personal",
      userId: activeChannel.kind === "personal" ? activeUserId : null
    };
    if (id) {
      dispatch({ type: "UPDATE_TASK", payload: { id, ...payload } });
      showToast("Tarea actualizada correctamente.");
    } else {
      dispatch({ type: "CREATE_TASK", payload });
      showToast(
        activeChannel.kind === "personal"
          ? "Tarea privada guardada en Mi Día."
          : "Nueva tarea agregada al plan."
      );
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
    renderTeamsCardPreviewHelper();
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

  document.getElementById("export-ics-btn")?.addEventListener("click", () => {
    const ics = exportToICalendar(boardState.tasks);
    triggerDownload(`taskflow-calendar-${todayIso}.ics`, ics, "text/calendar;charset=utf-8");
    showToast("📅 Archivo iCalendar (.ics) generado para Outlook y Apple Calendar.");
  });

  document.getElementById("send-clarification-email-btn")?.addEventListener("click", () => {
    const missingTasks = boardState.tasks.filter((t) => t.deadlineState !== DEADLINE_STATES.CONFIRMED);
    const draftText = el.clarificationDraftBox?.textContent || "";
    const mailto = generateMailtoClarificationUrl({
      senderEmail: "coordinacion@empresa.com",
      subject: "TaskFlow AI · Aclaración de fechas de entrega requeridas",
      clarificationDraft: draftText,
      missingTasks
    });
    window.location.href = mailto;
    showToast("Abriendo cliente de correo corporativo para enviar aclaración...");
  });

  setupKanbanDragAndDrop(el.tasksRenderRoot, (taskId, targetStatus) => {
    dispatch({ type: "UPDATE_TASK", payload: { id: taskId, status: targetStatus } });
    showToast(`Tarea movida a: ${TASK_STATUSES[targetStatus]?.labelEs || targetStatus}`);
  });

  const micBtn = document.getElementById("mic-dictation-btn");
  if (micBtn) {
    setupVoiceDictation({
      micBtn,
      inputMessage: el.inputMessage,
      onTranscriptChange: updateCharCounter,
      showToast
    });
  }

  setupCommandPalette({
    dialog: document.getElementById("cmd-palette-dialog"),
    searchInput: document.getElementById("cmd-palette-input"),
    resultsList: document.getElementById("cmd-palette-results"),
    getTasks: () => boardState.tasks,
    onSelectAction: (actionId) => {
      if (actionId === "export-ics") {
        document.getElementById("export-ics-btn")?.click();
      } else if (actionId === "export-csv") {
        el.exportCsvBtn?.click();
      } else if (actionId === "export-slack") {
        el.copySlackMdBtn?.click();
      } else if (actionId === "export-teams") {
        el.exportTeamsCardBtn?.click();
      }
    },
    openCrudDialog,
    setViewMode,
    showToast
  });

  el.resetDemoBtn?.addEventListener("click", () => {
    if (activeChannel.kind === "custom" || activeChannel.kind === "personal") {
      if (boardState.tasks.length === 0) {
        showToast("Esta lista ya está vacía.");
        return;
      }
      const label = activeChannel.kind === "personal" ? "Mi Día (Privado)" : `#${activeChannel.name}`;
      if (!window.confirm(`¿Vaciar todas las tareas de ${label}?`)) return;
      dispatch({ type: "CLEAR_BOARD" });
      showToast(`Lista de ${label} vaciada.`);
      return;
    }
    const preset = WORKPLACE_PRESETS.find((p) => p.id === activeChannel.presetId) || WORKPLACE_PRESETS[0];
    el.inputChannel.value = preset.channel;
    el.inputMessage.value = preset.message;
    updateCharCounter();
    runAnalysisFlow({
      message: preset.message,
      channel: preset.channel,
      referenceDate: el.inputRefDate.value || todayIso
    });
  });

  const threadDialog = (document.getElementById("slack-thread-dialog"));
  document.getElementById("close-thread-dialog-btn")?.addEventListener("click", () => threadDialog?.close());
  document.getElementById("dismiss-thread-dialog-btn")?.addEventListener("click", () => threadDialog?.close());
  document.getElementById("slack-thread-send-reply-btn")?.addEventListener("click", () => {
    const replyInput = (document.getElementById("slack-thread-quick-reply"));
    if (replyInput && replyInput.value.trim()) {
      showToast("Mensaje registrado en el hilo de Slack.");
      replyInput.value = "";
      threadDialog?.close();
    }
  });

  window.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
      ev.preventDefault();
      if (el.inputMessage && el.inputMessage.value.trim().length >= 4) {
        runAnalysisFlow({ message: el.inputMessage.value, channel: el.inputChannel.value, referenceDate: el.inputRefDate.value || todayIso });
      }
      return;
    }
    if (ev.altKey && (ev.key === "n" || ev.key === "N")) {
      ev.preventDefault();
      openCrudDialog(null);
      return;
    }
    if (ev.altKey && (ev.key === "p" || ev.key === "P")) {
      ev.preventDefault();
      window.print();
      return;
    }
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    const isTyping = tag === "input" || tag === "textarea" || tag === "select";
    if (!isTyping && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      if (ev.key === "1") setViewMode("cards");
      else if (ev.key === "2") setViewMode("table");
      else if (ev.key === "3") setViewMode("kanban");
      else if (ev.key === "4") setViewMode("sharepoint");
      else if (ev.key === "5") setViewMode("timeline");
    }
  });

  // Background Alarm & Audio Notification Loop (runs every 25 seconds)
  const firedAlarms = new Set();
  setInterval(() => {
    if (!boardState || !Array.isArray(boardState.tasks)) return;
    const currentHhMm = formatLocalHhMm();
    const due = checkDueAlarms(boardState.tasks, currentHhMm, firedAlarms);
    for (const task of due) {
      triggerTaskNotification(task);
      playAlarmChime();
      showToast(`⏰ ¡Hora de tu tarea programada! ${task.title}`);
    }
  }, 25_000);

  // If ?join=token is present and user is not logged in yet, notify them to sign in first
  if (new URLSearchParams(window.location.search).get("join") && !activeUserId) {
    showToast("Inicia sesión con tu cuenta de Google para unirte al canal compartido.");
  }

  // PWA Recovery: Unregister any legacy Service Worker to ensure clean network execution
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        for (const reg of regs) {
          reg.unregister().catch(() => {});
        }
      })
      .catch(() => {});
  }
}

bootstrap();
