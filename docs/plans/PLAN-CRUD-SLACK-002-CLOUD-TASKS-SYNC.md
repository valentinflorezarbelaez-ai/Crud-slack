# PLAN-CRUD-SLACK-002: CLOUD MULTI-USER TASK SYNCHRONIZATION VIA NEON POSTGRESQL

## 1. Intent & Context (The Why)
- **Problem**: When a user analyzes messages or interacts with the task board at `https://crud-slack.vercel.app/`, task state is stored strictly in the client's `localStorage`. Opening the URL on another computer or browser loads a blank board or default presets, preventing real-time team collaboration.
- **Goal**: Enable seamless, zero-friction multi-user task sharing per channel using Neon Serverless PostgreSQL, keeping `0` runtime dependencies and maintaining offline fallback resilience.

---

## 2. Goals, Non-Goals & Anti-Goals
- **Goals**:
  1. Auto-sync task boards per channel (e.g. `#general`, `#urgencias`, `#proyectos`) against Neon PostgreSQL.
  2. Any person loading a channel fetches the latest cloud-persisted tasks.
  3. Updates (drag & drop in Kanban, inline edits, status toggles, new AI triage) persist to the cloud asynchronously.
  4. Preserve offline resilience: if network/database fails, gracefully fallback to `localStorage`.
  5. Zero new npm dependencies: utilize the existing Layer-0 HTTP Neon client in `api/_db.js`.
- **Non-Goals**:
  - Full Operational Transformation (OT) / CRDT real-time multi-cursor collaboration (overkill for this challenge scope).
  - Enforcing mandatory Google Sign-In to view or edit public channel tasks (viewing and updating public channel tasks remains accessible to team members).
- **Anti-Goals**:
  - Never break existing tests (`npm test`, `npm run verify:strict`).
  - Never expose database credentials in client bundles.
  - Never block UI responsiveness on slow database round-trips (optimistic updates locally with background sync).

---

## 3. Evaluated Approaches & Selected Path
- **Approach 1 (Selected)**: Channel-Shared Task Board in Neon PostgreSQL.
  - Each channel owns its task board in Neon.
  - Public channels (`#general`, etc.) allow immediate collaborative viewing and editing.
- **Approach 2 (Rejected)**: Shareable Board URL token (`?board=xyz`).
  - Rejected because users opening the root domain would still see a blank board unless they received a custom link.
- **Approach 3 (Rejected)**: Strict mandatory authentication per user/tenant.
  - Rejected because it introduces excessive friction for technical reviews, demos, and guest evaluation.

---

## 4. Technical Architecture & Database Schema

### Database Table: `tasks`
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  channel_id VARCHAR(64) NOT NULL,
  order_idx INT DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority VARCHAR(16) NOT NULL,
  priority_reason TEXT DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  deadline_date VARCHAR(16),
  deadline_label TEXT DEFAULT '',
  deadline_state VARCHAR(24) DEFAULT 'MISSING_INFO',
  missing_details TEXT DEFAULT '',
  assignee TEXT DEFAULT 'Por asignar',
  source_quote TEXT DEFAULT '',
  depends_on_order INT,
  grounded BOOLEAN DEFAULT TRUE,
  channel_type VARCHAR(24) DEFAULT 'slack',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_channel_id ON tasks(channel_id);
```

### Serverless API: `api/tasks.js`
- `GET /api/tasks?channelId=general`:
  - Returns `{ ok: true, tasks: [...] }` ordered by `order_idx ASC, created_at ASC`.
- `POST /api/tasks`:
  - Receives `{ channelId: string, tasks: TaskEntity[] }`.
  - Performs an idempotent atomic upsert/sync transaction into the `tasks` table for that `channel_id`.
  - Returns `{ ok: true, count: number, checksum: string }`.

### Client-Side Data Adapter: `src/infrastructure/cloudTaskAdapter.mjs`
- `fetchChannelTasks(channelId)`:
  - Fetches from `/api/tasks?channelId=...`.
  - On success: saves to `localStorage` as cache and updates reactive state.
  - On network/server error: falls back to `loadPersistedBoardState(channelId)`.
- `syncChannelTasks(channelId, tasks)`:
  - Debounced (300ms) background push to `POST /api/tasks`.
  - Also updates `localStorage` immediately (optimistic UI).

---

## 5. Security & Verification
- Strict parameterization against SQL injection via `api/_db.js`.
- Input validation on task titles, lengths, and valid status/priority enums.
- Comprehensive `node:test` suite verifying:
  - API endpoint responses (`GET` and `POST /api/tasks`).
  - Fallback to local storage when cloud is unreachable.
  - Zero-lint / 0-dependency invariant verified via `npm run verify:strict`.
