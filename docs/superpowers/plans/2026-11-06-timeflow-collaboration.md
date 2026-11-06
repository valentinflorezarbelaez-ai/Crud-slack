# TimeFlow AI: Hourly Time-Blocking, Alarms, Google Auth & Channel Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform TaskFlow AI into TimeFlow AI with hourly daily agenda planning (06:00 to 22:00), browser notifications with audio chime alarms, Google Sign-In with private workspace isolation, and team channel invite links.

**Architecture:** Extend Layer-0 domain entities with `scheduledTime` (`HH:mm`), build a pure-logic `notificationEngine.mjs` matching current time with task schedules, create a Web Audio chime synthesizer with Web Notification API adapter, update serverless `/api/tasks` for private user isolation, and add `/api/channels/invite` and `/api/channels/join` endpoints backed by Neon PostgreSQL.

**Tech Stack:** Node.js 24 LTS, Native Web Audio API, Web Notification API, Neon Serverless PostgreSQL HTTP API, Web Crypto API, Vanilla ES Modules, `node:test`.

**Spec:** `docs/plans/PLAN-CRUD-SLACK-003-TIMEFLOW-COLLABORATION.md`

## Global Constraints

- Runtime dependencies must remain strictly zero (`dependencies: {}` in `package.json`).
- All SQL queries must be 100% parameterized using `sql()` from `api/_db.js`.
- All text inputs must be sanitized using domain sanitizers (`sanitizePlainText`, `escapeHtml`).
- Strict CSP without `'unsafe-inline'` must be respected (no inline `style="..."` attributes).
- CSS bundle budget (< 45 KB) and JS bundle budget (< 50 KB) must be maintained.
- All 7 stages of `npm run verify:strict` must pass with exit code 0.

## Review Focus

- Time format validation: `scheduledTime` must strictly accept `HH:mm` (24h format, 00:00 to 23:59) and reject invalid strings without crashing.
- Alarm deduplication: When wall-clock matches a task's `scheduledTime`, alarm must fire once per day/session and not spam repeated notifications every second.
- Workspace isolation: Personal private tasks (`is_private: true`) must never be visible to other users querying general channels.
- Expired invite tokens: Channel invites older than expiration date (7 days) must be rejected with 410 Gone / 400 Bad Request.
- Notification permission degradation: If user denies or ignores browser notification permissions, fallback gracefully to in-app toast and audio chime without unhandled promise rejections.

---

### Task 1: Domain Entities & NLP Hourly Extraction

**Files:**
- Modify: `src/domain/taskEntities.mjs`
- Modify: `src/domain/deterministicNlp.mjs`
- Test: `test/hourlyTask.test.mjs`

**Interfaces:**
- Consumes: Task inputs and message text.
- Produces: `scheduledTime` (`"HH:mm"|null`), `durationMinutes` (`number`), `isPrivate` (`boolean`), `userId` (`string|null`) on `TaskEntity`. `extractHourlySchedule(text: string) -> string|null`.

- [ ] **Step 1: Write failing test in `test/hourlyTask.test.mjs`**
Test validating `scheduledTime` regex and extracting hours from Spanish phrases like *"a las 09:30"*, *"a las 15:00"*, *"10:00 am"*.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/hourlyTask.test.mjs`
Expected: FAIL (`extractHourlySchedule` is not defined or `scheduledTime` is missing).

- [ ] **Step 3: Implement hourly schema and NLP parser**
Add `scheduledTime` validation and normalization to `createTaskEntity` in `src/domain/taskEntities.mjs`, and add regex extraction in `src/domain/deterministicNlp.mjs`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/hourlyTask.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/domain/taskEntities.mjs src/domain/deterministicNlp.mjs test/hourlyTask.test.mjs
git commit -m "feat(domain): add hourly time-blocking schema and deterministic hour parser"
```

---

### Task 2: Notification & Audio Alarm Engine

**Files:**
- Create: `src/application/notificationEngine.mjs`
- Create: `src/infrastructure/webNotificationAdapter.mjs`
- Modify: `src/ui/soundFx.mjs`
- Test: `test/notificationEngine.test.mjs`

**Interfaces:**
- Consumes: `TaskEntity[]`, current time `HH:mm`.
- Produces: `checkDueAlarms(tasks, currentHhMm, firedAlarmSet) -> TaskEntity[]`, `playAlarmChime()`, `triggerTaskNotification(task)`.

- [ ] **Step 1: Write failing test in `test/notificationEngine.test.mjs`**
Test alarm engine triggering tasks whose `scheduledTime` matches current time, avoiding duplicate triggers on already fired tasks.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/notificationEngine.test.mjs`
Expected: FAIL (`checkDueAlarms` is not defined).

- [ ] **Step 3: Implement notificationEngine and webNotificationAdapter**
Implement pure Layer-0 scheduler in `src/application/notificationEngine.mjs` and native Web Audio chime in `src/ui/soundFx.mjs`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/notificationEngine.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/application/notificationEngine.mjs src/infrastructure/webNotificationAdapter.mjs src/ui/soundFx.mjs test/notificationEngine.test.mjs
git commit -m "feat(notifications): implement layer-0 alarm scheduler and web audio chime"
```

---

### Task 3: Backend API: Hourly Persistence & Workspace Isolation

**Files:**
- Modify: `api/tasks.js`
- Test: `test/tasksApi.test.mjs`

**Interfaces:**
- Consumes: `scheduledTime`, `durationMinutes`, `isPrivate`, `userId` from request body.
- Produces: Persistent database writes in Neon PostgreSQL, returning user's private tasks when `channelId === 'personal'`.

- [ ] **Step 1: Write failing test in `test/tasksApi.test.mjs`**
Add test for storing and retrieving `scheduledTime` and isolating private tasks by user.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/tasksApi.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update `api/tasks.js`**
Add columns to `ensureTasksTable()`, map `scheduled_time`, `duration_minutes`, `is_private`, and `user_id` in SQL statements.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/tasksApi.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add api/tasks.js test/tasksApi.test.mjs
git commit -m "feat(api): persist hourly time-blocking and private workspace isolation"
```

---

### Task 4: Channel Invites Endpoints

**Files:**
- Create: `api/channels/invite.js`
- Create: `api/channels/join.js`
- Test: `test/channelInvites.test.mjs`

**Interfaces:**
- Consumes: `channelId`, `userId`.
- Produces: `POST /api/channels/invite` returning `{ ok: true, inviteUrl: string, token: string }`, `GET /api/channels/join?token=xxx` adding member and returning channel details.

- [ ] **Step 1: Write failing test in `test/channelInvites.test.mjs`**
Test generating invite token and validating join logic.

- [ ] **Step 2: Run test to verify it fails**
Run: `node --test test/channelInvites.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `invite.js` and `join.js`**
Implement cryptographic token generation via `node:crypto`, database persistence in `channel_invites`, and membership redemption.

- [ ] **Step 4: Run test to verify it passes**
Run: `node --test test/channelInvites.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add api/channels/invite.js api/channels/join.js test/channelInvites.test.mjs
git commit -m "feat(channels): add channel invitation token generator and join endpoints"
```

---

### Task 5: UI Integration: Hourly Timeline View, Alarms & Invites

**Files:**
- Modify: `src/ui/taskViews.mjs`
- Modify: `src/ui/main.mjs`
- Modify: `index.html`
- Modify: `css/styles.css`

**Interfaces:**
- Consumes: `renderHourlyTimelineView`, `notificationEngine`, `cloudTaskAdapter`.
- Produces: Daily timeline grid (06:00 to 22:00), Alarm notification loop (checks every 30s), Invite modal & Google Auth switcher.

- [ ] **Step 1: Add Hourly Timeline View in `taskViews.mjs`**
Implement `renderHourlyTimelineView(container, tasks)` rendering time slots with tasks assigned to their respective hours.

- [ ] **Step 2: Add UI controls in `index.html`**
Add tab button "⏰ Agenda Horaria", "🔔 Activar Alarmas" toggle, and "🔗 Invitar al Canal" action.

- [ ] **Step 3: Wire alarm loop and invite handler in `main.mjs`**
Set up `setInterval` checking due alarms, playing audio chime, and displaying notifications. Wire invite link generator to copy URL to clipboard.

- [ ] **Step 4: Commit**
```bash
git add src/ui/taskViews.mjs src/ui/main.mjs index.html css/styles.css
git commit -m "feat(ui): integrate daily hourly timeline view, alarm listener, and channel invites"
```

---

### Task 6: Strict 7-Stage SecDevOps Verification Gate & Production Ship

**Files:**
- Modify: `scripts/verify-strict.mjs`
- Modify: `docs/evidence/EVD-0001.json`

- [ ] **Step 1: Run complete test suite**
Run: `npm test`
Expected: 100% PASS across all test suites.

- [ ] **Step 2: Run 7-Stage SecDevOps Verification Gate**
Run: `npm run verify:strict`
Expected: Exit code 0, 7/7 stages passed.

- [ ] **Step 3: Fast-forward merge and push to production**
```bash
git push origin main
```
