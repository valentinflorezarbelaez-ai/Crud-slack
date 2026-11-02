/**
 * AUTOMATED UNIT, BDD, SECURITY & SERVERLESS API TEST SUITE (node:test)
 * Validates BDD-CS-001 through BDD-CS-005 and OWASP security controls.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.TASKFLOW_HERMETIC_TEST = "1";

import {
  DEADLINE_STATES,
  escapeHtml,
  sanitizeCsvCell,
  validateAnalysisInput
} from "../src/domain/taskEntities.mjs";
import { runDeterministicTriage } from "../src/domain/deterministicNlp.mjs";
import { verifyAndGroundTriage } from "../src/domain/groundingVerifier.mjs";
import {
  computeBoardMetrics,
  createInitialBoardState,
  taskBoardReducer
} from "../src/domain/taskBoardStore.mjs";
import { analyzeWorkplaceRequest } from "../src/application/analyzeRequest.mjs";
import {
  exportToICalendar,
  exportToSharePointCsv,
  exportToSlackMarkdown,
  exportToTeamsAdaptiveCard,
  generateMailtoClarificationUrl
} from "../src/application/exportTasks.mjs";
import { GET as healthGet } from "../api/health.js";
import { POST as analyzePost, GET as analyzeGet } from "../api/analyze.js";
import { GET as metricsGet } from "../api/metrics.js";

const CANONICAL_CHALLENGE_PROMPT =
  "Hola, necesitamos preparar la reunión del equipo para el viernes. Hay que revisar los resultados del mes, actualizar la presentación y enviar la agenda a los participantes antes de la reunión.";

describe("SPEC-CRUD-SLACK-001: TaskFlow AI Domain, Anti-Hallucination & API Suite", () => {
  it("BDD-CS-001: extracts all 4 tasks from the canonical Friday meeting prompt in logical dependency order without inventing missing dates", async () => {
    const res = await analyzeWorkplaceRequest({
      message: CANONICAL_CHALLENGE_PROMPT,
      channel: "email",
      referenceDate: "2026-10-28" // Wednesday -> Friday is 2026-10-30
    });

    assert.equal(res.ok, true);
    assert.equal(res.statusCode, 200);
    const { tasks, missingInfoGaps, clarificationDraft, verificationReport } = res.data;

    assert.equal(tasks.length, 4);

    // Logical dependency order: 1. Review results -> 2. Update presentation -> 3. Send agenda before meeting -> 4. Friday meeting
    assert.match(tasks[0].title, /revisar los resultados del mes/i);
    assert.match(tasks[1].title, /actualizar la presentaci[oó]n/i);
    assert.match(tasks[2].title, /enviar la agenda/i);
    assert.match(tasks[3].title, /preparar la reuni[oó]n del equipo/i);

    // Intermediate tasks without explicit date must NOT invent an ISO deadlineDate
    assert.equal(tasks[0].deadlineDate, null);
    assert.equal(tasks[0].deadlineState, DEADLINE_STATES.MISSING_INFO);
    assert.equal(tasks[1].deadlineDate, null);
    assert.equal(tasks[1].deadlineState, DEADLINE_STATES.MISSING_INFO);

    // "antes de la reunión" is a partial anchor without exact date/time
    assert.equal(tasks[2].deadlineDate, null);
    assert.equal(tasks[2].deadlineState, DEADLINE_STATES.PARTIAL_ANCHOR);

    // "para el viernes" resolves to 2026-10-30 as PARTIAL_ANCHOR (hour still missing)
    assert.equal(tasks[3].deadlineDate, "2026-10-30");
    assert.equal(tasks[3].deadlineState, DEADLINE_STATES.PARTIAL_ANCHOR);

    assert.ok(missingInfoGaps.length >= 2);
    assert.ok(clarificationDraft.length > 20);
    assert.equal(verificationReport.verified, true);
    assert.equal(verificationReport.groundingRatePct, 100);
  });

  it("BDD-CS-002: Anti-Hallucination Guard strips fabricated ISO dates and fabricated assignees from ungrounded AI outputs", () => {
    const sourceMessage =
      "Necesitamos auditar los permisos del sitio de SharePoint y actualizar la documentación técnica del equipo.";

    const hallucinatingAiCandidate = {
      summary: "Plan generado",
      tasks: [
        {
          order: 1,
          title: "Auditar los permisos del sitio de SharePoint",
          priority: "HIGH",
          priorityReason: "Seguridad de accesos",
          deadlineDate: "2026-12-24", // Fabricated date!
          deadlineState: "CONFIRMED",
          deadlineLabel: "2026-12-24",
          missingDetails: "",
          assignee: "Roberto Inventado", // Fabricated person!
          sourceQuote: "auditar los permisos del sitio de SharePoint"
        }
      ],
      missingInfoGaps: [],
      clarificationDraft: ""
    };

    const verified = verifyAndGroundTriage({
      sourceMessage,
      referenceDate: "2026-10-30",
      channel: "teams",
      candidate: hallucinatingAiCandidate
    });

    assert.equal(verified.tasks[0].deadlineDate, null);
    assert.equal(verified.tasks[0].deadlineState, DEADLINE_STATES.MISSING_INFO);
    assert.equal(verified.tasks[0].assignee, "Por asignar");
    assert.ok(verified.verificationReport.hallucinationsPrevented >= 2);
  });

  it("BDD-CS-003: executes full immutable CRUD lifecycle and resolves missing deadline alerts upon date update", () => {
    let state = createInitialBoardState();
    const triage = runDeterministicTriage({
      message: CANONICAL_CHALLENGE_PROMPT,
      channel: "slack",
      referenceDate: "2026-10-28"
    });

    state = taskBoardReducer(state, { type: "LOAD_TRIAGE_RESULT", payload: triage });
    assert.equal(state.tasks.length, 4);

    // CREATE
    state = taskBoardReducer(state, {
      type: "CREATE_TASK",
      payload: { title: "Reservar sala virtual en Teams", priority: "MEDIUM" }
    });
    assert.equal(state.tasks.length, 5);

    const initialMetrics = computeBoardMetrics(state.tasks);
    assert.equal(initialMetrics.missingInfoCount, 5);

    // UPDATE (resolve missing date + mark COMPLETED)
    const firstId = state.tasks[0].id;
    state = taskBoardReducer(state, {
      type: "UPDATE_TASK",
      payload: {
        id: firstId,
        deadlineDate: "2026-10-29",
        assignee: "Ana Gómez",
        status: "COMPLETED"
      }
    });

    const updatedFirst = state.tasks.find((t) => t.id === firstId);
    assert.equal(updatedFirst.deadlineState, DEADLINE_STATES.CONFIRMED);
    assert.equal(updatedFirst.deadlineDate, "2026-10-29");
    assert.equal(updatedFirst.status, "COMPLETED");

    const afterUpdateMetrics = computeBoardMetrics(state.tasks);
    assert.equal(afterUpdateMetrics.missingInfoCount, 4);
    assert.equal(afterUpdateMetrics.completed, 1);

    // DELETE
    state = taskBoardReducer(state, { type: "DELETE_TASK", payload: { id: firstId } });
    assert.equal(state.tasks.length, 4);
    assert.equal(state.tasks[0].order, 1);
  });

  it("BDD-CS-004: Circuit Breaker seamlessly fails over to Layer-0 deterministic engine when upstream AI adapter throws", async () => {
    const failingAiPort = {
      isConfigured: () => true,
      extractTasks: async () => {
        throw new Error("SIMULATED_UPSTREAM_TIMEOUT");
      }
    };

    const res = await analyzeWorkplaceRequest(
      {
        message: CANONICAL_CHALLENGE_PROMPT,
        channel: "slack",
        referenceDate: "2026-10-28"
      },
      { aiPort: failingAiPort }
    );

    assert.equal(res.ok, true);
    assert.equal(res.data.engineMode, "LAYER0_DETERMINISTIC_ENGINE");
    assert.equal(res.data.tasks.length, 4);
  });

  it("BDD-CS-005 & Security: sanitizes XSS HTML entities, blocks oversized payloads, and neutralizes CSV Formula Injection", () => {
    assert.equal(escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    assert.equal(sanitizeCsvCell("=CMD|' /C calc'!A0"), `"'=CMD|' /C calc'!A0"`);

    const oversized = validateAnalysisInput({ message: "a".repeat(4005) });
    assert.equal(oversized.valid, false);

    const triage = runDeterministicTriage({
      message: CANONICAL_CHALLENGE_PROMPT,
      channel: "email",
      referenceDate: "2026-10-28"
    });
    const csv = exportToSharePointCsv(triage.tasks);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes("Título de la Tarea"));

    const md = exportToSlackMarkdown({
      tasks: triage.tasks,
      summary: triage.summary,
      clarificationDraft: triage.clarificationDraft
    });
    assert.ok(md.includes("Revisar los resultados del mes"));
  });

  it("Serverless API Smoke: /api/health and /api/analyze return valid Web Response JSON", async () => {
    const healthRes = await healthGet(new Request("http://localhost/api/health"));
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, "UP");

    const metaRes = await analyzeGet(new Request("http://localhost/api/analyze"));
    assert.equal(metaRes.status, 200);

    const postReq = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: CANONICAL_CHALLENGE_PROMPT,
        channel: "slack",
        referenceDate: "2026-10-28"
      })
    });
    const postRes = await analyzePost(postReq);
    assert.equal(postRes.status, 200);
    const postJson = await postRes.json();
    assert.equal(postJson.ok, true);
    assert.equal(postJson.tasks.length, 4);

    const metricsRes = await metricsGet(new Request("http://localhost/api/metrics"));
    assert.equal(metricsRes.status, 200);
    const metricsText = await metricsRes.text();
    assert.ok(metricsText.includes("taskflow_process_uptime_seconds"));
    assert.ok(metricsText.includes("taskflow_anti_hallucination_guarantee 100"));
  });

  it("BDD-CS-006: generates valid Microsoft Teams Adaptive Card v1.5 payload with structured facts and action URLs", () => {
    const triage = runDeterministicTriage({
      message: CANONICAL_CHALLENGE_PROMPT,
      channel: "teams",
      referenceDate: "2026-10-28"
    });

    const card = exportToTeamsAdaptiveCard({
      tasks: triage.tasks,
      summary: triage.summary,
      clarificationDraft: triage.clarificationDraft,
      channel: "teams",
      referenceDate: "2026-10-28"
    });

    assert.equal(card.type, "AdaptiveCard");
    assert.equal(card.version, "1.5");
    assert.ok(Array.isArray(card.body));
    assert.ok(card.body.length >= 4);
    assert.ok(Array.isArray(card.actions));
    assert.equal(card.actions[0].type, "Action.OpenUrl");
    assert.ok(card.actions[0].url.includes("crud-slack.vercel.app"));
  });

  it("BDD-CS-007: exports tasks to RFC 5545 iCalendar (.ics) and generates RFC 2368 mailto clarification link", () => {
    const tasks = [
      { id: "task-1", order: 1, title: "Reunión de planificación", priority: "ALTA", deadlineDate: "2026-11-06", assignee: "Valentin" },
      { id: "task-2", order: 2, title: "Tarea sin fecha", priority: "MEDIA", deadlineDate: null }
    ];

    const icsContent = exportToICalendar(tasks);
    assert.ok(icsContent.includes("BEGIN:VCALENDAR"));
    assert.ok(icsContent.includes("VERSION:2.0"));
    assert.ok(icsContent.includes("SUMMARY:[TaskFlow] #1: Reunión de planificación"));
    assert.ok(icsContent.includes("DTSTART;VALUE=DATE:20261106"));
    assert.ok(icsContent.includes("END:VCALENDAR"));

    const mailto = generateMailtoClarificationUrl({
      senderEmail: "coordinacion@empresa.com",
      clarificationDraft: "Necesitamos confirmar las fechas.",
      missingTasks: [{ order: 2, title: "Tarea sin fecha", missingDetails: "Fecha no especificada" }]
    });

    assert.ok(mailto.startsWith("mailto:coordinacion%40empresa.com?"));
    assert.ok(mailto.includes("subject="));
    assert.ok(mailto.includes("body="));
  });
});
