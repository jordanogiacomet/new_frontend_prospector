-- Prospecta app-owned grants and role assumptions.
-- Roles are provisioned outside this migration. This file only grants access
-- inside prospecting_app when the expected runtime role already exists.

REVOKE ALL ON SCHEMA prospecting_app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA prospecting_app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA prospecting_app FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    GRANT USAGE ON SCHEMA prospecting_app TO prospecta_app_rw;

    GRANT SELECT, INSERT, UPDATE ON TABLE
      prospecting_app.import_submissions,
      prospecting_app.lead_workspaces
    TO prospecta_app_rw;

    GRANT SELECT, INSERT ON TABLE
      prospecting_app.import_submission_events
    TO prospecta_app_rw;

    GRANT SELECT, INSERT ON TABLE
      prospecting_app.lead_activities
    TO prospecta_app_rw;

    GRANT SELECT, INSERT ON TABLE
      prospecting_app.lead_notes
    TO prospecta_app_rw;

    GRANT SELECT, INSERT ON TABLE
      prospecting_app.commercial_audit_events
    TO prospecta_app_rw;

    GRANT EXECUTE ON FUNCTION
      prospecting_app.text_is_present(text, integer),
      prospecting_app.jsonb_has_only_keys(jsonb, text[])
    TO prospecta_app_rw;

    REVOKE DELETE ON ALL TABLES IN SCHEMA prospecting_app FROM prospecta_app_rw;
    REVOKE UPDATE, DELETE ON TABLE
      prospecting_app.import_submission_events,
      prospecting_app.lead_activities,
      prospecting_app.lead_notes,
      prospecting_app.commercial_audit_events
    FROM prospecta_app_rw;
  END IF;
END $$;
