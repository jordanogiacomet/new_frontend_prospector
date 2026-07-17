import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateAndHashUploadFile: vi.fn(),
  recordImportSubmissionIntent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../imports/upload-file", () => ({
  validateAndHashUploadFile: mocks.validateAndHashUploadFile,
}));
vi.mock("../repositories/imports/import-submissions-repository", () => ({
  recordImportSubmissionIntent: mocks.recordImportSubmissionIntent,
}));

import type { ImportSubmissionRecord } from "../repositories/imports/import-submissions-repository";
import type { UploadFileInput, ValidatedUploadFile } from "../imports/upload-file";
import {
  recordDemo3Import,
  Demo3ImportInputError,
  type RecordDemo3ImportInput,
} from "./demo3-import";

const organizationId = "org-synthetic-demo3";
const actorSubject = "demo3|synthetic-manager";
const idempotencyKey = "demo3-synthetic-idempotency-001";
const submissionId = "00000000-0000-4000-8000-000000000301";
const fileSha256 = "a".repeat(64);
const bytes = new TextEncoder().encode(
  "CNPJ;Razao\n00000000000000;Empresa Sintetica\n",
);

function uploadFile(): UploadFileInput {
  return {
    name: "empresaqui-demo3.csv",
    type: "text/csv",
    size: bytes.byteLength,
    arrayBuffer: vi.fn(async () => Uint8Array.from(bytes).buffer),
  };
}

function validatedFile(): ValidatedUploadFile {
  return {
    bytes,
    filename: "empresaqui-demo3.csv",
    mediaType: "text/csv",
    sha256: fileSha256,
    sizeBytes: bytes.byteLength,
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
    originalFilename: overrides.originalFilename ?? "empresaqui-demo3.csv",
    sizeBytes: overrides.sizeBytes ?? bytes.byteLength,
    mediaType: overrides.mediaType ?? "text/csv",
    appContractVersion: overrides.appContractVersion ?? "prospecta-import-v1",
    status: overrides.status ?? "SUBMISSION_RECORDED",
    statusFactSource: overrides.statusFactSource ?? "app_submission",
    submittedAt:
      overrides.submittedAt ?? new Date("2026-07-16T12:00:00.000Z"),
    producerAcknowledgement:
      overrides.producerAcknowledgement === undefined
        ? null
        : overrides.producerAcknowledgement,
  };
}

function input(
  overrides: Partial<RecordDemo3ImportInput> = {},
): RecordDemo3ImportInput {
  return {
    organizationId: overrides.organizationId ?? organizationId,
    actor:
      overrides.actor ?? {
        organizationId,
        subject: actorSubject,
      },
    idempotencyKey: overrides.idempotencyKey ?? idempotencyKey,
    file: overrides.file ?? uploadFile(),
  };
}

function source(): string {
  return readFileSync(
    resolve(process.cwd(), "src/server/demo/demo3-import.ts"),
    "utf8",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateAndHashUploadFile.mockResolvedValue(validatedFile());
  mocks.recordImportSubmissionIntent.mockResolvedValue({
    kind: "created",
    submission: submission(),
  });
});

describe("recordDemo3Import", () => {
  it.each([
    ["missing organization", { organizationId: "" }],
    [
      "cross-organization actor",
      {
        actor: {
          organizationId: "org-synthetic-other",
          subject: actorSubject,
        },
      },
    ],
    [
      "missing actor subject",
      { actor: { organizationId, subject: "" } },
    ],
  ] as const)(
    "rejects %s before reading the file or database",
    async (_label, overrides) => {
      await expect(recordDemo3Import(input(overrides))).rejects.toBeInstanceOf(
        Demo3ImportInputError,
      );

      expect(mocks.validateAndHashUploadFile).not.toHaveBeenCalled();
      expect(mocks.recordImportSubmissionIntent).not.toHaveBeenCalled();
    },
  );

  it("validates and hashes before persisting only safe file metadata", async () => {
    await recordDemo3Import(input());

    expect(
      mocks.validateAndHashUploadFile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.recordImportSubmissionIntent.mock.invocationCallOrder[0],
    );
    expect(mocks.recordImportSubmissionIntent).toHaveBeenCalledWith({
      organizationId,
      actorSubject,
      idempotencyKey,
      file: {
        filename: "empresaqui-demo3.csv",
        sha256: fileSha256,
        sizeBytes: bytes.byteLength,
        mediaType: "text/csv",
      },
    });
    expect(
      JSON.stringify(mocks.recordImportSubmissionIntent.mock.calls),
    ).not.toContain("Empresa Sintetica");
  });

  it("returns a durable app record without inventing producer acknowledgement", async () => {
    const result = await recordDemo3Import(input());

    expect(result).toEqual({
      kind: "submitted",
      producerOutcome: "unknown",
      submission: submission(),
    });
  });

  it("returns the original record for the same organization, key, and hash", async () => {
    const original = submission();
    mocks.recordImportSubmissionIntent.mockResolvedValueOnce({
      kind: "duplicate",
      submission: original,
    });

    await expect(recordDemo3Import(input())).resolves.toEqual({
      kind: "duplicate",
      producerOutcome: "unknown",
      submission: original,
    });
  });

  it("preserves a hash conflict for the route to return 409", async () => {
    const error = {
      code: "IMPORT_IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
      message: "Submission conflicts with an earlier file.",
    } as const;
    mocks.recordImportSubmissionIntent.mockResolvedValueOnce({
      kind: "conflict",
      error,
    });

    await expect(recordDemo3Import(input())).resolves.toEqual({
      kind: "conflict",
      error,
    });
  });

  it("contains no ingress, producer database, retry, or raw-file persistence path", () => {
    expect(source()).toContain('import "server-only";');
    expect(source()).not.toMatch(
      /submitToN8nIngress|N8N_IMPORT_URL|PRODUCER_DATABASE_URL|producer-client|fetch\s*\(|retry|reprocess/i,
    );
    expect(source()).not.toMatch(/file\.bytes|bytes\s*:/);
  });
});
