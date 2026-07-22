# Prospecta n8n v7.4 lifecycle events
> Callback events improve telemetry but do not satisfy durable batch acceptance

Reviewed artifacts:
- previous attachment retained as historical evidence
- local-only ignored export: `.local/n8n-review/worflow-atual.json`
- sanitized evidence:
  `.specs/features/batch-import-n8n-alignment/evidence/current-workflow-static-review-2026-07-22.md`

Relevant app flow:
- `src/server/imports/ingress-client.ts:requestAcknowledgement()`
- `src/server/imports/batch-read-service.ts:composeBatchSummary()`
- `src/server/repositories/imports/producer-batch-observations-repository.ts:readProducerBatchObservations()`
- `db/app/001_app_schema_forward.sql`
- `db/producer/001_batch_observation_source.sql`

Findings:
- The export keeps the active current workflow identity
  `6HM8Era5svuUN24x`; it is not the separate inactive versioned ingress
  required by `.specs/features/batch-import-n8n-alignment/spec.md`.
- `ACCEPTED_ROW` is emitted after the acknowledgement response and a timing
  wait, not after an atomic durable producer acceptance.
- Callback failures retry briefly and then continue, so callback delivery is
  not a durable producer fact source or recoverable outbox.
- The app has no lifecycle-event POST route, environment contract, repository,
  or read path. Batch pages read app-owned durable acceptance plus the approved
  producer observation view only.
- Demo 3 gateway authentication applies to every app path; the callback sends
  only a custom secret header and cannot use the current NodePort route as
  configured.
- Callback payloads exceed the existing app import-event metadata allowlist.
- The extractor still names `arquivo_csv0` while the app transmits
  `arquivo_csv`; this is contract drift that needs a synthetic disposable
  execution check.
- `BATCH_CLOSED` delivery can follow failed terminal callback delivery, so the
  callback stream can be incomplete even when the n8n loop finishes.
- Local export fingerprint:
  `26a2c00f30a58de01eae60802d470c6ba4d16d0e6e09e8340453c38aea142c23`.
- Inventory: 98 active nodes; 9 credential-bearing references; no pin data;
  no Execute Sub-workflow or Execute Sub-workflow Trigger.
- The response has no Postgres ancestor. Seven Postgres nodes write/read the
  legacy model and reference none of the accepted X4 tables/functions.
- Current normalization has 35 alias groups and producer scoring/search rules;
  ingress v1 normalization has 8 structural groups. They are not
  interchangeable.
- Current identities (`empresaqui_<timestamp>`, short FNV run ID and legacy
  idempotency key) cannot satisfy the structured 64-hex constraints.

Direction:
- Keep the current workflow immutable.
- Continue the inactive artifact under
  `integrations/n8n/prospecting-import-v1/`.
- Make atomic producer acceptance precede `202`, expose acceptance and X4
  through approved producer read views, reconcile app-owned acceptance, and
  persist explicit producer close facts.
- OPEN-02 requires a separately approved worker plus an idempotent terminal
  adapter. The current workflow is a behavior baseline only; do not change,
  clone or call it from v1.

Updated: 2026-07-22
