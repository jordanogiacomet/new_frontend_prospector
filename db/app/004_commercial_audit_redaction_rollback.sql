-- Roll back only the Demo 3 audit-key constraint shape.
-- Existing append-only audit rows are never rewritten or deleted.

ALTER TABLE prospecting_app.commercial_audit_events
  DROP CONSTRAINT commercial_audit_events_previous_metadata_ck,
  DROP CONSTRAINT commercial_audit_events_new_metadata_ck,
  DROP CONSTRAINT commercial_audit_events_next_action_scalar_ck;

ALTER TABLE prospecting_app.commercial_audit_events
  ADD CONSTRAINT commercial_audit_events_previous_metadata_ck
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
    ) NOT VALID,
  ADD CONSTRAINT commercial_audit_events_new_metadata_ck
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
    ) NOT VALID;
