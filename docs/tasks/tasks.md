# TASKS-CRUD-SLACK-001: ATOMIC 21-STEP EXECUTION DAG

## 1. Governance & Pre-Implementation Gates (Steps 1–9)
- [x] **TASK-CS-01**: Record Intake & Context (`docs/intake/crud-slack/PROJECT_CONTEXT.md`, `inventory.json`).
- [x] **TASK-CS-02**: Execute Reconnaissance & Threat Baseline Audit (`docs/audits/AUDIT-CRUD-SLACK-001.md`).
- [x] **TASK-CS-03**: Formalize EARS Requirements & BDD Acceptance Criteria (`docs/specs/SPEC-CRUD-SLACK-001.md`).
- [x] **TASK-CS-04**: Author Hexagonal Architecture Plan & ADRs (`docs/plans/PLAN-CRUD-SLACK-001.md`).
- [x] **TASK-CS-05**: Register `crud-slack` in `docs/projects/registry.json` & record Level 3 Authorization in `IMPLEMENTATION_AUTHORIZATION.md`.

## 2. Clean/Hexagonal Implementation (Step 10)
- [x] **TASK-CS-06**: Initialize `c:\Users\valen\Crud-slack` Git repository, `package.json` (`dependencies: {}`), `.gitignore`, `vercel.json` (CSP & OWASP security headers), `catalog-info.yaml`, `AGENTS.md`, and mirrored SDD governance docs.
- [x] **TASK-CS-07**: Implement Pure Domain Layer (`src/domain/taskEntities.mjs`, `src/domain/deterministicNlp.mjs`, `src/domain/groundingVerifier.mjs`, `src/domain/taskBoardStore.mjs`).
- [x] **TASK-CS-08**: Implement Application Use Cases (`src/application/analyzeRequest.mjs`, `src/application/exportTasks.mjs`).
- [x] **TASK-CS-09**: Implement Infrastructure Adapters & Vercel Node.js 24 Functions (`src/infrastructure/geminiAdapter.mjs`, `src/infrastructure/storageAdapter.mjs`, `api/analyze.js`, `api/health.js`).
- [x] **TASK-CS-10**: Implement Accessible UI, Visual Task Workspace (Table + Kanban + Dependency/Priority cues + Missing-Info Clarification Generator + CRUD Dialog), and Integrated Executive Challenge Presentation Deck (`index.html`, `css/styles.css`, `src/ui/presets.mjs`, `src/ui/main.mjs`, `README.md`, `docs/PRESENTACION_EJECUTIVA_RETO.md`).

## 3. Verification, SecDevOps Auditing & Live Deployment (Steps 11–21)
- [x] **TASK-CS-11**: Implement comprehensive `node:test` suite (`test/taskflow.test.mjs`) validating BDD-CS-001..005, XSS/CSV-injection sanitization, rate limiting, and serverless endpoints.
- [x] **TASK-CS-12**: Implement & execute 7-Stage Fail-Closed Verification Gate (`scripts/verify-strict.mjs`) covering SAST/Secrets, SDD completeness, L0 0-deps SBOM SHA-256, Unit/BDD tests, WCAG 2.1 AA + SEO + CWV budgets, API smoke tests, and cryptographic evidence generation (`docs/evidence/EVD-0001.json`).
- [x] **TASK-CS-13**: Commit & push to `https://github.com/valentinflorezarbelaez-ai/Crud-slack.git` (`main`), link & deploy to Vercel Production, configure `GEMINI_API_KEY` securely if available or verify live production endpoints (`/`, `/api/health`, `/api/analyze`), re-verify `Eos-System` (`npm run verify:strict`), and capture architectural learnings in Engram.
- [x] **TASK-CS-14**: Big Tech Tier-1 Enterprise Elevation: Deliver Microsoft SharePoint Online PnP.PowerShell provisioning script, Power Automate Cloud Flow blueprint, Microsoft Teams Adaptive Card v1.5 exporter & live interactive preview, Prometheus SRE metrics endpoint (`/api/metrics`), PWA offline service worker (`sw.js`), and executive 1-page printable memo.

## 4. TimeFlow Collaboration, First-Visit Auth Gate & Private Daily Workspace (Delta 003)
- [x] **TASK-CS-15**: Deliver Hourly Time-Blocking (`06:00`–`22:00`), Web Notification + Web Audio Alarm Loop, Channel Invites (`?join=token`), Serverless Consolidation (11 functions <= 12 Hobby ceiling), and Channel Cascade Deletion (`DELETE /api/channels`).
- [x] **TASK-CS-16**: Harden Google OIDC Backend (`api/auth/google.js` schema & `userId` session signing), enforce authenticated `user_id` isolation on `api/tasks.js` (`channelId = "personal"`), and protect `"personal"` in `api/channels.js` `DELETE`.
- [x] **TASK-CS-17**: Implement First-Visit Google Login Gate (`#slack-auth-gate`, `src/ui/realtimeSlack.mjs`) and dedicated `"Mi Día (Privado)"` personal workspace (`src/infrastructure/channelStore.mjs`, `src/infrastructure/cloudTaskAdapter.mjs`, `src/ui/channels.mjs`, `src/ui/main.mjs`), verify 7/7 strict gates, and deploy to Vercel Production.
- [x] **TASK-CS-18**: Deliver Multi-Tenant Per-User Workspace Personalization, `(user_id, channel_id)` private space isolation (`personal`, `personal-proyectos`, `personal-notas`), per-member `/api/channels` scoping & dynamic teammates, cloud user preferences/status sync in `/api/auth/me`, unit/BDD tests, and Vercel Production deployment.
