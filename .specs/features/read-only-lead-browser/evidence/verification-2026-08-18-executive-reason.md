# Executive Decision Reason — Deployment Evidence

Date: 2026-08-18  
Target: authorized Demo 3 local pre-production  
Release: `demo3-preprod-20260818-executive-reason-001`

## Gates

- Focused presentation suite: 5 files, 86 tests passed.
- Full ESLint and strict TypeScript passed.
- Full unit/component/route suite: 124 files, 2,270 tests passed.
- Sanitized Next.js production build passed.
- Exact cluster-target and contact-TLS preflights passed before mutation.

## Rollout and postflight

- Four immutable release images were built and published.
- App-owned migrations were reapplied idempotently; this presentation change
  introduced no migration, route or external contract.
- Application Deployment and PostgreSQL StatefulSet completed at `1/1` Ready;
  all containers reported zero restarts.
- Anonymous Leads returned `401`; authenticated Leads returned `200`.
- A value-safe read found one current reason matching the approved technical
  pattern. The active client bundle contains all executive-copy markers.
- App, edge, database proxy and PostgreSQL logs contained zero sanitized error
  markers over the rollout window.

No credential, CNPJ, company name, report content, raw reason or response body
was recorded. Deployment and postflight made no OpenAI request, n8n call,
contact-provider request, outreach action or producer write.
