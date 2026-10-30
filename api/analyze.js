/**
 * VERCEL NODE.JS 24 FLUID COMPUTE FUNCTION: POST /api/analyze
 * Governed by SPEC-CRUD-SLACK-001 (FR-CS-001..005, FR-CS-009).
 *
 * Uses Web Standard Request/Response API with:
 * - W3C Distributed Trace Context (traceparent)
 * - Sliding-window IP rate protection (30 req / 60s)
 * - Gemini 3.8 Flash Structured Outputs + Layer-0 Anti-Hallucination Verifier + Circuit Breaker
 */

import crypto from "node:crypto";
import { analyzeWorkplaceRequest } from "../src/application/analyzeRequest.mjs";
import { createGeminiInteractionsAdapter } from "../src/infrastructure/geminiAdapter.mjs";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;
/** @type {Map<string, { count: number, resetAt: number }>} */
const rateBuckets = new Map();

function checkRateLimit(clientKey) {
  const now = Date.now();
  if (rateBuckets.size > 512) {
    for (const [k, bucket] of rateBuckets.entries()) {
      if (bucket.resetAt <= now) rateBuckets.delete(k);
    }
  }
  const existing = rateBuckets.get(clientKey);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(clientKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_MAX_REQUESTS - 1 };
  }
  if (existing.count >= RATE_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_MAX_REQUESTS - existing.count };
}

function buildTraceHeaders(request, remaining) {
  const incoming = request.headers?.get?.("traceparent") || null;
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  const traceparent = incoming || `00-${traceId}-${spanId}-01`;
  return {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    "X-RateLimit-Remaining": String(remaining),
    traceparent
  };
}

export async function POST(request) {
  const clientIp =
    request.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers?.get?.("x-real-ip") ||
    "anonymous";

  const rate = checkRateLimit(clientIp);
  const headers = buildTraceHeaders(request, rate.remaining);

  if (!rate.allowed) {
    console.error(`[TaskFlow API] Rate limit exceeded for client hash`);
    return Response.json(
      { ok: false, error: "Límite de solicitudes alcanzado (30/min). Intenta nuevamente en unos segundos." },
      { status: 429, headers }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[TaskFlow API] Malformed JSON request body:", err instanceof Error ? err.message : "parse_error");
    return Response.json(
      { ok: false, error: "El cuerpo de la solicitud debe ser JSON válido." },
      { status: 400, headers }
    );
  }

  try {
    const aiPort = createGeminiInteractionsAdapter();
    const result = await analyzeWorkplaceRequest(body, { aiPort });
    return Response.json(
      result.ok ? { ok: true, ...result.data } : { ok: false, error: result.error },
      { status: result.statusCode, headers }
    );
  } catch (err) {
    console.error("[TaskFlow API] Unexpected execution error:", err instanceof Error ? err.message : "unknown_error");
    return Response.json(
      { ok: false, error: "Error interno al procesar la solicitud." },
      { status: 500, headers }
    );
  }
}

export async function GET(request) {
  const headers = buildTraceHeaders(request, RATE_MAX_REQUESTS);
  const geminiConfigured = Boolean((process.env.GEMINI_API_KEY || "").trim().length >= 16);
  return Response.json(
    {
      ok: true,
      endpoint: "/api/analyze",
      methods: ["POST"],
      primaryEngine: geminiConfigured ? "GEMINI_3_8_FLASH_VERIFIED" : "LAYER0_DETERMINISTIC_ENGINE",
      antiHallucinationVerifier: "ACTIVE"
    },
    { status: 200, headers }
  );
}
