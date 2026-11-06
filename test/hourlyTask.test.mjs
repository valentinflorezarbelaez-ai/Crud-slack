import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTaskEntity } from "../src/domain/taskEntities.mjs";
import { extractHourlySchedule } from "../src/domain/deterministicNlp.mjs";

describe("Task 1: Hourly Time-Blocking & NLP Extraction", () => {
  it("normalizes scheduledTime (HH:mm) and defaults duration to 60 minutes", () => {
    const t1 = createTaskEntity({ title: "Revisión matutina", scheduledTime: "09:30" });
    assert.equal(t1.scheduledTime, "09:30");
    assert.equal(t1.durationMinutes, 60);
    assert.equal(t1.isPrivate, false);

    const t2 = createTaskEntity({ title: "Invalida", scheduledTime: "25:99" });
    assert.equal(t2.scheduledTime, null);

    const t3 = createTaskEntity({ title: "Privada", scheduledTime: "14:00", isPrivate: true, userId: "usr_valentin" });
    assert.equal(t3.isPrivate, true);
    assert.equal(t3.userId, "usr_valentin");
  });

  it("extracts hourly schedule from Spanish and 12h/24h text", () => {
    assert.equal(extractHourlySchedule("Revisar resultados a las 09:30 de la mañana"), "09:30");
    assert.equal(extractHourlySchedule("Enviar informe a las 15:45"), "15:45");
    assert.equal(extractHourlySchedule("Llamada con equipo a las 2:00 pm"), "14:00");
    assert.equal(extractHourlySchedule("Reunión a las 10:00 am"), "10:00");
    assert.equal(extractHourlySchedule("Preparar agenda para el viernes"), null);
  });
});
