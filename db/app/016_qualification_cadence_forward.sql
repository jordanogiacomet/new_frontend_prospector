-- Four-step, app-owned qualification cadence for one commercial workspace.
-- Contact identity, provider payloads and outreach content are intentionally
-- absent. Completion details remain in the existing append-only activity log.

CREATE TABLE IF NOT EXISTS prospecting_app.lead_qualification_contacts (
  qualification_contact_id uuid PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id uuid NOT NULL,
  contact_number smallint NOT NULL,
  scheduled_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'PENDING',
  outcome text,
  completed_activity_id uuid,
  created_by_subject text NOT NULL,
  updated_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lead_qualification_contacts_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT lead_qualification_contacts_number_ck
    CHECK (contact_number BETWEEN 1 AND 4),
  CONSTRAINT lead_qualification_contacts_state_ck
    CHECK (state IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT lead_qualification_contacts_outcome_ck
    CHECK (
      outcome IS NULL
      OR outcome IN (
        'NO_RESPONSE',
        'RESPONDED',
        'FOLLOW_UP_LATER',
        'QUALIFIED',
        'NOT_INTERESTED',
        'WRONG_CONTACT',
        'OTHER_RESPONSE'
      )
    ),
  CONSTRAINT lead_qualification_contacts_created_subject_ck
    CHECK (prospecting_app.text_is_present(created_by_subject, 256)),
  CONSTRAINT lead_qualification_contacts_updated_subject_ck
    CHECK (prospecting_app.text_is_present(updated_by_subject, 256)),
  CONSTRAINT lead_qualification_contacts_time_ck
    CHECK (updated_at >= created_at),
  CONSTRAINT lead_qualification_contacts_completion_ck
    CHECK (
      (
        state = 'PENDING'
        AND outcome IS NULL
        AND completed_activity_id IS NULL
      )
      OR
      (
        state = 'COMPLETED'
        AND outcome IS NOT NULL
        AND completed_activity_id IS NOT NULL
      )
      OR
      (
        state = 'CANCELLED'
        AND outcome IS NULL
        AND completed_activity_id IS NULL
      )
    ),
  CONSTRAINT lead_qualification_contacts_workspace_fk
    FOREIGN KEY (organization_id, workspace_id)
    REFERENCES prospecting_app.lead_workspaces (organization_id, workspace_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT lead_qualification_contacts_activity_fk
    FOREIGN KEY (completed_activity_id)
    REFERENCES prospecting_app.lead_activities (activity_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS
  lead_qualification_contacts_org_workspace_number_uk
  ON prospecting_app.lead_qualification_contacts (
    organization_id,
    workspace_id,
    contact_number
  );

CREATE INDEX IF NOT EXISTS lead_qualification_contacts_org_due_idx
  ON prospecting_app.lead_qualification_contacts (
    organization_id,
    state,
    scheduled_at,
    workspace_id
  )
  WHERE state = 'PENDING';

REVOKE ALL ON TABLE
  prospecting_app.lead_qualification_contacts
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    GRANT SELECT, INSERT ON TABLE
      prospecting_app.lead_qualification_contacts
    TO prospecta_app_rw;

    GRANT UPDATE (
      scheduled_at,
      state,
      outcome,
      completed_activity_id,
      updated_by_subject,
      updated_at
    ) ON prospecting_app.lead_qualification_contacts
    TO prospecta_app_rw;

    REVOKE DELETE ON TABLE
      prospecting_app.lead_qualification_contacts
    FROM prospecta_app_rw;
  END IF;
END $$;
