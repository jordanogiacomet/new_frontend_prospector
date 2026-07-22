# Prospecta n8n v7.4 lifecycle events
> Callback events improve telemetry but do not satisfy durable batch acceptance

Reviewed artifact:
`/home/jordanogiacomet/.codex/attachments/6c947169-eb2d-46e3-90f8-28ebceff1401/pasted-text.txt`

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

Direction:
- Keep the current workflow immutable.
- Continue the inactive artifact under
  `integrations/n8n/prospecting-import-v1/`.
- Make atomic producer acceptance precede `202`, expose acceptance and X4
  through approved producer read views, reconcile app-owned acceptance, and
  persist explicit producer close facts.

Updated: 2026-07-20
