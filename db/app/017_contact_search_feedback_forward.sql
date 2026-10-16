-- PII-free provider facts committed with the existing terminal result.
-- No producer source, audit payload or provider response body is copied here.

CREATE OR REPLACE FUNCTION prospecting_app.contact_search_diagnostics_are_valid(
  diagnostics jsonb,
  company_search boolean
) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN diagnostics IS NULL THEN true
    WHEN jsonb_typeof(diagnostics) <> 'array' THEN false
    WHEN jsonb_array_length(diagnostics) NOT BETWEEN 1 AND 4 THEN false
    ELSE (
      SELECT
        count(*) = count(DISTINCT (item->>'provider', item->>'stage'))
        AND bool_and(COALESCE(
          jsonb_typeof(item) = 'object'
          AND item - ARRAY['provider', 'stage', 'code'] = '{}'::jsonb
          AND jsonb_typeof(item->'provider') = 'string'
          AND jsonb_typeof(item->'stage') = 'string'
          AND jsonb_typeof(item->'code') = 'string'
          AND (
            (company_search AND item->>'provider' = 'LUSHA'
              AND item->>'stage' = 'COMPANY_SEARCH')
            OR (NOT company_search AND (
              (item->>'provider' = 'LUSHA' AND item->>'stage' = 'CONTACT_PREVIEW')
              OR (item->>'provider' = 'APOLLO'
                AND item->>'stage' IN ('COMPANY_MATCH', 'CONTACT_PREVIEW'))
            ))
          )
          AND item->>'code' IN (
            'RESULTS_FOUND', 'NO_MATCHES', 'ACCESS_DENIED', 'RATE_LIMITED',
            'PROVIDER_ERROR', 'INVALID_RESPONSE', 'TIMEOUT', 'OUTCOME_UNKNOWN',
            'DOMAIN_UNAVAILABLE', 'COMPANY_NOT_CONFIRMED', 'NOT_ATTEMPTED'
          ), false))
      FROM jsonb_array_elements(diagnostics) AS entries(item)
    )
END;
$$;

REVOKE ALL ON FUNCTION
  prospecting_app.contact_search_diagnostics_are_valid(jsonb, boolean)
FROM PUBLIC;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ADD COLUMN IF NOT EXISTS search_diagnostics jsonb;
ALTER TABLE prospecting_app.contact_company_search_requests
  ADD COLUMN IF NOT EXISTS search_diagnostics jsonb;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP CONSTRAINT IF EXISTS contact_enrichment_v2_requests_diagnostics_ck;
ALTER TABLE prospecting_app.contact_company_search_requests
  DROP CONSTRAINT IF EXISTS contact_company_search_requests_diagnostics_ck;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ADD CONSTRAINT contact_enrichment_v2_requests_diagnostics_ck
  CHECK (prospecting_app.contact_search_diagnostics_are_valid(search_diagnostics, false));
ALTER TABLE prospecting_app.contact_company_search_requests
  ADD CONSTRAINT contact_company_search_requests_diagnostics_ck
  CHECK (prospecting_app.contact_search_diagnostics_are_valid(search_diagnostics, true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    GRANT EXECUTE ON FUNCTION
      prospecting_app.contact_search_diagnostics_are_valid(jsonb, boolean)
    TO prospecta_app_rw;
    GRANT UPDATE (search_diagnostics) ON
      prospecting_app.contact_enrichment_v2_requests,
      prospecting_app.contact_company_search_requests
    TO prospecta_app_rw;
  END IF;
END $$;
