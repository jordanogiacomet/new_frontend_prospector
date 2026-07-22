-- Allow distinct app submissions to correlate to the same canonical producer
-- batch. Apply only to an approved app-owned non-production target first.

DROP INDEX IF EXISTS prospecting_app.import_submissions_org_producer_batch_uk;

CREATE INDEX IF NOT EXISTS import_submissions_org_producer_batch_idx
  ON prospecting_app.import_submissions (
    organization_id,
    producer_import_batch_id
  )
  WHERE producer_import_batch_id IS NOT NULL;
