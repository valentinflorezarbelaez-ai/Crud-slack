# PLAN-CRUD-SLACK-003: TIMEFLOW AI — TIME-BLOCKING, HOURLY NOTIFICATIONS, GOOGLE AUTH & CHANNEL INVITATIONS

## 1. Intent & Context
- **Vision**: Elevate TaskFlow AI into **TimeFlow AI**: a full-fledged daily time-blocking productivity suite with collaborative team channels and personal private workspaces.
- **Problem Solved**:
  1. Multi-user isolation: Users currently share channel task lists without private spaces for individual daily agendas.
  2. Hourly Daily Organization: Tasks currently only have coarse dates (e.g. "Friday"), lacking precise hourly scheduling ("at 09:00 do X, at 14:30 do Y").
  3. Real-time Notifications: Users have no active reminder when an hourly scheduled task arrives.
  4. Team Onboarding: Adding teammates to channels requires manual database seeding rather than shareable invite links.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
1. **Google Sign-In & Workspace Isolation**:
   - Authenticate via Google Identity Services (OIDC) or fast one-click team profile selection.
   - Dual-workspace mode: **"Mi Día" (Private Personal Workspace)** strictly scoped to the logged-in user, vs **"Canales de Equipo" (Collaborative Channels)**.
2. **Hourly Time-Blocking Engine (06:00 - 22:00)**:
   - Extend task schema with `scheduledTime` (`HH:mm`) and optional `durationMinutes`.
   - Add **Vista Agenda Diaria (Timeline Horario)** alongside Tabla, Tarjetas y Kanban.
   - Deterministic NLP & AI extraction parses explicit hour anchors (e.g. *"a las 10:00 am"*, *"15:30"*) without hallucination.
3. **Web Notifications & Audio Alarm System**:
   - Native Web Notification API (`Notification.requestPermission`) triggering desktop/mobile OS notifications when current time matches task `scheduledTime`.
   - Native zero-dependency Web Audio synthesizer chime alert when an alarm fires.
4. **Channel Invite System**:
   - Endpoint `POST /api/channels/invite` and `GET /api/channels/join?token=...`.
   - Direct *"🔗 Invitar al Canal"* button copying a shareable join URL.

### Non-Goals
- Full Google Calendar two-way sync via Google OAuth API (we preserve iCalendar `.ics` export for external calendar ingestion; full Google Calendar API requires complex OAuth2 write verification scopes).
- Native iOS/Android app store packaging (the existing PWA service worker with Web Notifications covers mobile and desktop cleanly).

### Anti-Goals
- Zero external runtime npm dependencies (`dependencies: {}` strictly preserved).
- Zero plain secrets (client IDs and session secrets properly handled).
- Never block page loading or throw unhandled exceptions if the user denies notification permissions.

---

## 3. Database Schema Evolution (Neon PostgreSQL)

### A. Extend `tasks` Table:
```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(8) DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_minutes INT DEFAULT 60;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT NULL;
```

### B. New `channel_invites` Table:
```sql
CREATE TABLE IF NOT EXISTS channel_invites (
  token VARCHAR(64) PRIMARY KEY,
  channel_id VARCHAR(64) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Architectural Modules & Component Topology

```text
src/
├── domain/
│   ├── taskEntities.mjs          # Adds scheduledTime (HH:mm) validation, time invariants, alarm triggers
│   └── deterministicNlp.mjs      # Extends regex parser to capture Spanish/English hours ("a las 9:00", "14:30")
├── application/
│   ├── notificationEngine.mjs    # Pure Layer-0 alarm scheduler comparing wall-clock with task times
│   └── inviteManager.mjs         # Channel invite link token validation and membership orchestration
├── infrastructure/
│   ├── webNotificationAdapter.mjs# Browser Notification API wrapper + Web Audio chime synthesizer
│   └── cloudTaskAdapter.mjs      # Supports both private user workspace (usr_xxx) and team channels
└── ui/
    ├── main.mjs                  # Integrates Hourly Timeline View, Alarm listener, Invite modal, Google Sign-In
    ├── taskViews.mjs             # Renders modern Hourly Timeline (06:00 to 22:00) with draggable/selectable slots
    └── soundFx.mjs               # Pure Web Audio alert synthesizer
api/
├── tasks.js                      # Handles scheduled_time, is_private, and user isolation
├── channels/
│   ├── invite.js                 # Generates shareable invite links with cryptographic tokens
│   └── join.js                   # Verifies invite token and adds user to channel members
└── auth/
    ├── google.js                 # Handles Google OIDC credential tokens
    └── me.js                     # Returns current session profile
```

---

## 5. Security, WCAG Accessibility & Verification
- Strict CSP: Google GSI iframe and script sources already configured in `vercel.json`.
- Web Audio alarm strictly requires prior user interaction before playing audio (prevents browser autoplay policy block).
- Automated tests in `node:test` covering:
  - Hourly NLP extraction.
  - Notification scheduler time matching.
  - Private vs shared task isolation in `api/tasks.js`.
  - Channel invite token creation and redemption.
- 7-Stage SecDevOps verification gate (`npm run verify:strict`) passing with code 0.
