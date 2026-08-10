-- Disposable non-production rollback only. Refuse to erase the selector of an
-- existing preview request; operators must retain migration 011 once used.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM prospecting_app.contact_enrichment_v2_requests
    WHERE company_match_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'migration 011 rollback refused: confirmed company matches exist';
  END IF;
END $$;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP CONSTRAINT IF EXISTS contact_enrichment_v2_requests_company_match_fk;
ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP CONSTRAINT IF EXISTS contact_enrichment_v2_requests_target_ck;
ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP COLUMN IF EXISTS company_match_id;
ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ALTER COLUMN company_domain SET NOT NULL;

DROP TABLE IF EXISTS prospecting_app.contact_company_search_events;
DROP TABLE IF EXISTS prospecting_app.contact_company_matches;
DROP TABLE IF EXISTS prospecting_app.contact_company_search_requests;
