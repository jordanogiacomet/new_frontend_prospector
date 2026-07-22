import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: {
    query: vi.fn(),
  },
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../db/app-client", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

import type {
  AppDatabaseTransaction,
  SqlStatement,
} from "../../db/app-client";
import {
  ImportAcceptanceReconciliationRepositoryInputError,
  getImportAcceptanceCandidate,
  promoteDurableImportAcceptance,
} from "./import-acceptance-reconciliation-repository";

const organizationId = "org-synthetic-a";
const actorSubject = "oidc|synthetic-manager";
const submissionId = "00000000-0000-4000-8000-000000000015";
const fileSha256 = "a".repeat(64);
const importBatchId = `ib_${"b".repeat(64)}`;
const submittedAt = new Date("2026-07-20T12:00:00.000Z");
const acknowledgedAt = new Date("2026-07-20T12:00:01.000Z");
const acceptedAt = new Date("2026-07-20T12:00:00.500Z");

function installTransactionMock(): void {
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
}

function candidateRow(
  overrides: Partial<{
    submission_id: string;
    organization_id: string;
    file_sha256: string;
    app_contract_version: string;
    submitted_at: Date;
    producer_acknowledged_at: Date | null;
    producer_import_batch_id: string | null;
    acknowledged_row_count: number | null;
    durable_accepted_at: Date | null;
    durable_accepted_row_count: number | null;
    status: string;
  }> = {},
) {
  return {
    submission_id: overrides.submission_id ?? submissionId,
    organization_id: overrides.organization_id ?? organizationId,
    file_sha256: overrides.file_sha256 ?? fileSha256,
    app_contract_version:
      overrides.app_contract_version ?? "prospecta-import-v1",
    submitted_at: overrides.submitted_at ?? submittedAt,
    producer_acknowledged_at:
      "producer_acknowledged_at" in overrides
        ? (overrides.producer_acknowledged_at ?? null)
        : acknowledgedAt,
    producer_import_batch_id:
      "producer_import_batch_id" in overrides
        ? (overrides.producer_import_batch_id ?? null)
        : importBatchId,
    acknowledged_row_count:
      "acknowledged_row_count" in overrides
        ? (overrides.acknowledged_row_count ?? null)
        : 2,
    durable_accepted_at:
      "durable_accepted_at" in overrides
        ? (overrides.durable_accepted_at ?? null)
        : null,
    durable_accepted_row_count:
      "durable_accepted_row_count" in overrides
        ? (overrides.durable_accepted_row_count ?? null)
        : null,
    status: overrides.status ?? "PRODUCER_ACKNOWLEDGED",
  };
}

function promotionInput() {
  return {
    organizationId,
    actorSubject,
    submissionId,
    fileSha256,
    appContractVersion: "prospecta-import-v1",
    acceptance: {
      import_batch_id: importBatchId,
      acceptedRowCount: 2,
      acceptedAt,
    },
  } as const;
}

function readStatement(): SqlStatement {
  return mocks.query.mock.calls[0]?.[0] as SqlStatement;
}

function transactionStatements(): SqlStatement[] {
  return mocks.client.query.mock.calls.map(
    (call) => call[0] as SqlStatement,
  );
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/repositories/imports/import-acceptance-reconciliation-repository.ts",
    ),
    "utf8",
  );
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.query.mockReset();
  mocks.transaction.mockReset();
  installTransactionMock();
});

describe("getImportAcceptanceCandidate", () => {
  it("loads internal correlation facts under the verified organization", async () => {
    mocks.query.mockResolvedValueOnce([candidateRow()]);

    await expect(
      getImportAcceptanceCandidate({ organizationId, submissionId }),
    ).resolves.toEqual({
      kind: "found",
      candidate: {
        submissionId,
        organizationId,
        fileSha256,
        appContractVersion: "prospecta-import-v1",
        submittedAt,
        status: "PRODUCER_ACKNOWLEDGED",
        workflowAcknowledgement: {
          import_batch_id: importBatchId,
          row_count: 2,
          acknowledgedAt,
        },
        durableAcceptance: null,
      },
    });

    expect(readStatement().text).toMatch(
      /WHERE organization_id = \$1\s+AND submission_id = \$2/i,
    );
    expect(readStatement().values).toEqual([
      organizationId,
      submissionId,
    ]);
  });

  it("fails closed before producer work for cross-organization lookup", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await expect(
      getImportAcceptanceCandidate({
        organizationId: "org-synthetic-b",
        submissionId,
      }),
    ).resolves.toMatchObject({ kind: "not_found" });
  });

  it("returns inconsistent for incomplete acknowledgement facts", async () => {
    mocks.query.mockResolvedValueOnce([
      candidateRow({ acknowledged_row_count: null }),
    ]);

    await expect(
      getImportAcceptanceCandidate({ organizationId, submissionId }),
    ).resolves.toEqual({
      kind: "inconsistent",
      error: {
        code: "IMPORT_ACCEPTANCE_CONFLICT",
        httpStatus: 409,
        message: "Import acceptance facts are inconsistent.",
      },
    });
  });
});

describe("promoteDurableImportAcceptance", () => {
  it("updates acceptance and appends one allowlisted event atomically", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        candidateRow({
          durable_accepted_at: acceptedAt,
          durable_accepted_row_count: 2,
          status: "DURABLE_ACCEPTED",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await promoteDurableImportAcceptance(promotionInput());
    const [update, event] = transactionStatements();

    expect(result).toEqual({ kind: "confirmed", changed: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(update?.text).toMatch(
      /UPDATE prospecting_app\.import_submissions/i,
    );
    expect(update?.text).toMatch(/status = 'DURABLE_ACCEPTED'/i);
    expect(update?.text).toMatch(
      /producer_import_batch_id = \$5\s+AND acknowledged_row_count = \$6/i,
    );
    expect(update?.values).toEqual([
      organizationId,
      submissionId,
      fileSha256,
      "prospecta-import-v1",
      importBatchId,
      2,
      acceptedAt,
    ]);
    expect(event?.text).toMatch(
      /INSERT INTO prospecting_app\.import_submission_events/i,
    );
    expect(event?.values).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      organizationId,
      submissionId,
      actorSubject,
      "RECONCILIATION_OBSERVED",
      {
        source: "producer_import_acceptances_v1",
        status: "DURABLE_ACCEPTED",
        import_batch_id: importBatchId,
        row_count: 2,
        observed_at: acceptedAt.toISOString(),
      },
    ]);
  });

  it("returns unchanged and creates no duplicate event for the same durable fact", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        candidateRow({
          durable_accepted_at: acceptedAt,
          durable_accepted_row_count: 2,
          status: "DURABLE_ACCEPTED",
        }),
      ]);

    await expect(
      promoteDurableImportAcceptance(promotionInput()),
    ).resolves.toEqual({ kind: "confirmed", changed: false });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });

  it("returns a safe conflict without event when acknowledgement facts differ", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        candidateRow({ acknowledged_row_count: 3 }),
      ]);

    await expect(
      promoteDurableImportAcceptance(promotionInput()),
    ).resolves.toEqual({
      kind: "conflict",
      error: {
        code: "IMPORT_ACCEPTANCE_CONFLICT",
        httpStatus: 409,
        message: "Import acceptance facts are inconsistent.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });

  it("returns safe not_found for a missing scoped submission", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      promoteDurableImportAcceptance(promotionInput()),
    ).resolves.toMatchObject({ kind: "not_found" });
  });

  it.each([
    ["blank organization", { organizationId: "" }],
    ["blank actor", { actorSubject: "" }],
    ["bad submission", { submissionId: "not-a-uuid" }],
    ["bad hash", { fileSha256: "not-a-hash" }],
    [
      "bad batch",
      { acceptance: { import_batch_id: "not-canonical" } },
    ],
  ] as const)("rejects %s before app database work", async (_label, override) => {
    const base = promotionInput();
    const input = {
      ...base,
      ...override,
      acceptance: {
        ...base.acceptance,
        ...("acceptance" in override ? override.acceptance : {}),
      },
    };

    await expect(
      promoteDurableImportAcceptance(input),
    ).rejects.toBeInstanceOf(
      ImportAcceptanceReconciliationRepositoryInputError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("uses only the app client and never queries the producer", () => {
    expect(source()).toContain("../../db/app-client");
    expect(source()).not.toMatch(
      /producer-client|PRODUCER_DATABASE_URL|prospecta_import_acceptances_v1/i,
    );
  });
});
