import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkDueAlarms } from "../src/application/notificationEngine.mjs";

describe("Task 2: Alarm Notification Scheduler", () => {
  it("identifies pending tasks matching the current HH:mm wall-clock", () => {
    const tasks = [
      { id: "t1", title: "Tarea 09:30", scheduledTime: "09:30", status: "PENDING" },
      { id: "t2", title: "Tarea 10:00", scheduledTime: "10:00", status: "PENDING" },
      { id: "t3", title: "Tarea completada", scheduledTime: "09:30", status: "COMPLETED" }
    ];

    const firedSet = new Set();
    const due = checkDueAlarms(tasks, "09:30", firedSet);

    assert.equal(due.length, 1);
    assert.equal(due[0].id, "t1");
    assert.ok(firedSet.has("t1"));

    // Second check in the same minute must not re-trigger
    const secondCheck = checkDueAlarms(tasks, "09:30", firedSet);
    assert.equal(secondCheck.length, 0);
  });
});
