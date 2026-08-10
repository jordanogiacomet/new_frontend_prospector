-- App-owned company-name resolution for contact-enrichment-v2.
-- Search input is represented only by hashes. Provider company references and
-- normalized company profiles are encrypted; no provider payload is stored.

CREATE TABLE IF NOT EXISTS prospecting_app.contact_company_search_requests (
  search_request_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  actor_subject text NOT NULL,
  cnpj_normalizado text NOT NULL,
  idempotency_key_sha256 text NOT NULL,
  input_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'SEARCH_REQUEST_RECORDED',
  result_sha256 text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider_occurred_at timestamptz,
  matches_expires_at timestamptz,

  CONSTRAINT contact_company_search_requests_org_request_uk
    UNIQUE (organization_id, search_request_id),
  CONSTRAINT contact_company_search_requests_org_idempotency_uk
    UNIQUE (organization_id, idempotency_key_sha256),
  CONSTRAINT contact_company_search_requests_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_company_search_requests_actor_ck
    CHECK (prospecting_app.text_is_present(actor_subject, 256)),
  CONSTRAINT contact_company_search_requests_cnpj_ck
    CHECK (cnpj_normalizado ~ '^[0-9]{14}$'),
  CONSTRAINT contact_company_search_requests_idempotency_hash_ck
    CHECK (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_company_search_requests_input_hash_ck
    CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_company_search_requests_result_hash_ck
    CHECK (result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_company_search_requests_status_ck
    CHECK (
      status IN (
        'SEARCH_REQUEST_RECORDED',
        'SEARCH_DISPATCHED',
        'DISPATCH_OUTCOME_UNKNOWN',
        'SEARCH_AVAILABLE',
        'SEARCH_EMPTY',
        'SEARCH_FAILED',
        'PROVIDER_OUTCOME_UNKNOWN'
      )
    ),
  CONSTRAINT contact_company_search_requests_terminal_ck
    CHECK (
      (
        status IN (
          'SEARCH_REQUEST_RECORDED',
          'SEARCH_DISPATCHED',
          'DISPATCH_OUTCOME_UNKNOWN'
        )
        AND provider_occurred_at IS NULL
        AND result_sha256 IS NULL
        AND matches_expires_at IS NULL
      )
      OR (
        status IN (
          'SEARCH_EMPTY',
          'SEARCH_FAILED',
          'PROVIDER_OUTCOME_UNKNOWN'
        )
        AND provider_occurred_at IS NOT NULL
        AND result_sha256 IS NOT NULL
        AND matches_expires_at IS NULL
      )
      OR (
        status = 'SEARCH_AVAILABLE'
        AND provider_occurred_at IS NOT NULL
        AND result_sha256 IS NOT NULL
        AND matches_expires_at IS NOT NULL
      )
    ),
  CONSTRAINT contact_company_search_requests_time_ck
    CHECK (
      updated_at >= requested_at
      AND (
        matches_expires_at IS NULL
        OR matches_expires_at > provider_occurred_at
      )
    )
);

CREATE INDEX IF NOT EXISTS contact_company_search_requests_org_requested_idx
  ON prospecting_app.contact_company_search_requests (
    organization_id,
    requested_at DESC,
    search_request_id
  );

CREATE TABLE IF NOT EXISTS prospecting_app.contact_company_matches (
  company_match_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  search_request_id uuid NOT NULL,
  provider_ref_key_id text,
  provider_ref_nonce bytea,
  provider_ref_ciphertext bytea,
  provider_ref_auth_tag bytea,
  profile_key_id text,
  profile_nonce bytea,
  profile_ciphertext bytea,
  profile_auth_tag bytea,
  list_position integer NOT NULL,
  obtained_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  erased_at timestamptz,

  CONSTRAINT contact_company_matches_org_match_uk
    UNIQUE (organization_id, company_match_id),
  CONSTRAINT contact_company_matches_org_request_position_uk
    UNIQUE (organization_id, search_request_id, list_position),
  CONSTRAINT contact_company_matches_request_fk
    FOREIGN KEY (organization_id, search_request_id)
    REFERENCES prospecting_app.contact_company_search_requests (
      organization_id,
      search_request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_company_matches_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_company_matches_position_ck
    CHECK (list_position BETWEEN 1 AND 5),
  CONSTRAINT contact_company_matches_time_ck
    CHECK (
      expires_at > obtained_at
      AND (erased_at IS NULL OR erased_at >= obtained_at)
    ),
  CONSTRAINT contact_company_matches_provider_cipher_ck
    CHECK (
      (erased_at IS NULL AND num_nonnulls(
        provider_ref_key_id,
        provider_ref_nonce,
        provider_ref_ciphertext,
        provider_ref_auth_tag
      ) = 4)
      OR
      (erased_at IS NOT NULL AND num_nonnulls(
        provider_ref_key_id,
        provider_ref_nonce,
        provider_ref_ciphertext,
        provider_ref_auth_tag
      ) = 0)
    ),
  CONSTRAINT contact_company_matches_profile_cipher_ck
    CHECK (
      (erased_at IS NULL AND num_nonnulls(
        profile_key_id,
        profile_nonce,
        profile_ciphertext,
        profile_auth_tag
      ) = 4)
      OR
      (erased_at IS NOT NULL AND num_nonnulls(
        profile_key_id,
        profile_nonce,
        profile_ciphertext,
        profile_auth_tag
      ) = 0)
    )
);

CREATE INDEX IF NOT EXISTS contact_company_matches_org_request_idx
  ON prospecting_app.contact_company_matches (
    organization_id,
    search_request_id,
    list_position
  );

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ADD COLUMN IF NOT EXISTS company_match_id uuid;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ALTER COLUMN company_domain DROP NOT NULL;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP CONSTRAINT IF EXISTS contact_enrichment_v2_requests_domain_ck;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ADD CONSTRAINT contact_enrichment_v2_requests_domain_ck
  CHECK (
    company_domain IS NULL
    OR (
      char_length(company_domain) BETWEEN 4 AND 253
      AND company_domain = lower(company_domain)
      AND company_domain !~ '[/:?#@]'
    )
  );

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP CONSTRAINT IF EXISTS contact_enrichment_v2_requests_target_ck;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ADD CONSTRAINT contact_enrichment_v2_requests_target_ck
  CHECK (num_nonnulls(company_domain, company_match_id) = 1);

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  DROP CONSTRAINT IF EXISTS contact_enrichment_v2_requests_company_match_fk;

ALTER TABLE prospecting_app.contact_enrichment_v2_requests
  ADD CONSTRAINT contact_enrichment_v2_requests_company_match_fk
  FOREIGN KEY (organization_id, company_match_id)
  REFERENCES prospecting_app.contact_company_matches (
    organization_id,
    company_match_id
  )
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS prospecting_app.contact_company_search_events (
  event_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  search_request_id uuid NOT NULL,
  actor_category text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,

  CONSTRAINT contact_company_search_events_request_fk
    FOREIGN KEY (organization_id, search_request_id)
    REFERENCES prospecting_app.contact_company_search_requests (
      organization_id,
      search_request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_company_search_events_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_company_search_events_actor_ck
    CHECK (prospecting_app.text_is_present(actor_category, 256)),
  CONSTRAINT contact_company_search_events_type_ck
    CHECK (
      event_type IN (
        'COMPANY_SEARCH_REQUEST_RECORDED',
        'COMPANY_SEARCH_DISPATCH_RECORDED',
        'COMPANY_SEARCH_RESULT_RECORDED',
        'COMPANY_SEARCH_READ',
        'COMPANY_MATCH_CONFIRMED',
        'COMPANY_MATCH_DATA_ERASED'
      )
    )
);

CREATE INDEX IF NOT EXISTS contact_company_search_events_org_time_idx
  ON prospecting_app.contact_company_search_events (
    organization_id,
    occurred_at DESC,
    event_id
  );

DROP TRIGGER IF EXISTS contact_company_search_events_append_only
  ON prospecting_app.contact_company_search_events;
CREATE TRIGGER contact_company_search_events_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.contact_company_search_events
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();

REVOKE ALL ON TABLE
  prospecting_app.contact_company_search_requests,
  prospecting_app.contact_company_matches,
  prospecting_app.contact_company_search_events
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    GRANT SELECT, INSERT ON TABLE
      prospecting_app.contact_company_search_requests,
      prospecting_app.contact_company_matches,
      prospecting_app.contact_company_search_events
    TO prospecta_app_rw;

    GRANT UPDATE (
      status,
      result_sha256,
      updated_at,
      provider_occurred_at,
      matches_expires_at
    ) ON prospecting_app.contact_company_search_requests
    TO prospecta_app_rw;

    GRANT UPDATE (
      provider_ref_key_id,
      provider_ref_nonce,
      provider_ref_ciphertext,
      provider_ref_auth_tag,
      profile_key_id,
      profile_nonce,
      profile_ciphertext,
      profile_auth_tag,
      erased_at
    ) ON prospecting_app.contact_company_matches
    TO prospecta_app_rw;

    REVOKE UPDATE, DELETE ON TABLE
      prospecting_app.contact_company_search_events
    FROM prospecta_app_rw;
    REVOKE DELETE ON TABLE
      prospecting_app.contact_company_search_requests,
      prospecting_app.contact_company_matches
    FROM prospecta_app_rw;
  END IF;
END $$;
