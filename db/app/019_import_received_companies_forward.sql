-- App-owned received-row facts from the authenticated import callback.
-- A receipt is not durable producer acceptance or completed analysis.
-- Company names, CNPJ, raw rows and producer payloads are never stored here.

CREATE TABLE IF NOT EXISTS prospecting_app.import_received_companies (
  organization_id text NOT NULL,
  submission_id uuid NOT NULL,
  source_row bigint NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_received_companies_pk
    PRIMARY KEY (organization_id, submission_id, source_row),
  CONSTRAINT import_received_companies_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT import_received_companies_source_row_ck
    CHECK (source_row > 0 AND source_row <= 9007199254740991),
  CONSTRAINT import_received_companies_submission_fk
    FOREIGN KEY (organization_id, submission_id)
    REFERENCES prospecting_app.import_submissions (organization_id, submission_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS import_received_companies_append_only
  ON prospecting_app.import_received_companies;
CREATE TRIGGER import_received_companies_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.import_received_companies
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();

REVOKE ALL ON TABLE prospecting_app.import_received_companies FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    REVOKE ALL ON TABLE prospecting_app.import_received_companies
    FROM prospecta_app_rw;
    GRANT SELECT, INSERT ON TABLE prospecting_app.import_received_companies
    TO prospecta_app_rw;
  END IF;
END $$;
