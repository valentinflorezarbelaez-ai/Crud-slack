/**
 * LAYER-0 PURE IMMUTABLE CRUD STATE REDUCER & METRICS ENGINE
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-006, BDD-CS-003).
 * Zero external runtime dependencies.
 */

import {
  DEADLINE_STATES,
  PRIORITIES,
  createTaskEntity,
  fnv1aHex,
  normalizePriority,
  normalizeStatus
} from "./taskEntities.mjs";

/**
 * Creates an empty initial board state.
 */
export function createInitialBoardState() {
  return {
    tasks: [],
    lastAnalysis: null,
    checksum: fnv1aHex("EMPTY_BOARD_V1")
  };
}

/**
 * Recomputes deterministic FNV-1a integrity checksum for a task collection.
 * @param {Array<ReturnType<typeof createTaskEntity>>} tasks
 */
export function computeTasksChecksum(tasks) {
  const serialized = tasks
    .map((t) => `${t.id}:${t.title}:${t.priority}:${t.status}:${t.deadlineDate || "NULL"}:${t.deadlineState}:${t.assignee}`)
    .join("|");
  return fnv1aHex(serialized || "EMPTY");
}

/**
 * Pure CRUD reducer operating on immutable board state snapshots.
 * @param {ReturnType<typeof createInitialBoardState>} state
 * @param {{ type: string, payload?: any }} action
 */
export function taskBoardReducer(state, action) {
  const currentTasks = Array.isArray(state?.tasks) ? state.tasks : [];

  switch (action.type) {
    case "LOAD_TRIAGE_RESULT": {
      const result = action.payload;
      const incoming = Array.isArray(result?.tasks)
        ? result.tasks.map((t, i) => createTaskEntity(t, i))
        : [];
      return {
        tasks: incoming,
        lastAnalysis: {
          summary: result.summary || "",
          channel: result.channel || "slack",
          referenceDate: result.referenceDate || "",
          engineMode: result.engineMode || "LAYER0_DETERMINISTIC_ENGINE",
          latencyMs: result.latencyMs ?? 0,
          missingInfoGaps: result.missingInfoGaps || [],
          clarificationDraft: result.clarificationDraft || "",
          verificationReport: result.verificationReport || null
        },
        checksum: computeTasksChecksum(incoming)
      };
    }

    case "CREATE_TASK": {
      const nextOrder = currentTasks.length + 1;
      const raw = action.payload || {};
      const hasDate = typeof raw.deadlineDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadlineDate);
      const created = createTaskEntity(
        {
          ...raw,
          order: nextOrder,
          deadlineState: hasDate ? DEADLINE_STATES.CONFIRMED : DEADLINE_STATES.MISSING_INFO,
          deadlineLabel: hasDate ? `${raw.deadlineDate} (Confirmada)` : "Información faltante (sin fecha límite)",
          missingDetails: hasDate ? "" : "Tarea creada manualmente sin fecha límite definida.",
          grounded: true
        },
        currentTasks.length
      );
      const nextTasks = [...currentTasks, created];
      return {
        ...state,
        tasks: nextTasks,
        checksum: computeTasksChecksum(nextTasks)
      };
    }

    case "UPDATE_TASK": {
      const patch = action.payload || {};
      const nextTasks = currentTasks.map((task, idx) => {
        if (task.id !== patch.id) return task;

        const nextDateRaw =
          patch.deadlineDate !== undefined ? String(patch.deadlineDate || "").trim() : task.deadlineDate;
        const hasValidDate = Boolean(nextDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(nextDateRaw));

        let nextDeadlineState = task.deadlineState;
        let nextDeadlineLabel = patch.deadlineLabel !== undefined ? patch.deadlineLabel : task.deadlineLabel;
        let nextMissingDetails = patch.missingDetails !== undefined ? patch.missingDetails : task.missingDetails;

        // If user supplies or updates an explicit calendar date, resolve missing info!
        if (patch.deadlineDate !== undefined) {
          if (hasValidDate) {
            nextDeadlineState = DEADLINE_STATES.CONFIRMED;
            nextDeadlineLabel = `${nextDateRaw} (Confirmada)`;
            nextMissingDetails = "";
          } else {
            nextDeadlineState = DEADLINE_STATES.MISSING_INFO;
            nextDeadlineLabel = "Información faltante (sin fecha límite)";
            nextMissingDetails = "Fecha límite pendiente por confirmar.";
          }
        }

        return createTaskEntity(
          {
            ...task,
            ...patch,
            priority: patch.priority ? normalizePriority(patch.priority) : task.priority,
            status: patch.status ? normalizeStatus(patch.status) : task.status,
            deadlineDate: hasValidDate ? nextDateRaw : null,
            deadlineState: nextDeadlineState,
            deadlineLabel: nextDeadlineLabel,
            missingDetails: nextMissingDetails,
            updatedAt: new Date().toISOString()
          },
          idx
        );
      });

      return {
        ...state,
        tasks: nextTasks,
        checksum: computeTasksChecksum(nextTasks)
      };
    }

    case "DELETE_TASK": {
      const targetId = action.payload?.id;
      const nextTasks = currentTasks
        .filter((t) => t.id !== targetId)
        .map((t, idx) => ({ ...t, order: idx + 1 }));
      return {
        ...state,
        tasks: nextTasks,
        checksum: computeTasksChecksum(nextTasks)
      };
    }

    case "CLEAR_BOARD": {
      return createInitialBoardState();
    }

    default:
      return state;
  }
}

/**
 * Computes real-time operational KPIs for the task workspace.
 * @param {Array<ReturnType<typeof createTaskEntity>>} tasks
 */
export function computeBoardMetrics(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const total = list.length;
  const completed = list.filter((t) => t.status === "COMPLETED").length;
  const inProgress = list.filter((t) => t.status === "IN_PROGRESS").length;
  const pending = list.filter((t) => t.status === "PENDING").length;
  const highOrCritical = list.filter(
    (t) => t.priority === PRIORITIES.CRITICAL.code || t.priority === PRIORITIES.HIGH.code
  ).length;
  const missingInfoCount = list.filter((t) => t.deadlineState !== DEADLINE_STATES.CONFIRMED).length;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    inProgress,
    pending,
    highOrCritical,
    missingInfoCount,
    completionPct
  };
}
