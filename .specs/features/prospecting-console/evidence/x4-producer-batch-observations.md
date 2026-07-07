# X4 Producer Batch Observation Source

**Status:** APPROVED FOR LOCAL/NON-PRODUCTION SYNTHETIC IMPLEMENTATION on
2026-07-07. Production creation, grants, deployment, and rollout still require
separate approval.

This evidence records the approved producer-owned read source for T022. The
source is an adapter view over the structured producer objects already present
in `docs/db/schema.sql`; it is not an app-owned schema and it is not a
migration that Prospecta applies by itself. The app may only read the view
through the existing `PRODUCER_DATABASE_URL` producer client.

## Approved Read Source

| Item | Value |
| --- | --- |
| Source | `public.prospecta_import_batch_observations_v1` |
| Source owner | Producer database owner |
| App access | `SELECT` only through producer-read role |
| Filter | `import_batch_id = $1` |
| Row identity | `source_row` for accepted-row and terminal facts |
| Observation clock | `observed_at` |
| Close fact | `fact_type = 'BATCH_CLOSED'` with `closed_at` from the explicit producer manifest keys below |

Approved columns:

| Column | Purpose |
| --- | --- |
| `import_batch_id` | Producer batch identity |
| `fact_type` | One of `ACCEPTED_ROW`, `TERMINAL_OUTCOME`, `BATCH_CLOSED`, `RETAINED_LEGACY_OBSERVATION` |
| `source_row` | Accepted or observed row identity; nullable only for batch close and retained legacy facts without row identity |
| `lead_run_id` | Required only for materialized terminal outcomes; nullable otherwise |
| `producer_result` | Producer result code used only for terminal mapping |
| `observed_at` | Time the approved observation was recorded |
| `closed_at` | Explicit producer batch close timestamp |

## Schema Alignment

The approved view is derived from these documented producer objects:

| Underlying object | View facts |
| --- | --- |
| `public.lead_input_rows` | `ACCEPTED_ROW` facts by `import_batch_id` and `source_row` |
| `public.lead_decisions` | `TERMINAL_OUTCOME` materialized facts for completed decisions |
| `public.lead_processing_state` | `TERMINAL_OUTCOME` blocked/failed facts from terminal row states |
| `public.lead_import_batches.import_manifest` | `BATCH_CLOSED` only when explicit close keys exist |
| `public.company_validation_runs` | `RETAINED_LEGACY_OBSERVATION` only; never acceptance or completion |

The close fact is intentionally narrow. A close is emitted only when the
producer persists both:

- `import_manifest.prospecta_batch_closed = "true"`
- `import_manifest.prospecta_batch_closed_at = "<ISO timestamp>"`

Without those explicit keys, the view emits no close fact and Prospecta cannot
claim `COMPLETED` or `INCOMPLETE`.

## Terminal Mapping

Unknown producer results are non-terminal.

| Underlying source | View producer result | Terminal class |
| --- | --- | --- |
| `lead_decisions.decision_status = 'COMPLETED'` | `LEAD_DECISION_SAVED` | `MATERIALIZED` |
| `lead_processing_state.status = 'SKIPPED'` and `last_stage ILIKE '%crm%'` | `CRM_REJECTED` | `BLOCKED` |
| `lead_processing_state.status = 'SKIPPED'` otherwise | `PRE_VALIDATION_BLOCKED` | `BLOCKED` |
| `lead_processing_state.status IN ('FAILED', 'DEAD_LETTER')` | `PROCESSING_FAILED` | `FAILED` |

`MATERIALIZED` requires a non-empty `lead_run_id`. `BLOCKED` and `FAILED` do
not expose a lead decision id.

## Deduplication

- Accepted rows deduplicate by `source_row`.
- Terminal outcomes deduplicate by `source_row` and terminal class.
- Duplicate close facts do not increment counts; consumers use one close fact.
- Retained legacy observations are informational only. They never prove durable
  acceptance, processing completion, failure, or confirmed zero counts.

## Non-Production DDL

The producer-owned adapter view DDL is stored at
`db/producer/001_batch_observation_source.sql`. Its rollback is
`db/producer/002_batch_observation_source_rollback.sql`.

These files are for producer-owner setup in disposable, non-production, or
separately approved production PostgreSQL targets. They must not be run by the
Prospecta app role. Production execution still requires the identified target,
backup/rollback owner, credential owner, deployment owner, and approval called
out in `AGENTS.md`.
