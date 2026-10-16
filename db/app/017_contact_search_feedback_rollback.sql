-- Restore the previous application release without erasing recorded facts.
-- An unused migration may be removed; populated diagnosis ledgers are retained.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM prospecting_app.contact_enrichment_v2_requests
    WHERE search_diagnostics IS NOT NULL)
    OR EXISTS (SELECT 1 FROM prospecting_app.contact_company_search_requests
      WHERE search_diagnostics IS NOT NULL) THEN
    RAISE EXCEPTION 'Recorded contact-search facts must be retained. Restore the prior app release and keep migration 017.';
  END IF;
END $$;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP COLUMN search_diagnostics;
ALTER TABLE prospecting_app.contact_company_search_requests
  DROP COLUMN search_diagnostics;
DROP FUNCTION prospecting_app.contact_search_diagnostics_are_valid(jsonb, boolean);
