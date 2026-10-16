# Unknown Risk Original Value — Deployment Evidence

Date: 2026-08-18  
Target: authorized Demo 3 local pre-production  
Release: `demo3-preprod-20260818-risk-original-001`

## Gates

- Focused risk-presentation suite: 2 files, 63 tests passed.
- Full ESLint and strict TypeScript passed.
- Full unit/component/route suite: 124 files, 2,270 tests passed.
- Sanitized Next.js production build passed.
- Exact cluster-target and contact-TLS preflights passed before mutation.

## Rollout and postflight

- Four immutable release images were built and published.
- Existing app-owned migrations were reapplied idempotently; this presentation
  change introduced no migration, route or external contract.
- Application Deployment and PostgreSQL StatefulSet completed at `1/1` Ready;
  every container reported zero restarts.
- Anonymous Leads returned `401`; authenticated Leads returned `200`.
- Value-safe reads completed for all seven visible leads and observed seven
  unknown risk items without recording their values.
- The active client bundle omits the generic unknown-risk sentence and retains
  the approved known-risk descriptions.
- App, edge, database proxy and PostgreSQL logs contained zero sanitized error
  markers over the rollout window.

No credential, CNPJ, company name, report content, risk value or response body
was recorded. Deployment and postflight made no OpenAI request, n8n call,
contact-provider request, outreach action or producer write.
