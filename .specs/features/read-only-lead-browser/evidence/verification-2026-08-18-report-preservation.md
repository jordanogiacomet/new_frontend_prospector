# Strategic Report Preservation — Deployment Evidence

Date: 2026-08-18  
Target: authorized Demo 3 local pre-production  
Release: `demo3-preprod-20260818-report-preservation-001`

## Gates

- Focused mapper suite: 2 files, 42 tests passed.
- Full ESLint and strict TypeScript passed.
- Full unit/component/route suite: 124 files, 2,271 tests passed.
- Sanitized Next.js production build passed.
- Git diff whitespace validation passed.
- Exact cluster-target and contact-TLS preflights passed before mutation.

## Rollout and postflight

- Four immutable release images were built and published.
- Existing app-owned migrations were reapplied idempotently; this presentation
  change introduced no migration, route or external contract.
- Application Deployment and PostgreSQL StatefulSet completed at `1/1` Ready;
  every container reported zero restarts.
- Anonymous Leads returned `401`; authenticated Leads returned `200`.
- A value-safe live check found one targeted report and confirmed it was
  available, non-empty, no longer than 12,000 characters, contained the
  privacy-redaction and reduction notices, and contained no phone-like value.
- App, edge, database proxy and PostgreSQL logs contained zero sanitized error
  markers over the rollout window.

No credential, CNPJ, company name, report content, phone value or response body
was recorded. Deployment and postflight made no OpenAI request, n8n call,
contact-provider request, outreach action or producer write.
