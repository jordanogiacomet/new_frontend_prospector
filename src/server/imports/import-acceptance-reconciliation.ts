import "server-only";

import {
  getImportAcceptanceCandidate,
  promoteDurableImportAcceptance,
} from "../repositories/imports/import-acceptance-reconciliation-repository";
import { readProducerImportAcceptance } from "../repositories/imports/producer-import-acceptances-repository";

const CONTRACT_VERSION = "prospecta-import-v1";

export interface ReconcileImportAcceptanceInput {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly submissionId: string;
}

export interface ReconcileImportAcceptanceOperations {
  readonly getImportAcceptanceCandidate: typeof getImportAcceptanceCandidate;
  readonly readProducerImportAcceptance: typeof readProducerImportAcceptance;
  readonly promoteDurableImportAcceptance: typeof promoteDurableImportAcceptance;
}

export interface ReconcileImportAcceptanceDependencies {
  readonly operations?: Partial<ReconcileImportAcceptanceOperations>;
}

export type ReconcileImportAcceptanceResult =
  | { readonly kind: "confirmed"; readonly changed: boolean }
  | {
      readonly kind:
        | "not_found"
        | "not_ready"
        | "not_observed"
        | "unavailable"
        | "conflict";
    };

export class ImportAcceptanceReconciliationInputError extends Error {
  readonly code = "INVALID_IMPORT_ACCEPTANCE_RECONCILIATION_INPUT";

  constructor() {
    super("Invalid import acceptance reconciliation input.");
    this.name = "ImportAcceptanceReconciliationInputError";
  }
}

const defaultOperations: ReconcileImportAcceptanceOperations = {
  getImportAcceptanceCandidate,
  readProducerImportAcceptance,
  promoteDurableImportAcceptance,
};

export async function reconcileImportAcceptance(
  input: ReconcileImportAcceptanceInput,
  dependencies: ReconcileImportAcceptanceDependencies = {},
): Promise<ReconcileImportAcceptanceResult> {
  validateInput(input);
  const operations = {
    ...defaultOperations,
    ...(dependencies.operations ?? {}),
  };
  const candidateResult =
    await operations.getImportAcceptanceCandidate({
      organizationId: input.organizationId,
      submissionId: input.submissionId,
    });

  if (candidateResult.kind === "not_found") {
    return { kind: "not_found" };
  }

  if (candidateResult.kind === "inconsistent") {
    return { kind: "conflict" };
  }

  const candidate = candidateResult.candidate;

  if (
    candidate.status === "DURABLE_ACCEPTED" &&
    candidate.durableAcceptance !== null
  ) {
    return { kind: "confirmed", changed: false };
  }

  if (candidate.workflowAcknowledgement === null) {
    return { kind: "not_ready" };
  }

  const producerResult =
    await operations.readProducerImportAcceptance({
      submissionId: input.submissionId,
    });

  if (producerResult.availability === "UNAVAILABLE") {
    return { kind: "unavailable" };
  }

  if (producerResult.availability === "INCONSISTENT") {
    return { kind: "conflict" };
  }

  if (producerResult.acceptance === null) {
    return { kind: "not_observed" };
  }

  const acceptance = producerResult.acceptance;

  if (
    candidate.appContractVersion !== CONTRACT_VERSION ||
    acceptance.submissionId !== candidate.submissionId ||
    acceptance.uploadedFileSha256 !== candidate.fileSha256 ||
    acceptance.import_batch_id !==
      candidate.workflowAcknowledgement.import_batch_id ||
    acceptance.acceptedRowCount !==
      candidate.workflowAcknowledgement.row_count ||
    acceptance.acceptedAt.getTime() < candidate.submittedAt.getTime() ||
    acceptance.acceptedAt.getTime() >
      candidate.workflowAcknowledgement.acknowledgedAt.getTime()
  ) {
    return { kind: "conflict" };
  }

  const promotion =
    await operations.promoteDurableImportAcceptance({
      organizationId: input.organizationId,
      actorSubject: input.actorSubject,
      submissionId: input.submissionId,
      fileSha256: candidate.fileSha256,
      appContractVersion: candidate.appContractVersion,
      acceptance: {
        import_batch_id: acceptance.import_batch_id,
        acceptedRowCount: acceptance.acceptedRowCount,
        acceptedAt: acceptance.acceptedAt,
      },
    });

  if (promotion.kind === "confirmed") {
    return promotion;
  }

  return {
    kind: promotion.kind === "not_found" ? "not_found" : "conflict",
  };
}

function validateInput(input: ReconcileImportAcceptanceInput): void {
  if (
    typeof input !== "object" ||
    input === null ||
    !isPresentText(input.organizationId, 128) ||
    !isPresentText(input.actorSubject, 256) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.submissionId,
    )
  ) {
    throw new ImportAcceptanceReconciliationInputError();
  }
}

function isPresentText(value: unknown, maximumLength: number): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value
  );
}
