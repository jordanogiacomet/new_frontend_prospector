-- Receipt facts are retained when restoring the previous application release.
-- The lock, emptiness check and drop run in one transaction/statement.
DO $rollback$
BEGIN
  IF to_regclass('prospecting_app.import_received_companies') IS NULL THEN
    RETURN;
  END IF;

  LOCK TABLE prospecting_app.import_received_companies IN ACCESS EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM prospecting_app.import_received_companies) THEN
    RAISE EXCEPTION 'Import receipt facts must be retained. Restore the prior app release and keep migration 019.';
  END IF;

  DROP TABLE prospecting_app.import_received_companies;
END $rollback$;
