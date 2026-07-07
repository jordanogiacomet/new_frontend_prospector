import "server-only";

import type { AuthorizedActor } from "../auth/authorization";
import {
  recordImportSubmissionIntent,
  recordProducerAcknowledgement,
  recordProducerOutcomeUnknown,
  type ImportSubmissionRecord,
  type RecordImportSubmissionIntentResult,
} from "../repositories/imports/import-submissions-repository";
import {
  submitToN8nIngress,
  type N8nIngressClientDependencies,
  type N8nIngressResult,
} from "./ingress-client";
import {
  validateAndHashUploadFile,
  type UploadFileInput,
  type ValidatedUploadFile,
} from "./upload-file";

type SubmitImportActor = Pick<
  AuthorizedActor,
  "organizationId" | "subject"
>;

type SubmitImportConflictError = Extract<
  RecordImportSubmissionIntentResult,
  { kind: "conflict" }
>["error"];

export type SubmitImportProducerOutcome =
  | "acknowledged"
  | "unknown"
  | "not_acknowledged";

export interface SubmitImportInput {
  readonly organizationId: string;
  readonly actor: SubmitImportActor;
  readonly idempotencyKey: string;
  readonly file: UploadFileInput;
}

export interface SubmitImportOperations {
  readonly validateAndHashUploadFile: typeof validateAndHashUploadFile;
  readonly recordImportSubmissionIntent: typeof recordImportSubmissionIntent;
  readonly submitToN8nIngress: typeof submitToN8nIngress;
  readonly recordProducerAcknowledgement: typeof recordProducerAcknowledgement;
  readonly recordProducerOutcomeUnknown: typeof recordProducerOutcomeUnknown;
}

export interface SubmitImportDependencies {
  readonly ingressClient: N8nIngressClientDependencies;
  readonly operations?: Partial<SubmitImportOperations>;
}

export type SubmitImportResult =
  | {
      readonly kind: "submitted";
      readonly producerOutcome: "acknowledged";
      readonly submission: ImportSubmissionRecord;
    }
  | {
      readonly kind: "submitted";
      readonly producerOutcome: "unknown";
      readonly submission: ImportSubmissionRecord;
    }
  | {
      readonly kind: "duplicate";
      readonly producerOutcome: SubmitImportProducerOutcome;
      readonly submission: ImportSubmissionRecord;
    }
  | {
      readonly kind: "conflict";
      readonly error: SubmitImportConflictError;
    };

export class SubmitImportInputError extends Error {
  readonly code = "INVALID_IMPORT_SUBMISSION_INPUT";

  constructor() {
    super("Invalid import submission input.");
    this.name = "SubmitImportInputError";
  }
}

const defaultOperations: SubmitImportOperations = {
  validateAndHashUploadFile,
  recordImportSubmissionIntent,
  submitToN8nIngress,
  recordProducerAcknowledgement,
  recordProducerOutcomeUnknown,
};

export async function submitImport(
  input: SubmitImportInput,
  dependencies: SubmitImportDependencies,
): Promise<SubmitImportResult> {
  validateSubmitImportInput(input);
  const operations: SubmitImportOperations = {
    ...defaultOperations,
    ...(dependencies.operations ?? {}),
  };

  const file = await operations.validateAndHashUploadFile(input.file);
  const intentResult = await operations.recordImportSubmissionIntent({
    organizationId: input.organizationId,
    actorSubject: input.actor.subject,
    idempotencyKey: input.idempotencyKey,
    file: {
      filename: file.filename,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      mediaType: file.mediaType,
    },
  });

  switch (intentResult.kind) {
    case "conflict":
      return {
        kind: "conflict",
        error: intentResult.error,
      };
    case "duplicate":
      return {
        kind: "duplicate",
        producerOutcome: producerOutcomeFor(intentResult.submission),
        submission: intentResult.submission,
      };
    case "created":
      return submitNewImport(
        input,
        file,
        intentResult.submission,
        operations,
        dependencies.ingressClient,
      );
  }
}

async function submitNewImport(
  input: SubmitImportInput,
  file: ValidatedUploadFile,
  submission: ImportSubmissionRecord,
  operations: SubmitImportOperations,
  ingressClient: N8nIngressClientDependencies,
): Promise<Extract<SubmitImportResult, { kind: "submitted" }>> {
  const ingressResult = await submitToIngressSafely(
    operations,
    file,
    ingressClient,
  );

  if (ingressResult.kind === "acknowledged") {
    const acknowledgementResult =
      await operations.recordProducerAcknowledgement({
        organizationId: input.organizationId,
        actorSubject: input.actor.subject,
        submissionId: submission.submissionId,
        acknowledgement: ingressResult.acknowledgement,
      });

    if (acknowledgementResult.kind === "recorded") {
      return {
        kind: "submitted",
        producerOutcome: "acknowledged",
        submission: acknowledgementResult.submission,
      };
    }

    return {
      kind: "submitted",
      producerOutcome: "unknown",
      submission,
    };
  }

  const unknownResult = await operations.recordProducerOutcomeUnknown({
    organizationId: input.organizationId,
    actorSubject: input.actor.subject,
    submissionId: submission.submissionId,
  });

  return {
    kind: "submitted",
    producerOutcome: "unknown",
    submission:
      unknownResult.kind === "recorded"
        ? unknownResult.submission
        : submission,
  };
}

async function submitToIngressSafely(
  operations: SubmitImportOperations,
  file: ValidatedUploadFile,
  ingressClient: N8nIngressClientDependencies,
): Promise<N8nIngressResult> {
  try {
    return await operations.submitToN8nIngress(file, ingressClient);
  } catch {
    return { kind: "unknown" };
  }
}

function producerOutcomeFor(
  submission: ImportSubmissionRecord,
): SubmitImportProducerOutcome {
  if (
    submission.status === "PRODUCER_ACKNOWLEDGED" ||
    submission.producerAcknowledgement !== null
  ) {
    return "acknowledged";
  }

  return submission.status === "ACCEPTANCE_UNKNOWN"
    ? "unknown"
    : "not_acknowledged";
}

function validateSubmitImportInput(input: SubmitImportInput): void {
  if (
    typeof input.actor !== "object" ||
    input.actor === null ||
    Array.isArray(input.actor)
  ) {
    throw new SubmitImportInputError();
  }

  requireText(input.organizationId, 128);
  requireText(input.actor.organizationId, 128);
  requireText(input.actor.subject, 256);
  requireText(input.idempotencyKey, 128);

  if (input.actor.organizationId !== input.organizationId) {
    throw new SubmitImportInputError();
  }
}

function requireText(value: unknown, maximumLength: number): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new SubmitImportInputError();
  }
}
