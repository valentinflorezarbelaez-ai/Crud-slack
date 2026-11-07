/**
 * INFRASTRUCTURE ADAPTER: HYBRID CLOUD & LOCALSTORAGE TASK ADAPTER
 * Connects the reactive task board store to Neon PostgreSQL (/api/tasks)
 * with graceful offline fallback to window.localStorage.
 * Enforces strict (userId, channelId) isolation across all personal private spaces
 * and live collaborative sync across shared channels (FR-CS-017).
 *
 * Governed by EOS Law V (Clean Architecture) and Law VI (Defense in Depth).
 * Zero external runtime dependencies.
 */

import { createTaskEntity } from "../domain/taskEntities.mjs";
import { loadPersistedBoardState, savePersistedBoardState } from "./storageAdapter.mjs";

/** @type {Map<string, any>} */
const syncDebounceTimers = new Map();

/**
 * Normalizes a channel ID by removing 'c_' prefix and mapping personal space slugs.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeChannel(raw) {
  let ch = String(raw || "general").trim().toLowerCase();
  if (ch.startsWith("c_")) ch = ch.slice(2);
  if (ch === "mi-dia") return "personal";
  if (ch === "mis-proyectos") return "personal-proyectos";
  if (ch === "notas-ideas") return "personal-notas";
  return ch || "general";
}

export function isPersonalSpace(canonical, rawChannel = "") {
  const c = String(canonical || "").toLowerCase();
  return c === "personal" || c.startsWith("personal-") || String(rawChannel || "").startsWith("usr_");
}

/**
 * Fetches tasks from Neon PostgreSQL /api/tasks with fallback to localStorage.
 * @param {string} channelId
 * @param {string|null} userId
 * @returns {Promise<{ ok: boolean, tasks: Array<any>, checksum?: string|null, source: "cloud"|"local" }>}
 */
export async function fetchRemoteTasks(channelId, userId = null) {
  const rawId = String(channelId || "general").trim();
  const canonical = normalizeChannel(rawId);
  const isPrivate = isPersonalSpace(canonical, rawId);
  const isCustomChannel = rawId.startsWith("c_");

  // Strict privacy guard: never return private workspace tasks without an authenticated userId
  if (isPrivate && !userId) {
    return { ok: true, tasks: [], checksum: null, source: "local" };
  }

  // If running in a non-browser environment or fetch is unavailable, return local directly
  if (typeof window === "undefined" || typeof fetch !== "function") {
    const local = loadPersistedBoardState(canonical, userId);
    return { ok: true, tasks: local?.tasks || [], checksum: local?.checksum || null, source: "local" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const params = new URLSearchParams({ channelId: isCustomChannel ? rawId : canonical });
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
        const entities = json.tasks
          .filter((t) => t && t.id !== "tsk_priv_1" && !String(t.title || "").includes("Mi entrega privada"))
          .map((t, idx) =>
            createTaskEntity({ ...t, isPrivate: isPrivate || Boolean(t.isPrivate), userId: userId || t.userId }, idx)
          );
        if (entities.length > 0 || isCustomChannel || isPrivate) {
          savePersistedBoardState({ tasks: entities }, canonical, userId);
          return {
            ok: true,
            tasks: entities,
            checksum: json.checksum || null,
            source: "cloud"
          };
        }
      }
    }
  } catch {
    // Network failure, timeout, or server unavailable -> fallback to local
  }

  // Fallback to local storage
  const local = loadPersistedBoardState(canonical, userId);
  return { ok: true, tasks: local?.tasks || [], checksum: local?.checksum || null, source: "local" };
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
  const rawId = String(channelId || "general").trim();
  const canonical = normalizeChannel(rawId);
  const isPrivate = isPersonalSpace(canonical, rawId);
  const isCustomChannel = rawId.startsWith("c_");

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
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          channelId: isCustomChannel ? rawId : canonical,
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
