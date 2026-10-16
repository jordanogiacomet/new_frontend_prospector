import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../../db/app-client", () => ({ query: mocks.query }));

import { SafeApiError } from "../../api/errors";
import type { SqlStatement } from "../../db/app-client";
import {
  ImportReceivedCompaniesRepositoryInputError,
  listImportReceivedCompanies,
  type ListImportReceivedCompaniesInput,
} from "./import-received-companies-repository";

const organizationId = "org-synthetic-a";
const submissionId = "00000000-0000-4000-8000-000000000819";
const receivedAt = new Date("2026-10-14T15:30:00.000Z");

function input(
  overrides: Partial<ListImportReceivedCompaniesInput> = {},
): ListImportReceivedCompaniesInput {
  return { organizationId, submissionId, ...overrides };
}

function statements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

beforeEach(() => {
  mocks.query.mockReset();
});

describe("listImportReceivedCompanies", () => {
  it("paginates only the requested organization and submission with safe row identities", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: "45" }])
      .mockResolvedValueOnce([
        { source_row: "21", received_at: receivedAt },
        { source_row: 22, received_at: "2026-10-14T15:31:00.000Z" },
      ]);

    await expect(listImportReceivedCompanies(input({ page: 2, pageSize: 20 }))).resolves.toEqual({
      companies: [
        { source_row: 21, receivedAt: receivedAt.toISOString() },
        { source_row: 22, receivedAt: "2026-10-14T15:31:00.000Z" },
      ],
      page: 2,
      pageSize: 20,
      total: 45,
    });

    const [count, list] = statements();
    expect(count?.text).toMatch(/COUNT\(\*\)::text/i);
    expect(count?.values).toEqual([organizationId, submissionId]);
    expect(list?.values).toEqual([organizationId, submissionId, 20, 20]);
    expect(list?.text).toMatch(/ORDER BY source_row ASC\s+LIMIT \$3 OFFSET \$4/i);

    for (const statement of [count, list]) {
      expect(statement?.text).toMatch(/organization_id = \$1 AND submission_id = \$2/i);
      expect(statement?.text).not.toContain(organizationId);
      expect(statement?.text).not.toContain(submissionId);
      expect(statement?.text).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|public\./i);
    }
  });

  it("returns confirmed zero only after successful scoped reads", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: "0" }])
      .mockResolvedValueOnce([]);

    await expect(listImportReceivedCompanies(input())).resolves.toEqual({
      companies: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(statements()[1]?.values).toEqual([organizationId, submissionId, 20, 0]);
  });

  it("keeps another organization scoped independently without falling back to a global read", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: "0" }])
      .mockResolvedValueOnce([]);

    const result = await listImportReceivedCompanies(input({ organizationId: "org-synthetic-b" }));

    expect(result.companies).toEqual([]);
    expect(statements().every((statement) => statement.values[0] === "org-synthetic-b")).toBe(true);
  });

  it("maps only the approved row identity and timestamp", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        source_row: String(Number.MAX_SAFE_INTEGER),
        received_at: receivedAt,
        company_name: "Empresa Sintética Oculta",
        raw_payload: { synthetic: "withheld" },
      }]);

    await expect(listImportReceivedCompanies(input())).resolves.toMatchObject({
      companies: [{ source_row: Number.MAX_SAFE_INTEGER, receivedAt: receivedAt.toISOString() }],
    });
    const statement = statements()[1];
    expect(statement?.text).toMatch(/SELECT source_row, received_at/i);
    expect(statement?.text).not.toMatch(/company_name|cnpj|payload|lead_run_id/i);
  });

  it.each([
    { organizationId: "" },
    { organizationId: " org-synthetic-a" },
    { organizationId: "x".repeat(129) },
    { submissionId: "not-a-uuid" },
    { page: 0 },
    { page: 1.5 },
    { page: 10_001 },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: Number.POSITIVE_INFINITY },
  ])("rejects invalid input before database work: %j", async (invalid) => {
    await expect(listImportReceivedCompanies(input(invalid))).rejects.toBeInstanceOf(
      ImportReceivedCompaniesRepositoryInputError,
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "1.5", "-1", "9007199254740992", null])(
    "does not present invalid total %j as a confirmed count",
    async (total) => {
      mocks.query.mockResolvedValueOnce([{ total }]);

      await expect(listImportReceivedCompanies(input())).rejects.toBeInstanceOf(SafeApiError);
      expect(mocks.query).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["0", "-1", "1.5", "9007199254740992", null])(
    "rejects unsafe producer row identity %j",
    async (source_row) => {
      mocks.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ source_row, received_at: receivedAt }]);

      await expect(listImportReceivedCompanies(input())).rejects.toBeInstanceOf(SafeApiError);
    },
  );

  it.each(["invalid-date", new Date("invalid"), null])(
    "rejects unavailable received timestamps %j",
    async (received_at) => {
      mocks.query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ source_row: "1", received_at }]);

      await expect(listImportReceivedCompanies(input())).rejects.toBeInstanceOf(SafeApiError);
    },
  );

  it("propagates a database outage without claiming there are no received companies", async () => {
    const failure = new Error("synthetic database unavailable");
    mocks.query.mockRejectedValueOnce(failure);

    await expect(listImportReceivedCompanies(input())).rejects.toBe(failure);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
