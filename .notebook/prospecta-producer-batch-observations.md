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

Updated: 2026-07-07
