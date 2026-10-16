-- Encrypted request-scoped corporate-phone fallback for contact-enrichment-v2.
-- The normalized number never appears in a plaintext column, audit event or
-- producer-owned object.

CREATE TABLE IF NOT EXISTS prospecting_app.contact_company_phone_fallbacks (
  request_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  phone_hmac text NOT NULL,
  phone_data_key_id text,
  phone_data_nonce bytea,
  phone_data_ciphertext bytea,
  phone_data_auth_tag bytea,
  obtained_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  erased_at timestamptz,

  CONSTRAINT contact_company_phone_fallbacks_org_request_uk
    UNIQUE (organization_id, request_id),
  CONSTRAINT contact_company_phone_fallbacks_request_fk
    FOREIGN KEY (organization_id, request_id)
    REFERENCES prospecting_app.contact_enrichment_v2_requests (
      organization_id,
      request_id
    )
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT contact_company_phone_fallbacks_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT contact_company_phone_fallbacks_hmac_ck
    CHECK (phone_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT contact_company_phone_fallbacks_time_ck
    CHECK (
      expires_at > obtained_at
      AND (erased_at IS NULL OR erased_at >= obtained_at)
    ),
  CONSTRAINT contact_company_phone_fallbacks_cipher_ck
    CHECK (
      (erased_at IS NULL AND num_nonnulls(
        phone_data_key_id,
        phone_data_nonce,
        phone_data_ciphertext,
        phone_data_auth_tag
      ) = 4
        AND octet_length(phone_data_nonce) = 12
        AND octet_length(phone_data_auth_tag) = 16)
      OR
      (erased_at IS NOT NULL AND num_nonnulls(
        phone_data_key_id,
        phone_data_nonce,
        phone_data_ciphertext,
        phone_data_auth_tag
      ) = 0)
    )
);

CREATE INDEX IF NOT EXISTS contact_company_phone_fallbacks_expiry_idx
  ON prospecting_app.contact_company_phone_fallbacks (
    organization_id,
    expires_at,
    request_id
  )
  WHERE erased_at IS NULL;

REVOKE ALL ON TABLE
  prospecting_app.contact_company_phone_fallbacks
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    GRANT SELECT, INSERT ON TABLE
      prospecting_app.contact_company_phone_fallbacks
    TO prospecta_app_rw;

    GRANT UPDATE (
      phone_data_key_id,
      phone_data_nonce,
      phone_data_ciphertext,
      phone_data_auth_tag,
      erased_at
    ) ON prospecting_app.contact_company_phone_fallbacks
    TO prospecta_app_rw;

    REVOKE DELETE ON TABLE
      prospecting_app.contact_company_phone_fallbacks
    FROM prospecta_app_rw;
  END IF;
END $$;
