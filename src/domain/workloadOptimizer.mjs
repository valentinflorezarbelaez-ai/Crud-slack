/**
 * DOMAIN SERVICE: WORKLOAD OPTIMIZER & EXECUTIVE STANDUP GENERATOR
 * Pure business logic conforming to Hexagonal Layer-0 (0 external dependencies).
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-020).
 */

/**
 * Parses "HH:mm" time string into total minutes from midnight.
 * @param {string|null} timeStr
 * @returns {number|null}
 */
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Converts total minutes from midnight back to "HH:mm" format.
 * @param {number} totalMinutes
 * @returns {string}
 */
export function minutesToTime(totalMinutes) {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(bounded / 60).toString().padStart(2, "0");
  const m = (bounded % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Detects time collisions and overlapping schedule slots among tasks.
 * @param {Array<any>} tasks
 * @returns {Array<{ taskA: any, taskB: any, overlapMinutes: number }>}
 */
export function detectScheduleConflicts(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const scheduled = list
    .filter((t) => t && t.status !== "COMPLETED" && t.scheduledTime)
    .map((t) => {
      const start = timeToMinutes(t.scheduledTime);
      const duration = Number(t.durationMinutes) || 60;
      return {
        task: t,
        start,
        end: start !== null ? start + duration : null
      };
    })
    .filter((item) => item.start !== null);

  const conflicts = [];
  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      const a = scheduled[i];
      const b = scheduled[j];
      // Check if intervals [startA, endA) and [startB, endB) overlap
      if (a.start < b.end && b.start < a.end) {
        const overlapStart = Math.max(a.start, b.start);
        const overlapEnd = Math.min(a.end, b.end);
        conflicts.push({
          taskA: a.task,
          taskB: b.task,
          overlapMinutes: overlapEnd - overlapStart
        });
      }
    }
  }
  return conflicts;
}

/**
 * Staggers overlapping tasks to resolve scheduling collisions deterministically.
 * When two tasks collide, shifts the lower-priority or later task to start after the first finishes.
 * @param {Array<any>} tasks
 * @returns {Array<any>}
 */
export function resolveScheduleConflicts(tasks) {
  const list = Array.isArray(tasks) ? tasks.map((t) => ({ ...t })) : [];
  const conflicts = detectScheduleConflicts(list);
  if (conflicts.length === 0) return list;

  // Priority weight: CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1
  const priorityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  for (const conflict of conflicts) {
    const a = list.find((t) => t.id === conflict.taskA.id);
    const b = list.find((t) => t.id === conflict.taskB.id);
    if (!a || !b) continue;

    const weightA = priorityWeight[a.priority] || 2;
    const weightB = priorityWeight[b.priority] || 2;

    // Shift the lower priority task, or task B if equal
    const target = weightA >= weightB ? b : a;
    const anchor = target === b ? a : b;

    const anchorStart = timeToMinutes(anchor.scheduledTime);
    const anchorDuration = Number(anchor.durationMinutes) || 60;
    if (anchorStart !== null) {
      const nextAvailable = anchorStart + anchorDuration + 15; // 15 min buffer
      if (nextAvailable < 23 * 60) {
        target.scheduledTime = minutesToTime(nextAvailable);
      }
    }
  }

  return list;
}

/**
 * Generates an executive standup digest formatted for daily briefing and team sharing.
 * @param {Array<any>} tasks
 * @param {{ activeChannelName?: string, userName?: string }} [opts]
 * @returns {{ title: string, markdown: string, speechText: string, metrics: any, conflicts: Array<any> }}
 */
export function generateDailyExecutiveDigest(tasks, opts = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const channelName = opts.activeChannelName || "Mi Día";
  const userName = opts.userName || "Equipo";

  const total = list.length;
  const completed = list.filter((t) => t.status === "COMPLETED").length;
  const inProgress = list.filter((t) => t.status === "IN_PROGRESS").length;
  const pending = list.filter((t) => t.status === "PENDING").length;
  const missingInfo = list.filter((t) => t.deadlineState === "MISSING_INFO").length;
  const critical = list.filter((t) => t.priority === "CRITICAL" || t.priority === "HIGH").length;

  const conflicts = detectScheduleConflicts(list);

  // Group active tasks
  const scheduledTasks = list
    .filter((t) => t.status !== "COMPLETED" && t.scheduledTime)
    .sort((a, b) => (timeToMinutes(a.scheduledTime) || 0) - (timeToMinutes(b.scheduledTime) || 0));

  const unscheduledTasks = list
    .filter((t) => t.status !== "COMPLETED" && !t.scheduledTime);

  const lines = [];
  lines.push(`☀️ *RESUMEN EJECUTIVO DIARIO · ${channelName.toUpperCase()}*`);
  lines.push(`👤 *Responsable*: ${userName} | 📅 *Fecha*: ${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}`);
  lines.push("");
  lines.push(`📊 *Métricas Clave*: ${completed}/${total} completadas | ⏳ ${inProgress} en curso | 🚨 ${critical} de alta prioridad`);

  if (conflicts.length > 0) {
    lines.push(`⚠️ *Alerta de Colisión*: Se detectaron ${conflicts.length} conflicto(s) de horario superpuesto.`);
  }

  lines.push("");
  lines.push("🎯 *Plan de Ejecución Cronológico*:");
  if (scheduledTasks.length === 0) {
    lines.push("  • _No hay entregas con hora fijada para hoy._");
  } else {
    for (const t of scheduledTasks) {
      const statusIcon = t.status === "IN_PROGRESS" ? "⏳" : "⚪";
      lines.push(`  ${statusIcon} *${t.scheduledTime}* (${t.durationMinutes || 60}m) — ${t.title} [${t.priority}]`);
    }
  }

  if (unscheduledTasks.length > 0) {
    lines.push("");
    lines.push("📋 *Entregas Pendientes de Agendar*:");
    for (const t of unscheduledTasks) {
      lines.push(`  • ${t.title} (Resp: ${t.assignee || "Por asignar"})`);
    }
  }

  if (missingInfo > 0) {
    lines.push("");
    lines.push(`🔍 *Atención*: Hay ${missingInfo} tarea(s) que requieren confirmación de fecha o responsable.`);
  }

  const markdown = lines.join("\n");

  // Natural Spanish speech text for speech synthesis
  const speechParts = [
    `Hola ${userName}. Este es tu resumen ejecutivo para ${channelName}.`,
    `Tienes ${total} tareas en total, con ${critical} de alta prioridad.`,
    scheduledTasks.length > 0
      ? `Tu primera entrega programada es a las ${scheduledTasks[0].scheduledTime}, correspondiente a: ${scheduledTasks[0].title}.`
      : "No tienes entregas con hora fijada para el día.",
    conflicts.length > 0
      ? `Atención: se ha detectado una colisión de horario entre ${conflicts[0].taskA.title} y ${conflicts[0].taskB.title}. Te sugiero resolver el conflicto.`
      : "Tu agenda se encuentra libre de conflictos de horario.",
    `¡Que tengas una jornada productiva!`
  ];

  return {
    title: `Resumen Ejecutivo · ${channelName}`,
    markdown,
    speechText: speechParts.join(" "),
    conflicts,
    metrics: {
      total,
      completed,
      inProgress,
      pending,
      critical,
      missingInfo,
      conflictCount: conflicts.length
    }
  };
}
