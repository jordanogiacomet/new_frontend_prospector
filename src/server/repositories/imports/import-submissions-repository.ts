import "server-only";

import { randomUUID } from "node:crypto";

import {
  query as queryAppDatabase,
  transaction,
  type AppDatabaseTransaction,
  type SqlStatement,
} from "../../db/app-client";

const APP_CONTRACT_VERSION = "prospecta-import-v1";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SAFE_CONFLICT_ERROR = {
  code: "IMPORT_IDEMPOTENCY_CONFLICT",
  httpStatus: 409,
  message: "Submission conflicts with an earlier file.",
} as const;
const SAFE_NOT_FOUND_ERROR = {
  code: "IMPORT_SUBMISSION_NOT_FOUND",
  httpStatus: 404,
  message: "Import submission was not found.",
} as const;

export type ImportSubmissionStatus =
  | "SUBMISSION_RECORDED"
  | "PRODUCER_ACKNOWLEDGED"
  | "ACCEPTANCE_UNKNOWN";

export type ImportSubmissionReadStatus =
  | ImportSubmissionStatus
  | "DURABLE_ACCEPTED"
  | "REJECTED";

export interface ImportSubmissionFileMetadata {
  readonly filename: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
}

export interface RecordImportSubmissionIntentInput {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly idempotencyKey: string;
  readonly file: ImportSubmissionFileMetadata;
}

export interface ImportSubmissionRecord {
  readonly submissionId: string;
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly fileSha256: string;
  readonly originalFilename: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly appContractVersion: string;
  readonly status: ImportSubmissionStatus;
  readonly statusFactSource: string;
  readonly submittedAt: Date;
  readonly producerAcknowledgement: {
    readonly import_batch_id: string;
    readonly row_count: number;
    readonly producerAcknowledgedAt: Date;
  } | null;
}

export interface ListImportSubmissionsInput {
  readonly organizationId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ImportSubmissionReadModel {
  readonly submissionId: string;
  readonly originalFilename: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly appContractVersion: string;
  readonly appStatus: ImportSubmissionReadStatus;
  readonly statusFactSource: string;
  readonly submittedAt: Date;
  readonly lastObservedAt: Date | null;
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

export interface ListImportSubmissionsResult {
  readonly submissions: readonly ImportSubmissionReadModel[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number | null;
}

export interface GetImportSubmissionDetailInput {
  readonly organizationId: string;
  readonly submissionId: string;
}

export type RecordImportSubmissionIntentResult =
  | {
      readonly kind: "created";
      readonly submission: ImportSubmissionRecord;
    }
  | {
      readonly kind: "duplicate";
      readonly submission: ImportSubmissionRecord;
    }
  | {
      readonly kind: "conflict";
      readonly error: typeof SAFE_CONFLICT_ERROR;
    };

export interface RecordProducerAcknowledgementInput {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly submissionId: string;
  readonly acknowledgement: ValidatedProducerAcknowledgement;
}

export interface RecordProducerOutcomeUnknownInput {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly submissionId: string;
}

export interface ValidatedProducerAcknowledgement {
  readonly accepted: true;
  readonly message: string;
  readonly import_batch_id: string;
  readonly row_count: number;
  readonly source: string;
}

export type RecordProducerAcknowledgementResult =
  | {
      readonly kind: "recorded";
      readonly submission: ImportSubmissionRecord;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export type RecordProducerOutcomeUnknownResult =
  | {
      readonly kind: "recorded";
      readonly submission: ImportSubmissionRecord;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export type GetImportSubmissionDetailResult =
  | {
      readonly kind: "found";
      readonly submission: ImportSubmissionReadModel;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export class ImportSubmissionRepositoryInputError extends Error {
  readonly code = "INVALID_IMPORT_SUBMISSION_INPUT";

  constructor() {
    super("Invalid import submission persistence input.");
    this.name = "ImportSubmissionRepositoryInputError";
  }
}

interface ImportSubmissionRow {
  readonly submission_id: string;
  readonly organization_id: string;
  readonly original_filename: string;
  readonly file_sha256: string;
  readonly file_size_bytes: number | string;
  readonly content_type: string;
  readonly idempotency_key: string;
  readonly app_contract_version: string;
  readonly submitted_at: Date;
  readonly producer_acknowledged_at: Date | null;
  readonly producer_import_batch_id: string | null;
  readonly acknowledged_row_count: number | null;
  readonly status: ImportSubmissionStatus;
  readonly status_fact_source: string;
}

interface ImportSubmissionReadRow {
  readonly submission_id: string;
  readonly original_filename: string;
  readonly file_size_bytes: number | string;
  readonly content_type: string;
  readonly app_contract_version: string;
  readonly submitted_at: Date;
  readonly producer_acknowledged_at: Date | null;
  readonly producer_import_batch_id: string | null;
  readonly acknowledged_row_count: number | null;
  readonly durable_accepted_at: Date | null;
  readonly durable_accepted_row_count: number | null;
  readonly status: ImportSubmissionReadStatus;
  readonly status_fact_source: string;
  readonly last_observed_at: Date | null;
}

interface CountRow {
  readonly total: number | string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;

export async function recordImportSubmissionIntent(
  input: RecordImportSubmissionIntentInput,
): Promise<RecordImportSubmissionIntentResult> {
  validateSubmissionIntentInput(input);

  return transaction(async (client) => {
    const [created] = await client.query<ImportSubmissionRow>(
      buildInsertSubmissionStatement(input, randomUUID()),
    );

    if (created !== undefined) {
      await client.query(
        buildInsertSubmissionEventStatement({
          organizationId: input.organizationId,
          submissionId: created.submission_id,
          actorSubject: input.actorSubject,
          eventType: "SUBMISSION_RECORDED",
          metadata: {
            source: "app",
            status: "SUBMISSION_RECORDED",
          },
        }),
      );

      return {
        kind: "created",
        submission: mapSubmissionRow(created),
      };
    }

    const existing = await getSubmissionByIdempotencyKey(
      client,
      input.organizationId,
      input.idempotencyKey,
    );

    if (
      existing !== null &&
      existing.file_sha256 === input.file.sha256
    ) {
      return {
        kind: "duplicate",
        submission: mapSubmissionRow(existing),
      };
    }

    return {
      kind: "conflict",
      error: SAFE_CONFLICT_ERROR,
    };
  });
}

export async function recordProducerAcknowledgement(
  input: RecordProducerAcknowledgementInput,
): Promise<RecordProducerAcknowledgementResult> {
  validateAcknowledgementInput(input);

  return transaction(async (client) => {
    const [updated] = await client.query<ImportSubmissionRow>(
      buildUpdateAcknowledgementStatement(input),
    );

    if (updated === undefined) {
      return {
        kind: "not_found",
        error: SAFE_NOT_FOUND_ERROR,
      };
    }

    await client.query(
      buildInsertSubmissionEventStatement({
        organizationId: input.organizationId,
        submissionId: updated.submission_id,
        actorSubject: input.actorSubject,
        eventType: "PRODUCER_ACKNOWLEDGED",
        metadata: {
          source: input.acknowledgement.source,
          import_batch_id: input.acknowledgement.import_batch_id,
          row_count: input.acknowledgement.row_count,
          status: "PRODUCER_ACKNOWLEDGED",
        },
      }),
    );

    return {
      kind: "recorded",
      submission: mapSubmissionRow(updated),
    };
  });
}

export async function recordProducerOutcomeUnknown(
  input: RecordProducerOutcomeUnknownInput,
): Promise<RecordProducerOutcomeUnknownResult> {
  validateOutcomeUnknownInput(input);

  return transaction(async (client) => {
    const [updated] = await client.query<ImportSubmissionRow>(
      buildUpdateOutcomeUnknownStatement(input),
    );

    if (updated === undefined) {
      return {
        kind: "not_found",
        error: SAFE_NOT_FOUND_ERROR,
      };
    }

    await client.query(
      buildInsertSubmissionEventStatement({
        organizationId: input.organizationId,
        submissionId: updated.submission_id,
        actorSubject: input.actorSubject,
        eventType: "ACCEPTANCE_UNKNOWN",
        metadata: {
          source: "app",
          reason_code: "INGRESS_UNKNOWN",
          status: "ACCEPTANCE_UNKNOWN",
        },
      }),
    );

    return {
      kind: "recorded",
      submission: mapSubmissionRow(updated),
    };
  });
}

export async function listImportSubmissions(
  input: ListImportSubmissionsInput,
): Promise<ListImportSubmissionsResult> {
  const pagination = validateListInput(input);
  const [{ total } = { total: 0 }] = await queryAppDatabase<CountRow>(
    buildCountSubmissionsStatement(input.organizationId),
  );
  const rows = await queryAppDatabase<ImportSubmissionReadRow>(
    buildListSubmissionsStatement(input.organizationId, pagination),
  );

  return {
    submissions: rows.map(mapSubmissionReadRow),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: toSafeInteger(total),
  };
}

export async function getImportSubmissionDetail(
  input: GetImportSubmissionDetailInput,
): Promise<GetImportSubmissionDetailResult> {
  validateDetailInput(input);

  const [row] = await queryAppDatabase<ImportSubmissionReadRow>(
    buildSelectSubmissionDetailStatement(input),
  );

  if (row === undefined) {
    return {
      kind: "not_found",
      error: SAFE_NOT_FOUND_ERROR,
    };
  }

  return {
    kind: "found",
    submission: mapSubmissionReadRow(row),
  };
}

function buildInsertSubmissionStatement(
  input: RecordImportSubmissionIntentInput,
  submissionId: string,
): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.import_submissions (
        submission_id,
        organization_id,
        created_by_subject,
        original_filename,
        file_sha256,
        file_size_bytes,
        content_type,
        idempotency_key,
        app_contract_version,
        status,
        status_fact_source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SUBMISSION_RECORDED', 'app_submission')
      ON CONFLICT (organization_id, idempotency_key) DO NOTHING
      RETURNING ${submissionColumns()}`,
    values: [
      submissionId,
      input.organizationId,
      input.actorSubject,
      input.file.filename,
      input.file.sha256,
      input.file.sizeBytes,
      input.file.mediaType,
      input.idempotencyKey,
      APP_CONTRACT_VERSION,
    ],
  };
}

function buildUpdateAcknowledgementStatement(
  input: RecordProducerAcknowledgementInput,
): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.import_submissions
      SET
        producer_acknowledged_at = now(),
        producer_import_batch_id = $3,
        acknowledged_row_count = $4,
        status = 'PRODUCER_ACKNOWLEDGED',
        status_fact_source = 'workflow_acknowledgement',
        last_observed_at = now(),
        updated_at = now()
      WHERE organization_id = $1
        AND submission_id = $2
      RETURNING ${submissionColumns()}`,
    values: [
      input.organizationId,
      input.submissionId,
      input.acknowledgement.import_batch_id,
      input.acknowledgement.row_count,
    ],
  };
}

function buildUpdateOutcomeUnknownStatement(
  input: RecordProducerOutcomeUnknownInput,
): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.import_submissions
      SET
        status = 'ACCEPTANCE_UNKNOWN',
        status_fact_source = 'ingress_unknown',
        last_observed_at = now(),
        updated_at = now()
      WHERE organization_id = $1
        AND submission_id = $2
        AND producer_acknowledged_at IS NULL
      RETURNING ${submissionColumns()}`,
    values: [input.organizationId, input.submissionId],
  };
}

function buildSelectByIdempotencyKeyStatement(
  organizationId: string,
  idempotencyKey: string,
): SqlStatement {
  return {
    text: `
      SELECT ${submissionColumns()}
      FROM prospecting_app.import_submissions
      WHERE organization_id = $1
        AND idempotency_key = $2
      LIMIT 1`,
    values: [organizationId, idempotencyKey],
  };
}

function buildCountSubmissionsStatement(organizationId: string): SqlStatement {
  return {
    text: `
      SELECT count(*)::integer AS total
      FROM prospecting_app.import_submissions
      WHERE organization_id = $1`,
    values: [organizationId],
  };
}

function buildListSubmissionsStatement(
  organizationId: string,
  pagination: { readonly page: number; readonly pageSize: number },
): SqlStatement {
  return {
    text: `
      SELECT ${submissionReadColumns()}
      FROM prospecting_app.import_submissions
      WHERE organization_id = $1
      ORDER BY submitted_at DESC, submission_id DESC
      LIMIT $2
      OFFSET $3`,
    values: [
      organizationId,
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize,
    ],
  };
}

function buildSelectSubmissionDetailStatement(
  input: GetImportSubmissionDetailInput,
): SqlStatement {
  return {
    text: `
      SELECT ${submissionReadColumns()}
      FROM prospecting_app.import_submissions
      WHERE organization_id = $1
        AND submission_id = $2
      LIMIT 1`,
    values: [input.organizationId, input.submissionId],
  };
}

async function getSubmissionByIdempotencyKey(
  client: AppDatabaseTransaction,
  organizationId: string,
  idempotencyKey: string,
): Promise<ImportSubmissionRow | null> {
  const [row] = await client.query<ImportSubmissionRow>(
    buildSelectByIdempotencyKeyStatement(organizationId, idempotencyKey),
  );

  return row ?? null;
}

function buildInsertSubmissionEventStatement(input: {
  readonly organizationId: string;
  readonly submissionId: string;
  readonly actorSubject: string;
  readonly eventType:
    | "SUBMISSION_RECORDED"
    | "PRODUCER_ACKNOWLEDGED"
    | "ACCEPTANCE_UNKNOWN";
  readonly metadata: Record<string, string | number>;
}): SqlStatement {
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
      input.eventType,
      input.metadata,
    ],
  };
}

function submissionColumns(): string {
  return `
        submission_id,
        organization_id,
        original_filename,
        file_sha256,
        file_size_bytes,
        content_type,
        idempotency_key,
        app_contract_version,
        submitted_at,
        producer_acknowledged_at,
        producer_import_batch_id,
        acknowledged_row_count,
        status,
        status_fact_source`;
}

function submissionReadColumns(): string {
  return `
        submission_id,
        original_filename,
        file_size_bytes,
        content_type,
        app_contract_version,
        submitted_at,
        producer_acknowledged_at,
        producer_import_batch_id,
        acknowledged_row_count,
        durable_accepted_at,
        durable_accepted_row_count,
        status,
        status_fact_source,
        last_observed_at`;
}

function mapSubmissionRow(row: ImportSubmissionRow): ImportSubmissionRecord {
  return {
    submissionId: row.submission_id,
    organizationId: row.organization_id,
    idempotencyKey: row.idempotency_key,
    fileSha256: row.file_sha256,
    originalFilename: row.original_filename,
    sizeBytes: toSafeInteger(row.file_size_bytes),
    mediaType: row.content_type,
    appContractVersion: row.app_contract_version,
    status: row.status,
    statusFactSource: row.status_fact_source,
    submittedAt: row.submitted_at,
    producerAcknowledgement:
      row.producer_acknowledged_at === null ||
      row.producer_import_batch_id === null ||
      row.acknowledged_row_count === null
        ? null
        : {
            import_batch_id: row.producer_import_batch_id,
            row_count: row.acknowledged_row_count,
            producerAcknowledgedAt: row.producer_acknowledged_at,
          },
  };
}

function mapSubmissionReadRow(
  row: ImportSubmissionReadRow,
): ImportSubmissionReadModel {
  return {
    submissionId: row.submission_id,
    originalFilename: row.original_filename,
    sizeBytes: toSafeInteger(row.file_size_bytes),
    mediaType: row.content_type,
    appContractVersion: row.app_contract_version,
    appStatus: row.status,
    statusFactSource: row.status_fact_source,
    submittedAt: row.submitted_at,
    lastObservedAt: row.last_observed_at,
    workflowAcknowledgement:
      row.producer_acknowledged_at === null ||
      row.producer_import_batch_id === null ||
      row.acknowledged_row_count === null
        ? null
        : {
            import_batch_id: row.producer_import_batch_id,
            row_count: row.acknowledged_row_count,
            acknowledgedAt: row.producer_acknowledged_at,
          },
    durableAcceptance:
      row.durable_accepted_at === null ||
      row.durable_accepted_row_count === null
        ? null
        : {
            acceptedAt: row.durable_accepted_at,
            rowCountAccepted: row.durable_accepted_row_count,
          },
  };
}

function validateListInput(input: ListImportSubmissionsInput): {
  readonly page: number;
  readonly pageSize: number;
} {
  requireText(input.organizationId, 128);

  const page = input.page ?? DEFAULT_PAGE;
  const requestedPageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE ||
    !Number.isSafeInteger(requestedPageSize) ||
    requestedPageSize < 1
  ) {
    throw new ImportSubmissionRepositoryInputError();
  }

  return {
    page,
    pageSize: Math.min(requestedPageSize, MAX_PAGE_SIZE),
  };
}

function validateDetailInput(input: GetImportSubmissionDetailInput): void {
  requireText(input.organizationId, 128);

  if (!isUuid(input.submissionId)) {
    throw new ImportSubmissionRepositoryInputError();
  }
}

function validateSubmissionIntentInput(
  input: RecordImportSubmissionIntentInput,
): void {
  requireText(input.organizationId, 128);
  requireText(input.actorSubject, 256);
  requireText(input.idempotencyKey, 128);
  validateFilename(input.file.filename);
  validateSha256(input.file.sha256);
  validateSize(input.file.sizeBytes);
  validateMediaType(input.file.mediaType);
}

function validateAcknowledgementInput(
  input: RecordProducerAcknowledgementInput,
): void {
  requireText(input.organizationId, 128);
  requireText(input.actorSubject, 256);
  requireText(input.submissionId, 64);
  requireText(input.acknowledgement.import_batch_id, 128);

  if (
    input.acknowledgement.accepted !== true ||
    !Number.isSafeInteger(input.acknowledgement.row_count) ||
    input.acknowledgement.row_count < 0 ||
    typeof input.acknowledgement.source !== "string"
  ) {
    throw new ImportSubmissionRepositoryInputError();
  }
}

function validateOutcomeUnknownInput(
  input: RecordProducerOutcomeUnknownInput,
): void {
  requireText(input.organizationId, 128);
  requireText(input.actorSubject, 256);
  requireText(input.submissionId, 64);
}

function requireText(value: string, maximumLength: number): void {
  if (
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new ImportSubmissionRepositoryInputError();
  }
}

function validateFilename(filename: string): void {
  if (
    !/^[^/\\\0]+\.csv$/i.test(filename) ||
    /^\.csv$/i.test(filename) ||
    filename.length > 255
  ) {
    throw new ImportSubmissionRepositoryInputError();
  }
}

function validateSha256(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new ImportSubmissionRepositoryInputError();
  }
}

function validateSize(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_FILE_SIZE_BYTES
  ) {
    throw new ImportSubmissionRepositoryInputError();
  }
}

function validateMediaType(value: string): void {
  if (
    value !== "text/csv" &&
    value !== "application/csv" &&
    value !== "application/vnd.ms-excel"
  ) {
    throw new ImportSubmissionRepositoryInputError();
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function toSafeInteger(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ImportSubmissionRepositoryInputError();
  }

  return parsed;
}
