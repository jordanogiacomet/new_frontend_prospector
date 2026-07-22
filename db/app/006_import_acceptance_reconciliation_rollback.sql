-- Restore the original uniqueness rule only when existing facts permit it.
-- No app-owned submission or audit history is removed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM prospecting_app.import_submissions
    WHERE producer_import_batch_id IS NOT NULL
    GROUP BY organization_id, producer_import_batch_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'rollback refused: canonical producer batches have multiple app submissions'
      USING ERRCODE = '23505';
  END IF;
END
$$;

DROP INDEX IF EXISTS prospecting_app.import_submissions_org_producer_batch_idx;

CREATE UNIQUE INDEX IF NOT EXISTS import_submissions_org_producer_batch_uk
  ON prospecting_app.import_submissions (
    organization_id,
    producer_import_batch_id
  )
  WHERE producer_import_batch_id IS NOT NULL;
