import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../db/producer-client", () => ({
  query: mocks.query,
}));

import type { SqlStatement } from "../../db/producer-client";
import {
  CostReadRepositoryInputError,
  listProducerRunCosts,
} from "./cost-read-repository";

const importBatchId = "batch-synthetic-a";
const otherImportBatchId = "batch-synthetic-b";
const availableRunId = `lr_${"a".repeat(64)}`;
const unknownRunId = `lr_${"b".repeat(64)}`;
const ambiguousRunId = `lr_${"c".repeat(64)}`;
const validRunIdPattern = "^lr_([0-9a-f]{8}|[0-9a-f]{64})$";

function statements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/repositories/costs/cost-read-repository.ts",
    ),
    "utf8",
  );
}

beforeEach(() => {
  mocks.query.mockReset();
});

describe("listProducerRunCosts", () => {
  it("returns only the allowlisted run cost DTO and pagination facts", async () => {
    mocks.query
      .mockResolvedValueOnce([
        {
          total: 3,
          available_count: 1,
          unknown_count: 1,
          ambiguous_count: 1,
          subtotal_estimated_usd: "1.25000000",
        },
      ])
      .mockResolvedValueOnce([
        {
          lead_run_id: availableRunId,
          availability: "AVAILABLE",
          estimated_cost_usd: "1.25000000",
        },
        {
          lead_run_id: unknownRunId,
          availability: "UNKNOWN",
          estimated_cost_usd: null,
        },
        {
          lead_run_id: ambiguousRunId,
          availability: "AMBIGUOUS",
          estimated_cost_usd: null,
        },
      ]);

    const result = await listProducerRunCosts({
      importBatchIds: [importBatchId, otherImportBatchId],
      page: 2,
      pageSize: 3,
    });

    expect(result).toEqual({
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
        {
          leadRunId: ambiguousRunId,
          availability: "AMBIGUOUS",
          estimatedCostUsd: null,
        },
      ],
      total: 3,
      availableCount: 1,
      unknownCount: 1,
      ambiguousCount: 1,
      subtotalEstimatedUsd: "1.25000000",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /import_batch_id|llm_total_tokens|token|model|usage|price/i,
    );
  });

  it("uses the correlated batches as a bound parameter and only terminal production runs", async () => {
    mocks.query
      .mockResolvedValueOnce([
        {
          total: 0,
          available_count: 0,
          unknown_count: 0,
          ambiguous_count: 0,
          subtotal_estimated_usd: null,
        },
      ])
      .mockResolvedValueOnce([]);

    await listProducerRunCosts({
      importBatchIds: [importBatchId],
      page: 1,
      pageSize: 20,
    });

    const [summary, page] = statements();
    expect(summary?.text).toMatch(
      /run\.import_batch_id = ANY\(\$1::text\[\]\)/i,
    );
    expect(summary?.values).toContainEqual([importBatchId]);
    expect(summary?.text).not.toContain(importBatchId);
    expect(summary?.text).toMatch(/run\.integrity_status = \$2/i);
    expect(summary?.text).toMatch(/run\.processing_result = \$3/i);
    expect(summary?.text).toMatch(
      /\(run\.test_case_id IS NULL OR run\.test_case_id = 'SR_' \|\| run\.source_row\)/i,
    );
    expect(summary?.text).toMatch(/run\.lead_run_id ~ \$5/i);
    expect(summary?.values).toContain("OK");
    expect(summary?.values).toContain("INSERIDO_VALIDATION");
    expect(summary?.values).toContain(validRunIdPattern);
    expect(page?.values).toContain(20);
    expect(page?.values).toContain(0);
  });

  it("does not query the producer when no correlated batch exists", async () => {
    await expect(
      listProducerRunCosts({ importBatchIds: [], page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      runs: [],
      total: 0,
      availableCount: 0,
      unknownCount: 0,
      ambiguousCount: 0,
      subtotalEstimatedUsd: null,
    });

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("keeps a producer source failure available to the safe route mapper", async () => {
    mocks.query.mockRejectedValueOnce(new Error("synthetic producer failure"));

    await expect(
      listProducerRunCosts({
        importBatchIds: [importBatchId],
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow("synthetic producer failure");
  });

  it.each([
    { importBatchIds: [" batch-synthetic-a"], page: 1, pageSize: 20 },
    { importBatchIds: [importBatchId], page: 0, pageSize: 20 },
    { importBatchIds: [importBatchId], page: 1, pageSize: 101 },
  ])("rejects invalid input before producer work", async (input) => {
    await expect(listProducerRunCosts(input)).rejects.toBeInstanceOf(
      CostReadRepositoryInputError,
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("contains no producer mutation, raw LLM usage, pricing, or logging path", () => {
    expect(source()).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP)\b|llm_usage|model_pricing|llm_cost_usd|console\./i,
    );
    expect(source()).toContain("lead_run_id");
    expect(source()).toContain("llm_total_tokens");
    expect(source()).toContain("llm_estimated_cost_usd");
  });
});
