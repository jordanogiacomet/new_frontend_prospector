-- Prospecta X4 producer-owned batch observation adapter.
-- Target: producer PostgreSQL controlled by the producer owner.
-- This is not an app-owned migration and must not be executed by Prospecta.

CREATE OR REPLACE VIEW public.prospecta_import_batch_observations_v1 AS
SELECT
  rows.import_batch_id,
  'ACCEPTED_ROW'::text AS fact_type,
  rows.source_row,
  NULL::text AS lead_run_id,
  NULL::text AS producer_result,
  rows.first_seen_at AS observed_at,
  NULL::timestamptz AS closed_at
FROM public.lead_input_rows AS rows

UNION ALL

SELECT
  decisions.import_batch_id,
  'TERMINAL_OUTCOME'::text AS fact_type,
  decisions.source_row,
  decisions.lead_run_id,
  'LEAD_DECISION_SAVED'::text AS producer_result,
  decisions.created_at AS observed_at,
  NULL::timestamptz AS closed_at
FROM public.lead_decisions AS decisions
WHERE decisions.decision_status = 'COMPLETED'

UNION ALL

SELECT
  state.import_batch_id,
  'TERMINAL_OUTCOME'::text AS fact_type,
  state.source_row,
  NULL::text AS lead_run_id,
  CASE
    WHEN state.status = 'SKIPPED'::public.lead_processing_status
      AND state.last_stage ILIKE '%crm%'
      THEN 'CRM_REJECTED'
    WHEN state.status = 'SKIPPED'::public.lead_processing_status
      THEN 'PRE_VALIDATION_BLOCKED'
    WHEN state.status IN (
      'FAILED'::public.lead_processing_status,
      'DEAD_LETTER'::public.lead_processing_status
    )
      THEN 'PROCESSING_FAILED'
    ELSE NULL::text
  END AS producer_result,
  COALESCE(state.completed_at, state.failed_at, state.updated_at) AS observed_at,
  NULL::timestamptz AS closed_at
FROM public.lead_processing_state AS state
WHERE state.import_batch_id IS NOT NULL
  AND state.source_row IS NOT NULL
  AND state.status IN (
    'SKIPPED'::public.lead_processing_status,
    'FAILED'::public.lead_processing_status,
    'DEAD_LETTER'::public.lead_processing_status
  )

UNION ALL

SELECT
  batches.import_batch_id,
  'BATCH_CLOSED'::text AS fact_type,
  NULL::integer AS source_row,
  NULL::text AS lead_run_id,
  NULL::text AS producer_result,
  close_fact.closed_at AS observed_at,
  close_fact.closed_at
FROM public.lead_import_batches AS batches
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN batches.import_manifest ->> 'prospecta_batch_closed' = 'true'
      AND batches.import_manifest ->> 'prospecta_batch_closed_at'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
      THEN (batches.import_manifest ->> 'prospecta_batch_closed_at')::timestamptz
    ELSE NULL::timestamptz
  END AS closed_at
) AS close_fact
WHERE close_fact.closed_at IS NOT NULL

UNION ALL

SELECT
  legacy.import_batch_id,
  'RETAINED_LEGACY_OBSERVATION'::text AS fact_type,
  legacy.source_row,
  legacy.lead_run_id,
  NULL::text AS producer_result,
  COALESCE(legacy.run_created_at, legacy.created_at) AS observed_at,
  NULL::timestamptz AS closed_at
FROM public.company_validation_runs AS legacy
WHERE legacy.import_batch_id IS NOT NULL;

REVOKE ALL ON public.prospecta_import_batch_observations_v1 FROM PUBLIC;
