# Operational UX Flow v1 — Tasks

| Task | Requirement | Verification | Status |
| --- | --- | --- | --- |
| T1 Preserve internal origin across lead and workspace navigation | OUX-01 | Lead, queue and workspace component tests | Verified |
| T2 Connect workspace task shortcuts and copied message to cadence | OUX-02 | Workspace and approach component tests | Verified |
| T3 Warn about and discard unsaved workspace work | OUX-03 | Workspace interaction tests | Verified |
| T4 Run repository quality gates | OUX-01..03 | lint, typecheck, test, build | Verified |

## Validation — 2026-08-18

- Focused UX suite: 7 files, 111 tests passed.
- Full unit/component/route suite: 124 files, 2,267 tests passed.
- ESLint: passed.
- Next type generation and strict TypeScript: passed.
- Sanitized Next.js production build: passed; all application routes generated.
- Database integration and contract suites were not rerun because this pass
  changes no route, repository, schema or external contract.
- Exact Demo 3 target and contact TLS preflights passed before mutation.
- Immutable release `demo3-preprod-20260818-operational-ux-001` rolled out with
  app and PostgreSQL `1/1` Ready and all containers at zero restarts.
- Anonymous queue access returned `401`; authenticated Leads, Queue, an
  existing Workspace and its qualification cadence returned `200` without
  recording commercial values or response bodies.
- Sanitized rollout-window logs contained zero error markers. Deployment and
  postflight made no OpenAI, n8n, contact-provider or producer-write call.
