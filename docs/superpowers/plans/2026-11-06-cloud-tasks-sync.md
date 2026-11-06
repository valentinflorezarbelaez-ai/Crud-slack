# Cloud Multi-User Task Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable shared multi-user task board persistence per channel across multiple browser instances using Neon Serverless PostgreSQL, with resilient offline `localStorage` fallback and zero external runtime dependencies.

**Architecture:** A Layer-0 HTTP serverless endpoint `api/tasks.js` handles `GET` and `POST` using parameterized SQL over Neon's HTTP SQL gateway. A client-side `cloudTaskAdapter.mjs` coordinates hybrid syncing: optimistic updates with debounced background sync to Neon, falling back seamlessly to `localStorage` when offline or in degraded connectivity.

**Tech Stack:** Node.js 24 LTS, Native Web Fetch, Neon Serverless PostgreSQL HTTP API, Web Crypto API, Vanilla ES Modules, `node:test`.

**Spec:** `docs/plans/PLAN-CRUD-SLACK-002-CLOUD-TASKS-SYNC.md`

## Global Constraints

- Runtime dependencies must remain strictly empty (`dependencies: {}` in `package.json`).
- All SQL queries must be 100% parameterized using `sql()` from `api/_db.js`.
- All text inputs must be sanitized using domain sanitizers (`sanitizePlainText`, `escapeHtml`).
- Node 24 strip-only TS / modern ES module syntax (no bundler required).
- Existing test suite (`npm test`, `npm run verify:strict`) must pass with exit code 0.

## Review Focus

- Channel ID normalization: `general` and `c_general` must resolve to the same canonical key so tasks are shared regardless of prefix.
- Network resilience: Offline or HTTP 500 from Neon must gracefully fallback to local cache without blocking user interaction or throwing unhandled rejections.
- Debounced saving: Typing in task edit dialogs or dragging items in Kanban must not spam HTTP requests; batch/debounce sync by 300ms.
- Input validation: Malformed task payloads in `POST /api/tasks` must be validated and sanitized before database writes.
- Deterministic Ordering: Tasks returned by `GET /api/tasks` must preserve ordering by `order_idx ASC, created_at ASC`.

---

### Task 1: Serverless Task API Endpoint (`api/tasks.js`)

**Files:**
- Create: `api/tasks.js`
- Test: `test/tasksApi.test.mjs`

**Interfaces:**
- Consumes: `sql` from `./_db.js`, `createTaskEntity`, `sanitizePlainText` from `../src/domain/taskEntities.mjs`.
- Produces: `GET(req)` returning `{ ok: true, tasks: TaskEntity[] }`, `POST(req)` receiving `{ channelId: string, tasks: TaskEntity[] }` and returning `{ ok: true, count: number }`.

- [ ] **Step 1: Write failing integration test for `api/tasks.js`**
Write `test/tasksApi.test.mjs` testing `GET` with default channel and `POST` with a valid task list payload.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/tasksApi.test.mjs`
Expected: FAIL (module `api/tasks.js` does not exist).

- [ ] **Step 3: Implement `api/tasks.js`**
Implement idempotent `CREATE TABLE IF NOT EXISTS tasks (...)` execution, channel normalization, `GET` query with sorting, and `POST` batch sync with parameterization.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/tasksApi.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add api/tasks.js test/tasksApi.test.mjs
git commit -m "feat(api): add multi-user cloud tasks endpoint with neon postgres"
```

---

### Task 2: Client Cloud Data Adapter (`src/infrastructure/cloudTaskAdapter.mjs`)

**Files:**
- Create: `src/infrastructure/cloudTaskAdapter.mjs`
- Modify: `src/infrastructure/storageAdapter.mjs`
- Test: `test/cloudTaskAdapter.test.mjs`

**Interfaces:**
- Consumes: `/api/tasks` endpoint, `savePersistedBoardState`, `loadPersistedBoardState` from `./storageAdapter.mjs`.
- Produces: `fetchRemoteTasks(channelId: string) -> Promise<{ tasks: TaskEntity[], source: "cloud"|"local" }>`, `syncRemoteTasks(channelId: string, tasks: TaskEntity[]) -> Promise<boolean>`.

- [ ] **Step 1: Write failing unit test for `cloudTaskAdapter.mjs`**
Test fetching tasks with mock API, fallback to localStorage on network failure, and debounced saving.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/cloudTaskAdapter.test.mjs`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `cloudTaskAdapter.mjs`**
Implement `fetchRemoteTasks` with timeout/fallback and `syncRemoteTasks` with 300ms debounce and localStorage mirroring.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/cloudTaskAdapter.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/infrastructure/cloudTaskAdapter.mjs test/cloudTaskAdapter.test.mjs
git commit -m "feat(infra): implement hybrid cloud-local task adapter"
```

---

### Task 3: UI Integration & Realtime Channel Sync (`src/ui/main.mjs`)

**Files:**
- Modify: `src/ui/main.mjs`
- Modify: `index.html` (add visual cloud sync indicator icon in header/status bar)

**Interfaces:**
- Consumes: `fetchRemoteTasks`, `syncRemoteTasks` from `../infrastructure/cloudTaskAdapter.mjs`.
- Produces: Automated cloud sync whenever `boardStore.dispatch` updates state or when user switches channels.

- [ ] **Step 1: Add cloud sync status indicator in `index.html`**
Add subtle badge `<span id="cloud-sync-status" class="sync-badge">☁️ Sincronizado</span>` in the workspace header.

- [ ] **Step 2: Connect `main.mjs` to `cloudTaskAdapter.mjs`**
In `initWorkspace()` and `switchChannel()`, call `fetchRemoteTasks(activeChannel)`. On state changes (`task:created`, `task:updated`, `task:deleted`, `analysis:applied`), call `syncRemoteTasks(activeChannel, currentTasks)`.

- [ ] **Step 3: Manual & Automated verification**
Verify that switching channels loads persisted tasks and editing a task triggers sync.

- [ ] **Step 4: Commit**
```bash
git add src/ui/main.mjs index.html css/styles.css
git commit -m "feat(ui): connect task board to cloud sync adapter with status indicator"
```

---

### Task 4: Full Verification Gate (`npm test` & `npm run verify:strict`)

**Files:**
- Test: All tests in `test/`
- Script: `scripts/verify-strict.mjs`

- [ ] **Step 1: Run complete test suite**
Run: `npm test`
Expected: 100% passing tests across domain, security, and API.

- [ ] **Step 2: Run 7-Stage Strict Verification Gate**
Run: `npm run verify:strict`
Expected: Exit code 0, 0 lint errors, 0 secret leaks, 0 ungrounded dates, dependencies count = 0.

- [ ] **Step 3: Commit and seal plan**
```bash
git commit -am "chore: seal cloud tasks synchronization implementation"
```
