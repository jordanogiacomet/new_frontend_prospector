import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateAndHashUploadFile: vi.fn(),
  recordImportSubmissionIntent: vi.fn(),
  submitToN8nIngress: vi.fn(),
  recordProducerAcknowledgement: vi.fn(),
  recordProducerOutcomeUnknown: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./upload-file", () => ({
  validateAndHashUploadFile: mocks.validateAndHashUploadFile,
}));
vi.mock("./ingress-client", () => ({
  submitToN8nIngress: mocks.submitToN8nIngress,
}));
vi.mock("../repositories/imports/import-submissions-repository", () => ({
  recordImportSubmissionIntent: mocks.recordImportSubmissionIntent,
  recordProducerAcknowledgement: mocks.recordProducerAcknowledgement,
  recordProducerOutcomeUnknown: mocks.recordProducerOutcomeUnknown,
}));

import type { N8nIngressFetch } from "./ingress-client";
import {
  submitImport,
  SubmitImportInputError,
  type SubmitImportInput,
} from "./submit-import";
import type {
  UploadFileInput,
  ValidatedUploadFile,
} from "./upload-file";
import type {
  ImportSubmissionRecord,
  ValidatedProducerAcknowledgement,
} from "../repositories/imports/import-submissions-repository";

const encoder = new TextEncoder();
const organizationId = "org-synthetic-a";
const actor = {
  organizationId,
  subject: "oidc|synthetic-manager",
} as const;
const idempotencyKey = "idem-synthetic-015";
const fileSha256 = "c".repeat(64);
const submissionId = "00000000-0000-4000-8000-000000000015";
const submittedAt = new Date("2026-07-07T15:00:00.000Z");
const acknowledgedAt = new Date("2026-07-07T15:01:00.000Z");
const importBatchId = "empresaqui_2026-07-07T15:00:00.000Z";

function uploadFile(): UploadFileInput {
  const content = encoder.encode(
    "CNPJ;Razão\n00000000000000;Empresa Sintética\n",
  );

  return {
    name: "empresaqui-sintetica.csv",
    type: "text/csv",
    size: content.byteLength,
    arrayBuffer: vi.fn(async () => Uint8Array.from(content).buffer),
  };
}

function validatedFile(): ValidatedUploadFile {
  const content = encoder.encode(
    "CNPJ;Razão\n00000000000000;Empresa Sintética\n",
  );

  return {
    bytes: content,
    filename: "empresaqui-sintetica.csv",
    mediaType: "text/csv",
    sha256: fileSha256,
    sizeBytes: content.byteLength,
  };
}

function acknowledgement(
  overrides: Partial<ValidatedProducerAcknowledgement> = {},
): ValidatedProducerAcknowledgement {
  return {
    accepted: true,
    message:
      overrides.message ?? "Arquivo recebido para processamento.",
    import_batch_id: overrides.import_batch_id ?? importBatchId,
    row_count: overrides.row_count ?? 2,
    source: overrides.source ?? "EmpresaAqui",
  };
}

function submission(
  overrides: Partial<ImportSubmissionRecord> = {},
): ImportSubmissionRecord {
  return {
    submissionId: overrides.submissionId ?? submissionId,
    organizationId: overrides.organizationId ?? organizationId,
    idempotencyKey: overrides.idempotencyKey ?? idempotencyKey,
    fileSha256: overrides.fileSha256 ?? fileSha256,
    originalFilename:
      overrides.originalFilename ?? "empresaqui-sintetica.csv",
    sizeBytes: overrides.sizeBytes ?? 128,
    mediaType: overrides.mediaType ?? "text/csv",
    appContractVersion:
      overrides.appContractVersion ?? "prospecta-import-v1",
    status: overrides.status ?? "SUBMISSION_RECORDED",
    statusFactSource: overrides.statusFactSource ?? "app_submission",
    submittedAt: overrides.submittedAt ?? submittedAt,
    producerAcknowledgement:
      overrides.producerAcknowledgement ?? null,
  };
}

function acknowledgedSubmission(): ImportSubmissionRecord {
  return submission({
    status: "PRODUCER_ACKNOWLEDGED",
    statusFactSource: "workflow_acknowledgement",
    producerAcknowledgement: {
      import_batch_id: importBatchId,
      row_count: 2,
      producerAcknowledgedAt: acknowledgedAt,
    },
  });
}

function unknownSubmission(): ImportSubmissionRecord {
  return submission({
    status: "ACCEPTANCE_UNKNOWN",
    statusFactSource: "ingress_unknown",
  });
}

function input(overrides: Partial<SubmitImportInput> = {}): SubmitImportInput {
  return {
    organizationId: overrides.organizationId ?? organizationId,
    actor:
      "actor" in overrides
        ? (overrides.actor as SubmitImportInput["actor"])
        : actor,
    idempotencyKey: overrides.idempotencyKey ?? idempotencyKey,
    file: overrides.file ?? uploadFile(),
  };
}

function ingressClient(): { readonly fetch: ReturnType<typeof vi.fn<N8nIngressFetch>> } {
  return {
    fetch: vi.fn<N8nIngressFetch>(),
  };
}

function dependencies() {
  return {
    ingressClient: ingressClient(),
  };
}

function configureCreatedAcknowledged(): void {
  mocks.validateAndHashUploadFile.mockResolvedValue(validatedFile());
  mocks.recordImportSubmissionIntent.mockResolvedValue({
    kind: "created",
    submission: submission(),
  });
  mocks.submitToN8nIngress.mockResolvedValue({
    kind: "acknowledged",
    acknowledgement: acknowledgement(),
  });
  mocks.recordProducerAcknowledgement.mockResolvedValue({
    kind: "recorded",
    submission: acknowledgedSubmission(),
  });
  mocks.recordProducerOutcomeUnknown.mockResolvedValue({
    kind: "recorded",
    submission: unknownSubmission(),
  });
}

function source(): string {
  return readFileSync(
    resolve(process.cwd(), "src/server/imports/submit-import.ts"),
    "utf8",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  configureCreatedAcknowledged();
});

describe("submitImport", () => {
  it.each([
    ["missing organization", { organizationId: "" }],
    [
      "missing actor",
      { actor: undefined as unknown as SubmitImportInput["actor"] },
    ],
    [
      "missing actor subject",
      { actor: { organizationId, subject: "" } },
    ],
    [
      "cross-organization actor",
      {
        actor: {
          organizationId: "org-synthetic-b",
          subject: actor.subject,
        },
      },
    ],
  ] as const)(
    "rejects %s before file, persistence, or ingress work",
    async (_label, overrides) => {
      await expect(
        submitImport(input(overrides), dependencies()),
      ).rejects.toBeInstanceOf(SubmitImportInputError);

      expect(mocks.validateAndHashUploadFile).not.toHaveBeenCalled();
      expect(mocks.recordImportSubmissionIntent).not.toHaveBeenCalled();
      expect(mocks.submitToN8nIngress).not.toHaveBeenCalled();
    },
  );

  it("validates and hashes the file before persisting intent", async () => {
    await submitImport(input(), dependencies());

    expect(
      mocks.validateAndHashUploadFile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.recordImportSubmissionIntent.mock.invocationCallOrder[0],
    );
    expect(mocks.recordImportSubmissionIntent).toHaveBeenCalledWith({
      organizationId,
      actorSubject: actor.subject,
      idempotencyKey,
      file: {
        filename: "empresaqui-sintetica.csv",
        sha256: fileSha256,
        sizeBytes: validatedFile().sizeBytes,
        mediaType: "text/csv",
      },
    });
  });

  it("does not persist or call ingress when file validation fails", async () => {
    mocks.validateAndHashUploadFile.mockRejectedValueOnce(
      new Error("invalid synthetic file"),
    );

    await expect(
      submitImport(input(), dependencies()),
    ).rejects.toThrow("invalid synthetic file");

    expect(mocks.recordImportSubmissionIntent).not.toHaveBeenCalled();
    expect(mocks.submitToN8nIngress).not.toHaveBeenCalled();
  });

  it("persists durable intent before the ingress call", async () => {
    await submitImport(input(), dependencies());

    expect(
      mocks.recordImportSubmissionIntent.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.submitToN8nIngress.mock.invocationCallOrder[0],
    );
  });

  it("calls the ingress exactly once for a new submission", async () => {
    const deps = dependencies();

    await submitImport(input(), deps);

    expect(mocks.submitToN8nIngress).toHaveBeenCalledTimes(1);
    expect(mocks.submitToN8nIngress).toHaveBeenCalledWith(
      validatedFile(),
      deps.ingressClient,
    );
    expect(deps.ingressClient.fetch).not.toHaveBeenCalled();
  });

  it("returns a 409-mappable conflict and does not call ingress", async () => {
    mocks.recordImportSubmissionIntent.mockResolvedValueOnce({
      kind: "conflict",
      error: {
        code: "IMPORT_IDEMPOTENCY_CONFLICT",
        httpStatus: 409,
        message: "Submission conflicts with an earlier file.",
      },
    });

    const result = await submitImport(input(), dependencies());

    expect(result).toEqual({
      kind: "conflict",
      error: {
        code: "IMPORT_IDEMPOTENCY_CONFLICT",
        httpStatus: 409,
        message: "Submission conflicts with an earlier file.",
      },
    });
    expect(mocks.submitToN8nIngress).not.toHaveBeenCalled();
    expect(mocks.recordProducerAcknowledgement).not.toHaveBeenCalled();
  });

  it("returns the original duplicate record and does not call ingress", async () => {
    const original = acknowledgedSubmission();
    mocks.recordImportSubmissionIntent.mockResolvedValueOnce({
      kind: "duplicate",
      submission: original,
    });

    const result = await submitImport(input(), dependencies());

    expect(result).toEqual({
      kind: "duplicate",
      producerOutcome: "acknowledged",
      submission: original,
    });
    expect(mocks.submitToN8nIngress).not.toHaveBeenCalled();
  });

  it("returns an original duplicate unknown record without a new ingress call", async () => {
    const original = unknownSubmission();
    mocks.recordImportSubmissionIntent.mockResolvedValueOnce({
      kind: "duplicate",
      submission: original,
    });

    const result = await submitImport(input(), dependencies());

    expect(result).toEqual({
      kind: "duplicate",
      producerOutcome: "unknown",
      submission: original,
    });
    expect(mocks.submitToN8nIngress).not.toHaveBeenCalled();
  });

  it("persists acknowledgement only after the ingress returns a validated acknowledgement", async () => {
    await submitImport(input(), dependencies());

    expect(
      mocks.submitToN8nIngress.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.recordProducerAcknowledgement.mock.invocationCallOrder[0],
    );
    expect(mocks.recordProducerAcknowledgement).toHaveBeenCalledWith({
      organizationId,
      actorSubject: actor.subject,
      submissionId,
      acknowledgement: acknowledgement(),
    });
  });

  it("does not promote acknowledgement to durable accepted, completed, or processing states", async () => {
    const result = await submitImport(input(), dependencies());

    expect(result).toMatchObject({
      kind: "submitted",
      producerOutcome: "acknowledged",
      submission: {
        status: "PRODUCER_ACKNOWLEDGED",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /ACCEPTED|DURABLE_ACCEPTED|COMPLETED|PROCESSING|rowCountAccepted|durableAcceptance/i,
    );
  });

  it("preserves import_batch_id under the original producer field name", async () => {
    const result = await submitImport(input(), dependencies());

    expect(result).toMatchObject({
      kind: "submitted",
      submission: {
        producerAcknowledgement: {
          import_batch_id: importBatchId,
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/producerBatchId/i);
  });

  it("keeps row_count as an observed acknowledgement fact", async () => {
    const result = await submitImport(input(), dependencies());

    expect(result).toMatchObject({
      kind: "submitted",
      submission: {
        producerAcknowledgement: {
          row_count: 2,
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/rowCountAccepted/i);
  });

  it("records unknown outcome without calling the ingress again", async () => {
    mocks.submitToN8nIngress.mockResolvedValueOnce({ kind: "unknown" });

    const result = await submitImport(input(), dependencies());

    expect(result).toEqual({
      kind: "submitted",
      producerOutcome: "unknown",
      submission: unknownSubmission(),
    });
    expect(mocks.submitToN8nIngress).toHaveBeenCalledTimes(1);
    expect(mocks.recordProducerOutcomeUnknown).toHaveBeenCalledWith({
      organizationId,
      actorSubject: actor.subject,
      submissionId,
    });
    expect(mocks.recordProducerAcknowledgement).not.toHaveBeenCalled();
  });

  it("maps ingress exceptions to unknown without exposing producer body details", async () => {
    mocks.submitToN8nIngress.mockRejectedValueOnce(
      new Error("raw producer body with stack and sql details"),
    );

    const result = await submitImport(input(), dependencies());

    expect(result).toEqual({
      kind: "submitted",
      producerOutcome: "unknown",
      submission: unknownSubmission(),
    });
    expect(mocks.submitToN8nIngress).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("raw producer body");
    expect(JSON.stringify(result)).not.toContain("sql details");
  });

  it("is server-only and keeps UI, direct fetch, authentication, or replay out of the service source", () => {
    const submitSource = source();

    expect(submitSource).toContain('import "server-only";');
    expect(submitSource).not.toMatch(
      /fetch\s*\(|HMAC|signature|canonical|timestamp|nonce|replay|retry|reprocess/i,
    );
    expect(submitSource).not.toMatch(
      /src\/app|\(private\)|Arquivo CSV|window|document/i,
    );
  });

  it("does not use the producer database or producer client", () => {
    expect(source()).not.toMatch(
      /PRODUCER_DATABASE_URL|producer-client|prospecta-producer-read|company_validations|company_validation_runs/i,
    );
  });
});
