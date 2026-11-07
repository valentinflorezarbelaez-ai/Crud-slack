import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTaskEntity } from "../src/domain/taskEntities.mjs";
import { extractHourlySchedule } from "../src/domain/deterministicNlp.mjs";
import { verifyAndGroundTriage } from "../src/domain/groundingVerifier.mjs";
import { parseIngestedFile } from "../src/application/fileIngestor.mjs";

describe("Task 1 & BDD-CS-011: Hourly Time-Blocking, Anti-Hallucination Hour Guard & File Ingestion", () => {
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

  it("strips hallucinated scheduledTime when source text contains zero explicit hours (FR-CS-019)", () => {
    const ungroundedHour = verifyAndGroundTriage({
      sourceMessage: "Por favor actualizar la presentación para el viernes con las cifras del mes.",
      referenceDate: "2026-11-06",
      channel: "email",
      candidate: {
        summary: "Plan",
        tasks: [
          {
            order: 1,
            title: "Actualizar la presentación",
            priority: "HIGH",
            priorityReason: "Entrega viernes",
            deadlineDate: "2026-11-06",
            scheduledTime: "09:30",
            deadlineState: "PARTIAL_ANCHOR",
            deadlineLabel: "2026-11-06",
            missingDetails: "Falta hora",
            assignee: "Por asignar",
            sourceQuote: "actualizar la presentación para el viernes"
          }
        ],
        missingInfoGaps: [],
        clarificationDraft: "Confirmar hora exacta."
      }
    });
    assert.equal(ungroundedHour.tasks[0].scheduledTime, null);
    assert.ok(ungroundedHour.verificationReport.hallucinationsPrevented >= 1);

    const groundedHour = verifyAndGroundTriage({
      sourceMessage: "Enviar reporte financiero hoy a las 14:30 sin falta.",
      referenceDate: "2026-11-06",
      channel: "slack",
      candidate: {
        summary: "Plan",
        tasks: [
          {
            order: 1,
            title: "Enviar reporte financiero",
            priority: "CRITICAL",
            priorityReason: "Corte hoy",
            deadlineDate: "2026-11-06",
            scheduledTime: "14:30",
            deadlineState: "CONFIRMED",
            deadlineLabel: "2026-11-06 · 14:30",
            missingDetails: "",
            assignee: "Por asignar",
            sourceQuote: "Enviar reporte financiero hoy a las 14:30"
          }
        ],
        missingInfoGaps: [],
        clarificationDraft: ""
      }
    });
    assert.equal(groundedHour.tasks[0].scheduledTime, "14:30");
  });

  it("parses RFC 5322 .eml emails (Quoted-Printable + RFC 2047) and WhatsApp .txt exports (BDD-CS-011)", () => {
    const rawEml = [
      "From: =?UTF-8?Q?Coordinaci=C3=B3n?= <coord@empresa.com>",
      "Subject: =?UTF-8?Q?Reuni=C3=B3n_Trimestral?=",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Hola equipo, por favor revisar los resultados del mes y preparar la pre=",
      "sentaci=C3=B3n antes del viernes a las 10:00 am."
    ].join("\r\n");

    const emlParsed = parseIngestedFile({ filename: "solicitud.eml", content: rawEml });
    assert.equal(emlParsed.ok, true);
    assert.equal(emlParsed.detectedChannel, "email");
    assert.ok(emlParsed.text.includes("Asunto: Reunión Trimestral"));
    assert.ok(emlParsed.text.includes("Coordinación"));
    assert.ok(emlParsed.text.includes("preparar la presentación antes del viernes a las 10:00 am."));

    const rawWhatsapp = [
      "06/11/2026, 8:15 a. m. - Los mensajes y las llamadas están cifrados de extremo a extremo.",
      "06/11/2026, 9:10 a. m. - Valentina: Hola! Necesitamos enviar la propuesta comercial hoy a las 16:00.",
      "06/11/2026, 9:12 a. m. - Carlos: También validar el presupuesto con compras."
    ].join("\n");

    const waParsed = parseIngestedFile({ filename: "Chat de WhatsApp.txt", content: rawWhatsapp });
    assert.equal(waParsed.ok, true);
    assert.equal(waParsed.detectedChannel, "whatsapp");
    assert.ok(!waParsed.text.includes("cifrados de extremo a extremo"));
    assert.ok(waParsed.text.includes("enviar la propuesta comercial"));
  });
});
