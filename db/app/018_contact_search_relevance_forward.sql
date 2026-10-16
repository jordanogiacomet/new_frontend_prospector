-- Distinguish a non-empty provider sample without commercially relevant profiles.
-- The additional fact applies only to contact preview, never company matching.

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
            'RESULTS_FOUND', 'NO_MATCHES', 'NO_RELEVANT_MATCHES',
            'ACCESS_DENIED', 'RATE_LIMITED',
            'PROVIDER_ERROR', 'INVALID_RESPONSE', 'TIMEOUT', 'OUTCOME_UNKNOWN',
            'DOMAIN_UNAVAILABLE', 'COMPANY_NOT_CONFIRMED', 'NOT_ATTEMPTED'
          )
          AND (item->>'code' <> 'NO_RELEVANT_MATCHES'
            OR item->>'stage' = 'CONTACT_PREVIEW'), false))
      FROM jsonb_array_elements(diagnostics) AS entries(item)
    )
END;
$$;

REVOKE ALL ON FUNCTION
  prospecting_app.contact_search_diagnostics_are_valid(jsonb, boolean)
FROM PUBLIC;
