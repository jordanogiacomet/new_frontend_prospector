-- Organization-scoped cache and durable generation claim for validated
-- customer-facing approach drafts. Strategic reports, prompts, provider
-- payloads and raw responses are intentionally absent from this schema.

CREATE TABLE IF NOT EXISTS prospecting_app.lead_approach_drafts (
  approach_draft_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  cnpj_normalizado text NOT NULL,
  observed_lead_run_id text NOT NULL,
  generator_version text NOT NULL,
  status text NOT NULL,
  generation_attempt_id uuid,
  message text,
  requested_by_subject text NOT NULL,
  lease_expires_at timestamptz,
  retry_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_approach_drafts_identity_uk
    UNIQUE (
      organization_id,
      cnpj_normalizado,
      observed_lead_run_id,
      generator_version
    ),
  CONSTRAINT lead_approach_drafts_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT lead_approach_drafts_cnpj_ck
    CHECK (cnpj_normalizado ~ '^[0-9]{14}$'),
  CONSTRAINT lead_approach_drafts_run_ck
    CHECK (observed_lead_run_id ~ '^lr_([0-9a-f]{8}|[0-9a-f]{64})$'),
  CONSTRAINT lead_approach_drafts_generator_ck
    CHECK (prospecting_app.text_is_present(generator_version, 64)),
  CONSTRAINT lead_approach_drafts_subject_ck
    CHECK (prospecting_app.text_is_present(requested_by_subject, 256)),
  CONSTRAINT lead_approach_drafts_time_ck
    CHECK (updated_at >= created_at),
  CONSTRAINT lead_approach_drafts_state_ck
    CHECK (
      (
        status = 'GENERATING'
        AND generation_attempt_id IS NOT NULL
        AND message IS NULL
        AND lease_expires_at IS NOT NULL
        AND retry_after IS NULL
      )
      OR
      (
        status = 'READY'
        AND generation_attempt_id IS NULL
        AND prospecting_app.text_is_present(message, 1600)
        AND lease_expires_at IS NULL
        AND retry_after IS NULL
      )
      OR
      (
        status = 'FAILED'
        AND generation_attempt_id IS NULL
        AND message IS NULL
        AND lease_expires_at IS NULL
        AND retry_after IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS lead_approach_drafts_retry_idx
  ON prospecting_app.lead_approach_drafts (
    organization_id,
    status,
    retry_after,
    lease_expires_at
  )
  WHERE status IN ('GENERATING', 'FAILED');

REVOKE ALL ON TABLE prospecting_app.lead_approach_drafts FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    GRANT SELECT, INSERT ON TABLE
      prospecting_app.lead_approach_drafts
    TO prospecta_app_rw;

    GRANT UPDATE (
      status,
      generation_attempt_id,
      message,
      requested_by_subject,
      lease_expires_at,
      retry_after,
      updated_at
    ) ON prospecting_app.lead_approach_drafts
    TO prospecta_app_rw;

    REVOKE DELETE ON TABLE
      prospecting_app.lead_approach_drafts
    FROM prospecta_app_rw;
  END IF;
END $$;

