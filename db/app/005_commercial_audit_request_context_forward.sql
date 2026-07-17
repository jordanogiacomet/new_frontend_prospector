-- Prospecta commercial audit request-context hardening.
-- Target: local or approved non-production PostgreSQL only.
-- Historical append-only rows remain unchanged; NOT VALID constraints require
-- complete allowlisted context on every new audit event.

ALTER TABLE prospecting_app.commercial_audit_events
  ADD COLUMN actor_issuer text,
  ADD COLUMN request_correlation_id uuid,
  ADD COLUMN authorization_basis text;

ALTER TABLE prospecting_app.commercial_audit_events
  ADD CONSTRAINT commercial_audit_events_actor_issuer_ck
    CHECK (
      actor_issuer IS NOT NULL
      AND prospecting_app.text_is_present(actor_issuer, 2048)
    ) NOT VALID,
  ADD CONSTRAINT commercial_audit_events_request_correlation_id_ck
    CHECK (request_correlation_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT commercial_audit_events_authorization_basis_ck
    CHECK (
      authorization_basis IS NOT NULL
      AND authorization_basis IN ('verified_oidc', 'local_demo2', 'local_demo3')
    ) NOT VALID,
  ADD CONSTRAINT commercial_audit_events_authorization_origin_ck
    CHECK (
      authorization_basis = CASE actor_issuer
        WHEN 'urn:prospecta:local-demo' THEN 'local_demo3'
        WHEN 'urn:prospecta:local-development' THEN 'local_demo2'
        ELSE 'verified_oidc'
      END
    ) NOT VALID;

CREATE INDEX IF NOT EXISTS commercial_audit_events_org_correlation_idx
  ON prospecting_app.commercial_audit_events (
    organization_id,
    request_correlation_id,
    occurred_at DESC
  );
