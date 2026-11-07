/**
 * INFRASTRUCTURE ADAPTER: HYBRID CLOUD & LOCALSTORAGE TASK ADAPTER
 * Connects the reactive task board store to Neon PostgreSQL (/api/tasks)
 * with graceful offline fallback to window.localStorage.
 *
 * Governed by EOS Law V (Clean Architecture) and Law VI (Defense in Depth).
 * Zero external runtime dependencies.
 */

import { createTaskEntity } from "../domain/taskEntities.mjs";
import { loadPersistedBoardState, savePersistedBoardState } from "./storageAdapter.mjs";

/** @type {Map<string, any>} */
const syncDebounceTimers = new Map();

/**
 * Normalizes a channel ID by removing 'c_' prefix and mapping 'mi-dia' to 'personal'.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeChannel(raw) {
  let ch = String(raw || "general").trim().toLowerCase();
  if (ch.startsWith("c_")) ch = ch.slice(2);
  if (ch === "mi-dia") return "personal";
  return ch || "general";
}

/**
 * Fetches tasks from Neon PostgreSQL /api/tasks with fallback to localStorage.
 * @param {string} channelId
 * @param {string|null} userId
 * @returns {Promise<{ ok: boolean, tasks: Array<any>, source: "cloud"|"local" }>}
 */
export async function fetchRemoteTasks(channelId, userId = null) {
  const canonical = normalizeChannel(channelId);
  const isPrivate = canonical === "personal" || String(channelId || "").startsWith("usr_");

  // Strict privacy guard: never return private workspace tasks without an authenticated userId
  if (isPrivate && !userId) {
    return { ok: true, tasks: [], source: "local" };
  }

  // If running in a non-browser environment or fetch is unavailable, return local directly
  if (typeof window === "undefined" || typeof fetch !== "function") {
    const local = loadPersistedBoardState(canonical, userId);
    return { ok: true, tasks: local?.tasks || [], source: "local" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const params = new URLSearchParams({ channelId: canonical });
    if (userId) params.set("userId", userId);
    if (isPrivate) params.set("isPrivate", "true");

    const res = await fetch(`/api/tasks?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.ok && Array.isArray(json.tasks)) {
        const entities = json.tasks.map((t, idx) =>
          createTaskEntity({ ...t, isPrivate: isPrivate || Boolean(t.isPrivate), userId: userId || t.userId }, idx)
        );
        if (entities.length > 0) {
          savePersistedBoardState({ tasks: entities }, canonical, userId);
          return { ok: true, tasks: entities, source: "cloud" };
        }
        if (isPrivate) {
          const local = loadPersistedBoardState(canonical, userId);
          if (!local || !Array.isArray(local.tasks) || local.tasks.length === 0) {
            return { ok: true, tasks: [], source: "cloud" };
          }
        }
      }
    }
  } catch {
    // Network failure, timeout, or server unavailable -> fallback to local
  }

  // Fallback to local storage
  const local = loadPersistedBoardState(canonical, userId);
  return { ok: true, tasks: local?.tasks || [], source: "local" };
}

/**
 * Pushes tasks to Neon PostgreSQL (/api/tasks) in the background with debouncing.
 * Always writes to localStorage immediately for offline safety.
 *
 * @param {string} channelId
 * @param {Array<any>} tasks
 * @param {string|null} userId
 * @param {{ immediate?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export async function syncRemoteTasks(channelId, tasks, userId = null, options = {}) {
  const canonical = normalizeChannel(channelId);
  const isPrivate = canonical === "personal" || String(channelId || "").startsWith("usr_");

  if (isPrivate && !userId) {
    return false;
  }

  const entities = Array.isArray(tasks)
    ? tasks.map((t, idx) =>
        createTaskEntity(
          {
            ...t,
            isPrivate: isPrivate || Boolean(t.isPrivate),
            userId: isPrivate ? userId : userId || t.userId || null
          },
          idx
        )
      )
    : [];

  // 1. Immediate local persistence scoped to (channel, userId)
  savePersistedBoardState({ tasks: entities }, canonical, userId);

  // 2. If non-browser environment, stop here
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return true;
  }

  const timerKey = `${canonical}__${userId || "public"}`;
  if (syncDebounceTimers.has(timerKey)) {
    clearTimeout(syncDebounceTimers.get(timerKey));
    syncDebounceTimers.delete(timerKey);
  }

  const performSync = async () => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: canonical,
          userId: userId || null,
          isPrivate,
          tasks: entities
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  if (options.immediate) {
    return await performSync();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      syncDebounceTimers.delete(timerKey);
      const success = await performSync();
      resolve(success);
    }, 300);
    syncDebounceTimers.set(timerKey, timer);
  });
}
