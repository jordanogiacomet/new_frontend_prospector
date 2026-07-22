-- Refuse rollback after an append-only workflow close report was received.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM prospecting_app.import_submission_events
    WHERE event_type = 'WORKFLOW_CLOSED_REPORTED'
  ) THEN
    RAISE EXCEPTION
      'Cannot roll back legacy workflow close support after reports exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS
  prospecting_app.import_submission_events_one_workflow_close_uk;

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
        'RECONCILIATION_OBSERVED'
      )
    );
