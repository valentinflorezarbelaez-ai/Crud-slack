# PLAN-CRUD-SLACK-004: BIG TECH 10/10 EXECUTIVE STANDUP, CONFLICT GUARD & AUDIT TRAIL

## 1. Plan Metadata
- **Plan ID**: `PLAN-CRUD-SLACK-004`
- **Spec Association**: `SPEC-CRUD-SLACK-001` (FR-CS-020, FR-CS-021)
- **Status**: `APPROVED`
- **Owner**: Valentín Flórez Arbeláez (Principal Architect)
- **Date**: `2026-11-07`

---

## 2. Architecture Decision Records (ADRs)

### ADR-007: Deterministic Interval-Based Conflict Detection & Executive Standup Synthesis
- **Context**: Users managing multiple deliverables across personal and collaborative channels can inadvertently book conflicting or overlapping time slots (e.g. two deliveries at 09:30).
- **Decision**: Implement a pure domain service (`src/domain/workloadOptimizer.mjs`) that:
  1. Computes total minutes from midnight for each scheduled task interval `[start, start + duration)`.
  2. Detects interval overlaps for active (non-completed) tasks in $O(N^2)$ time where $N \le 200$.
  3. Staggers overlapping tasks based on priority weights (CRITICAL > HIGH > MEDIUM > LOW) with a 15-minute buffer.
  4. Generates a daily executive standup digest formatted in Markdown for Slack/Teams and synthesized via browser `window.speechSynthesis`.
- **Rejected Alternatives**:
  - *Cloud LLM on every conflict check*: Rejected due to latency (>800ms) and cost; deterministic interval arithmetic executes in <1ms and is 100% predictable.
  - *Hard modal blocking user creation*: Rejected because users often create draft tasks before refining schedules; soft warning banner with 1-click auto-resolution is far superior UX.

### ADR-008: Immutable Task Audit Trail & Activity Changelog
- **Context**: Enterprise compliance (SOC2/ISO27001) and collaborative clarity require visibility into who changed a task, what was changed, and when.
- **Decision**: Create an immutable event record for every task mutation (`createAuditRecord`) tracking `(taskId, action, actorId, actorName, oldValue, newValue, timestamp)`. Render chronologically within accessible UI components.
- **Rejected Alternatives**:
  - *Heavy database triggers on every column*: Unnecessary overhead on Neon serverless; domain-driven audit log with client & database persistence satisfies requirements with zero latency.

---

## 3. Atomic Task Decomposition
1. **TASK-BT-01**: Implement `src/domain/workloadOptimizer.mjs` with interval math, conflict detection, auto-resolution, and standup generation.
2. **TASK-BT-02**: Implement `src/domain/taskAuditTrail.mjs` with immutable event records and accessible HTML rendering.
3. **TASK-BT-03**: Create unit test suite `test/workloadOptimizer.test.mjs` verifying conversions, conflict math, resolution, and digest formatting.
4. **TASK-BT-04**: Build `src/ui/executiveDigest.mjs` accessible modal controller with clipboard copy and Spanish speech synthesis.
5. **TASK-BT-05**: Wire modal and trigger button into `index.html`, `src/ui/commandPalette.mjs`, and `src/ui/main.mjs`.
6. **TASK-BT-06**: Verify strict compliance via `npm run verify:strict` (7/7 gates, CSS < 45 KB, JS < 55 KB, 0 deps).
7. **TASK-BT-07**: Deploy to Vercel production and verify live endpoints.
