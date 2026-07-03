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
import { listLeads } from "./lead-list-repository";

const syntheticRow = {
  decision_id: "9001",
  import_batch_id: "batch-synthetic-001",
  lead_run_id: "run-synthetic-001",
  source_row: 7,
  source_hash: "sha256:synthetic-source-hash",
  agent_version: "agent-synthetic-v1",
  cnpj_normalizado: "11222333000181",
  nome_fantasia: "Empresa Sintética",
  razao_social: "Empresa Sintética Ltda.",
  cidade: "Recife",
  uf: "PE",
  cnae_descricao: "Serviços sintéticos",
  trust_score: 82,
  priority: "B",
  final_action: "PROSPECTAR",
  trust_status: "Revisão Humana",
  validated_at: new Date("2026-06-30T15:45:00.000Z"),
};

const defaultQuery = {
  page: 1,
  pageSize: 20,
} as const;
const approvedRunIdPattern = "^lr_([0-9a-f]{8}|[0-9a-f]{64})$";

function projectionRows(count: number): { cnpj: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    cnpj: String(index).padStart(14, "0"),
  }));
}

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

describe("listLeads", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("allows an unfiltered source containing exactly 20 current projections", async () => {
    mocks.query
      .mockResolvedValueOnce(projectionRows(20))
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([syntheticRow]);

    await expect(listLeads(defaultQuery)).resolves.toMatchObject({
      total: 1,
      leads: [expect.objectContaining({ cnpj: "11222333000181" })],
    });
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it("fails closed above 20 projections before count or data runs", async () => {
    mocks.query.mockResolvedValueOnce(projectionRows(21));

    const error = await listLeads(defaultQuery).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(SafeApiError);
    expect(error).toMatchObject({
      code: "DATA_SOURCE_UNAVAILABLE",
      message: "Não foi possível consultar os dados agora.",
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("runs the source guard without business or eligibility filters", async () => {
    mocks.query.mockResolvedValueOnce(projectionRows(21));

    await expect(listLeads(defaultQuery)).rejects.toBeInstanceOf(SafeApiError);

    const [guard] = statements();
    expect(guard.text).toMatch(
      /SELECT\s+company_validations\.cnpj\s+FROM\s+public\.company_validations\s+AS\s+company_validations\s+LIMIT\s+\$1/i,
    );
    expect(guard.text).not.toMatch(/\bWHERE\b/i);
    expect(guard.values).toEqual([21]);
  });

  it("establishes the current eligible relation before business filters", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads({ ...defaultQuery, uf: "PE" });

    const [, count] = statements();
    const eligibleRelation = count.text.indexOf("eligible_current AS");
    const businessFilter = count.text.indexOf("lead.uf =");

    expect(eligibleRelation).toBeGreaterThan(-1);
    expect(businessFilter).toBeGreaterThan(eligibleRelation);
  });

  it("binds the projection to only its exact selected terminal run", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads(defaultQuery);

    const [, count] = statements();
    expect(count.text).toMatch(
      /terminal\.lead_run_id\s*=\s*company_validations\.last_lead_run_id/i,
    );
    expect(count.text).not.toMatch(
      /ORDER BY\s+terminal\.(?:created_at|run_created_at)/i,
    );
  });

  it("accepts only null or exact source-row provenance and valid run IDs", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads(defaultQuery);

    const [, count] = statements();
    expect(count.text).toMatch(/terminal\.processing_result\s*=\s*\$3/i);
    expect(count.text).toMatch(
      /\(\s*terminal\.test_case_id\s+IS\s+NULL\s+OR\s+terminal\.test_case_id\s*=\s*'SR_'\s*\|\|\s*terminal\.source_row\s*\)/i,
    );
    expect(count.text).toMatch(/terminal\.lead_run_id\s*~\s*\$5/i);
    expect(count.values).toContain("INSERIDO_VALIDATION");
    expect(count.values).toContain(approvedRunIdPattern);
    expect(count.text).not.toContain("RECEBIDO");
    expect(count.text).not.toMatch(/grupo_teste/i);
  });

  it("requires exactly one eligible terminal per current projection", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads(defaultQuery);

    const [, count] = statements();
    expect(count.text).toMatch(
      /COUNT\(\*\)\s+OVER\s*\(\s*PARTITION BY\s+company_validations\.id\s*\)\s+AS\s+terminal_count/i,
    );
    expect(count.text).toMatch(/terminal_count\s*=\s*\$6/i);
    expect(count.values).toContain(1);
  });

  it("enforces integrity, CNPJ, provenance, version, and non-future dates", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads(defaultQuery);

    const [, count] = statements();
    expect(count.text).toMatch(
      /company_validations\.integrity_status\s*=\s*\$1/i,
    );
    expect(count.text).toMatch(/terminal\.integrity_status\s*=\s*\$1/i);
    expect(count.text).toMatch(
      /company_validations\.cnpj_normalizado\s*~\s*\$2/i,
    );
    expect(count.text).toMatch(
      /company_validations\.cnpj::text\s*=\s*company_validations\.cnpj_normalizado/i,
    );
    expect(count.text).toMatch(
      /terminal\.cnpj_normalizado\s*=\s*company_validations\.cnpj_normalizado/i,
    );
    expect(count.text).toMatch(
      /terminal\.import_batch_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+company_validations\.last_import_batch_id/i,
    );
    expect(count.text).toMatch(
      /terminal\.source_row\s+IS\s+NOT\s+DISTINCT\s+FROM\s+company_validations\.last_source_row/i,
    );
    expect(count.text).toMatch(
      /BTRIM\(company_validations\.agent_version\)\s*<>\s*\$4/i,
    );
    expect(count.text).toMatch(
      /company_validations\.validated_at\s*<=\s*CURRENT_TIMESTAMP/i,
    );
    expect(count.text).toMatch(
      /terminal\.run_created_at\s*<=\s*CURRENT_TIMESTAMP/i,
    );
  });

  it("uses a bound exact CNPJ filter", async () => {
    const cnpj = "11222333000181";
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads({ ...defaultQuery, cnpj });

    const [, count, data] = statements();
    expect(count.text).toMatch(/lead\.cnpj_normalizado\s*=\s*\$7/i);
    expect(count.values).toContain(cnpj);
    expect(data.values).toContain(cnpj);
    expect(count.text).not.toContain(cnpj);
    expect(data.text).not.toContain(cnpj);
  });

  it("uses a bound exact UF filter", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads({ ...defaultQuery, uf: "PE" });

    const [, count] = statements();
    expect(count.text).toMatch(/lead\.uf\s*=\s*\$7/i);
    expect(count.values).toContain("PE");
    expect(count.text).not.toMatch(/\bLIKE\b/i);
  });

  it("uses a bound exact priority filter", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads({ ...defaultQuery, priority: "B" });

    const [, count] = statements();
    expect(count.text).toMatch(/lead\.priority\s*=\s*\$7/i);
    expect(count.values).toContain("B");
    expect(count.text).not.toMatch(/\bLIKE\b/i);
  });

  it("combines approved filters with AND in a stable parameter order", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads({
      page: 1,
      pageSize: 20,
      cnpj: "11222333000181",
      uf: "PE",
      priority: "R",
    });

    const [, count] = statements();
    expect(count.text).toMatch(
      /lead\.cnpj_normalizado\s*=\s*\$7\s+AND\s+lead\.uf\s*=\s*\$8\s+AND\s+lead\.priority\s*=\s*\$9/i,
    );
    expect(count.values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "INSERIDO_VALIDATION",
      "",
      approvedRunIdPattern,
      1,
      "11222333000181",
      "PE",
      "R",
    ]);
  });

  it("calculates bound LIMIT and OFFSET values from validated pagination", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads({ page: 3, pageSize: 7 });

    const [, count, data] = statements();
    expect(data.text).toMatch(/LIMIT\s+\$7\s+OFFSET\s+\$8/i);
    expect(count.values).toHaveLength(6);
    expect(data.values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "INSERIDO_VALIDATION",
      "",
      approvedRunIdPattern,
      1,
      7,
      14,
    ]);
  });

  it("uses only the fixed deterministic projection ordering", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads(defaultQuery);

    const [, , data] = statements();
    expect(data.text).toMatch(
      /ORDER BY\s+lead\.validated_at\s+DESC,\s+lead\.projection_id\s+DESC/i,
    );
    expect(data.text.match(/\bORDER BY\b/gi)).toHaveLength(1);
  });

  it("keeps count and data predicates equivalent and runs all queries sequentially", async () => {
    const guard = deferred<{ cnpj: string }[]>();
    const count = deferred<{ total: number }[]>();
    const data = deferred<(typeof syntheticRow)[]>();
    mocks.query
      .mockImplementationOnce(() => guard.promise)
      .mockImplementationOnce(() => count.promise)
      .mockImplementationOnce(() => data.promise);

    const result = listLeads({ ...defaultQuery, uf: "PE" });

    expect(mocks.query).toHaveBeenCalledTimes(1);
    guard.resolve([]);
    await settleMicrotasks();
    expect(mocks.query).toHaveBeenCalledTimes(2);
    count.resolve([{ total: 1 }]);
    await settleMicrotasks();
    expect(mocks.query).toHaveBeenCalledTimes(3);

    const [, countStatement, dataStatement] = statements();
    expect(countStatement.text).toContain(
      "FROM eligible_current AS lead\nWHERE lead.uf = $7",
    );
    expect(dataStatement.text).toContain(
      "FROM eligible_current AS lead\nWHERE lead.uf = $7",
    );
    expect(dataStatement.values.slice(0, countStatement.values.length)).toEqual(
      countStatement.values,
    );

    data.resolve([syntheticRow]);
    await expect(result).resolves.toMatchObject({ total: 1 });
  });

  it("keeps SQL injection attempts only in parameter values", async () => {
    const injection = "PE'; DROP TABLE company_validations; --";
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads({
      ...defaultQuery,
      uf: injection as "PE",
    });

    const [, count, data] = statements();
    expect(count.values).toContain(injection);
    expect(data.values).toContain(injection);
    expect(count.text).not.toContain(injection);
    expect(data.text).not.toContain(injection);
    expect(count.text).not.toMatch(/\bDROP\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b/i);
  });

  it("contains no deferred filter, wildcard search, alternate sort, or JSON access", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listLeads(defaultQuery);

    const sql = statements()
      .map((statement) => statement.text)
      .join("\n");
    expect(sql).not.toMatch(/\bLIKE\b|\bILIKE\b|%/i);
    expect(sql).not.toMatch(
      /json|raw_payload|evidences|risk_flags|positive_signals|search_queries|#>>|->>/i,
    );
    expect(sql).not.toMatch(
      /lead_decisions|lead_import_batches|crm_|n8n|webhook|http/i,
    );
    expect(sql).not.toMatch(
      /lead\.(?:city|final_action|trust_status|trust_score|validated_at)\s*=/i,
    );
  });

  it("preserves a null stored score through the existing mapper", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ ...syntheticRow, trust_score: null }]);

    const result = await listLeads(defaultQuery);

    expect(result.leads[0]?.score).toBeNull();
  });

  it("returns the strict mapped leads and exact total contract", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([syntheticRow]);

    const result = await listLeads(defaultQuery);

    expect(result).toEqual({
      leads: [
        expect.objectContaining({
          decision_id: "9001",
          lead_run_id: "run-synthetic-001",
          recommendedAction: "PROSPECTAR",
        }),
      ],
      total: 1,
    });
    expect(Object.keys(result).sort()).toEqual(["leads", "total"]);
  });

  it("exposes only safe source-limit errors without SQL or internal data", async () => {
    mocks.query.mockResolvedValueOnce(projectionRows(21));

    const error = await listLeads({
      ...defaultQuery,
      cnpj: "11222333000181",
    }).catch((caught: unknown) => caught);

    expect(JSON.stringify(error)).not.toMatch(
      /SELECT|company_validations|11222333000181|postgresql|password/i,
    );
    expect(error).not.toHaveProperty("statement");
    expect(error).not.toHaveProperty("values");
    expect(error).not.toHaveProperty("cause");
  });

  it("is server-only, SELECT-only, typed, and reuses the bounded global client", () => {
    const repositorySource = readFileSync(
      resolve(
        process.cwd(),
        "src/server/repositories/lead-list-repository.ts",
      ),
      "utf8",
    );
    const clientSource = readFileSync(
      resolve(process.cwd(), "src/server/db/client.ts"),
      "utf8",
    );

    expect(repositorySource).toContain('import "server-only";');
    expect(repositorySource).toContain('from "../db/client"');
    expect(repositorySource).toContain("mapLeadSummary");
    expect(repositorySource).toContain("LeadSummaryRow");
    expect(repositorySource).toContain("LeadListQuery");
    expect(repositorySource).not.toMatch(/\bany\b/);
    expect(repositorySource).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
    );
    expect(repositorySource).not.toMatch(
      /from\s+["']pg["']|new\s+Pool|fetch\(|axios|n8n|webhook/i,
    );
    expect(clientSource).toMatch(/\bmax:\s*2\b/);
    expect(repositorySource).not.toMatch(/\bmax:\s*[3-9]\b/);
  });
});
