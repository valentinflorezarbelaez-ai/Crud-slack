/**
 * INFRASTRUCTURE ADAPTER: SAFE LOCALSTORAGE PERSISTENCE
 * Persists user CRUD modifications locally across browser reloads.
 */

import { createInitialBoardState, computeTasksChecksum } from "../domain/taskBoardStore.mjs";
import { createTaskEntity } from "../domain/taskEntities.mjs";

const STORAGE_KEY = "crud_slack_taskflow_state_v1";

export function loadPersistedBoardState() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;

    const tasks = parsed.tasks.map((t, idx) => createTaskEntity(t, idx));
    return {
      tasks,
      lastAnalysis: parsed.lastAnalysis || null,
      checksum: computeTasksChecksum(tasks)
    };
  } catch {
    return createInitialBoardState();
  }
}

export function savePersistedBoardState(state) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}
