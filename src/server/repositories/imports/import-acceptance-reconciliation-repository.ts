import "server-only";

import { randomUUID } from "node:crypto";

import {
  query as queryAppDatabase,
  transaction,
  type SqlStatement,
} from "../../db/app-client";
import type { ImportSubmissionReadStatus } from "./import-submissions-repository";

const SAFE_NOT_FOUND_ERROR = {
  code: "IMPORT_SUBMISSION_NOT_FOUND",
  httpStatus: 404,
  message: "Import submission was not found.",
} as const;
const SAFE_CONFLICT_ERROR = {
  code: "IMPORT_ACCEPTANCE_CONFLICT",
  httpStatus: 409,
  message: "Import acceptance facts are inconsistent.",
} as const;

export interface ImportAcceptanceCandidate {
  readonly submissionId: string;
  readonly organizationId: string;
  readonly fileSha256: string;
  readonly appContractVersion: string;
  readonly submittedAt: Date;
  readonly status: ImportSubmissionReadStatus;
  readonly workflowAcknowledgement: {
    readonly import_batch_id: string;
    readonly row_count: number;
    readonly acknowledgedAt: Date;
  } | null;
  readonly durableAcceptance: {
    readonly acceptedAt: Date;
    readonly rowCountAccepted: number;
  } | null;
}

export interface GetImportAcceptanceCandidateInput {
  readonly organizationId: string;
  readonly submissionId: string;
}

export type GetImportAcceptanceCandidateResult =
  | {
      readonly kind: "found";
      readonly candidate: ImportAcceptanceCandidate;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    }
  | {
      readonly kind: "inconsistent";
      readonly error: typeof SAFE_CONFLICT_ERROR;
    };

export interface PromoteDurableImportAcceptanceInput {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly submissionId: string;
  readonly fileSha256: string;
  readonly appContractVersion: string;
  readonly acceptance: {
    readonly import_batch_id: string;
    readonly acceptedRowCount: number;
    readonly acceptedAt: Date;
  };
}

export type PromoteDurableImportAcceptanceResult =
  | {
      readonly kind: "confirmed";
      readonly changed: boolean;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    }
  | {
      readonly kind: "conflict";
      readonly error: typeof SAFE_CONFLICT_ERROR;
    };

export class ImportAcceptanceReconciliationRepositoryInputError extends Error {
  readonly code = "INVALID_IMPORT_ACCEPTANCE_RECONCILIATION_INPUT";

  constructor() {
    super("Invalid import acceptance reconciliation input.");
    this.name = "ImportAcceptanceReconciliationRepositoryInputError";
  }
}

interface ImportAcceptanceCandidateRow {
  readonly submission_id: string;
  readonly organization_id: string;
  readonly file_sha256: string;
  readonly app_contract_version: string;
  readonly submitted_at: Date;
  readonly producer_acknowledged_at: Date | null;
  readonly producer_import_batch_id: string | null;
  readonly acknowledged_row_count: number | null;
  readonly durable_accepted_at: Date | null;
  readonly durable_accepted_row_count: number | null;
  readonly status: ImportSubmissionReadStatus;
}

export async function getImportAcceptanceCandidate(
  input: GetImportAcceptanceCandidateInput,
): Promise<GetImportAcceptanceCandidateResult> {
  validateCandidateInput(input);

  const [row] = await queryAppDatabase<ImportAcceptanceCandidateRow>(
    buildSelectCandidateStatement(input),
  );

  if (row === undefined) {
    return { kind: "not_found", error: SAFE_NOT_FOUND_ERROR };
  }

  const candidate = mapCandidateRow(row);

  return candidate === null
    ? { kind: "inconsistent", error: SAFE_CONFLICT_ERROR }
    : { kind: "found", candidate };
}

export async function promoteDurableImportAcceptance(
  input: PromoteDurableImportAcceptanceInput,
): Promise<PromoteDurableImportAcceptanceResult> {
  validatePromotionInput(input);

  return transaction(async (client) => {
    const [updated] = await client.query<ImportAcceptanceCandidateRow>(
      buildPromoteAcceptanceStatement(input),
    );

    if (updated !== undefined) {
      await client.query(buildInsertReconciliationEventStatement(input));
      return { kind: "confirmed", changed: true };
    }

    const [existing] = await client.query<ImportAcceptanceCandidateRow>(
      buildSelectCandidateStatement(input),
    );

    if (existing === undefined) {
      return { kind: "not_found", error: SAFE_NOT_FOUND_ERROR };
    }

    const candidate = mapCandidateRow(existing);

    if (candidate !== null && isSameDurableAcceptance(candidate, input)) {
      return { kind: "confirmed", changed: false };
    }

    return { kind: "conflict", error: SAFE_CONFLICT_ERROR };
  });
}

function buildSelectCandidateStatement(
  input: GetImportAcceptanceCandidateInput,
): SqlStatement {
  return {
    text: `
      SELECT
        submission_id,
        organization_id,
        file_sha256,
        app_contract_version,
        submitted_at,
        producer_acknowledged_at,
        producer_import_batch_id,
        acknowledged_row_count,
        durable_accepted_at,
        durable_accepted_row_count,
        status
      FROM prospecting_app.import_submissions
      WHERE organization_id = $1
        AND submission_id = $2
      LIMIT 1`,
    values: [input.organizationId, input.submissionId],
  };
}

function buildPromoteAcceptanceStatement(
  input: PromoteDurableImportAcceptanceInput,
): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.import_submissions
      SET
        durable_accepted_at = $7,
        durable_accepted_row_count = $6,
        status = 'DURABLE_ACCEPTED',
        status_fact_source = 'durable_acceptance',
        last_observed_at = GREATEST(COALESCE(last_observed_at, $7), $7),
        updated_at = now()
      WHERE organization_id = $1
        AND submission_id = $2
        AND file_sha256 = $3
        AND app_contract_version = $4
        AND producer_import_batch_id = $5
        AND acknowledged_row_count = $6
        AND producer_acknowledged_at IS NOT NULL
        AND durable_accepted_at IS NULL
        AND durable_accepted_row_count IS NULL
        AND status = 'PRODUCER_ACKNOWLEDGED'
      RETURNING
        submission_id,
        organization_id,
        file_sha256,
        app_contract_version,
        submitted_at,
        producer_acknowledged_at,
        producer_import_batch_id,
        acknowledged_row_count,
        durable_accepted_at,
        durable_accepted_row_count,
        status`,
    values: [
      input.organizationId,
      input.submissionId,
      input.fileSha256,
      input.appContractVersion,
      input.acceptance.import_batch_id,
      input.acceptance.acceptedRowCount,
      input.acceptance.acceptedAt,
    ],
  };
}

function buildInsertReconciliationEventStatement(
  input: PromoteDurableImportAcceptanceInput,
): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.import_submission_events (
        event_id,
        organization_id,
        submission_id,
        actor_subject,
        event_type,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)`,
    values: [
      randomUUID(),
      input.organizationId,
      input.submissionId,
      input.actorSubject,
      "RECONCILIATION_OBSERVED",
      {
        source: "producer_import_acceptances_v1",
        status: "DURABLE_ACCEPTED",
        import_batch_id: input.acceptance.import_batch_id,
        row_count: input.acceptance.acceptedRowCount,
        observed_at: input.acceptance.acceptedAt.toISOString(),
      },
    ],
  };
}

function mapCandidateRow(
  row: ImportAcceptanceCandidateRow,
): ImportAcceptanceCandidate | null {
  const acknowledgementPresence = [
    row.producer_acknowledged_at,
    row.producer_import_batch_id,
    row.acknowledged_row_count,
  ].filter((value) => value !== null).length;
  const durablePresence = [
    row.durable_accepted_at,
    row.durable_accepted_row_count,
  ].filter((value) => value !== null).length;

  if (
    !isUuid(row.submission_id) ||
    !isPresentText(row.organization_id, 128) ||
    !/^[0-9a-f]{64}$/.test(row.file_sha256) ||
    !isPresentText(row.app_contract_version, 64) ||
    !isValidDate(row.submitted_at) ||
    (acknowledgementPresence !== 0 && acknowledgementPresence !== 3) ||
    (durablePresence !== 0 && durablePresence !== 2)
  ) {
    return null;
  }

  if (
    acknowledgementPresence === 3 &&
    (!isValidDate(row.producer_acknowledged_at) ||
      !isPresentText(row.producer_import_batch_id, 128) ||
      !isNonNegativeInteger(row.acknowledged_row_count))
  ) {
    return null;
  }

  if (
    durablePresence === 2 &&
    (!isValidDate(row.durable_accepted_at) ||
      !isNonNegativeInteger(row.durable_accepted_row_count))
  ) {
    return null;
  }

  return {
    submissionId: row.submission_id,
    organizationId: row.organization_id,
    fileSha256: row.file_sha256,
    appContractVersion: row.app_contract_version,
    submittedAt: row.submitted_at,
    status: row.status,
    workflowAcknowledgement:
      acknowledgementPresence === 0
        ? null
        : {
            import_batch_id: row.producer_import_batch_id as string,
            row_count: row.acknowledged_row_count as number,
            acknowledgedAt: row.producer_acknowledged_at as Date,
          },
    durableAcceptance:
      durablePresence === 0
        ? null
        : {
            acceptedAt: row.durable_accepted_at as Date,
            rowCountAccepted:
              row.durable_accepted_row_count as number,
          },
  };
}

function isSameDurableAcceptance(
  candidate: ImportAcceptanceCandidate,
  input: PromoteDurableImportAcceptanceInput,
): boolean {
  return (
    candidate.status === "DURABLE_ACCEPTED" &&
    candidate.organizationId === input.organizationId &&
    candidate.submissionId === input.submissionId &&
    candidate.fileSha256 === input.fileSha256 &&
    candidate.appContractVersion === input.appContractVersion &&
    candidate.workflowAcknowledgement?.import_batch_id ===
      input.acceptance.import_batch_id &&
    candidate.workflowAcknowledgement.row_count ===
      input.acceptance.acceptedRowCount &&
    candidate.durableAcceptance?.rowCountAccepted ===
      input.acceptance.acceptedRowCount &&
    candidate.durableAcceptance.acceptedAt.getTime() ===
      input.acceptance.acceptedAt.getTime()
  );
}

function validateCandidateInput(
  input: GetImportAcceptanceCandidateInput,
): void {
  requireText(input.organizationId, 128);

  if (!isUuid(input.submissionId)) {
    throw new ImportAcceptanceReconciliationRepositoryInputError();
  }
}

function validatePromotionInput(
  input: PromoteDurableImportAcceptanceInput,
): void {
  requireText(input.organizationId, 128);
  requireText(input.actorSubject, 256);
  requireText(input.appContractVersion, 64);

  if (
    !isUuid(input.submissionId) ||
    !/^[0-9a-f]{64}$/.test(input.fileSha256) ||
    !/^ib_[0-9a-f]{64}$/.test(input.acceptance.import_batch_id) ||
    !Number.isSafeInteger(input.acceptance.acceptedRowCount) ||
    input.acceptance.acceptedRowCount < 1 ||
    !isValidDate(input.acceptance.acceptedAt)
  ) {
    throw new ImportAcceptanceReconciliationRepositoryInputError();
  }
}

function requireText(value: string, maximumLength: number): void {
  if (!isPresentText(value, maximumLength)) {
    throw new ImportAcceptanceReconciliationRepositoryInputError();
  }
}

function isPresentText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}
