import "server-only";

import { getServerEnv } from "../env";
import { mapBatchStatus } from "../mappers/batch-status-mapper";
import {
  getImportSubmissionDetail,
  listImportSubmissions,
  type GetImportSubmissionDetailResult,
  type ImportSubmissionReadModel,
} from "../repositories/imports/import-submissions-repository";
import {
  readProducerBatchObservations,
  readProducerBatchObservationsByBatchIds,
} from "../repositories/imports/producer-batch-observations-repository";
import type {
  BatchAcceptanceFact,
  BatchAcknowledgementFact,
  BatchProducerObservationFacts,
  BatchSummary,
  BatchSubmissionFact,
} from "../../types/imports";

const APP_SUBMISSION_FACT_SOURCE = "app_submission";
const WORKFLOW_ACKNOWLEDGEMENT_FACT_SOURCE = "workflow_acknowledgement";
const BATCH_OBSERVATION_GATE_FACT_SOURCE =
  "app_batch_observation_feature_gate";
const MAX_ORGANIZATION_ID_LENGTH = 128;
const MAX_PAGE = 10_000;

export interface ListImportBatchesInput {
  readonly organizationId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ListImportBatchesResult {
  readonly batches: readonly BatchSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number | null;
}

export interface GetImportBatchDetailInput {
  readonly organizationId: string;
  readonly submissionId: string;
}

export type GetImportBatchDetailResult =
  | {
      readonly kind: "found";
      readonly batch: BatchSummary;
    }
  | {
      readonly kind: "not_found";
      readonly error: Extract<
        GetImportSubmissionDetailResult,
        { readonly kind: "not_found" }
      >["error"];
    };

export interface BatchReadServiceOperations {
  readonly listImportSubmissions: typeof listImportSubmissions;
  readonly getImportSubmissionDetail: typeof getImportSubmissionDetail;
  readonly readProducerBatchObservations: typeof readProducerBatchObservations;
  readonly readProducerBatchObservationsByBatchIds:
    typeof readProducerBatchObservationsByBatchIds;
  readonly mapBatchStatus: typeof mapBatchStatus;
}

export interface BatchReadServiceDependencies {
  readonly operations?: Partial<BatchReadServiceOperations>;
  readonly batchObservationEnabled?: boolean;
}

export class BatchReadServiceInputError extends Error {
  readonly code = "INVALID_BATCH_READ_INPUT";

  constructor() {
    super("Invalid batch read input.");
    this.name = "BatchReadServiceInputError";
  }
}

const defaultOperations: BatchReadServiceOperations = {
  listImportSubmissions,
  getImportSubmissionDetail,
  readProducerBatchObservations,
  readProducerBatchObservationsByBatchIds,
  mapBatchStatus,
};

export async function listImportBatches(
  input: ListImportBatchesInput,
  dependencies: BatchReadServiceDependencies = {},
): Promise<ListImportBatchesResult> {
  validateListInput(input);

  const operations = resolveOperations(dependencies);
  const batchObservationEnabled = resolveBatchObservationEnabled(dependencies);
  const result = await operations.listImportSubmissions({
    organizationId: input.organizationId,
    page: input.page,
    pageSize: input.pageSize,
  });
  const producerObservationsByBatchId =
    await readPageProducerObservations(
      result.submissions,
      operations,
      batchObservationEnabled,
    );
  const batches = result.submissions.map((submission) =>
    composeBatchSummary(
      submission,
      operations,
      observationsForSubmission(
        submission,
        producerObservationsByBatchId,
        batchObservationEnabled,
      ),
    ),
  );

  return {
    batches,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };
}

export async function getImportBatchDetail(
  input: GetImportBatchDetailInput,
  dependencies: BatchReadServiceDependencies = {},
): Promise<GetImportBatchDetailResult> {
  validateDetailInput(input);

  const operations = resolveOperations(dependencies);
  const batchObservationEnabled = resolveBatchObservationEnabled(dependencies);
  const result = await operations.getImportSubmissionDetail({
    organizationId: input.organizationId,
    submissionId: input.submissionId,
  });

  if (result.kind === "not_found") {
    return result;
  }

  return {
    kind: "found",
    batch: await composeBatchSummary(
      result.submission,
      operations,
      await readCorrelatedProducerObservations(
        result.submission,
        operations,
        batchObservationEnabled,
      ),
    ),
  };
}

function resolveOperations(
  dependencies: BatchReadServiceDependencies,
): BatchReadServiceOperations {
  return {
    ...defaultOperations,
    ...(dependencies.operations ?? {}),
  };
}

function resolveBatchObservationEnabled(
  dependencies: BatchReadServiceDependencies,
): boolean {
  return (
    dependencies.batchObservationEnabled ??
    getServerEnv().FEATURE_BATCH_OBSERVATION_ENABLED
  );
}

function composeBatchSummary(
  submission: ImportSubmissionReadModel,
  operations: BatchReadServiceOperations,
  producerObservations: BatchProducerObservationFacts | null,
): BatchSummary {
  return {
    ...operations.mapBatchStatus({
      submission: mapSubmissionFact(submission),
      acknowledgement: mapAcknowledgementFact(submission),
      acceptance: mapAcceptanceFact(submission),
      producerObservations,
      freshness: null,
    }),
    workflowReportedClosedAt:
      submission.workflowCloseReport?.reportedClosedAt.toISOString() ??
      null,
    workflowReportedRowCount:
      submission.workflowCloseReport?.rowCountExpected ?? null,
  };
}

async function readPageProducerObservations(
  submissions: readonly ImportSubmissionReadModel[],
  operations: BatchReadServiceOperations,
  batchObservationEnabled: boolean,
): Promise<ReadonlyMap<string, BatchProducerObservationFacts>> {
  if (!batchObservationEnabled) {
    return new Map();
  }

  const importBatchIds = [
    ...new Set(
      submissions
        .map(correlatedImportBatchId)
        .filter((value): value is string => value !== null),
    ),
  ];

  if (importBatchIds.length === 0) {
    return new Map();
  }

  return operations.readProducerBatchObservationsByBatchIds({
    import_batch_ids: importBatchIds,
  });
}

function observationsForSubmission(
  submission: ImportSubmissionReadModel,
  observationsByBatchId: ReadonlyMap<
    string,
    BatchProducerObservationFacts
  >,
  batchObservationEnabled: boolean,
): BatchProducerObservationFacts | null {
  if (!batchObservationEnabled) {
    return unavailableProducerObservations();
  }

  const importBatchId = correlatedImportBatchId(submission);

  if (importBatchId === null) {
    return null;
  }

  return (
    observationsByBatchId.get(importBatchId) ??
    unavailableProducerObservations()
  );
}

async function readCorrelatedProducerObservations(
  submission: ImportSubmissionReadModel,
  operations: BatchReadServiceOperations,
  batchObservationEnabled: boolean,
): Promise<BatchProducerObservationFacts | null> {
  if (!batchObservationEnabled) {
    return unavailableProducerObservations();
  }

  const importBatchId = correlatedImportBatchId(submission);

  if (importBatchId === null) {
    return null;
  }

  return operations.readProducerBatchObservations({
    import_batch_id: importBatchId,
  });
}

function unavailableProducerObservations(): BatchProducerObservationFacts {
  return {
    factSource: BATCH_OBSERVATION_GATE_FACT_SOURCE,
    availability: "UNAVAILABLE",
    unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
    lastObservedAt: null,
    acceptedRows: [],
    terminalOutcomes: [],
    close: null,
    retainedLegacyObservations: [],
  };
}

function mapSubmissionFact(
  submission: ImportSubmissionReadModel,
): BatchSubmissionFact {
  return {
    submissionId: submission.submissionId,
    submittedAt: submission.submittedAt,
    factSource: APP_SUBMISSION_FACT_SOURCE,
  };
}

function mapAcknowledgementFact(
  submission: ImportSubmissionReadModel,
): BatchAcknowledgementFact | null {
  if (submission.workflowAcknowledgement === null) {
    return null;
  }

  return {
    import_batch_id: submission.workflowAcknowledgement.import_batch_id,
    acknowledgedAt: submission.workflowAcknowledgement.acknowledgedAt,
    factSource: WORKFLOW_ACKNOWLEDGEMENT_FACT_SOURCE,
  };
}

function mapAcceptanceFact(
  submission: ImportSubmissionReadModel,
): BatchAcceptanceFact | null {
  const importBatchId = correlatedImportBatchId(submission);

  if (submission.durableAcceptance === null || importBatchId === null) {
    return null;
  }

  return {
    import_batch_id: importBatchId,
    acceptedAt: submission.durableAcceptance.acceptedAt,
    rowCountAccepted: submission.durableAcceptance.rowCountAccepted,
    factSource: submission.statusFactSource,
  };
}

function correlatedImportBatchId(
  submission: ImportSubmissionReadModel,
): string | null {
  return submission.workflowAcknowledgement?.import_batch_id ?? null;
}

function validateListInput(input: ListImportBatchesInput): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BatchReadServiceInputError();
  }

  requireText(input.organizationId, MAX_ORGANIZATION_ID_LENGTH);
  validateOptionalPage(input.page);
  validateOptionalPageSize(input.pageSize);
}

function validateDetailInput(input: GetImportBatchDetailInput): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BatchReadServiceInputError();
  }

  requireText(input.organizationId, MAX_ORGANIZATION_ID_LENGTH);

  if (!isUuid(input.submissionId)) {
    throw new BatchReadServiceInputError();
  }
}

function requireText(value: unknown, maximumLength: number): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new BatchReadServiceInputError();
  }
}

function validateOptionalPage(value: number | undefined): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value < 1 || value > MAX_PAGE)
  ) {
    throw new BatchReadServiceInputError();
  }
}

function validateOptionalPageSize(value: number | undefined): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value < 1)
  ) {
    throw new BatchReadServiceInputError();
  }
}

function isUuid(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
