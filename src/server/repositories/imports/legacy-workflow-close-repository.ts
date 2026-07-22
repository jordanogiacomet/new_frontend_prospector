import "server-only";

import { randomUUID } from "node:crypto";

import {
  transaction,
  type SqlStatement,
} from "../../db/app-client";

const SAFE_NOT_FOUND_ERROR = {
  code: "IMPORT_WORKFLOW_CLOSE_NOT_FOUND",
  httpStatus: 404,
  message: "Import workflow close correlation was not found.",
} as const;

const SAFE_CONFLICT_ERROR = {
  code: "IMPORT_WORKFLOW_CLOSE_CONFLICT",
  httpStatus: 409,
  message: "Import workflow close facts conflict with the submission.",
} as const;

export interface RecordLegacyWorkflowCloseInput {
  readonly organizationId: string;
  readonly importBatchId: string;
  readonly occurredAt: Date;
  readonly rowCountExpected: number;
}

export type RecordLegacyWorkflowCloseResult =
  | { readonly kind: "recorded"; readonly submissionCount: number }
  | { readonly kind: "replayed"; readonly submissionCount: number }
  | { readonly kind: "not_found"; readonly error: typeof SAFE_NOT_FOUND_ERROR }
  | { readonly kind: "conflict"; readonly error: typeof SAFE_CONFLICT_ERROR };

export class LegacyWorkflowCloseRepositoryInputError extends Error {
  readonly code = "INVALID_IMPORT_WORKFLOW_CLOSE_INPUT";

  constructor() {
    super("Invalid legacy workflow close persistence input.");
    this.name = "LegacyWorkflowCloseRepositoryInputError";
  }
}

interface CorrelatedSubmissionRow {
  readonly submission_id: string;
  readonly acknowledged_row_count: number;
}

interface ExistingCloseRow {
  readonly submission_id: string;
  readonly import_batch_id: string;
  readonly row_count: number;
  readonly occurred_at: Date;
}

export async function recordLegacyWorkflowClose(
  input: RecordLegacyWorkflowCloseInput,
): Promise<RecordLegacyWorkflowCloseResult> {
  validateInput(input);

  return transaction(async (client) => {
    const submissions = await client.query<CorrelatedSubmissionRow>(
      buildCorrelatedSubmissionsStatement(input),
    );

    if (submissions.length === 0) {
      return { kind: "not_found", error: SAFE_NOT_FOUND_ERROR };
    }

    if (
      submissions.some(
        (submission) =>
          submission.acknowledged_row_count !== input.rowCountExpected,
      )
    ) {
      return { kind: "conflict", error: SAFE_CONFLICT_ERROR };
    }

    const existing = await client.query<ExistingCloseRow>(
      buildExistingCloseReportsStatement(
        input.organizationId,
        submissions.map((submission) => submission.submission_id),
      ),
    );
    const existingBySubmission = new Map(
      existing.map((report) => [report.submission_id, report]),
    );

    if (
      existing.some(
        (report) =>
          report.import_batch_id !== input.importBatchId ||
          report.row_count !== input.rowCountExpected ||
          report.occurred_at.getTime() !== input.occurredAt.getTime(),
      )
    ) {
      return { kind: "conflict", error: SAFE_CONFLICT_ERROR };
    }

    const missing = submissions.filter(
      (submission) => !existingBySubmission.has(submission.submission_id),
    );

    for (const submission of missing) {
      await client.query(
        buildInsertCloseReportStatement(input, submission.submission_id),
      );
    }

    return {
      kind: missing.length === 0 ? "replayed" : "recorded",
      submissionCount: submissions.length,
    };
  });
}

function buildCorrelatedSubmissionsStatement(
  input: RecordLegacyWorkflowCloseInput,
): SqlStatement {
  return {
    text: `
      SELECT submission_id, acknowledged_row_count
      FROM prospecting_app.import_submissions
      WHERE organization_id = $1
        AND producer_import_batch_id = $2
        AND acknowledged_row_count IS NOT NULL
      ORDER BY submission_id ASC
      FOR UPDATE`,
    values: [input.organizationId, input.importBatchId],
  };
}

function buildExistingCloseReportsStatement(
  organizationId: string,
  submissionIds: readonly string[],
): SqlStatement {
  return {
    text: `
      SELECT
        submission_id,
        metadata->>'import_batch_id' AS import_batch_id,
        (metadata->>'row_count')::integer AS row_count,
        occurred_at
      FROM prospecting_app.import_submission_events
      WHERE organization_id = $1
        AND submission_id = ANY($2::uuid[])
        AND event_type = 'WORKFLOW_CLOSED_REPORTED'
      ORDER BY submission_id ASC`,
    values: [organizationId, [...submissionIds]],
  };
}

function buildInsertCloseReportStatement(
  input: RecordLegacyWorkflowCloseInput,
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
      VALUES ($1, $2, $3, NULL, 'WORKFLOW_CLOSED_REPORTED', $4, $5)
      ON CONFLICT (organization_id, submission_id)
        WHERE event_type = 'WORKFLOW_CLOSED_REPORTED'
      DO NOTHING`,
    values: [
      randomUUID(),
      input.organizationId,
      submissionId,
      input.occurredAt,
      {
        source: "legacy_n8n_callback",
        import_batch_id: input.importBatchId,
        row_count: input.rowCountExpected,
        status: "WORKFLOW_CLOSED_REPORTED",
        observed_at: input.occurredAt.toISOString(),
      },
    ],
  };
}

function validateInput(input: RecordLegacyWorkflowCloseInput): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new LegacyWorkflowCloseRepositoryInputError();
  }

  requireText(input.organizationId, 128);
  requireText(input.importBatchId, 128);

  if (
    !(input.occurredAt instanceof Date) ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    !Number.isSafeInteger(input.rowCountExpected) ||
    input.rowCountExpected < 1
  ) {
    throw new LegacyWorkflowCloseRepositoryInputError();
  }
}

function requireText(value: unknown, maximumLength: number): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new LegacyWorkflowCloseRepositoryInputError();
  }
}
