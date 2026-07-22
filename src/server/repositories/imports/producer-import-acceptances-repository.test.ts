import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class DatabaseUnavailableError extends Error {
    readonly code = "DATABASE_UNAVAILABLE";

    constructor() {
      super("Database temporarily unavailable.");
      this.name = "DatabaseUnavailableError";
    }
  }

  return {
    query: vi.fn(),
    DatabaseUnavailableError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../../db/producer-client", () => ({
  query: mocks.query,
  DatabaseUnavailableError: mocks.DatabaseUnavailableError,
}));

import { DatabaseUnavailableError } from "../../db/producer-client";
import type { SqlStatement } from "../../db/producer-client";
import {
  ProducerImportAcceptanceRepositoryInputError,
  readProducerImportAcceptance,
} from "./producer-import-acceptances-repository";

const submissionId = "00000000-0000-4000-8000-000000000015";
const importBatchId = `ib_${"a".repeat(64)}`;
const fileSha256 = "b".repeat(64);
const acceptedAt = new Date("2026-07-20T12:00:00.000Z");

function statement(): SqlStatement {
  return mocks.query.mock.calls[0]?.[0] as SqlStatement;
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/repositories/imports/producer-import-acceptances-repository.ts",
    ),
    "utf8",
  );
}

beforeEach(() => {
  mocks.query.mockReset();
});

describe("readProducerImportAcceptance", () => {
  it("reads one acceptance by parameterized submission id", async () => {
    mocks.query.mockResolvedValueOnce([
      {
        submission_id: submissionId,
        import_batch_id: importBatchId,
        uploaded_file_sha256: fileSha256,
        accepted_row_count: 2,
        accepted_at: acceptedAt,
      },
    ]);

    await expect(
      readProducerImportAcceptance({ submissionId }),
    ).resolves.toEqual({
      availability: "AVAILABLE",
      factSource: "producer_import_acceptances_v1",
      acceptance: {
        submissionId,
        import_batch_id: importBatchId,
        uploadedFileSha256: fileSha256,
        acceptedRowCount: 2,
        acceptedAt,
      },
    });

    expect(statement().text).toMatch(
      /FROM public\.prospecta_import_acceptances_v1/i,
    );
    expect(statement().text).toMatch(
      /WHERE submission_id = \$1\s+LIMIT 1/i,
    );
    expect(statement().values).toEqual([submissionId]);
    expect(statement().text).not.toContain(submissionId);
  });

  it("returns available with no acceptance when no durable fact exists", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await expect(
      readProducerImportAcceptance({ submissionId }),
    ).resolves.toEqual({
      availability: "AVAILABLE",
      factSource: "producer_import_acceptances_v1",
      acceptance: null,
    });
  });

  it("returns unavailable without leaking producer errors", async () => {
    mocks.query.mockRejectedValueOnce(new DatabaseUnavailableError());

    const result = await readProducerImportAcceptance({ submissionId });

    expect(result).toEqual({
      availability: "UNAVAILABLE",
      factSource: "producer_import_acceptances_v1",
      acceptance: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/SELECT|public\.|\$1/i);
  });

  it.each([
    ["wrong submission", { submission_id: "not-the-submission" }],
    ["noncanonical batch", { import_batch_id: "batch-temporal" }],
    ["invalid hash", { uploaded_file_sha256: "not-a-hash" }],
    ["zero rows", { accepted_row_count: 0 }],
    ["invalid timestamp", { accepted_at: "not-a-date" }],
  ] as const)("fails closed for %s in the producer row", async (_label, override) => {
    mocks.query.mockResolvedValueOnce([
      {
        submission_id: submissionId,
        import_batch_id: importBatchId,
        uploaded_file_sha256: fileSha256,
        accepted_row_count: 2,
        accepted_at: acceptedAt,
        ...override,
      },
    ]);

    await expect(
      readProducerImportAcceptance({ submissionId }),
    ).resolves.toEqual({
      availability: "INCONSISTENT",
      factSource: "producer_import_acceptances_v1",
      acceptance: null,
    });
  });

  it.each(["", "not-a-uuid", ` ${submissionId}`])(
    "rejects invalid submission id %j before producer work",
    async (value) => {
      await expect(
        readProducerImportAcceptance({ submissionId: value }),
      ).rejects.toBeInstanceOf(
        ProducerImportAcceptanceRepositoryInputError,
      );
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("selects only the five allowlisted acceptance columns", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await readProducerImportAcceptance({ submissionId });

    const selectedColumns = statement()
      .text.match(/SELECT([\s\S]*?)FROM/i)?.[1]
      ?.split(",")
      .map((column) => column.trim());
    expect(selectedColumns).toEqual([
      "submission_id",
      "import_batch_id",
      "uploaded_file_sha256",
      "accepted_row_count",
      "accepted_at",
    ]);
  });

  it("uses only the producer read client and no app write connection", () => {
    expect(source()).toContain("../../db/producer-client");
    expect(source()).not.toMatch(
      /app-client|APP_DATABASE_URL|INSERT|UPDATE|DELETE/i,
    );
  });
});
