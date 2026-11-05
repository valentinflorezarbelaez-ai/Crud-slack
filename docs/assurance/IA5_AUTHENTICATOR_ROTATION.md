# IA-5 Authenticator Management — TaskFlow / Crud-slack
<!-- Epistemic: WITHIN_TESTED_SCOPE · Law VI · NIST IA-5 remediation -->

## Status

Fail-closed authenticators:
- `SESSION_SECRET` — required (≥32 chars); no code fallback.
- `GOOGLE_CLIENT_ID` — required for OAuth module load; no hardcoded client id.
- `GEMINI_API_KEY` — server-only via env; never commit `.env.local`.

## Rotation runbook

1. Generate new secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
2. Set in Vercel/host secret store (`SESSION_SECRET`, rotate `GEMINI_API_KEY` in Google AI console if exposed).
3. Redeploy production.
4. Invalidate sessions (cookie Max-Age / bump cookie name if needed).
5. Confirm `/api/health` and auth flows; never paste real values into chat/git.

## Evidence

- `api/_auth.js` throws `SESSION_SECRET_REQUIRED_MIN_32_CHARS` when missing.
- `api/auth/google.js` throws `GOOGLE_CLIENT_ID_REQUIRED` when missing.
- `api/auth/google-client.js` GET bootstraps GIS client id from env only (503 if unset).
- `src/ui/realtimeSlack.mjs` fetches `/api/auth/google-client` — zero hardcoded client id.
- `.env*` gitignored; `.env.example` placeholders only; local redact via `scripts/redact-env-local.mjs`.
