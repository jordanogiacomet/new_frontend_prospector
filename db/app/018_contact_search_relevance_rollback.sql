-- Restore the previous validator only when every recorded fact remains valid.
-- Otherwise restore the prior app release and retain migration 018 and its facts.
-- Lock and replace inside one statement to prevent concurrent new-code writes.
DO $rollback$
BEGIN
  LOCK TABLE prospecting_app.contact_enrichment_v2_requests,
    prospecting_app.contact_company_search_requests IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1 FROM prospecting_app.contact_enrichment_v2_requests
    WHERE search_diagnostics @> '[{"code":"NO_RELEVANT_MATCHES"}]'::jsonb
  ) OR EXISTS (
    SELECT 1 FROM prospecting_app.contact_company_search_requests
    WHERE search_diagnostics @> '[{"code":"NO_RELEVANT_MATCHES"}]'::jsonb
  ) THEN
    RAISE EXCEPTION 'Recorded contact-search relevance facts must be retained. Restore the prior app release and keep migration 018.';
  END IF;

  EXECUTE $definition$
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
  $definition$;
END $rollback$;
