import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../../db/producer-client", () => ({ query: mocks.query }));

import type { SqlStatement } from "../../db/producer-client";
import {
  listProcessedImportCompanies,
  ProcessedImportCompaniesRepositoryInputError,
  type ListProcessedImportCompaniesInput,
} from "./processed-import-companies-repository";

const importBatchId = "synthetic-processed-company-batch";
const processedAt = new Date("2026-09-01T12:00:00.000Z");

function input(
  overrides: Partial<ListProcessedImportCompaniesInput> = {},
): ListProcessedImportCompaniesInput {
  return { importBatchId, ...overrides };
}

function statements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

beforeEach(() => {
  mocks.query.mockReset();
});

describe("listProcessedImportCompanies", () => {
  it("returns only the approved row and processing timestamp using scoped pagination", async () => {
    mocks.query
      .mockResolvedValueOnce([{ cnpj: "00000000000001" }])
      .mockResolvedValueOnce([{ total: 45 }])
      .mockResolvedValueOnce([
        {
          source_row: "21", processed_at: processedAt,
          cnpj_normalizado: "00000000000001", nome_fantasia: "Empresa Sintética Oculta",
          raw_payload: { synthetic: "withheld" },
        },
        { source_row: 22, processed_at: "2026-09-01T12:01:00.000Z" },
      ]);

    await expect(listProcessedImportCompanies(input({ page: 2, pageSize: 20 }))).resolves.toEqual({
      companies: [
        { source_row: 21, processedAt: processedAt.toISOString() },
        { source_row: 22, processedAt: "2026-09-01T12:01:00.000Z" },
      ],
      page: 2, pageSize: 20, total: 45,
    });

    const [guard, count, list] = statements();
    expect(guard?.values).toEqual([1001]);
    expect(count?.values.at(-1)).toBe(importBatchId);
    expect(list?.values.slice(-3)).toEqual([importBatchId, 20, 20]);
    for (const statement of statements()) {
      expect(statement.text).not.toContain(importBatchId);
      expect(statement.text).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALTER\b|\bCREATE\b/i);
      expect(statement.text).not.toMatch(/prospecta_import_acceptances|lead_import_batches|import_submissions/);
    }
  });

  it("confirms an empty page only after successful guard, count and data reads", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await expect(listProcessedImportCompanies(input())).resolves.toEqual({
      companies: [], page: 1, pageSize: 20, total: 0,
    });
    expect(statements()[2]?.values.slice(-2)).toEqual([20, 0]);
  });

  it("preserves the maximum safe row identity without exposing additional producer fields", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        source_row: String(Number.MAX_SAFE_INTEGER), processed_at: processedAt,
        lead_run_id: "lr_00000001", final_action: "PROSPECTAR",
      }]);

    await expect(listProcessedImportCompanies(input())).resolves.toMatchObject({
      companies: [{ source_row: Number.MAX_SAFE_INTEGER, processedAt: processedAt.toISOString() }],
    });
  });

  it.each([
    { importBatchId: "" },
    { importBatchId: " synthetic-batch" },
    { importBatchId: "synthetic-batch " },
    { importBatchId: "x".repeat(129) },
    { page: 0 },
    { page: 1.5 },
    { page: 10_001 },
    { page: Number.POSITIVE_INFINITY },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: Number.NaN },
  ])("rejects invalid input before producer reads: %j", async (invalid) => {
    await expect(listProcessedImportCompanies(input(invalid))).rejects.toBeInstanceOf(
      ProcessedImportCompaniesRepositoryInputError,
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([null, undefined, [], "synthetic-batch", { importBatchId: 1 }])(
    "rejects invalid runtime input %j before producer reads",
    async (invalid) => {
      await expect(listProcessedImportCompanies(invalid as unknown as ListProcessedImportCompaniesInput))
        .rejects.toBeInstanceOf(ProcessedImportCompaniesRepositoryInputError);
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("fails before count/data reads when the unfiltered source exceeds the 1000-row safety boundary", async () => {
    mocks.query.mockResolvedValueOnce(Array.from({ length: 1001 }, () => ({ cnpj: "00000000000001" })));

    await expect(listProcessedImportCompanies(input())).rejects.toMatchObject({
      code: "DATA_SOURCE_UNAVAILABLE",
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("permits exactly 1000 current projections", async () => {
    mocks.query
      .mockResolvedValueOnce(Array.from({ length: 1000 }, () => ({ cnpj: "00000000000001" })))
      .mockResolvedValueOnce([{ total: 1000 }])
      .mockResolvedValueOnce([]);

    await expect(listProcessedImportCompanies(input())).resolves.toMatchObject({ total: 1000 });
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it.each([undefined, null, "1", -1, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY])(
    "withholds malformed or unsafe count %j instead of confirming zero",
    async (total) => {
      mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total }]);

      await expect(listProcessedImportCompanies(input())).rejects.toMatchObject({
        code: "DATA_SOURCE_UNAVAILABLE",
      });
      expect(mocks.query).toHaveBeenCalledTimes(2);
    },
  );

  it("withholds a missing count result", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(listProcessedImportCompanies(input())).rejects.toMatchObject({
      code: "DATA_SOURCE_UNAVAILABLE",
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it.each(["0", "-1", "1.5", "1e2", "9007199254740992", null, undefined, 0, -1, 1.5])(
    "withholds unsafe source row %j",
    async (source_row) => {
      mocks.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ source_row, processed_at: processedAt }]);

      await expect(listProcessedImportCompanies(input())).rejects.toMatchObject({
        code: "DATA_SOURCE_UNAVAILABLE",
      });
    },
  );

  it.each(["invalid-date", new Date("invalid"), null, undefined, 123])(
    "withholds unavailable processing timestamp %j",
    async (processed_at) => {
      mocks.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ source_row: "1", processed_at }]);

      await expect(listProcessedImportCompanies(input())).rejects.toMatchObject({
        code: "DATA_SOURCE_UNAVAILABLE",
      });
    },
  );

  it.each([0, 1, 2])("does not claim processed zero when read %i fails", async (index) => {
    const failure = new Error("synthetic producer unavailable");
    if (index > 0) mocks.query.mockResolvedValueOnce([]);
    if (index > 1) mocks.query.mockResolvedValueOnce([{ total: 0 }]);
    mocks.query.mockRejectedValueOnce(failure);

    await expect(listProcessedImportCompanies(input())).rejects.toBe(failure);
    expect(mocks.query).toHaveBeenCalledTimes(index + 1);
  });
});
