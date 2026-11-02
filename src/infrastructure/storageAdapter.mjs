/**
 * INFRASTRUCTURE ADAPTER: SAFE LOCALSTORAGE PERSISTENCE
 * Persists user CRUD modifications locally across browser reloads.
 * Every channel owns an independent board; #general keeps the legacy key so
 * previously saved data is preserved.
 */

import { createInitialBoardState, computeTasksChecksum } from "../domain/taskBoardStore.mjs";
import { createTaskEntity } from "../domain/taskEntities.mjs";

const STORAGE_KEY = "crud_slack_taskflow_state_v1";

function keyFor(channelId) {
  return !channelId || channelId === "general" ? STORAGE_KEY : `${STORAGE_KEY}__${channelId}`;
}

export function loadPersistedBoardState(channelId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(keyFor(channelId));
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

export function savePersistedBoardState(state, channelId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(keyFor(channelId), JSON.stringify(state));
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}

export function removePersistedBoardState(channelId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(keyFor(channelId));
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}
