-- App-owned receipt for the legacy n8n workflow's explicit end-of-loop report.
-- This event does not promote the producer batch status to COMPLETED.

ALTER TABLE prospecting_app.import_submission_events
  DROP CONSTRAINT import_submission_events_event_type_ck,
  ADD CONSTRAINT import_submission_events_event_type_ck
    CHECK (
      event_type IN (
        'SUBMISSION_RECORDED',
        'PRODUCER_ACKNOWLEDGED',
        'ACCEPTANCE_UNKNOWN',
        'DURABLE_ACCEPTED',
        'CSV_DELETION_REQUESTED',
        'CSV_DELETION_CONFIRMED',
        'CSV_DELETION_FAILED',
        'RECONCILIATION_OBSERVED',
        'WORKFLOW_CLOSED_REPORTED'
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS
  import_submission_events_one_workflow_close_uk
  ON prospecting_app.import_submission_events (
    organization_id,
    submission_id
  )
  WHERE event_type = 'WORKFLOW_CLOSED_REPORTED';
