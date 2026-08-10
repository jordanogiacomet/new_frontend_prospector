-- PII-free app-owned contact-enrichment request ledger for Demo 3.
-- Contact and provider values are intentionally absent from this schema.

CREATE TABLE IF NOT EXISTS prospecting_app.contact_enrichment_requests (
  request_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  actor_subject text NOT NULL,
  idempotency_key_sha256 text NOT NULL,
  input_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'REQUEST_RECORDED',
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider_occurred_at timestamptz,

  CONSTRAINT contact_enrichment_requests_org_request_uk
    UNIQUE (organization_id, request_id),
  CONSTRAINT contact_enrichment_requests_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_enrichment_requests_actor_subject_ck
    CHECK (prospecting_app.text_is_present(actor_subject, 256)),
  CONSTRAINT contact_enrichment_requests_idempotency_hash_ck
    CHECK (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_enrichment_requests_input_hash_ck
    CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_enrichment_requests_status_ck
    CHECK (
      status IN (
        'REQUEST_RECORDED',
        'ENRICHMENT_DISPATCHED',
        'DISPATCH_OUTCOME_UNKNOWN',
        'COMPLETED_WITHHELD',
        'PROVIDER_OUTCOME_UNKNOWN'
      )
    ),
  CONSTRAINT contact_enrichment_requests_provider_state_ck
    CHECK (
      (
        status IN (
          'REQUEST_RECORDED',
          'ENRICHMENT_DISPATCHED',
          'DISPATCH_OUTCOME_UNKNOWN'
        )
        AND provider_occurred_at IS NULL
      )
      OR (
        status IN ('COMPLETED_WITHHELD', 'PROVIDER_OUTCOME_UNKNOWN')
        AND provider_occurred_at IS NOT NULL
      )
    ),
  CONSTRAINT contact_enrichment_requests_timestamps_ck
    CHECK (updated_at >= requested_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS
  contact_enrichment_requests_org_idempotency_hash_uk
  ON prospecting_app.contact_enrichment_requests (
    organization_id,
    idempotency_key_sha256
  );

CREATE INDEX IF NOT EXISTS contact_enrichment_requests_org_requested_idx
  ON prospecting_app.contact_enrichment_requests (
    organization_id,
    requested_at DESC,
    request_id
  );

CREATE TABLE IF NOT EXISTS prospecting_app.contact_enrichment_events (
  event_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  request_id uuid NOT NULL,
  actor_category text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contact_enrichment_events_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_enrichment_events_actor_category_ck
    CHECK (prospecting_app.text_is_present(actor_category, 256)),
  CONSTRAINT contact_enrichment_events_event_type_ck
    CHECK (
      event_type IN (
        'REQUEST_RECORDED',
        'ENRICHMENT_DISPATCHED',
        'DISPATCH_OUTCOME_UNKNOWN',
        'COMPLETED_WITHHELD',
        'PROVIDER_OUTCOME_UNKNOWN'
      )
    ),
  CONSTRAINT contact_enrichment_events_request_fk
    FOREIGN KEY (organization_id, request_id)
    REFERENCES prospecting_app.contact_enrichment_requests (
      organization_id,
      request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS contact_enrichment_events_org_request_occurred_idx
  ON prospecting_app.contact_enrichment_events (
    organization_id,
    request_id,
    occurred_at,
    event_id
  );

DROP TRIGGER IF EXISTS contact_enrichment_events_append_only
  ON prospecting_app.contact_enrichment_events;
CREATE TRIGGER contact_enrichment_events_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.contact_enrichment_events
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();

REVOKE ALL ON TABLE
  prospecting_app.contact_enrichment_requests,
  prospecting_app.contact_enrichment_events
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    REVOKE ALL ON TABLE
      prospecting_app.contact_enrichment_requests,
      prospecting_app.contact_enrichment_events
    FROM prospecta_app_rw;

    GRANT SELECT, INSERT ON TABLE
      prospecting_app.contact_enrichment_requests
    TO prospecta_app_rw;

    GRANT UPDATE (status, updated_at, provider_occurred_at) ON TABLE
      prospecting_app.contact_enrichment_requests
    TO prospecta_app_rw;

    GRANT SELECT, INSERT ON TABLE
      prospecting_app.contact_enrichment_events
    TO prospecta_app_rw;

    REVOKE DELETE ON ALL TABLES IN SCHEMA prospecting_app
    FROM prospecta_app_rw;
    REVOKE UPDATE, DELETE ON TABLE
      prospecting_app.contact_enrichment_events
    FROM prospecta_app_rw;
  END IF;
END $$;
