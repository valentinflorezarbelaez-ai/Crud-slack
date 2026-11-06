/**
 * INFRASTRUCTURE ADAPTER: BROWSER NOTIFICATION API
 * Dispatches native OS notifications when tasks reach their scheduled time.
 * Zero external runtime dependencies.
 */

/**
 * Requests native browser notification permissions safely.
 * @returns {Promise<boolean>}
 */
export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    const perm = await Notification.requestPermission().catch(() => "denied");
    return perm === "granted";
  }
  return false;
}

/**
 * Emits a native notification for a scheduled task.
 * @param {{ title: string, scheduledTime?: string, priority?: string }} task
 * @returns {boolean}
 */
export function triggerTaskNotification(task) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    try {
      const timeStr = task.scheduledTime ? ` (${task.scheduledTime})` : "";
      new Notification(`⏰ Recordatorio de Tarea${timeStr}`, {
        body: task.title || "Es hora de tu tarea programada.",
        icon: "/favicon.svg",
        tag: `taskflow-alarm-${task.id || Date.now()}`,
        requireInteraction: false
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
