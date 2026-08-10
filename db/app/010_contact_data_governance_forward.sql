-- App-owned, encrypted contact data for contact-enrichment-v2.
-- No producer table, provider payload, plaintext contact value, or cascading
-- producer relationship is permitted here.

CREATE TABLE IF NOT EXISTS prospecting_app.contact_enrichment_v2_requests (
  request_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  actor_subject text NOT NULL,
  cnpj_normalizado text NOT NULL,
  company_domain text NOT NULL,
  idempotency_key_sha256 text NOT NULL,
  input_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'REQUEST_RECORDED',
  result_sha256 text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider_occurred_at timestamptz,
  preview_expires_at timestamptz,

  CONSTRAINT contact_enrichment_v2_requests_org_request_uk
    UNIQUE (organization_id, request_id),
  CONSTRAINT contact_enrichment_v2_requests_org_idempotency_uk
    UNIQUE (organization_id, idempotency_key_sha256),
  CONSTRAINT contact_enrichment_v2_requests_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_enrichment_v2_requests_actor_ck
    CHECK (prospecting_app.text_is_present(actor_subject, 256)),
  CONSTRAINT contact_enrichment_v2_requests_cnpj_ck
    CHECK (cnpj_normalizado ~ '^[0-9]{14}$'),
  CONSTRAINT contact_enrichment_v2_requests_domain_ck
    CHECK (
      char_length(company_domain) BETWEEN 4 AND 253
      AND company_domain = lower(company_domain)
      AND company_domain !~ '[/:?#@]'
    ),
  CONSTRAINT contact_enrichment_v2_requests_idempotency_hash_ck
    CHECK (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_enrichment_v2_requests_input_hash_ck
    CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_enrichment_v2_requests_result_hash_ck
    CHECK (result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_enrichment_v2_requests_status_ck
    CHECK (
      status IN (
        'REQUEST_RECORDED',
        'PREVIEW_DISPATCHED',
        'DISPATCH_OUTCOME_UNKNOWN',
        'PREVIEW_AVAILABLE',
        'PREVIEW_EMPTY',
        'PREVIEW_FAILED',
        'PROVIDER_OUTCOME_UNKNOWN'
      )
    ),
  CONSTRAINT contact_enrichment_v2_requests_terminal_ck
    CHECK (
      (
        status IN (
          'REQUEST_RECORDED',
          'PREVIEW_DISPATCHED',
          'DISPATCH_OUTCOME_UNKNOWN'
        )
        AND provider_occurred_at IS NULL
        AND result_sha256 IS NULL
        AND preview_expires_at IS NULL
      )
      OR (
        status IN (
          'PREVIEW_EMPTY',
          'PREVIEW_FAILED',
          'PROVIDER_OUTCOME_UNKNOWN'
        )
        AND provider_occurred_at IS NOT NULL
        AND result_sha256 IS NOT NULL
        AND preview_expires_at IS NULL
      )
      OR (
        status = 'PREVIEW_AVAILABLE'
        AND provider_occurred_at IS NOT NULL
        AND result_sha256 IS NOT NULL
        AND preview_expires_at IS NOT NULL
      )
    ),
  CONSTRAINT contact_enrichment_v2_requests_time_ck
    CHECK (
      updated_at >= requested_at
      AND (
        preview_expires_at IS NULL
        OR preview_expires_at > provider_occurred_at
      )
    )
);

CREATE INDEX IF NOT EXISTS contact_enrichment_v2_requests_org_requested_idx
  ON prospecting_app.contact_enrichment_v2_requests (
    organization_id,
    requested_at DESC,
    request_id
  );

CREATE TABLE IF NOT EXISTS prospecting_app.contact_candidates (
  contact_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  request_id uuid NOT NULL,
  provider_ref_hmac text NOT NULL,
  provider_ref_key_id text,
  provider_ref_nonce bytea,
  provider_ref_ciphertext bytea,
  provider_ref_auth_tag bytea,
  profile_key_id text,
  profile_nonce bytea,
  profile_ciphertext bytea,
  profile_auth_tag bytea,
  list_position integer NOT NULL,
  can_reveal_work_email boolean NOT NULL,
  can_reveal_business_phone boolean NOT NULL,
  obtained_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  suppressed_at timestamptz,
  erased_at timestamptz,

  CONSTRAINT contact_candidates_org_contact_uk
    UNIQUE (organization_id, contact_id),
  CONSTRAINT contact_candidates_org_request_provider_uk
    UNIQUE (organization_id, request_id, provider_ref_hmac),
  CONSTRAINT contact_candidates_request_fk
    FOREIGN KEY (organization_id, request_id)
    REFERENCES prospecting_app.contact_enrichment_v2_requests (
      organization_id,
      request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_candidates_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_candidates_provider_hmac_ck
    CHECK (provider_ref_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_candidates_position_ck
    CHECK (list_position BETWEEN 1 AND 10),
  CONSTRAINT contact_candidates_time_ck
    CHECK (
      expires_at > obtained_at
      AND (suppressed_at IS NULL OR suppressed_at >= obtained_at)
      AND (erased_at IS NULL OR erased_at >= obtained_at)
    ),
  CONSTRAINT contact_candidates_encrypted_provider_ck
    CHECK (
      (provider_ref_key_id IS NOT NULL
        AND provider_ref_nonce IS NOT NULL
        AND octet_length(provider_ref_nonce) = 12
        AND provider_ref_ciphertext IS NOT NULL
        AND provider_ref_auth_tag IS NOT NULL
        AND octet_length(provider_ref_auth_tag) = 16)
      OR
      (erased_at IS NOT NULL
        AND provider_ref_key_id IS NULL
        AND provider_ref_nonce IS NULL
        AND provider_ref_ciphertext IS NULL
        AND provider_ref_auth_tag IS NULL)
    ),
  CONSTRAINT contact_candidates_encrypted_profile_ck
    CHECK (
      (profile_key_id IS NOT NULL
        AND profile_nonce IS NOT NULL
        AND octet_length(profile_nonce) = 12
        AND profile_ciphertext IS NOT NULL
        AND profile_auth_tag IS NOT NULL
        AND octet_length(profile_auth_tag) = 16)
      OR
      (erased_at IS NOT NULL
        AND profile_key_id IS NULL
        AND profile_nonce IS NULL
        AND profile_ciphertext IS NULL
        AND profile_auth_tag IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS contact_candidates_org_request_position_idx
  ON prospecting_app.contact_candidates (
    organization_id,
    request_id,
    list_position,
    contact_id
  );

CREATE INDEX IF NOT EXISTS contact_candidates_expiry_idx
  ON prospecting_app.contact_candidates (expires_at, contact_id)
  WHERE erased_at IS NULL;

CREATE TABLE IF NOT EXISTS prospecting_app.contact_reveal_requests (
  reveal_request_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  request_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  actor_subject text NOT NULL,
  idempotency_key_sha256 text NOT NULL,
  input_sha256 text NOT NULL,
  requested_channels text[] NOT NULL,
  status text NOT NULL DEFAULT 'REQUEST_RECORDED',
  result_sha256 text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider_occurred_at timestamptz,

  CONSTRAINT contact_reveal_requests_org_reveal_uk
    UNIQUE (organization_id, reveal_request_id),
  CONSTRAINT contact_reveal_requests_org_idempotency_uk
    UNIQUE (organization_id, idempotency_key_sha256),
  CONSTRAINT contact_reveal_requests_candidate_fk
    FOREIGN KEY (organization_id, contact_id)
    REFERENCES prospecting_app.contact_candidates (
      organization_id,
      contact_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_reveal_requests_request_fk
    FOREIGN KEY (organization_id, request_id)
    REFERENCES prospecting_app.contact_enrichment_v2_requests (
      organization_id,
      request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_reveal_requests_actor_ck
    CHECK (prospecting_app.text_is_present(actor_subject, 256)),
  CONSTRAINT contact_reveal_requests_idempotency_ck
    CHECK (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_reveal_requests_input_ck
    CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_reveal_requests_result_ck
    CHECK (result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_reveal_requests_channels_ck
    CHECK (
      cardinality(requested_channels) BETWEEN 1 AND 2
      AND requested_channels <@ ARRAY['work_email', 'business_phone']::text[]
      AND (
        cardinality(requested_channels) = 1
        OR requested_channels[1] <> requested_channels[2]
      )
    ),
  CONSTRAINT contact_reveal_requests_status_ck
    CHECK (
      status IN (
        'REQUEST_RECORDED',
        'REVEAL_DISPATCHED',
        'DISPATCH_OUTCOME_UNKNOWN',
        'REVEAL_AVAILABLE',
        'REVEAL_EMPTY',
        'REVEAL_FAILED',
        'PROVIDER_OUTCOME_UNKNOWN'
      )
    ),
  CONSTRAINT contact_reveal_requests_terminal_ck
    CHECK (
      (
        status IN (
          'REQUEST_RECORDED',
          'REVEAL_DISPATCHED',
          'DISPATCH_OUTCOME_UNKNOWN'
        )
        AND provider_occurred_at IS NULL
        AND result_sha256 IS NULL
      )
      OR (
        status IN (
          'REVEAL_AVAILABLE',
          'REVEAL_EMPTY',
          'REVEAL_FAILED',
          'PROVIDER_OUTCOME_UNKNOWN'
        )
        AND provider_occurred_at IS NOT NULL
        AND result_sha256 IS NOT NULL
      )
    )
);

CREATE TABLE IF NOT EXISTS prospecting_app.contact_records (
  contact_record_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  contact_id uuid NOT NULL,
  reveal_request_id uuid NOT NULL,
  channel_data_key_id text,
  channel_data_nonce bytea,
  channel_data_ciphertext bytea,
  channel_data_auth_tag bytea,
  work_email_hmacs text[] NOT NULL DEFAULT ARRAY[]::text[],
  business_phone_hmacs text[] NOT NULL DEFAULT ARRAY[]::text[],
  obtained_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  suppressed_at timestamptz,
  erased_at timestamptz,

  CONSTRAINT contact_records_org_contact_uk
    UNIQUE (organization_id, contact_id),
  CONSTRAINT contact_records_candidate_fk
    FOREIGN KEY (organization_id, contact_id)
    REFERENCES prospecting_app.contact_candidates (
      organization_id,
      contact_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_records_reveal_fk
    FOREIGN KEY (organization_id, reveal_request_id)
    REFERENCES prospecting_app.contact_reveal_requests (
      organization_id,
      reveal_request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_records_email_hmacs_ck
    CHECK (
      cardinality(work_email_hmacs) = 0
      OR array_to_string(work_email_hmacs, ',')
        ~ '^[0-9a-f]{64}(,[0-9a-f]{64})?$'
    ),
  CONSTRAINT contact_records_phone_hmacs_ck
    CHECK (
      cardinality(business_phone_hmacs) = 0
      OR array_to_string(business_phone_hmacs, ',')
        ~ '^[0-9a-f]{64}(,[0-9a-f]{64})?$'
    ),
  CONSTRAINT contact_records_time_ck
    CHECK (
      expires_at > obtained_at
      AND (suppressed_at IS NULL OR suppressed_at >= obtained_at)
      AND (erased_at IS NULL OR erased_at >= obtained_at)
    ),
  CONSTRAINT contact_records_encrypted_ck
    CHECK (
      (channel_data_key_id IS NOT NULL
        AND channel_data_nonce IS NOT NULL
        AND octet_length(channel_data_nonce) = 12
        AND channel_data_ciphertext IS NOT NULL
        AND channel_data_auth_tag IS NOT NULL
        AND octet_length(channel_data_auth_tag) = 16)
      OR
      (erased_at IS NOT NULL
        AND channel_data_key_id IS NULL
        AND channel_data_nonce IS NULL
        AND channel_data_ciphertext IS NULL
        AND channel_data_auth_tag IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS contact_records_expiry_idx
  ON prospecting_app.contact_records (expires_at, contact_record_id)
  WHERE erased_at IS NULL;

CREATE TABLE IF NOT EXISTS prospecting_app.contact_suppressions (
  suppression_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  identity_kind text NOT NULL,
  identity_hmac text NOT NULL,
  channel_scope text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL,
  actor_category text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,

  CONSTRAINT contact_suppressions_org_identity_scope_uk
    UNIQUE (organization_id, identity_kind, identity_hmac, channel_scope),
  CONSTRAINT contact_suppressions_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_suppressions_identity_kind_ck
    CHECK (identity_kind IN ('provider', 'email', 'phone')),
  CONSTRAINT contact_suppressions_identity_hmac_ck
    CHECK (identity_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_suppressions_scope_ck
    CHECK (channel_scope IN ('all', 'email', 'phone')),
  CONSTRAINT contact_suppressions_reason_ck
    CHECK (
      reason IN (
        'DATA_SUBJECT_OPT_OUT',
        'DATA_SUBJECT_OBJECTION',
        'DO_NOT_CALL',
        'RIGHTS_ERASURE'
      )
    ),
  CONSTRAINT contact_suppressions_source_ck
    CHECK (source IN ('PROSPECTA', 'LUSHA')),
  CONSTRAINT contact_suppressions_actor_ck
    CHECK (prospecting_app.text_is_present(actor_category, 256)),
  CONSTRAINT contact_suppressions_time_ck
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS contact_suppressions_lookup_idx
  ON prospecting_app.contact_suppressions (
    organization_id,
    identity_kind,
    identity_hmac,
    channel_scope,
    expires_at
  );

CREATE TABLE IF NOT EXISTS prospecting_app.contact_rights_requests (
  rights_request_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  subject_reference_hmac text NOT NULL,
  request_type text NOT NULL,
  status text NOT NULL,
  actor_category text NOT NULL,
  received_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  resolved_at timestamptz,

  CONSTRAINT contact_rights_requests_org_request_uk
    UNIQUE (organization_id, rights_request_id),
  CONSTRAINT contact_rights_requests_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_rights_requests_subject_ck
    CHECK (subject_reference_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_rights_requests_type_ck
    CHECK (
      request_type IN (
        'CONFIRMATION',
        'ACCESS',
        'CORRECTION',
        'SOURCE_INFORMATION',
        'OPPOSITION',
        'BLOCK',
        'DELETION'
      )
    ),
  CONSTRAINT contact_rights_requests_status_ck
    CHECK (status IN ('OPEN', 'VERIFIED', 'RESOLVED', 'REJECTED')),
  CONSTRAINT contact_rights_requests_actor_ck
    CHECK (prospecting_app.text_is_present(actor_category, 256)),
  CONSTRAINT contact_rights_requests_time_ck
    CHECK (
      due_at >= received_at
      AND (resolved_at IS NULL OR resolved_at >= received_at)
      AND ((status IN ('RESOLVED', 'REJECTED')) = (resolved_at IS NOT NULL))
    )
);

CREATE TABLE IF NOT EXISTS prospecting_app.contact_governance_events (
  event_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  request_id uuid,
  contact_id uuid,
  reveal_request_id uuid,
  rights_request_id uuid,
  actor_category text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contact_governance_events_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_governance_events_actor_ck
    CHECK (prospecting_app.text_is_present(actor_category, 256)),
  CONSTRAINT contact_governance_events_type_ck
    CHECK (
      event_type IN (
        'PREVIEW_REQUEST_RECORDED',
        'PREVIEW_DISPATCH_RECORDED',
        'PREVIEW_RESULT_RECORDED',
        'PREVIEW_READ',
        'REVEAL_REQUEST_RECORDED',
        'REVEAL_DISPATCH_RECORDED',
        'REVEAL_RESULT_RECORDED',
        'CONTACT_READ',
        'SUPPRESSION_RECORDED',
        'CONTACT_ERASED',
        'RIGHTS_REQUEST_RECORDED',
        'RIGHTS_REQUEST_RESOLVED'
      )
    ),
  CONSTRAINT contact_governance_events_request_fk
    FOREIGN KEY (organization_id, request_id)
    REFERENCES prospecting_app.contact_enrichment_v2_requests (
      organization_id,
      request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_governance_events_contact_fk
    FOREIGN KEY (organization_id, contact_id)
    REFERENCES prospecting_app.contact_candidates (
      organization_id,
      contact_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_governance_events_reveal_fk
    FOREIGN KEY (organization_id, reveal_request_id)
    REFERENCES prospecting_app.contact_reveal_requests (
      organization_id,
      reveal_request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_governance_events_rights_fk
    FOREIGN KEY (organization_id, rights_request_id)
    REFERENCES prospecting_app.contact_rights_requests (
      organization_id,
      rights_request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS contact_governance_events_org_time_idx
  ON prospecting_app.contact_governance_events (
    organization_id,
    occurred_at DESC,
    event_id
  );

DROP TRIGGER IF EXISTS contact_governance_events_append_only
  ON prospecting_app.contact_governance_events;
CREATE TRIGGER contact_governance_events_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.contact_governance_events
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();

REVOKE ALL ON TABLE
  prospecting_app.contact_enrichment_v2_requests,
  prospecting_app.contact_candidates,
  prospecting_app.contact_reveal_requests,
  prospecting_app.contact_records,
  prospecting_app.contact_suppressions,
  prospecting_app.contact_rights_requests,
  prospecting_app.contact_governance_events
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    REVOKE ALL ON TABLE
      prospecting_app.contact_enrichment_v2_requests,
      prospecting_app.contact_candidates,
      prospecting_app.contact_reveal_requests,
      prospecting_app.contact_records,
      prospecting_app.contact_suppressions,
      prospecting_app.contact_rights_requests,
      prospecting_app.contact_governance_events
    FROM prospecta_app_rw;

    GRANT SELECT, INSERT ON TABLE
      prospecting_app.contact_enrichment_v2_requests,
      prospecting_app.contact_candidates,
      prospecting_app.contact_reveal_requests,
      prospecting_app.contact_records,
      prospecting_app.contact_suppressions,
      prospecting_app.contact_rights_requests,
      prospecting_app.contact_governance_events
    TO prospecta_app_rw;

    GRANT UPDATE (
      status,
      result_sha256,
      updated_at,
      provider_occurred_at,
      preview_expires_at
    ) ON prospecting_app.contact_enrichment_v2_requests
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
      can_reveal_work_email,
      can_reveal_business_phone,
      suppressed_at,
      erased_at
    ) ON prospecting_app.contact_candidates
    TO prospecta_app_rw;

    GRANT UPDATE (
      status,
      result_sha256,
      updated_at,
      provider_occurred_at
    ) ON prospecting_app.contact_reveal_requests
    TO prospecta_app_rw;

    GRANT UPDATE (
      reveal_request_id,
      channel_data_key_id,
      channel_data_nonce,
      channel_data_ciphertext,
      channel_data_auth_tag,
      work_email_hmacs,
      business_phone_hmacs,
      obtained_at,
      expires_at,
      suppressed_at,
      erased_at
    ) ON prospecting_app.contact_records
    TO prospecta_app_rw;

    GRANT UPDATE (
      reason,
      source,
      actor_category,
      created_at,
      expires_at
    ) ON prospecting_app.contact_suppressions
    TO prospecta_app_rw;

    GRANT UPDATE (status, actor_category, resolved_at)
      ON prospecting_app.contact_rights_requests
    TO prospecta_app_rw;

    REVOKE DELETE ON ALL TABLES IN SCHEMA prospecting_app
    FROM prospecta_app_rw;
    REVOKE UPDATE, DELETE ON TABLE
      prospecting_app.contact_governance_events
    FROM prospecta_app_rw;

    -- Narrow deletion exists only for the five-year suppression-retention job.
    -- Application queries still scope deletion by organization and expiry.
    GRANT DELETE ON TABLE prospecting_app.contact_suppressions
    TO prospecta_app_rw;
  END IF;
END $$;
