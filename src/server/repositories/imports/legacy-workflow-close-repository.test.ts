import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../db/app-client", () => ({
  transaction: mocks.transaction,
}));

import type {
  AppDatabaseTransaction,
  SqlStatement,
} from "../../db/app-client";
import {
  LegacyWorkflowCloseRepositoryInputError,
  recordLegacyWorkflowClose,
} from "./legacy-workflow-close-repository";

const organizationId = "org-synthetic-a";
const importBatchId = "empresaqui_2026-07-22T13:50:05.504Z";
const submissionId = "00000000-0000-4000-8000-000000000701";
const occurredAt = new Date("2026-07-22T14:20:05.504Z");

function input() {
  return {
    organizationId,
    importBatchId,
    occurredAt,
    rowCountExpected: 2,
  } as const;
}

function statements(): SqlStatement[] {
  return mocks.client.query.mock.calls.map(
    (call) => call[0] as SqlStatement,
  );
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.transaction.mockReset();
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
});

describe("recordLegacyWorkflowClose", () => {
  it("records one allowlisted append-only event for a correlated submission", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        { submission_id: submissionId, acknowledged_row_count: 2 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(recordLegacyWorkflowClose(input())).resolves.toEqual({
      kind: "recorded",
      submissionCount: 1,
    });

    const [correlation, existing, insert] = statements();
    expect(correlation?.text).toMatch(
      /organization_id = \$1\s+AND producer_import_batch_id = \$2[\s\S]*FOR UPDATE/i,
    );
    expect(correlation?.values).toEqual([organizationId, importBatchId]);
    expect(existing?.text).toMatch(
      /event_type = 'WORKFLOW_CLOSED_REPORTED'/i,
    );
    expect(insert?.text).toMatch(
      /INSERT INTO prospecting_app\.import_submission_events/i,
    );
    expect(insert?.text).not.toMatch(/UPDATE|DELETE/i);
    expect(insert?.values).toContainEqual({
      source: "legacy_n8n_callback",
      import_batch_id: importBatchId,
      row_count: 2,
      status: "WORKFLOW_CLOSED_REPORTED",
      observed_at: occurredAt.toISOString(),
    });
  });

  it("accepts an exact callback replay without appending another event", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        { submission_id: submissionId, acknowledged_row_count: 2 },
      ])
      .mockResolvedValueOnce([
        {
          submission_id: submissionId,
          import_batch_id: importBatchId,
          row_count: 2,
          occurred_at: occurredAt,
        },
      ]);

    await expect(recordLegacyWorkflowClose(input())).resolves.toEqual({
      kind: "replayed",
      submissionCount: 1,
    });
    expect(statements()).toHaveLength(2);
  });

  it("rejects a conflicting replay without writing", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        { submission_id: submissionId, acknowledged_row_count: 2 },
      ])
      .mockResolvedValueOnce([
        {
          submission_id: submissionId,
          import_batch_id: importBatchId,
          row_count: 2,
          occurred_at: new Date("2026-07-22T14:21:05.504Z"),
        },
      ]);

    await expect(recordLegacyWorkflowClose(input())).resolves.toMatchObject({
      kind: "conflict",
      error: { code: "IMPORT_WORKFLOW_CLOSE_CONFLICT", httpStatus: 409 },
    });
    expect(statements()).toHaveLength(2);
  });

  it("rejects a row-count mismatch against the acknowledgement", async () => {
    mocks.client.query.mockResolvedValueOnce([
      { submission_id: submissionId, acknowledged_row_count: 3 },
    ]);

    await expect(recordLegacyWorkflowClose(input())).resolves.toMatchObject({
      kind: "conflict",
      error: { code: "IMPORT_WORKFLOW_CLOSE_CONFLICT" },
    });
    expect(statements()).toHaveLength(1);
  });

  it("fails closed when the producer batch is not correlated", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    await expect(recordLegacyWorkflowClose(input())).resolves.toMatchObject({
      kind: "not_found",
      error: { code: "IMPORT_WORKFLOW_CLOSE_NOT_FOUND", httpStatus: 404 },
    });
  });

  it.each([
    { ...input(), organizationId: "" },
    { ...input(), importBatchId: " batch" },
    { ...input(), occurredAt: new Date("invalid") },
    { ...input(), rowCountExpected: 0 },
  ])("rejects invalid input before opening a transaction", async (invalid) => {
    await expect(recordLegacyWorkflowClose(invalid)).rejects.toBeInstanceOf(
      LegacyWorkflowCloseRepositoryInputError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
