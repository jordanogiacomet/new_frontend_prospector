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
  LegacyWorkflowStartRepositoryInputError,
  recordLegacyWorkflowStart,
} from "./legacy-workflow-start-repository";

const organizationId = "org-synthetic-a";
const importBatchId = "empresaqui_2026-07-23T13:50:05.504Z";
const firstSubmissionId = "00000000-0000-4000-8000-000000000801";
const secondSubmissionId = "00000000-0000-4000-8000-000000000802";
const occurredAt = new Date("2026-07-23T14:20:05.504Z");

function input(overrides: Partial<{
  readonly organizationId: string;
  readonly importBatchId: string;
  readonly occurredAt: Date;
}> = {}) {
  return {
    organizationId: overrides.organizationId ?? organizationId,
    importBatchId: overrides.importBatchId ?? importBatchId,
    occurredAt: overrides.occurredAt ?? occurredAt,
  };
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

describe("recordLegacyWorkflowStart", () => {
  it("records one minimal append-only start event for each acknowledged submission", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        { submission_id: firstSubmissionId },
        { submission_id: secondSubmissionId },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(recordLegacyWorkflowStart(input())).resolves.toEqual({
      kind: "recorded",
      submissionCount: 2,
    });

    const [correlation, existing, firstInsert, secondInsert] = statements();
    expect(correlation?.text).toMatch(
      /organization_id = \$1\s+AND producer_import_batch_id = \$2[\s\S]*producer_acknowledged_at IS NOT NULL[\s\S]*FOR UPDATE/i,
    );
    expect(correlation?.values).toEqual([organizationId, importBatchId]);
    expect(existing?.text).toMatch(
      /event_type = 'WORKFLOW_STARTED_REPORTED'/i,
    );

    for (const insert of [firstInsert, secondInsert]) {
      expect(insert?.text).toMatch(
        /INSERT INTO prospecting_app\.import_submission_events/i,
      );
      expect(insert?.text).not.toMatch(/UPDATE|DELETE/i);
      expect(insert?.values).toContainEqual({
        import_batch_id: importBatchId,
      });
      expect(JSON.stringify(insert?.values)).not.toMatch(
        /source_row|lead_run_id|idempotency_key|cnpj|payload|company/i,
      );
    }
    expect(firstInsert?.values).toContain(firstSubmissionId);
    expect(secondInsert?.values).toContain(secondSubmissionId);
  });

  it("treats later callbacks as replay regardless of their reported time", async () => {
    mocks.client.query
      .mockResolvedValueOnce([{ submission_id: firstSubmissionId }])
      .mockResolvedValueOnce([
        {
          submission_id: firstSubmissionId,
          import_batch_id: importBatchId,
        },
      ]);

    await expect(
      recordLegacyWorkflowStart(
        input({
          occurredAt: new Date("2026-07-23T14:25:05.504Z"),
        }),
      ),
    ).resolves.toEqual({
      kind: "replayed",
      submissionCount: 1,
    });

    expect(statements()).toHaveLength(2);
  });

  it("fails closed when an existing start report names another batch", async () => {
    mocks.client.query
      .mockResolvedValueOnce([{ submission_id: firstSubmissionId }])
      .mockResolvedValueOnce([
        {
          submission_id: firstSubmissionId,
          import_batch_id: "empresaqui_conflicting_batch",
        },
      ]);

    await expect(recordLegacyWorkflowStart(input())).resolves.toMatchObject({
      kind: "conflict",
      error: {
        code: "IMPORT_WORKFLOW_START_CONFLICT",
        httpStatus: 409,
      },
    });
    expect(statements()).toHaveLength(2);
  });

  it("fails closed when no acknowledged submission correlates in the organization", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    await expect(recordLegacyWorkflowStart(input())).resolves.toMatchObject({
      kind: "not_found",
      error: {
        code: "IMPORT_WORKFLOW_START_NOT_FOUND",
        httpStatus: 404,
      },
    });
    expect(statements()).toHaveLength(1);
  });

  it.each([
    input({ organizationId: "" }),
    input({ importBatchId: " batch" }),
    input({ occurredAt: new Date("invalid") }),
  ])("rejects invalid input before opening a transaction", async (invalid) => {
    await expect(recordLegacyWorkflowStart(invalid)).rejects.toBeInstanceOf(
      LegacyWorkflowStartRepositoryInputError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
