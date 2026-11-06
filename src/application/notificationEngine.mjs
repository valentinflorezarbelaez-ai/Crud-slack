/**
 * PURE LAYER-0 ALARM NOTIFICATION ENGINE
 * Governed by EOS Law V (Clean Architecture).
 * Zero external runtime dependencies.
 */

/**
 * Compares wall-clock HH:mm with task scheduled times and returns tasks that need alarming.
 * Mutates firedAlarmSet to deduplicate alarms per session/day.
 *
 * @param {Array<any>} tasks
 * @param {string} currentHhMm - e.g. "09:30"
 * @param {Set<string>} firedAlarmSet
 * @returns {Array<any>}
 */
export function checkDueAlarms(tasks, currentHhMm, firedAlarmSet) {
  if (!Array.isArray(tasks) || typeof currentHhMm !== "string") return [];
  const normalizedTime = currentHhMm.trim();

  const due = [];
  for (const t of tasks) {
    if (!t || typeof t !== "object") continue;
    if (t.status === "COMPLETED") continue;
    if (!t.scheduledTime) continue;

    if (t.scheduledTime === normalizedTime) {
      const alarmKey = `${t.id}_${normalizedTime}`;
      if (firedAlarmSet && !firedAlarmSet.has(t.id) && !firedAlarmSet.has(alarmKey)) {
        if (firedAlarmSet) {
          firedAlarmSet.add(t.id);
          firedAlarmSet.add(alarmKey);
        }
        due.push(t);
      }
    }
  }

  return due;
}

/**
 * Derives current HH:mm from a Date object in local time.
 * @param {Date} [now]
 * @returns {string}
 */
export function formatLocalHhMm(now = new Date()) {
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
