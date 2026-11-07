/**
 * INFRASTRUCTURE ADAPTER: SAFE LOCALSTORAGE PERSISTENCE
 * Persists user CRUD modifications locally across browser reloads.
 * Every channel owns an independent board; #general keeps the legacy key so
 * previously saved data is preserved.
 */

import { createInitialBoardState, computeTasksChecksum } from "../domain/taskBoardStore.mjs";
import { createTaskEntity } from "../domain/taskEntities.mjs";

const STORAGE_KEY = "crud_slack_taskflow_state_v1";

function keyFor(channelId, userId = null) {
  const userSuffix = userId ? `__usr_${userId}` : "";
  return !channelId || channelId === "general"
    ? `${STORAGE_KEY}${userSuffix}`
    : `${STORAGE_KEY}__${channelId}${userSuffix}`;
}

export function loadPersistedBoardState(channelId, userId = null) {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(keyFor(channelId, userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;

    const tasks = parsed.tasks
      .filter((t) => t && t.id !== "tsk_priv_1" && !String(t.title || "").includes("Mi entrega privada"))
      .map((t, idx) => createTaskEntity(t, idx));
    return {
      tasks,
      lastAnalysis: parsed.lastAnalysis || null,
      checksum: computeTasksChecksum(tasks)
    };
  } catch {
    return createInitialBoardState();
  }
}

export function savePersistedBoardState(state, channelId, userId = null) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(keyFor(channelId, userId), JSON.stringify(state));
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}

export function removePersistedBoardState(channelId, userId = null) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(keyFor(channelId, userId));
  } catch {
    // Ignore quota or private-mode restrictions safely
  }
}
