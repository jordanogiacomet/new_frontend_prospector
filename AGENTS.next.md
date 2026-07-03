# AGENTS.next.md — SUPERSEDED PROPOSAL

> Status: superseded on 2026-07-03.
>
> `AGENTS.md` remains the controlling repository instruction file and now
> contains the authorized Prospecta direction. This file is retained only as
> proposal history and grants no additional authority.

## Product

This repository may evolve into Prospecta, a private internal
assisted-prospecting platform.

After explicit approval, the application may:

- accept controlled EmpresaAqui CSV uploads;
- submit them through an approved server-to-server n8n webhook;
- monitor correlated producer batches through PostgreSQL;
- present n8n-produced qualification decisions;
- store app-owned commercial organization data.

## System boundaries

Proposed allowed flows:

```text
Browser → App API
App API → approved n8n import webhook
n8n → producer PostgreSQL tables
App API → SELECT on approved producer tables/views
App API → controlled reads/writes in the app-owned prospecting schema
```

Always prohibited:

```text
Browser → n8n
Browser → PostgreSQL
App → mutation of producer decisions, runs, reports, cache, CRM, or scoring data
App → arbitrary n8n API or workflow administration
App → recalculation of n8n decisions
```

## Legacy RLB

The read-only lead browser remains a reusable legacy module.

Preserve:

- private authentication;
- safe lead DTOs;
- list, detail, and retained-history components;
- null and unavailable states;
- server-only producer reads;
- Brazilian formatting;
- sensitive-content policy.

Do not continue RLB tasks automatically.

## Uploads

Uploads require all of the following before implementation:

- server-side authorization;
- file size, type, and encoding limits;
- upload-level idempotency;
- SHA-256 correlation;
- safe filenames;
- an approved n8n webhook contract;
- audit records in app-owned tables;
- an explicit retention and deletion policy.

The app must not reproduce n8n normalization, scoring, enrichment, or
qualification logic.

## Commercial writes

Commercial state must live only in app-owned tables.

Allowed examples:

- assignment;
- commercial stage;
- next action;
- contact activity;
- commercial outcome;
- notes;
- audit events.

Every write must record actor, organization, timestamp, and the referenced
`lead_run_id` when applicable.

Commercial state must never overwrite or masquerade as an n8n recommendation.

## Database access

Use separate least-privilege roles:

- producer read role;
- app-schema read/write role.

No production migration may run without explicit approval.

## Security

- Require server-side authentication and authorization for every private page
  and API route.
- Keep upload and commercial permissions distinct.
- Do not log CSV contents, contacts, reports, evidence bodies, or SQL
  parameters.
- Keep webhook and database credentials server-only.
- Use parameterized queries.
- Use private, no-store responses.
- Treat lead and contact data as sensitive business data.
- Require semantic approval before exposing report, evidence, or contact
  content.

## Prohibited without explicit approval

- editing or activating n8n workflows;
- arbitrary workflow execution;
- reprocessing leads;
- retrying accepted uploads automatically;
- writing producer tables;
- changing scoring rules;
- exporting sensitive data;
- CRM synchronization;
- production migrations;
- storing raw CSVs indefinitely.

## Definition of done

- Authentication and authorization are enforced.
- Writes are isolated to app-owned tables.
- Producer tables remain read-only to the app.
- Upload idempotency and correlation are tested.
- No n8n or database secret reaches the browser.
- Relevant unit, integration, and route tests pass.
- Lint, typecheck, tests, and build pass.
- Operational and incomplete states are represented honestly.
