import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/producer-client", () => ({
  query: mocks.query,
}));

import { SafeApiError } from "../api/errors";
import type { SqlStatement } from "../db/producer-client";
import {
  getOutsideAnalysisCompany,
  listOutsideAnalysisCompanies,
} from "./outside-analysis-repository";

const defaultQuery = {
  page: 1,
  pageSize: 20,
} as const;
const approvedRunIdPattern = "^lr_([0-9a-f]{8}|[0-9a-f]{64})$";
const syntheticRow = {
  import_batch_id: "synthetic-crm-batch",
  source_row: 9,
  cnpj_normalizado: "11222333000181",
  nome_fantasia: "Empresa Sintética CRM",
  razao_social: "Empresa Sintética CRM Ltda.",
  cidade: "Recife",
  uf: "PE",
  cnae_descricao: "Serviços sintéticos",
  final_action: "NAO_ABORDAR",
  reason: "Decisão sintética armazenada pelo produtor",
  decided_at: new Date("2026-07-23T14:30:00.000Z"),
};

function projectionRows(count: number): { cnpj: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    cnpj: String(index).padStart(14, "0"),
  }));
}

function statements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

describe("listOutsideAnalysisCompanies", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("reads only the exact current CRM destination with full integrity and provenance", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([syntheticRow]);

    const result = await listOutsideAnalysisCompanies(defaultQuery);

    const [, count, data] = statements();
    expect(count.values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "CRM_DECIDIU_E_SALVO",
      "",
      approvedRunIdPattern,
      1,
    ]);
    expect(count.text).toMatch(
      /terminal\.lead_run_id\s*=\s*company_validations\.last_lead_run_id/i,
    );
    expect(count.text).toMatch(
      /company_validations\.integrity_status\s*=\s*\$1/i,
    );
    expect(count.text).toMatch(/terminal\.integrity_status\s*=\s*\$1/i);
    expect(count.text).toMatch(/terminal\.processing_result\s*=\s*\$3/i);
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
      /COUNT\(\*\)\s+OVER\s*\(\s*PARTITION BY\s+company_validations\.id\s*\)\s+AS\s+terminal_count/i,
    );
    expect(count.text).toMatch(/terminal_count\s*=\s*\$6/i);
    expect(count.text).toMatch(/terminal\.lead_run_id\s*~\s*\$5/i);
    expect(count.text).toMatch(
      /company_validations\.validated_at\s*<=\s*CURRENT_TIMESTAMP/i,
    );
    expect(count.text).toMatch(
      /terminal\.run_created_at\s*<=\s*CURRENT_TIMESTAMP/i,
    );
    expect(count.text).not.toContain("INSERIDO_VALIDATION");
    expect(data.text).toContain("terminal.run_created_at AS decided_at");
    expect(result).toEqual({
      companies: [
        {
          import_batch_id: "synthetic-crm-batch",
          source_row: 9,
          cnpj: "11222333000181",
          companyName: "Empresa Sintética CRM",
          city: "Recife",
          uf: "PE",
          sector: "Serviços sintéticos",
          decidedAction: "NAO_ABORDAR",
          decisionReason: "Decisão sintética armazenada pelo produtor",
          decidedAt: "2026-07-23T14:30:00.000Z",
        },
      ],
      total: 1,
    });
  });

  it("uses a bound correlated batch array and bound pagination", async () => {
    const correlatedBatchIds = [
      "synthetic-same-organization-batch",
      "batch'); SELECT pg_sleep(1); --",
    ];
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listOutsideAnalysisCompanies(
      { page: 3, pageSize: 7 },
      { includeTestRunsFromImportBatchIds: correlatedBatchIds },
    );

    const [, count, data] = statements();
    expect(count.text).toContain(
      "terminal.import_batch_id = ANY($7::text[])",
    );
    expect(data.text).toContain(
      "terminal.import_batch_id = ANY($7::text[])",
    );
    expect(data.text).toMatch(/LIMIT\s+\$8\s+OFFSET\s+\$9/i);
    expect(count.values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "CRM_DECIDIU_E_SALVO",
      "",
      approvedRunIdPattern,
      1,
      correlatedBatchIds,
    ]);
    expect(data.values).toEqual([...count.values, 7, 14]);
    expect(count.text).not.toContain(correlatedBatchIds[0]);
    expect(count.text).not.toContain(correlatedBatchIds[1]);
  });

  it("keeps the production predicate when the correlated batch list is empty", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listOutsideAnalysisCompanies(defaultQuery, {
      includeTestRunsFromImportBatchIds: [],
    });

    const [, count, data] = statements();
    expect(count.text).toContain("terminal.test_case_id IS NULL");
    expect(count.text).toContain(
      "terminal.test_case_id = 'SR_' || terminal.source_row",
    );
    expect(count.text).not.toContain("ANY(");
    expect(data.text).not.toContain("ANY(");
    expect(count.values).toHaveLength(6);
  });

  it("fails closed above 1,000 current projections before count or data", async () => {
    mocks.query.mockResolvedValueOnce(projectionRows(1_001));

    await expect(
      listOutsideAnalysisCompanies(defaultQuery),
    ).rejects.toBeInstanceOf(SafeApiError);
    expect(mocks.query).toHaveBeenCalledOnce();

    const [guard] = statements();
    expect(guard.values).toEqual([1_001]);
    expect(guard.text).toMatch(
      /SELECT\s+company_validations\.cnpj\s+FROM\s+public\.company_validations\s+AS\s+company_validations\s+LIMIT\s+\$1/i,
    );
    expect(guard.text).not.toMatch(/\bWHERE\b/i);
  });

  it.each([
    undefined,
    -1,
    1_001,
    Number.NaN,
  ])("fails closed for an invalid bounded total %s", async (total) => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(total === undefined ? [] : [{ total }]);

    await expect(
      listOutsideAnalysisCompanies(defaultQuery),
    ).rejects.toBeInstanceOf(SafeApiError);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("orders decisions deterministically without browser-side recomputation", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listOutsideAnalysisCompanies(defaultQuery);

    const [, , data] = statements();
    expect(data.text).toMatch(
      /ORDER BY\s+lead\.decided_at\s+DESC,\s+lead\.projection_id\s+DESC/i,
    );
    expect(data.text.match(/\bORDER BY\b/gi)).toHaveLength(1);
  });

  it("is server-only, SELECT-only, typed, and uses the producer client", () => {
    const repositorySource = readFileSync(
      resolve(
        process.cwd(),
        "src/server/repositories/outside-analysis-repository.ts",
      ),
      "utf8",
    );

    expect(repositorySource).toContain('import "server-only";');
    expect(repositorySource).toContain('from "../db/producer-client"');
    expect(repositorySource).toContain("mapOutsideAnalysisCompany");
    expect(repositorySource).toContain("OutsideAnalysisCompanyRow");
    expect(repositorySource).not.toMatch(/\bany\b/);
    expect(repositorySource).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
    );
    expect(repositorySource).not.toMatch(
      /from\s+["']pg["']|new\s+Pool|fetch\(|axios|n8n|webhook/i,
    );
    expect(repositorySource).not.toContain("../db/app-client");
  });
});

describe("getOutsideAnalysisCompany", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("returns the mapped current CRM decision for one bound CNPJ", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([syntheticRow]);

    const result = await getOutsideAnalysisCompany("11222333000181");

    const [guard, detail] = statements();
    expect(guard.values).toEqual([1_001]);
    expect(detail.values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "CRM_DECIDIU_E_SALVO",
      "",
      approvedRunIdPattern,
      1,
      "11222333000181",
    ]);
    expect(detail.text).toMatch(
      /lead\.cnpj_normalizado\s*=\s*\$7/i,
    );
    expect(detail.text).toMatch(/LIMIT\s+2/i);
    expect(detail.text).not.toContain("11222333000181");
    expect(result).toEqual({
      import_batch_id: "synthetic-crm-batch",
      source_row: 9,
      cnpj: "11222333000181",
      companyName: "Empresa Sintética CRM",
      city: "Recife",
      uf: "PE",
      sector: "Serviços sintéticos",
      decidedAction: "NAO_ABORDAR",
      decisionReason: "Decisão sintética armazenada pelo produtor",
      decidedAt: "2026-07-23T14:30:00.000Z",
    });
  });

  it("preserves correlated visibility and binds the CNPJ after the batch array", async () => {
    const correlatedBatchIds = ["synthetic-correlated-batch"];
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([syntheticRow]);

    await getOutsideAnalysisCompany("11222333000181", {
      includeTestRunsFromImportBatchIds: correlatedBatchIds,
    });

    const [, detail] = statements();
    expect(detail.text).toContain(
      "terminal.import_batch_id = ANY($7::text[])",
    );
    expect(detail.text).toMatch(
      /lead\.cnpj_normalizado\s*=\s*\$8/i,
    );
    expect(detail.values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "CRM_DECIDIU_E_SALVO",
      "",
      approvedRunIdPattern,
      1,
      correlatedBatchIds,
      "11222333000181",
    ]);
  });

  it("returns null when no current eligible decision exists", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      getOutsideAnalysisCompany("11222333000181"),
    ).resolves.toBeNull();
  });

  it("fails closed when the CNPJ resolves to more than one eligible projection", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([syntheticRow, { ...syntheticRow }]);

    await expect(
      getOutsideAnalysisCompany("11222333000181"),
    ).rejects.toBeInstanceOf(SafeApiError);
  });

  it("applies the same 1,000-projection guard before detail access", async () => {
    mocks.query.mockResolvedValueOnce(projectionRows(1_001));

    await expect(
      getOutsideAnalysisCompany("11222333000181"),
    ).rejects.toBeInstanceOf(SafeApiError);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});
