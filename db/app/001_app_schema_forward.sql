-- Prospecta app-owned schema forward migration.
-- Target: local or approved non-production PostgreSQL only.

CREATE SCHEMA IF NOT EXISTS prospecting_app;

CREATE OR REPLACE FUNCTION prospecting_app.text_is_present(
  candidate text,
  maximum_length integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT candidate = btrim(candidate)
    AND char_length(candidate) BETWEEN 1 AND maximum_length;
$$;

CREATE OR REPLACE FUNCTION prospecting_app.jsonb_has_only_keys(
  candidate jsonb,
  allowed_keys text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT jsonb_typeof(candidate) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(candidate) AS key_name(key)
      WHERE NOT key_name.key = ANY (allowed_keys)
    );
$$;

CREATE OR REPLACE FUNCTION prospecting_app.reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'prospecting_app append-only relation cannot be updated or deleted'
    USING ERRCODE = '42501';
END;
$$;

CREATE TABLE IF NOT EXISTS prospecting_app.import_submissions (
  submission_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  created_by_subject text NOT NULL,
  original_filename text NOT NULL,
  file_sha256 char(64) NOT NULL,
  file_size_bytes bigint NOT NULL,
  content_type text NOT NULL,
  idempotency_key text NOT NULL,
  app_contract_version text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  producer_acknowledged_at timestamptz,
  durable_accepted_at timestamptz,
  producer_import_batch_id text,
  acknowledged_row_count integer,
  durable_accepted_row_count integer,
  status text NOT NULL DEFAULT 'SUBMISSION_RECORDED',
  status_fact_source text NOT NULL DEFAULT 'app_submission',
  last_observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT import_submissions_org_submission_uk
    UNIQUE (organization_id, submission_id),
  CONSTRAINT import_submissions_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT import_submissions_created_by_subject_ck
    CHECK (prospecting_app.text_is_present(created_by_subject, 256)),
  CONSTRAINT import_submissions_original_filename_ck
    CHECK (
      prospecting_app.text_is_present(original_filename, 255)
      AND position('/' in original_filename) = 0
      AND position(chr(92) in original_filename) = 0
    ),
  CONSTRAINT import_submissions_file_sha256_ck
    CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT import_submissions_file_size_bytes_ck
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  CONSTRAINT import_submissions_content_type_ck
    CHECK (
      content_type IN (
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel'
      )
    ),
  CONSTRAINT import_submissions_idempotency_key_ck
    CHECK (prospecting_app.text_is_present(idempotency_key, 128)),
  CONSTRAINT import_submissions_app_contract_version_ck
    CHECK (prospecting_app.text_is_present(app_contract_version, 64)),
  CONSTRAINT import_submissions_producer_import_batch_id_ck
    CHECK (prospecting_app.text_is_present(producer_import_batch_id, 128)),
  CONSTRAINT import_submissions_acknowledged_row_count_ck
    CHECK (acknowledged_row_count >= 0),
  CONSTRAINT import_submissions_durable_accepted_row_count_ck
    CHECK (durable_accepted_row_count >= 0),
  CONSTRAINT import_submissions_status_ck
    CHECK (
      status IN (
        'SUBMISSION_RECORDED',
        'PRODUCER_ACKNOWLEDGED',
        'ACCEPTANCE_UNKNOWN',
        'DURABLE_ACCEPTED',
        'REJECTED'
      )
    ),
  CONSTRAINT import_submissions_status_fact_source_ck
    CHECK (prospecting_app.text_is_present(status_fact_source, 64)),
  CONSTRAINT import_submissions_acknowledgement_consistency_ck
    CHECK (
      (
        producer_acknowledged_at IS NULL
        AND producer_import_batch_id IS NULL
        AND acknowledged_row_count IS NULL
      )
      OR (
        producer_acknowledged_at IS NOT NULL
        AND producer_import_batch_id IS NOT NULL
        AND acknowledged_row_count IS NOT NULL
      )
    ),
  CONSTRAINT import_submissions_status_acknowledgement_ck
    CHECK (
      status NOT IN ('PRODUCER_ACKNOWLEDGED', 'DURABLE_ACCEPTED')
      OR (
        producer_acknowledged_at IS NOT NULL
        AND producer_import_batch_id IS NOT NULL
        AND acknowledged_row_count IS NOT NULL
      )
    ),
  CONSTRAINT import_submissions_durable_acceptance_ck
    CHECK (
      (
        durable_accepted_at IS NULL
        AND durable_accepted_row_count IS NULL
      )
      OR (
        durable_accepted_at IS NOT NULL
        AND durable_accepted_row_count IS NOT NULL
        AND producer_acknowledged_at IS NOT NULL
      )
    ),
  CONSTRAINT import_submissions_status_durable_ck
    CHECK (
      status <> 'DURABLE_ACCEPTED'
      OR (
        durable_accepted_at IS NOT NULL
        AND durable_accepted_row_count IS NOT NULL
      )
    ),
  CONSTRAINT import_submissions_timestamps_ck
    CHECK (
      updated_at >= created_at
      AND submitted_at >= created_at - interval '1 minute'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS import_submissions_org_idempotency_key_uk
  ON prospecting_app.import_submissions (organization_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS import_submissions_org_producer_batch_uk
  ON prospecting_app.import_submissions (organization_id, producer_import_batch_id)
  WHERE producer_import_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS import_submissions_org_created_at_idx
  ON prospecting_app.import_submissions (organization_id, created_at DESC, submission_id);

CREATE INDEX IF NOT EXISTS import_submissions_org_status_observed_idx
  ON prospecting_app.import_submissions (organization_id, status, last_observed_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS prospecting_app.import_submission_events (
  event_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  submission_id uuid NOT NULL,
  actor_subject text,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT import_submission_events_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT import_submission_events_actor_subject_ck
    CHECK (prospecting_app.text_is_present(actor_subject, 256)),
  CONSTRAINT import_submission_events_event_type_ck
    CHECK (
      event_type IN (
        'SUBMISSION_RECORDED',
        'PRODUCER_ACKNOWLEDGED',
        'ACCEPTANCE_UNKNOWN',
        'DURABLE_ACCEPTED',
        'CSV_DELETION_REQUESTED',
        'CSV_DELETION_CONFIRMED',
        'CSV_DELETION_FAILED',
        'RECONCILIATION_OBSERVED'
      )
    ),
  CONSTRAINT import_submission_events_metadata_ck
    CHECK (
      prospecting_app.jsonb_has_only_keys(
        metadata,
        ARRAY[
          'source',
          'reason_code',
          'row_count',
          'import_batch_id',
          'status',
          'observed_at',
          'deletion_attempted_at',
          'deletion_result'
        ]
      )
    ),
  CONSTRAINT import_submission_events_submission_fk
    FOREIGN KEY (organization_id, submission_id)
    REFERENCES prospecting_app.import_submissions (organization_id, submission_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS import_submission_events_org_submission_occurred_idx
  ON prospecting_app.import_submission_events (
    organization_id,
    submission_id,
    occurred_at DESC,
    event_id
  );

CREATE INDEX IF NOT EXISTS import_submission_events_org_event_occurred_idx
  ON prospecting_app.import_submission_events (
    organization_id,
    event_type,
    occurred_at DESC
  );

CREATE TABLE IF NOT EXISTS prospecting_app.lead_workspaces (
  workspace_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  cnpj_normalizado char(14) NOT NULL,
  observed_lead_run_id text NOT NULL,
  responsible_subject text,
  commercial_stage text NOT NULL DEFAULT 'NOT_STARTED',
  next_action text,
  next_action_due_at timestamptz,
  commercial_outcome text,
  version integer NOT NULL DEFAULT 1,
  created_by_subject text NOT NULL,
  updated_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by_subject text,

  CONSTRAINT lead_workspaces_org_workspace_uk
    UNIQUE (organization_id, workspace_id),
  CONSTRAINT lead_workspaces_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT lead_workspaces_cnpj_normalizado_ck
    CHECK (cnpj_normalizado ~ '^[0-9]{14}$'),
  CONSTRAINT lead_workspaces_observed_lead_run_id_ck
    CHECK (prospecting_app.text_is_present(observed_lead_run_id, 128)),
  CONSTRAINT lead_workspaces_responsible_subject_ck
    CHECK (prospecting_app.text_is_present(responsible_subject, 256)),
  CONSTRAINT lead_workspaces_commercial_stage_ck
    CHECK (
      commercial_stage IN (
        'NOT_STARTED',
        'ASSIGNED',
        'CONTACTED',
        'FOLLOW_UP',
        'MEETING',
        'PAUSED',
        'CLOSED_WON',
        'CLOSED_LOST'
      )
    ),
  CONSTRAINT lead_workspaces_next_action_ck
    CHECK (char_length(next_action) <= 500),
  CONSTRAINT lead_workspaces_commercial_outcome_ck
    CHECK (
      commercial_outcome IS NULL
      OR commercial_outcome IN (
        'WON',
        'LOST',
        'NO_RESPONSE',
        'NOT_NOW',
        'DISQUALIFIED'
      )
    ),
  CONSTRAINT lead_workspaces_version_ck
    CHECK (version > 0),
  CONSTRAINT lead_workspaces_created_by_subject_ck
    CHECK (prospecting_app.text_is_present(created_by_subject, 256)),
  CONSTRAINT lead_workspaces_updated_by_subject_ck
    CHECK (prospecting_app.text_is_present(updated_by_subject, 256)),
  CONSTRAINT lead_workspaces_archive_subject_ck
    CHECK (prospecting_app.text_is_present(archived_by_subject, 256)),
  CONSTRAINT lead_workspaces_archive_pair_ck
    CHECK (
      (
        archived_at IS NULL
        AND archived_by_subject IS NULL
      )
      OR (
        archived_at IS NOT NULL
        AND archived_by_subject IS NOT NULL
      )
    ),
  CONSTRAINT lead_workspaces_timestamps_ck
    CHECK (
      updated_at >= created_at
      AND (
        archived_at IS NULL
        OR archived_at >= created_at
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_workspaces_org_cnpj_active_uk
  ON prospecting_app.lead_workspaces (organization_id, cnpj_normalizado)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS lead_workspaces_org_stage_idx
  ON prospecting_app.lead_workspaces (organization_id, commercial_stage, updated_at DESC);

CREATE INDEX IF NOT EXISTS lead_workspaces_org_responsible_idx
  ON prospecting_app.lead_workspaces (organization_id, responsible_subject, updated_at DESC)
  WHERE responsible_subject IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS lead_workspaces_org_next_action_due_idx
  ON prospecting_app.lead_workspaces (organization_id, next_action_due_at, workspace_id)
  WHERE next_action_due_at IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS lead_workspaces_org_lead_run_idx
  ON prospecting_app.lead_workspaces (organization_id, observed_lead_run_id);

CREATE TABLE IF NOT EXISTS prospecting_app.lead_activities (
  activity_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id uuid NOT NULL,
  observed_lead_run_id text NOT NULL,
  actor_subject text NOT NULL,
  occurred_at timestamptz NOT NULL,
  activity_type text NOT NULL,
  activity_outcome text,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_activities_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT lead_activities_observed_lead_run_id_ck
    CHECK (prospecting_app.text_is_present(observed_lead_run_id, 128)),
  CONSTRAINT lead_activities_actor_subject_ck
    CHECK (prospecting_app.text_is_present(actor_subject, 256)),
  CONSTRAINT lead_activities_activity_type_ck
    CHECK (
      activity_type IN (
        'CALL',
        'EMAIL',
        'WHATSAPP',
        'MEETING',
        'TASK',
        'OTHER'
      )
    ),
  CONSTRAINT lead_activities_activity_outcome_ck
    CHECK (prospecting_app.text_is_present(activity_outcome, 120)),
  CONSTRAINT lead_activities_summary_ck
    CHECK (char_length(summary) <= 1000),
  CONSTRAINT lead_activities_workspace_fk
    FOREIGN KEY (organization_id, workspace_id)
    REFERENCES prospecting_app.lead_workspaces (organization_id, workspace_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS lead_activities_org_workspace_occurred_idx
  ON prospecting_app.lead_activities (
    organization_id,
    workspace_id,
    occurred_at DESC,
    activity_id
  );

CREATE INDEX IF NOT EXISTS lead_activities_org_type_occurred_idx
  ON prospecting_app.lead_activities (
    organization_id,
    activity_type,
    occurred_at DESC
  );

CREATE TABLE IF NOT EXISTS prospecting_app.lead_notes (
  note_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id uuid NOT NULL,
  observed_lead_run_id text NOT NULL,
  author_subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_notes_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT lead_notes_observed_lead_run_id_ck
    CHECK (prospecting_app.text_is_present(observed_lead_run_id, 128)),
  CONSTRAINT lead_notes_author_subject_ck
    CHECK (prospecting_app.text_is_present(author_subject, 256)),
  CONSTRAINT lead_notes_body_ck
    CHECK (prospecting_app.text_is_present(body, 4000)),
  CONSTRAINT lead_notes_workspace_fk
    FOREIGN KEY (organization_id, workspace_id)
    REFERENCES prospecting_app.lead_workspaces (organization_id, workspace_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS lead_notes_org_workspace_created_idx
  ON prospecting_app.lead_notes (
    organization_id,
    workspace_id,
    created_at DESC,
    note_id
  );

CREATE TABLE IF NOT EXISTS prospecting_app.commercial_audit_events (
  audit_event_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id uuid,
  actor_subject text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  observed_lead_run_id text,
  previous_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT commercial_audit_events_organization_id_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT commercial_audit_events_actor_subject_ck
    CHECK (prospecting_app.text_is_present(actor_subject, 256)),
  CONSTRAINT commercial_audit_events_action_ck
    CHECK (
      action IN (
        'WORKSPACE_CREATED',
        'WORKSPACE_UPDATED',
        'WORKSPACE_ASSIGNED',
        'STAGE_CHANGED',
        'NEXT_ACTION_CHANGED',
        'ACTIVITY_APPENDED',
        'NOTE_APPENDED',
        'WORKSPACE_ARCHIVED',
        'IMPORT_SUBMISSION_RECORDED'
      )
    ),
  CONSTRAINT commercial_audit_events_target_type_ck
    CHECK (
      target_type IN (
        'lead_workspace',
        'lead_activity',
        'lead_note',
        'import_submission'
      )
    ),
  CONSTRAINT commercial_audit_events_observed_lead_run_id_ck
    CHECK (prospecting_app.text_is_present(observed_lead_run_id, 128)),
  CONSTRAINT commercial_audit_events_previous_metadata_ck
    CHECK (
      prospecting_app.jsonb_has_only_keys(
        previous_metadata,
        ARRAY[
          'commercial_stage',
          'responsible_subject',
          'next_action',
          'next_action_due_at',
          'commercial_outcome',
          'version',
          'archived_at',
          'status'
        ]
      )
    ),
  CONSTRAINT commercial_audit_events_new_metadata_ck
    CHECK (
      prospecting_app.jsonb_has_only_keys(
        new_metadata,
        ARRAY[
          'commercial_stage',
          'responsible_subject',
          'next_action',
          'next_action_due_at',
          'commercial_outcome',
          'version',
          'archived_at',
          'status'
        ]
      )
    ),
  CONSTRAINT commercial_audit_events_metadata_ck
    CHECK (
      prospecting_app.jsonb_has_only_keys(
        metadata,
        ARRAY[
          'field',
          'from',
          'to',
          'reason_code',
          'source',
          'workspace_id',
          'activity_id',
          'note_id',
          'import_submission_id',
          'activity_type',
          'activity_outcome'
        ]
      )
    ),
  CONSTRAINT commercial_audit_events_workspace_fk
    FOREIGN KEY (organization_id, workspace_id)
    REFERENCES prospecting_app.lead_workspaces (organization_id, workspace_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS commercial_audit_events_org_workspace_occurred_idx
  ON prospecting_app.commercial_audit_events (
    organization_id,
    workspace_id,
    occurred_at DESC,
    audit_event_id
  )
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commercial_audit_events_org_target_idx
  ON prospecting_app.commercial_audit_events (
    organization_id,
    target_type,
    target_id,
    occurred_at DESC
  );

DROP TRIGGER IF EXISTS import_submission_events_append_only
  ON prospecting_app.import_submission_events;
CREATE TRIGGER import_submission_events_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.import_submission_events
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();

DROP TRIGGER IF EXISTS lead_activities_append_only
  ON prospecting_app.lead_activities;
CREATE TRIGGER lead_activities_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.lead_activities
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();

DROP TRIGGER IF EXISTS lead_notes_append_only
  ON prospecting_app.lead_notes;
CREATE TRIGGER lead_notes_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.lead_notes
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();

DROP TRIGGER IF EXISTS commercial_audit_events_append_only
  ON prospecting_app.commercial_audit_events;
CREATE TRIGGER commercial_audit_events_append_only
  BEFORE UPDATE OR DELETE ON prospecting_app.commercial_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prospecting_app.reject_append_only_mutation();
