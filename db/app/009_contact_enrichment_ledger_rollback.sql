-- Preserve app-owned enrichment history once any request or event exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM prospecting_app.contact_enrichment_requests
  ) OR EXISTS (
    SELECT 1 FROM prospecting_app.contact_enrichment_events
  ) THEN
    RAISE EXCEPTION
      'Cannot roll back contact enrichment ledger after history exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS contact_enrichment_events_append_only
  ON prospecting_app.contact_enrichment_events;
DROP TABLE IF EXISTS prospecting_app.contact_enrichment_events;
DROP TABLE IF EXISTS prospecting_app.contact_enrichment_requests;
