# EOS FLEET GOVERNANCE MATRIX: CRUD-SLACK (TASKFLOW AI)

## 1. Backstage Component Profile
- **Component ID**: `crud-slack-taskflow-ai`
- **Owner**: `user:valentin-florez-arbelaez`
- **Lifecycle**: `production`
- **Architecture**: Clean / Hexagonal Layer-0 (`dependencies: {}`)

## 2. Inviolable Invariants
1. **Zero Vibe Coding**: Every feature maps to formal EARS requirements and BDD scenarios in `docs/specs/spec.md`.
2. **Anti-Hallucination Temporal Integrity**: Never fabricate deadlines, hours, or assignees missing from source text; enforce `groundingVerifier.mjs`.
3. **Layer-0 Zero-Dependency Purity**: `package.json` runtime `dependencies` must remain empty (`{}`).
4. **Zero Plaintext Secrets**: Server-only consumption of `GEMINI_API_KEY` via `/api/analyze`; strict CSP without `'unsafe-inline'`.
5. **Verification Gate**: All changes must pass `npm run verify:strict` (7/7 SecDevOps & SDD stages).
