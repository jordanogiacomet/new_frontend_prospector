import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({
  query: mocks.query,
}));

import type { SqlStatement } from "../db/client";
import { SafeApiError } from "../api/errors";
import { listLeadHistory } from "./lead-history-repository";

const syntheticCnpj = "11222333000181";
const syntheticRow = {
  id: "3301",
  import_batch_id: "batch-synthetic-033",
  lead_run_id: `lr_${"a".repeat(64)}`,
  source_row: 33,
  created_at: new Date("2026-07-01T15:30:00.000Z"),
  final_action: "PROSPECTAR",
  reason: "Decisão sintética armazenada",
  current_decision_id: "3301",
};

const defaultPage = {
  page: 1,
  pageSize: 20,
} as const;
const approvedRunIdPattern = "^lr_([0-9a-f]{8}|[0-9a-f]{64})$";

function statements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function deferred<Result>() {
  let resolvePromise: (value: Result) => void = () => undefined;
  const promise = new Promise<Result>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}

async function settleMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function historyPredicate(sql: string): string {
  const match = sql.match(
    /FROM public\.company_validation_runs AS history\n\s*(WHERE[\s\S]*?)\n\)/,
  );

  if (!match?.[1]) {
    throw new Error("Eligible history predicate was not found.");
  }

  return match[1];
}

describe("listLeadHistory", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("binds the exact normalized CNPJ outside the SQL text", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeadHistory(syntheticCnpj, defaultPage);

    const [count, data] = statements();
    expect(count.text).toMatch(
      /history\.cnpj_normalizado\s*=\s*\$5/i,
    );
    expect(count.values).toEqual([
      "OK",
      "INSERIDO_VALIDATION",
      "",
      approvedRunIdPattern,
      syntheticCnpj,
    ]);
    expect(data.values).toContain(syntheticCnpj);
    expect(count.text).not.toContain(syntheticCnpj);
    expect(data.text).not.toContain(syntheticCnpj);
    expect(count.text).not.toMatch(/\bLIKE\b|\bILIKE\b/i);
  });

  it("accepts only valid run IDs with null or exact source-row provenance", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeadHistory(syntheticCnpj, defaultPage);

    const [count] = statements();
    expect(count.text).toMatch(
      /history\.processing_result\s*=\s*\$2/i,
    );
    expect(count.text).toMatch(/history\.integrity_status\s*=\s*\$1/i);
    expect(count.text).toMatch(
      /\(\s*history\.test_case_id\s+IS\s+NULL\s+OR\s+history\.test_case_id\s*=\s*'SR_'\s*\|\|\s*history\.source_row\s*\)/i,
    );
    expect(count.text).toMatch(
      /BTRIM\(history\.lead_run_id\)\s*<>\s*\$3/i,
    );
    expect(count.text).toMatch(/history\.lead_run_id\s*~\s*\$4/i);
    expect(count.text).toMatch(
      /BTRIM\(history\.final_action\)\s*<>\s*\$3/i,
    );
    expect(count.text).toMatch(
      /history\.run_created_at\s*<=\s*CURRENT_TIMESTAMP/i,
    );
    expect(count.values).toContain("INSERIDO_VALIDATION");
    expect(count.values).toContain(approvedRunIdPattern);
    expect(count.text).not.toContain("RECEBIDO");
    expect(count.text).not.toMatch(/grupo_teste/i);
  });

  it("preserves distinct decisions and run identifiers without grouping", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValueOnce([
        syntheticRow,
        {
          ...syntheticRow,
          id: "3302",
          current_decision_id: null,
        },
        {
          ...syntheticRow,
          id: "3303",
          lead_run_id: `lr_${"b".repeat(64)}`,
          current_decision_id: null,
        },
      ]);

    const result = await listLeadHistory(syntheticCnpj, defaultPage);
    const [, data] = statements();

    expect(result.history.map((item) => item.decision_id)).toEqual([
      "3301",
      "3302",
      "3303",
    ]);
    expect(result.history.map((item) => item.lead_run_id)).toEqual([
      syntheticRow.lead_run_id,
      syntheticRow.lead_run_id,
      `lr_${"b".repeat(64)}`,
    ]);
    expect(historyPredicate(data.text)).not.toMatch(
      /\bDISTINCT\b|\bGROUP BY\b|\bPARTITION BY\b/i,
    );
  });

  it("marks current only through the exact terminal decision identifier", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        syntheticRow,
        {
          ...syntheticRow,
          id: "3302",
          current_decision_id: null,
        },
      ]);

    const result = await listLeadHistory(syntheticCnpj, defaultPage);
    const [, data] = statements();

    expect(result.history.map((item) => item.isCurrent)).toEqual([
      true,
      false,
    ]);
    expect(data.text).toMatch(
      /current_terminal\.id::text\s+AS\s+decision_id/i,
    );
    expect(data.text).toMatch(
      /current_decision\.decision_id\s*=\s*history\.id/i,
    );
    expect(data.text).not.toMatch(
      /current_decision\.lead_run_id\s*=\s*history\.lead_run_id/i,
    );
  });

  it("identifies the current decision from the exact approved projection relation", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeadHistory(syntheticCnpj, defaultPage);

    const [, data] = statements();
    expect(data.text).toMatch(
      /current_terminal\.lead_run_id\s*=\s*current_projection\.last_lead_run_id/i,
    );
    expect(data.text).toMatch(
      /current_terminal\.cnpj_normalizado\s*=\s*current_projection\.cnpj_normalizado/i,
    );
    expect(data.text).toMatch(
      /current_terminal\.import_batch_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+current_projection\.last_import_batch_id/i,
    );
    expect(data.text).toMatch(
      /current_terminal\.source_row\s+IS\s+NOT\s+DISTINCT\s+FROM\s+current_projection\.last_source_row/i,
    );
    expect(data.text).toMatch(/terminal_count\s*=\s*\$6/i);
  });

  it("uses the fixed deterministic history ordering", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeadHistory(syntheticCnpj, defaultPage);

    const [, data] = statements();
    expect(data.text).toMatch(
      /ORDER BY\s+history\.created_at\s+DESC,\s+history\.id\s+DESC/i,
    );
    expect(data.text.match(/\bORDER BY\b/gi)).toHaveLength(1);
  });

  it("calculates bound pagination with a maximum accepted page size of 20", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 6 }])
      .mockResolvedValueOnce([]);

    await listLeadHistory(syntheticCnpj, { page: 3, pageSize: 20 });

    const [count, data] = statements();
    expect(count.values).toHaveLength(5);
    expect(data.text).toMatch(/LIMIT\s+\$7\s+OFFSET\s+\$8/i);
    expect(data.values).toEqual([
      "OK",
      "INSERIDO_VALIDATION",
      "",
      approvedRunIdPattern,
      syntheticCnpj,
      1,
      20,
      40,
    ]);
  });

  it("runs exact count and data queries sequentially", async () => {
    const count = deferred<{ total: number }[]>();
    const data = deferred<(typeof syntheticRow)[]>();
    mocks.query
      .mockImplementationOnce(() => count.promise)
      .mockImplementationOnce(() => data.promise);

    const result = listLeadHistory(syntheticCnpj, defaultPage);

    expect(mocks.query).toHaveBeenCalledTimes(1);
    count.resolve([{ total: 1 }]);
    await settleMicrotasks();
    expect(mocks.query).toHaveBeenCalledTimes(2);
    data.resolve([syntheticRow]);

    await expect(result).resolves.toMatchObject({ total: 1 });
  });

  it("uses equivalent eligibility predicates for count and data", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeadHistory(syntheticCnpj, defaultPage);

    const [count, data] = statements();
    expect(historyPredicate(data.text)).toBe(historyPredicate(count.text));
    expect(data.values.slice(0, count.values.length)).toEqual(count.values);
  });

  it("allows exactly six retained terminal rows", async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      ...syntheticRow,
      id: String(3301 + index),
      current_decision_id: index === 0 ? "3301" : null,
    }));
    mocks.query
      .mockResolvedValueOnce([{ total: 6 }])
      .mockResolvedValueOnce(rows);

    await expect(
      listLeadHistory(syntheticCnpj, defaultPage),
    ).resolves.toMatchObject({
      total: 6,
      history: expect.arrayContaining([
        expect.objectContaining({ decision_id: "3306" }),
      ]),
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("fails closed above six rows without silently querying a truncated page", async () => {
    mocks.query.mockResolvedValueOnce([{ total: 7 }]);

    const error = await listLeadHistory(
      syntheticCnpj,
      defaultPage,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SafeApiError);
    expect(error).toMatchObject({
      code: "HISTORY_UNAVAILABLE",
      message: "O histórico não está disponível no momento.",
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("fails safely when the exact total is absent or invalid", async () => {
    for (const countRows of [
      [],
      [{ total: -1 }],
      [{ total: Number.NaN }],
    ]) {
      mocks.query.mockReset();
      mocks.query.mockResolvedValueOnce(countRows);

      await expect(
        listLeadHistory(syntheticCnpj, defaultPage),
      ).rejects.toMatchObject({ code: "HISTORY_UNAVAILABLE" });
      expect(mocks.query).toHaveBeenCalledTimes(1);
    }
  });

  it("returns the exact total and retained-only incompleteness metadata", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([syntheticRow]);

    const result = await listLeadHistory(syntheticCnpj, defaultPage);

    expect(result).toMatchObject({
      total: 1,
      completeness: "retained_only",
      label: "Análises retidas encontradas",
      caveat: "Análises mais antigas podem não estar presentes.",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /proven_complete|histórico completo|todas as análises/i,
    );
  });

  it("preserves nullable native values without projection defaults", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          ...syntheticRow,
          import_batch_id: null,
          source_row: null,
          created_at: null,
          reason: null,
          current_decision_id: null,
        },
      ]);

    const result = await listLeadHistory(syntheticCnpj, defaultPage);

    expect(result.history[0]).toMatchObject({
      import_batch_id: null,
      source_row: null,
      analyzedAt: null,
      recommendedActionReason: null,
      isCurrent: false,
    });
  });

  it("queries no event, idempotency, processing, view, report, evidence, or JSON source", async () => {
    mocks.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeadHistory(syntheticCnpj, defaultPage);

    const sql = statements()
      .map((statement) => statement.text)
      .join("\n");
    expect(sql).not.toMatch(
      /lead_decisions|lead_processing|idempoten|workflow_|vw_|company_latest_validation/i,
    );
    expect(sql).not.toMatch(
      /report|evidence|payload|json|risk_flags|positive_signals|#>>|->>/i,
    );
    expect(sql).not.toMatch(/n8n|webhook|http/i);
  });

  it("is server-only, SELECT-only, typed, and reuses approved contracts", () => {
    const repositorySource = readFileSync(
      resolve(
        process.cwd(),
        "src/server/repositories/lead-history-repository.ts",
      ),
      "utf8",
    );

    expect(repositorySource).toContain('import "server-only";');
    expect(repositorySource).toContain('from "../db/client"');
    expect(repositorySource).toContain("LeadHistoryQuery");
    expect(repositorySource).toContain("LeadHistoryItem");
    expect(repositorySource).toContain("LeadHistoryRow");
    expect(repositorySource).toContain("mapLeadHistoryItem");
    expect(repositorySource).not.toMatch(/\bany\b/);
    expect(repositorySource).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
    );
    expect(repositorySource).not.toMatch(
      /from\s+["']pg["']|new\s+Pool|fetch\(|axios|n8n|webhook/i,
    );
  });
});
