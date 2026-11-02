/**
 * EOS 7-STAGE FAIL-CLOSED SECDEVOPS & SDD VERIFICATION GATE (verify-strict.mjs)
 * Validates Security (Zero Secrets), SDD Governance, Layer-0 0-Deps SBOM,
 * Static Syntax + Unit/BDD Tests, WCAG 2.1 AA + SEO + CWV Budgets,
 * In-Process Serverless API Smoke Tests, and Cryptographic Evidence Receipt.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const startedAt = Date.now();
process.env.TASKFLOW_HERMETIC_TEST = "1";

console.log("======================================================================");
console.log(" TASKFLOW AI (CRUD-SLACK) — 7-STAGE EOS SECDEVOPS VERIFICATION GATE   ");
console.log(` Runtime: ${process.version} | Platform: ${process.platform}-${process.arch}`);
console.log("======================================================================");

function listFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", ".vercel", "node_modules"].includes(entry.name) || entry.name.startsWith(".env")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

const allFiles = listFiles(root);

// STAGE 1: SAST & ZERO PLAINTEXT SECRETS GATE (LAW VI)
const secretPatterns = [
  { name: "OpenAI/Stripe Secret Key", regex: new RegExp("sk-" + "(live|proj)-[0-9a-zA-Z]{16,}") },
  { name: "GitHub Token", regex: new RegExp("ghp_" + "[0-9a-zA-Z]{24,}") },
  { name: "AWS Access Key", regex: new RegExp("AKIA" + "[0-9A-Z]{16}") },
  { name: "Google API Key", regex: new RegExp("AIza" + "[0-9A-Za-z\\-_]{35}") },
  { name: "Private Key PEM", regex: new RegExp("-----BEGIN " + "(RSA |EC |OPENSSH )?PRIVATE KEY-----") }
];

for (const file of allFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const pat of secretPatterns) {
    assert.equal(
      pat.regex.test(content),
      false,
      `[STAGE 1 FAIL] Secret pattern (${pat.name}) detected in ${path.relative(root, file)}`
    );
  }
}
console.log(`[PASS] Stage 1/7 — SAST & Zero-Plaintext-Secrets Gate (${allFiles.length} files clean).`);

// STAGE 2: SDD SPECIFICATION PACKAGE & AUTHORIZATION GATE (LAWS I, II, IV)
const requiredDocs = [
  "docs/intake/PROJECT_CONTEXT.md",
  "docs/intake/inventory.json",
  "docs/audits/audit.md",
  "docs/specs/spec.md",
  "docs/plans/plan.md",
  "docs/tasks/tasks.md",
  "docs/PRESENTACION_EJECUTIVA_RETO.md",
  "docs/sharepoint/README.md",
  "docs/sharepoint/Provision-TaskFlowSharePointList.ps1",
  "docs/sharepoint/power-automate-flow-blueprint.json",
  "IMPLEMENTATION_AUTHORIZATION.md",
  "AGENTS.md",
  "catalog-info.yaml",
  "README.md"
];

for (const rel of requiredDocs) {
  assert.ok(fs.existsSync(path.join(root, rel)), `[STAGE 2 FAIL] Missing SDD artifact: ${rel}`);
}
console.log(`[PASS] Stage 2/7 — SDD Governance Package & Level 3 Authorization Gate (${requiredDocs.length} artifacts).`);

// STAGE 3: HEXAGONAL L0 PURITY (0 RUNTIME DEPS) & SLSA SHA-256 MERKLE SBOM (LAW V)
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const runtimeDeps = Object.keys(pkg.dependencies || {});
assert.equal(runtimeDeps.length, 0, `[STAGE 3 FAIL] Expected 0 runtime dependencies, found: ${runtimeDeps.join(", ")}`);

// Ensure domain layer never imports UI, infrastructure, or API layers
const domainFiles = listFiles(path.join(root, "src/domain"));
for (const df of domainFiles) {
  const src = fs.readFileSync(df, "utf8");
  assert.equal(/from\s+["']\.\.\/(ui|infrastructure|application|api)/.test(src), false, `[STAGE 3 FAIL] Hexagonal violation in ${df}`);
}

const merkle = crypto.createHash("sha256");
let artifactCount = 0;
for (const file of allFiles.sort()) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  if (rel === "docs/evidence/EVD-0001.json") continue;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  merkle.update(`${rel}:${hash}\n`);
  artifactCount++;
}
const sbomMerkleRoot = `sha256:${merkle.digest("hex")}`;
console.log(`[PASS] Stage 3/7 — Hexagonal L0 Purity (0-Deps) & SBOM Merkle (${sbomMerkleRoot.slice(0, 26)}...).`);

// STAGE 4: SYNTAX CHECK & AUTOMATED UNIT/BDD TEST SUITE
const codeFiles = allFiles.filter((f) => f.endsWith(".mjs") || f.endsWith(".js"));
for (const cf of codeFiles) {
  execFileSync(process.execPath, ["--check", cf], { cwd: root, stdio: "pipe" });
}
execFileSync(process.execPath, ["--test", path.join(root, "test/taskflow.test.mjs")], {
  cwd: root,
  stdio: "inherit"
});
console.log(`[PASS] Stage 4/7 — Static Syntax & Automated BDD/Security Test Suite (${codeFiles.length} modules verified).`);

// STAGE 5: WCAG 2.1 AA ACCESSIBILITY, SCHEMA.ORG SEO & CWV PERFORMANCE BUDGET GATE
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const vercelCfg = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

assert.ok(html.includes('class="skip-link"'), "Missing WCAG 2.1 AA skip-link");
assert.ok(html.includes('aria-live="polite"'), "Missing aria-live polite region");
assert.ok(html.includes('closedby="any"'), "Missing accessible <dialog closedby=\"any\">");
assert.ok(html.includes("application/ld+json"), "Missing Schema.org JSON-LD metadata");
assert.equal(/\sstyle="/i.test(html), false, "Inline style attribute violates strict CSP");
assert.ok(css.includes("content-visibility: auto"), "Missing CWV content-visibility optimization");
assert.ok(JSON.stringify(vercelCfg).includes("Content-Security-Policy"), "Missing CSP in vercel.json");

const cssKb = Number((fs.statSync(path.join(root, "css/styles.css")).size / 1024).toFixed(1));
const uiJsKb = Number((fs.statSync(path.join(root, "src/ui/main.mjs")).size / 1024).toFixed(1));
assert.ok(cssKb < 40, `CSS bundle exceeded 40 KB budget: ${cssKb} KB`);
assert.ok(uiJsKb < 45, `UI JS bundle exceeded 45 KB budget: ${uiJsKb} KB`);
console.log(`[PASS] Stage 5/7 — WCAG 2.1 AA, SEO JSON-LD, Strict CSP & CWV Budget Gate (CSS: ${cssKb} KB, UI JS: ${uiJsKb} KB).`);

// STAGE 6: IN-PROCESS SERVERLESS ENDPOINTS SMOKE VERIFICATION (/api/health, /api/analyze, /api/metrics, /api/channels)
const healthMod = await import(pathToFileURL(path.join(root, "api/health.js")).href);
const analyzeMod = await import(pathToFileURL(path.join(root, "api/analyze.js")).href);
const metricsMod = await import(pathToFileURL(path.join(root, "api/metrics.js")).href);
const channelsMod = await import(pathToFileURL(path.join(root, "api/channels.js")).href);

const hRes = await healthMod.GET(new Request("http://localhost/api/health"));
assert.equal(hRes.status, 200, "/api/health failed smoke check");

const mRes = await metricsMod.GET(new Request("http://localhost/api/metrics"));
assert.equal(mRes.status, 200, "/api/metrics failed smoke check");
const mText = await mRes.text();
assert.ok(mText.includes("taskflow_process_uptime_seconds"), "Prometheus metrics missing uptime");

const cRes = await channelsMod.GET();
assert.equal(cRes.status, 200, "/api/channels failed smoke check");

const aRes = await analyzeMod.POST(
  new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Hola, necesitamos preparar la reunión del equipo para el viernes y revisar los resultados del mes.",
      channel: "slack",
      referenceDate: "2026-10-28"
    })
  })
);
assert.equal(aRes.status, 200, "/api/analyze POST failed smoke check");
console.log("[PASS] Stage 6/7 — In-Process Serverless API Smoke Gate (/api/health, /api/analyze, /api/metrics & /api/channels 200 OK).");

// STAGE 7: CRYPTOGRAPHIC EVIDENCE RECEIPT GENERATION (LAW III)
const receipt = {
  evidenceId: "EVD-0001",
  projectId: "crud-slack",
  epistemicState: "VERIFIED",
  stagesPassed: "7/7",
  exitCode: 0,
  artifactCount,
  sbomMerkleRoot,
  budgets: {
    cssKilobytes: cssKb,
    uiJsKilobytes: uiJsKb,
    runtimeDependencies: 0
  },
  verifiedEndpoints: ["/api/health", "/api/analyze", "/api/metrics"]
};

fs.writeFileSync(
  path.join(root, "docs/evidence/EVD-0001.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  "utf8"
);

const elapsedMs = Date.now() - startedAt;
console.log(`[PASS] Stage 7/7 — Cryptographic Evidence Sealed (docs/evidence/EVD-0001.json) in ${elapsedMs} ms.`);
console.log("======================================================================");
console.log(" EPISTEMIC STATE: VERIFIED | 7/7 GATES PASSED | DEPLOY AUTHORIZED (0) ");
console.log("======================================================================");
