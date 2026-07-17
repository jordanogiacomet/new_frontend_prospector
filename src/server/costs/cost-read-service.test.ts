import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../repositories/imports/import-submissions-repository", () => ({
  listCorrelatedImportBatchIds: vi.fn(),
}));
vi.mock("../repositories/costs/cost-read-repository", () => ({
  listProducerRunCosts: vi.fn(),
}));

import type { ProducerRunCostPage } from "../repositories/costs/cost-read-repository";
import {
  CostReadServiceInputError,
  listCostOverview,
} from "./cost-read-service";

const organizationId = "org-synthetic-a";
const importBatchId = "batch-synthetic-a";
const availableRunId = `lr_${"a".repeat(64)}`;
const unknownRunId = `lr_${"b".repeat(64)}`;

const mocks = {
  listCorrelatedImportBatchIds: vi.fn(),
  listProducerRunCosts: vi.fn(),
};

function producerPage(
  overrides: Partial<ProducerRunCostPage> = {},
): ProducerRunCostPage {
  return {
    runs: overrides.runs ?? [
      {
        leadRunId: availableRunId,
        availability: "AVAILABLE",
        estimatedCostUsd: "1.25000000",
      },
    ],
    total: overrides.total ?? 1,
    availableCount: overrides.availableCount ?? 1,
    unknownCount: overrides.unknownCount ?? 0,
    ambiguousCount: overrides.ambiguousCount ?? 0,
    subtotalEstimatedUsd: Object.hasOwn(overrides, "subtotalEstimatedUsd")
      ? (overrides.subtotalEstimatedUsd ?? null)
      : "1.25000000",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCorrelatedImportBatchIds.mockResolvedValue([importBatchId]);
  mocks.listProducerRunCosts.mockResolvedValue(producerPage());
});

describe("listCostOverview", () => {
  it("uses only organization-scoped correlated batches and preserves server pagination", async () => {
    const result = await listCostOverview(
      { organizationId, page: 2, pageSize: 50 },
      { operations: mocks },
    );

    expect(mocks.listCorrelatedImportBatchIds).toHaveBeenCalledWith({
      organizationId,
    });
    expect(mocks.listProducerRunCosts).toHaveBeenCalledWith({
      importBatchIds: [importBatchId],
      page: 2,
      pageSize: 50,
    });
    expect(result).toEqual({
      runs: [
        {
          leadRunId: availableRunId,
          availability: "AVAILABLE",
          estimatedCostUsd: "1.25000000",
        },
      ],
      page: 2,
      pageSize: 50,
      total: 1,
      subtotalEstimatedUsd: "1.25000000",
      coverage: "COMPLETE",
    });
  });

  it("does not query the producer and does not infer zero when no batch is correlated", async () => {
    mocks.listCorrelatedImportBatchIds.mockResolvedValueOnce([]);

    await expect(
      listCostOverview({ organizationId }, { operations: mocks }),
    ).resolves.toEqual({
      runs: [],
      page: 1,
      pageSize: 20,
      total: 0,
      subtotalEstimatedUsd: null,
      coverage: "EMPTY",
    });
    expect(mocks.listProducerRunCosts).not.toHaveBeenCalled();
  });

  it("labels an aggregate with known and unknown runs as partial", async () => {
    mocks.listProducerRunCosts.mockResolvedValueOnce(
      producerPage({
        runs: [
          {
            leadRunId: availableRunId,
            availability: "AVAILABLE",
            estimatedCostUsd: "1.25000000",
          },
          {
            leadRunId: unknownRunId,
            availability: "UNKNOWN",
            estimatedCostUsd: null,
          },
        ],
        total: 2,
        availableCount: 1,
        unknownCount: 1,
      }),
    );

    const result = await listCostOverview(
      { organizationId },
      { operations: mocks },
    );

    expect(result).toMatchObject({
      subtotalEstimatedUsd: "1.25000000",
      coverage: "PARTIAL",
    });
  });

  it("labels a source with no available cost as unknown without fabricating zero", async () => {
    mocks.listProducerRunCosts.mockResolvedValueOnce(
      producerPage({
        runs: [
          {
            leadRunId: unknownRunId,
            availability: "UNKNOWN",
            estimatedCostUsd: null,
          },
        ],
        total: 1,
        availableCount: 0,
        unknownCount: 1,
        subtotalEstimatedUsd: null,
      }),
    );

    const result = await listCostOverview(
      { organizationId },
      { operations: mocks },
    );

    expect(result).toMatchObject({
      subtotalEstimatedUsd: null,
      coverage: "UNKNOWN",
    });
  });

  it("propagates an unavailable producer source without a partial overview", async () => {
    mocks.listProducerRunCosts.mockRejectedValueOnce(
      new Error("synthetic producer unavailable"),
    );

    await expect(
      listCostOverview({ organizationId }, { operations: mocks }),
    ).rejects.toThrow("synthetic producer unavailable");
  });

  it.each([
    { organizationId: "", page: 1, pageSize: 20 },
    { organizationId, page: 0, pageSize: 20 },
    { organizationId, page: 1, pageSize: 101 },
  ])("rejects invalid input before app or producer work", async (input) => {
    await expect(
      listCostOverview(input, { operations: mocks }),
    ).rejects.toBeInstanceOf(CostReadServiceInputError);
    expect(mocks.listCorrelatedImportBatchIds).not.toHaveBeenCalled();
    expect(mocks.listProducerRunCosts).not.toHaveBeenCalled();
  });

  it("does not return batch identifiers or technical LLM fields", async () => {
    const result = await listCostOverview(
      { organizationId },
      { operations: mocks },
    );

    expect(JSON.stringify(result)).not.toMatch(
      /batch|token|model|usage|price|llm_/i,
    );
  });
});
