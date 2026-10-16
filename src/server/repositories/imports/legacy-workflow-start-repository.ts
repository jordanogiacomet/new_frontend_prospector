import "server-only";

import { randomUUID } from "node:crypto";

import {
  transaction,
  type SqlStatement,
} from "../../db/app-client";

const SAFE_NOT_FOUND_ERROR = {
  code: "IMPORT_WORKFLOW_START_NOT_FOUND",
  httpStatus: 404,
  message: "Import workflow start correlation was not found.",
} as const;

const SAFE_CONFLICT_ERROR = {
  code: "IMPORT_WORKFLOW_START_CONFLICT",
  httpStatus: 409,
  message: "Import workflow start facts conflict with the submission.",
} as const;

export interface RecordLegacyWorkflowStartInput {
  readonly organizationId: string;
  readonly importBatchId: string;
  readonly occurredAt: Date;
  readonly sourceRow?: number | null;
}

export type RecordLegacyWorkflowStartResult =
  | { readonly kind: "recorded"; readonly submissionCount: number }
  | { readonly kind: "replayed"; readonly submissionCount: number }
  | { readonly kind: "not_found"; readonly error: typeof SAFE_NOT_FOUND_ERROR }
  | { readonly kind: "conflict"; readonly error: typeof SAFE_CONFLICT_ERROR };

export class LegacyWorkflowStartRepositoryInputError extends Error {
  readonly code = "INVALID_IMPORT_WORKFLOW_START_INPUT";

  constructor() {
    super("Invalid legacy workflow start persistence input.");
    this.name = "LegacyWorkflowStartRepositoryInputError";
  }
}

interface CorrelatedSubmissionRow {
  readonly submission_id: string;
}

interface ExistingStartRow {
  readonly submission_id: string;
  readonly import_batch_id: string | null;
}

export async function recordLegacyWorkflowStart(
  input: RecordLegacyWorkflowStartInput,
): Promise<RecordLegacyWorkflowStartResult> {
  validateInput(input);

  return transaction(async (client) => {
    const submissions = await client.query<CorrelatedSubmissionRow>(
      buildCorrelatedSubmissionsStatement(input),
    );

    if (submissions.length === 0) {
      return { kind: "not_found", error: SAFE_NOT_FOUND_ERROR };
    }

    const existing = await client.query<ExistingStartRow>(
      buildExistingStartReportsStatement(
        input.organizationId,
        submissions.map((submission) => submission.submission_id),
      ),
    );
    const existingSubmissionIds = new Set(
      existing.map((report) => report.submission_id),
    );

    if (
      existing.some(
        (report) => report.import_batch_id !== input.importBatchId,
      )
    ) {
      return { kind: "conflict", error: SAFE_CONFLICT_ERROR };
    }

    const missing = submissions.filter(
      (submission) => !existingSubmissionIds.has(submission.submission_id),
    );

    for (const submission of missing) {
      await client.query(
        buildInsertStartReportStatement(input, submission.submission_id),
      );
    }

    let receivedCompaniesRecorded = 0;

    if (input.sourceRow !== undefined && input.sourceRow !== null) {
      for (const submission of submissions) {
        const received = await client.query<{ readonly source_row: string | number }>(
          buildInsertReceivedCompanyStatement(
            input,
            submission.submission_id,
            input.sourceRow,
          ),
        );
        receivedCompaniesRecorded += received.length;
      }
    }

    return {
      kind: missing.length === 0 && receivedCompaniesRecorded === 0
        ? "replayed"
        : "recorded",
      submissionCount: submissions.length,
    };
  });
}

function buildCorrelatedSubmissionsStatement(
  input: RecordLegacyWorkflowStartInput,
): SqlStatement {
  return {
    text: `
      SELECT submission_id
      FROM prospecting_app.import_submissions
      WHERE organization_id = $1
        AND producer_import_batch_id = $2
        AND producer_acknowledged_at IS NOT NULL
        AND acknowledged_row_count IS NOT NULL
      ORDER BY submission_id ASC
      FOR UPDATE`,
    values: [input.organizationId, input.importBatchId],
  };
}

function buildExistingStartReportsStatement(
  organizationId: string,
  submissionIds: readonly string[],
): SqlStatement {
  return {
    text: `
      SELECT
        submission_id,
        metadata->>'import_batch_id' AS import_batch_id
      FROM prospecting_app.import_submission_events
      WHERE organization_id = $1
        AND submission_id = ANY($2::uuid[])
        AND event_type = 'WORKFLOW_STARTED_REPORTED'
      ORDER BY submission_id ASC`,
    values: [organizationId, [...submissionIds]],
  };
}

function buildInsertStartReportStatement(
  input: RecordLegacyWorkflowStartInput,
  submissionId: string,
): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.import_submission_events (
        event_id,
        organization_id,
        submission_id,
        actor_subject,
        event_type,
        occurred_at,
        metadata
      )
      VALUES ($1, $2, $3, NULL, 'WORKFLOW_STARTED_REPORTED', $4, $5)
      ON CONFLICT (organization_id, submission_id)
        WHERE event_type = 'WORKFLOW_STARTED_REPORTED'
      DO NOTHING`,
    values: [
      randomUUID(),
      input.organizationId,
      submissionId,
      input.occurredAt,
      { import_batch_id: input.importBatchId },
    ],
  };
}

function validateInput(input: RecordLegacyWorkflowStartInput): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new LegacyWorkflowStartRepositoryInputError();
  }

  requireText(input.organizationId, 128);
  requireText(input.importBatchId, 128);

  if (
    input.sourceRow !== undefined &&
    input.sourceRow !== null &&
    (!Number.isSafeInteger(input.sourceRow) || input.sourceRow < 1)
  ) {
    throw new LegacyWorkflowStartRepositoryInputError();
  }

  if (
    !(input.occurredAt instanceof Date) ||
    !Number.isFinite(input.occurredAt.getTime())
  ) {
    throw new LegacyWorkflowStartRepositoryInputError();
  }
}

function buildInsertReceivedCompanyStatement(
  input: RecordLegacyWorkflowStartInput,
  submissionId: string,
  sourceRow: number,
): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.import_received_companies (
        organization_id,
        submission_id,
        source_row,
        received_at
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (organization_id, submission_id, source_row)
      DO NOTHING
      RETURNING source_row`,
    values: [
      input.organizationId,
      submissionId,
      sourceRow,
      input.occurredAt,
    ],
  };
}

function requireText(value: unknown, maximumLength: number): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new LegacyWorkflowStartRepositoryInputError();
  }
}
