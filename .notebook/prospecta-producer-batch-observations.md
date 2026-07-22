# Prospecta Producer Batch Observations
> T022 approved local X4 source and repository flow

Entry: `src/server/repositories/imports/producer-batch-observations-repository.ts`

Evidence: `.specs/features/prospecting-console/evidence/x4-producer-batch-observations.md`

DDL: `db/producer/001_batch_observation_source.sql`

Flow:
- repository validates `import_batch_id` before database work
- reads only `public.prospecta_import_batch_observations_v1`
- uses `src/server/db/producer-client.ts` and `PRODUCER_DATABASE_URL`
- returns `BatchProducerObservationFacts` for T020/T023 composition

Schema alignment:
- `public.prospecta_import_batch_observations_v1` is a producer-owned adapter
  over `lead_input_rows`, `lead_decisions`, `lead_processing_state`,
  `lead_import_batches`, and retained `company_validation_runs`
- close emits only from explicit `lead_import_batches.import_manifest`
  `prospecta_batch_closed` / `prospecta_batch_closed_at` keys

X4 mapping:
- `LEAD_DECISION_SAVED` -> `MATERIALIZED`
- `PRE_VALIDATION_BLOCKED` -> `BLOCKED`
- `CRM_REJECTED` -> `BLOCKED`
- `PROCESSING_FAILED` -> `FAILED`
- unknown producer results are non-terminal

Gotchas:
- `docs/db/schema.sql` constrains structured producer `import_batch_id` to
  `ib_<64 hex>`; the T022 repository treats the value as opaque, but the
  producer/app correlation must use the same identifier for production
- retained legacy observations are informational only and do not prove
  acceptance, processing, completion, failure, or zero counts
- producer-source errors map to `availability: "UNAVAILABLE"`
- DDL under `db/producer/` must be run only by a producer owner in disposable,
  non-production, or separately approved production targets

Verification:
- focused unit: 18 tests
- focused disposable PostgreSQL integration: 5 tests
- full disposable PostgreSQL integration: 39 tests

Runtime configuration (Demo 2, 2026-07-14):
- The configured producer database initially lacked
  `public.prospecta_import_batch_observations_v1`; the read repository mapped
  that query failure to `availability: "UNAVAILABLE"`.
- The producer-owner test access applied
  `db/producer/001_batch_observation_source.sql` and granted the configured
  producer-read role `SELECT` on the view.
- Verified: producer-read `SELECT` succeeds; `GET /api/imports` returns all
  existing submissions with `observationStatus: "AVAILABLE"`.
- A workflow `202` remains acknowledgement-only, so existing batches still
  correctly map to `SUBMITTED` until a durable acceptance fact exists.
- `AVAILABLE` means the view query succeeded, even when no correlated rows
  exist. `lastObservedAt` needs a matching observation; accepted and terminal
  counts remain `null` without a durable acceptance fact.

Runtime configuration (Demo 3, 2026-07-22):
- a reported legacy batch had a workflow acknowledgement for one row but zero
  rows in `prospecta_import_batch_observations_v1`, zero durable acceptances and
  no installed `prospecta_import_acceptances_v1` view
- batch detail presentation now uses `lastObservedAt` to distinguish
  source-available/empty-correlation from actual correlated observations; this
  is presentation only and never promotes legacy evidence

Updated: 2026-07-22
