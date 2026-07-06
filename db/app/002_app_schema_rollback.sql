-- Prospecta app-owned schema rollback.
-- Drops only objects created by 001_app_schema_forward.sql.

DROP TABLE IF EXISTS prospecting_app.commercial_audit_events;
DROP TABLE IF EXISTS prospecting_app.lead_notes;
DROP TABLE IF EXISTS prospecting_app.lead_activities;
DROP TABLE IF EXISTS prospecting_app.lead_workspaces;
DROP TABLE IF EXISTS prospecting_app.import_submission_events;
DROP TABLE IF EXISTS prospecting_app.import_submissions;

DROP FUNCTION IF EXISTS prospecting_app.reject_append_only_mutation();
DROP FUNCTION IF EXISTS prospecting_app.jsonb_has_only_keys(jsonb, text[]);
DROP FUNCTION IF EXISTS prospecting_app.text_is_present(text, integer);

DROP SCHEMA IF EXISTS prospecting_app;
