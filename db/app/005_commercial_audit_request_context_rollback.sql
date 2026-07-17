-- Roll back only the commercial audit request-context schema addition.
-- Existing append-only audit rows are never rewritten or deleted.

DROP INDEX IF EXISTS prospecting_app.commercial_audit_events_org_correlation_idx;

ALTER TABLE prospecting_app.commercial_audit_events
  DROP CONSTRAINT commercial_audit_events_actor_issuer_ck,
  DROP CONSTRAINT commercial_audit_events_request_correlation_id_ck,
  DROP CONSTRAINT commercial_audit_events_authorization_basis_ck,
  DROP CONSTRAINT commercial_audit_events_authorization_origin_ck,
  DROP COLUMN actor_issuer,
  DROP COLUMN request_correlation_id,
  DROP COLUMN authorization_basis;
