import "server-only";

import type { AuthorizedActor } from "../auth/authorization";
import {
  recordImportSubmissionIntent,
  type RecordImportSubmissionIntentResult,
} from "../repositories/imports/import-submissions-repository";
import type {
  SubmitImportProducerOutcome,
  SubmitImportResult,
} from "../imports/submit-import";
import {
  validateAndHashUploadFile,
  type UploadFileInput,
} from "../imports/upload-file";

type Demo3ImportActor = Pick<
  AuthorizedActor,
  "organizationId" | "subject"
>;

export interface RecordDemo3ImportInput {
  readonly organizationId: string;
  readonly actor: Demo3ImportActor;
  readonly idempotencyKey: string;
  readonly file: UploadFileInput;
}

export interface RecordDemo3ImportOperations {
  readonly validateAndHashUploadFile: typeof validateAndHashUploadFile;
  readonly recordImportSubmissionIntent: typeof recordImportSubmissionIntent;
}

export interface RecordDemo3ImportDependencies {
  readonly operations?: Partial<RecordDemo3ImportOperations>;
}

export class Demo3ImportInputError extends Error {
  readonly code = "INVALID_IMPORT_SUBMISSION_INPUT";

  constructor() {
    super("Invalid Demo 3 import submission input.");
    this.name = "Demo3ImportInputError";
  }
}

const defaultOperations: RecordDemo3ImportOperations = {
  validateAndHashUploadFile,
  recordImportSubmissionIntent,
};

export async function recordDemo3Import(
  input: RecordDemo3ImportInput,
  dependencies: RecordDemo3ImportDependencies = {},
): Promise<SubmitImportResult> {
  validateInput(input);
  const operations = {
    ...defaultOperations,
    ...(dependencies.operations ?? {}),
  };
  const file = await operations.validateAndHashUploadFile(input.file);
  const intent = await operations.recordImportSubmissionIntent({
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

  return mapIntent(intent);
}

function mapIntent(
  intent: RecordImportSubmissionIntentResult,
): SubmitImportResult {
  if (intent.kind === "conflict") {
    return intent;
  }

  if (intent.kind === "duplicate") {
    return {
      kind: "duplicate",
      producerOutcome: producerOutcomeFor(intent.submission),
      submission: intent.submission,
    };
  }

  return {
    kind: "submitted",
    producerOutcome: "unknown",
    submission: intent.submission,
  };
}

function producerOutcomeFor(
  submission: Extract<
    RecordImportSubmissionIntentResult,
    { readonly kind: "created" | "duplicate" }
  >["submission"],
): SubmitImportProducerOutcome {
  if (
    submission.status === "PRODUCER_ACKNOWLEDGED" ||
    submission.producerAcknowledgement !== null
  ) {
    return "acknowledged";
  }

  return "unknown";
}

function validateInput(input: RecordDemo3ImportInput): void {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    typeof input.actor !== "object" ||
    input.actor === null ||
    Array.isArray(input.actor)
  ) {
    throw new Demo3ImportInputError();
  }

  requireText(input.organizationId, 128);
  requireText(input.actor.organizationId, 128);
  requireText(input.actor.subject, 256);
  requireText(input.idempotencyKey, 128);

  if (input.actor.organizationId !== input.organizationId) {
    throw new Demo3ImportInputError();
  }
}

function requireText(value: unknown, maximumLength: number): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new Demo3ImportInputError();
  }
}
