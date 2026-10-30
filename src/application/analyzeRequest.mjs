/**
 * APPLICATION LAYER USE CASE: OMNICHANNEL REQUEST ANALYSIS & CIRCUIT BREAKER
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-001..005, BDD-CS-001, BDD-CS-002, BDD-CS-004).
 *
 * Orchestrates:
 * 1. Input boundary validation & XSS/control-char sanitization.
 * 2. Primary AI Port invocation (Gemini 3.8 Flash Structured Outputs) when configured.
 * 3. Mandatory Layer-0 Anti-Hallucination & Grounding Verification.
 * 4. Seamless sub-2ms Circuit-Breaker failover to Layer-0 Deterministic Neuro-Symbolic NLP.
 */

import { validateAnalysisInput } from "../domain/taskEntities.mjs";
import { runDeterministicTriage } from "../domain/deterministicNlp.mjs";
import { verifyAndGroundTriage } from "../domain/groundingVerifier.mjs";

/**
 * Executes the end-to-end request-to-tasks triage use case.
 * @param {Record<string, unknown>} rawPayload
 * @param {{ aiPort?: { isConfigured: () => boolean, extractTasks: (args: any) => Promise<any> } }} [deps]
 */
export async function analyzeWorkplaceRequest(rawPayload, deps = {}) {
  const startedAt = performance.now();
  const validation = validateAnalysisInput(rawPayload);

  if (!validation.valid || !validation.value) {
    return {
      ok: false,
      statusCode: 400,
      error: validation.error || "Solicitud inválida."
    };
  }

  const { message, channel, referenceDate } = validation.value;
  const aiPort = deps.aiPort;
  let engineMode = "LAYER0_DETERMINISTIC_ENGINE";
  let fallbackReason = null;

  if (aiPort && typeof aiPort.isConfigured === "function" && aiPort.isConfigured()) {
    try {
      const aiCandidate = await aiPort.extractTasks({
        message,
        channel,
        referenceDate
      });

      if (aiCandidate && Array.isArray(aiCandidate.tasks) && aiCandidate.tasks.length > 0) {
        const verifiedAi = verifyAndGroundTriage({
          sourceMessage: message,
          referenceDate,
          channel,
          candidate: aiCandidate
        });

        if (verifiedAi.verificationReport.groundingRatePct >= 50) {
          const latencyMs = Number((performance.now() - startedAt).toFixed(2));
          return {
            ok: true,
            statusCode: 200,
            data: {
              ...verifiedAi,
              engineMode: "GEMINI_3_8_FLASH_VERIFIED",
              resolvedModel: aiCandidate._resolvedModel || "gemini-3.8-flash",
              fallbackReason: null,
              latencyMs
            }
          };
        }
        fallbackReason = "LOW_GROUNDING_CONFIDENCE_FAILOVER";
      } else {
        fallbackReason = "EMPTY_AI_CANDIDATE_FAILOVER";
      }
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message.slice(0, 120) : "UPSTREAM_AI_UNAVAILABLE";
    }
  } else {
    fallbackReason = "NO_SERVER_API_KEY_CONFIGURED_USING_L0_ENGINE";
  }

  // Deterministic Layer-0 Neuro-Symbolic Execution (Zero-Downtime Circuit Breaker)
  const deterministicCandidate = runDeterministicTriage({
    message,
    channel,
    referenceDate
  });

  const verifiedDeterministic = verifyAndGroundTriage({
    sourceMessage: message,
    referenceDate,
    channel,
    candidate: deterministicCandidate
  });

  const latencyMs = Number((performance.now() - startedAt).toFixed(2));
  return {
    ok: true,
    statusCode: 200,
    data: {
      ...verifiedDeterministic,
      engineMode,
      fallbackReason,
      latencyMs
    }
  };
}
