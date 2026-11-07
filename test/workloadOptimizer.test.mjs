import test from "node:test";
import assert from "node:assert/strict";
import {
  timeToMinutes,
  minutesToTime,
  detectScheduleConflicts,
  resolveScheduleConflicts,
  generateDailyExecutiveDigest
} from "../src/domain/workloadOptimizer.mjs";
import {
  createAuditRecord,
  formatAuditEntryDescription,
  renderAuditTrailHtml
} from "../src/domain/taskAuditTrail.mjs";

test("Workload Optimizer & Daily Executive Standup Suite (FR-CS-020)", async (t) => {
  await t.test("timeToMinutes and minutesToTime conversions are accurate and bounded", () => {
    assert.equal(timeToMinutes("09:30"), 570);
    assert.equal(timeToMinutes("00:00"), 0);
    assert.equal(timeToMinutes("23:59"), 1439);
    assert.equal(timeToMinutes("invalid"), null);
    assert.equal(timeToMinutes(null), null);

    assert.equal(minutesToTime(570), "09:30");
    assert.equal(minutesToTime(0), "00:00");
    assert.equal(minutesToTime(1439), "23:59");
    assert.equal(minutesToTime(-50), "00:00");
  });

  await t.test("detectScheduleConflicts detects colliding task time blocks", () => {
    const tasks = [
      { id: "t1", title: "Reunión de Estrategia", scheduledTime: "09:00", durationMinutes: 60, status: "PENDING" },
      { id: "t2", title: "Llamada con Cliente", scheduledTime: "09:30", durationMinutes: 45, status: "PENDING" },
      { id: "t3", title: "Almuerzo de Equipo", scheduledTime: "13:00", durationMinutes: 60, status: "PENDING" }
    ];

    const conflicts = detectScheduleConflicts(tasks);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].taskA.id, "t1");
    assert.equal(conflicts[0].taskB.id, "t2");
    assert.equal(conflicts[0].overlapMinutes, 30);
  });

  await t.test("detectScheduleConflicts ignores COMPLETED tasks", () => {
    const tasks = [
      { id: "t1", title: "Reunión 1", scheduledTime: "09:00", durationMinutes: 60, status: "COMPLETED" },
      { id: "t2", title: "Reunión 2", scheduledTime: "09:30", durationMinutes: 45, status: "PENDING" }
    ];

    const conflicts = detectScheduleConflicts(tasks);
    assert.equal(conflicts.length, 0);
  });

  await t.test("resolveScheduleConflicts deterministically staggers colliding tasks", () => {
    const tasks = [
      { id: "t1", title: "Revisión Crítica", priority: "CRITICAL", scheduledTime: "10:00", durationMinutes: 60, status: "PENDING" },
      { id: "t2", title: "Revisión Rutina", priority: "LOW", scheduledTime: "10:30", durationMinutes: 30, status: "PENDING" }
    ];

    const resolved = resolveScheduleConflicts(tasks);
    const t2 = resolved.find((t) => t.id === "t2");
    assert.equal(t2.scheduledTime, "11:15");
  });

  await t.test("generateDailyExecutiveDigest produces comprehensive standup summary and speech briefing", () => {
    const tasks = [
      { id: "t1", title: "Entrega de Proyecto", priority: "CRITICAL", status: "IN_PROGRESS", scheduledTime: "09:30", durationMinutes: 45, deadlineState: "EXACT_DATE", assignee: "Valentín" },
      { id: "t2", title: "Enviar Presentación", priority: "HIGH", status: "PENDING", scheduledTime: null, deadlineState: "MISSING_INFO", assignee: "Por asignar" },
      { id: "t3", title: "Revisar Notas", priority: "MEDIUM", status: "COMPLETED", scheduledTime: "08:00", durationMinutes: 30, deadlineState: "EXACT_DATE", assignee: "Valentín" }
    ];

    const digest = generateDailyExecutiveDigest(tasks, {
      activeChannelName: "Mis Proyectos",
      userName: "Valentín Flórez"
    });

    assert.ok(digest.title.includes("Mis Proyectos"));
    assert.ok(digest.markdown.includes("RESUMEN EJECUTIVO DIARIO"));
    assert.ok(digest.markdown.includes("09:30"));
    assert.ok(digest.markdown.includes("Enviar Presentación"));
    assert.ok(digest.speechText.includes("Hola Valentín Flórez"));
    assert.equal(digest.metrics.total, 3);
    assert.equal(digest.metrics.completed, 1);
    assert.equal(digest.metrics.inProgress, 1);
    assert.equal(digest.metrics.critical, 2);
  });

  await t.test("Task Audit Trail records and formats lifecycle mutations (FR-CS-021)", () => {
    const rec1 = createAuditRecord({
      taskId: "t1",
      action: "CREATE",
      actorName: "Valentín Flórez"
    });
    assert.ok(rec1.id.startsWith("aud_"));
    assert.equal(formatAuditEntryDescription(rec1), "Tarea creada por Valentín Flórez.");

    const rec2 = createAuditRecord({
      taskId: "t1",
      action: "STATUS_CHANGE",
      actorName: "Jacobo Flórez",
      oldValue: "PENDING",
      newValue: "IN_PROGRESS"
    });
    assert.equal(formatAuditEntryDescription(rec2), "Estado actualizado de PENDING a IN_PROGRESS por Jacobo Flórez.");

    const html = renderAuditTrailHtml([rec1, rec2]);
    assert.ok(html.includes("audit-item"));
    assert.ok(html.includes("Jacobo Flórez"));
  });
});
