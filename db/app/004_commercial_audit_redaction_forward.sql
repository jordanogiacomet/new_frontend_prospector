-- Prospecta commercial audit redaction hardening.
-- Target: local or approved non-production PostgreSQL only.
-- Existing append-only rows are preserved; NOT VALID constraints apply to new rows.

ALTER TABLE prospecting_app.commercial_audit_events
  DROP CONSTRAINT commercial_audit_events_previous_metadata_ck,
  DROP CONSTRAINT commercial_audit_events_new_metadata_ck;

ALTER TABLE prospecting_app.commercial_audit_events
  ADD CONSTRAINT commercial_audit_events_previous_metadata_ck
    CHECK (
      prospecting_app.jsonb_has_only_keys(
        previous_metadata,
        ARRAY[
          'commercial_stage',
          'responsible_subject',
          'next_action_present',
          'next_action_due_at',
          'commercial_outcome',
          'version',
          'archived_at',
          'status'
        ]
      )
    ) NOT VALID,
  ADD CONSTRAINT commercial_audit_events_new_metadata_ck
    CHECK (
      prospecting_app.jsonb_has_only_keys(
        new_metadata,
        ARRAY[
          'commercial_stage',
          'responsible_subject',
          'next_action_present',
          'next_action_due_at',
          'commercial_outcome',
          'version',
          'archived_at',
          'status'
        ]
      )
    ) NOT VALID,
  ADD CONSTRAINT commercial_audit_events_next_action_scalar_ck
    CHECK (
      metadata->>'field' IS DISTINCT FROM 'next_action'
      OR (
        (NOT metadata ? 'from' OR jsonb_typeof(metadata->'from') = 'boolean')
        AND (NOT metadata ? 'to' OR jsonb_typeof(metadata->'to') = 'boolean')
      )
    ) NOT VALID;
