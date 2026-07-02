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
import { getLeadDetail } from "./lead-detail-repository";

const syntheticCnpj = "11222333000181";
const syntheticLeadRunId = `lr_${"a".repeat(64)}`;

const syntheticRow = {
  decision_id: "9001",
  import_batch_id: "batch-synthetic-026",
  lead_run_id: syntheticLeadRunId,
  source_row: 26,
  source_hash: "sha256:synthetic-detail-source",
  agent_version: "agent-synthetic-v26",
  cnpj_normalizado: syntheticCnpj,
  nome_fantasia: "Empresa Sintética",
  razao_social: "Empresa Sintética Ltda.",
  cidade: "Recife",
  uf: "PE",
  cnae_principal: "6201501",
  cnae_descricao: "Serviços sintéticos",
  porte_empresa: "Médio",
  regime_tributario: "Lucro presumido",
  faturamento_estimado: "Faixa sintética",
  quadro_funcionarios: "50 a 99",
  quantidade_filiais: 3,
  trust_score: 82,
  trust_verdict: "REVISAO_HUMANA",
  trust_status: "Revisão Humana",
  priority: "B",
  final_action: "PROSPECTAR",
  reason: "Ação armazenada pelo produtor",
  icp_score: 73,
  strategic_asset_score: 64,
  strategic_tier: "TIER_SINTETICO",
  idempotency_key: "idempotency-synthetic-026",
  used_cache: false,
  validated_at: new Date("2026-06-30T15:45:00.000Z"),
  created_at: new Date("2026-06-30T15:40:00.000Z"),
  updated_at: new Date("2026-06-30T15:50:00.000Z"),
  expires_at: new Date("2026-07-30T15:45:00.000Z"),
};

function statement(): SqlStatement {
  return mocks.query.mock.calls[0]?.[0] as SqlStatement;
}

describe("getLeadDetail", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("binds default selection to the exact normalized CNPJ", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    expect(statement().text).toMatch(
      /company_validations\.cnpj_normalizado\s*=\s*\$6/i,
    );
    expect(statement().values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "INSERIDO_VALIDATION",
      "",
      1,
      syntheticCnpj,
    ]);
    expect(statement().text).not.toContain(syntheticCnpj);
  });

  it("binds exact-run selection to both CNPJ and lead run ID", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj, syntheticLeadRunId);

    expect(statement().text).toMatch(
      /company_validations\.cnpj_normalizado\s*=\s*\$6/i,
    );
    expect(statement().text).toMatch(
      /terminal\.lead_run_id\s*=\s*\$7/i,
    );
    expect(statement().values).toEqual([
      "OK",
      "^[0-9]{14}$",
      "INSERIDO_VALIDATION",
      "",
      1,
      syntheticCnpj,
      syntheticLeadRunId,
    ]);
    expect(statement().text).not.toContain(syntheticLeadRunId);
  });

  it("does not add an exact-run predicate when leadRunId is absent", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    expect(statement().text).not.toMatch(
      /terminal\.lead_run_id\s*=\s*\$7/i,
    );
    expect(statement().values).toHaveLength(6);
  });

  it("returns null when no eligible CNPJ-bound detail exists", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await expect(getLeadDetail(syntheticCnpj)).resolves.toBeNull();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("returns null when the exact CNPJ and run pair does not match", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await expect(
      getLeadDetail(syntheticCnpj, syntheticLeadRunId),
    ).resolves.toBeNull();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("maps the selected scalar row through the approved detail mapper", async () => {
    mocks.query.mockResolvedValueOnce([syntheticRow]);

    const detail = await getLeadDetail(syntheticCnpj);

    expect(detail).toMatchObject({
      decision_id: "9001",
      cnpj: syntheticCnpj,
      lead_run_id: syntheticLeadRunId,
      score: 82,
      recommendedAction: "PROSPECTAR",
      recommendedActionReason: "Ação armazenada pelo produtor",
      evidences: {
        status: "omitted_by_policy",
        content: null,
      },
      strategicReport: {
        status: "omitted_by_policy",
        content: null,
      },
    });
  });

  it("preserves nullable approved scalar fields without defaults", async () => {
    mocks.query.mockResolvedValueOnce([
      {
        ...syntheticRow,
        trust_score: null,
        reason: null,
        icp_score: null,
        strategic_asset_score: null,
        updated_at: null,
        expires_at: null,
      },
    ]);

    const detail = await getLeadDetail(syntheticCnpj);

    expect(detail).toMatchObject({
      score: null,
      recommendedActionReason: null,
      icpScore: null,
      strategicAssetScore: null,
      audit: {
        updated_at: null,
        expires_at: null,
      },
    });
  });

  it("binds the projection only to its exact selected terminal run", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    expect(statement().text).toMatch(
      /terminal\.lead_run_id\s*=\s*company_validations\.last_lead_run_id/i,
    );
    expect(statement().text).not.toMatch(
      /ORDER BY\s+terminal\.(?:created_at|run_created_at)/i,
    );
  });

  it("excludes operational and test-tagged terminal rows", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    expect(statement().text).toMatch(
      /terminal\.processing_result\s*=\s*\$3/i,
    );
    expect(statement().text).toMatch(
      /terminal\.test_case_id\s+IS\s+NULL/i,
    );
    expect(statement().values).toContain("INSERIDO_VALIDATION");
    expect(statement().text).not.toContain("RECEBIDO");
    expect(statement().text).not.toMatch(/execution_mode|PRODUCTION_E2E/i);
  });

  it("requires exactly one eligible terminal row per projection", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    expect(statement().text).toMatch(
      /COUNT\(\*\)\s+OVER\s*\(\s*PARTITION BY\s+company_validations\.id\s*\)\s+AS\s+terminal_count/i,
    );
    expect(statement().text).toMatch(/terminal_count\s*=\s*\$5/i);
    expect(statement().values).toContain(1);
  });

  it("enforces approved integrity, identity, provenance, action, and time predicates", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    const sql = statement().text;
    expect(sql).toMatch(
      /company_validations\.integrity_status\s*=\s*\$1/i,
    );
    expect(sql).toMatch(/terminal\.integrity_status\s*=\s*\$1/i);
    expect(sql).toMatch(
      /company_validations\.cnpj_normalizado\s*~\s*\$2/i,
    );
    expect(sql).toMatch(
      /company_validations\.cnpj::text\s*=\s*company_validations\.cnpj_normalizado/i,
    );
    expect(sql).toMatch(
      /terminal\.cnpj_normalizado\s*=\s*company_validations\.cnpj_normalizado/i,
    );
    expect(sql).toMatch(
      /terminal\.import_batch_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+company_validations\.last_import_batch_id/i,
    );
    expect(sql).toMatch(
      /terminal\.source_row\s+IS\s+NOT\s+DISTINCT\s+FROM\s+company_validations\.last_source_row/i,
    );
    expect(sql).toMatch(/BTRIM\(terminal\.final_action\)\s*<>\s*\$4/i);
    expect(sql).toMatch(
      /company_validations\.validated_at\s*<=\s*CURRENT_TIMESTAMP/i,
    );
    expect(sql).toMatch(
      /terminal\.run_created_at\s*<=\s*CURRENT_TIMESTAMP/i,
    );
  });

  it("uses only the approved deterministic latest ordering and one-row limit", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    expect(statement().text).toMatch(
      /ORDER BY\s+detail\.validated_at\s+DESC,\s+detail\.projection_id\s+DESC/i,
    );
    expect(statement().text.match(/\bORDER BY\b/gi)).toHaveLength(1);
    expect(statement().text).toMatch(/\bLIMIT\s+1\b/i);
  });

  it("does not query report, evidence, raw, JSON, or integrity-error content", async () => {
    mocks.query.mockResolvedValueOnce([syntheticRow]);

    const detail = await getLeadDetail(syntheticCnpj);
    const sql = statement().text;

    expect(sql).not.toMatch(
      /company_strategic_research_reports|report_json|report_markdown|evidences|risk_flags|positive_signals|raw_payload|search_queries|integrity_error|#>>|->>/i,
    );
    expect(detail?.evidences.status).toBe("omitted_by_policy");
    expect(detail?.strategicReport.status).toBe("omitted_by_policy");
  });

  it("does not infer absence, integrity, or multiplicity from unqueried content", async () => {
    mocks.query.mockResolvedValueOnce([
      {
        ...syntheticRow,
        strategic_report_match_count: 0,
        strategic_report_integrity_status: "INVALID",
        strategic_report_status: "missing",
      },
    ]);

    const detail = await getLeadDetail(syntheticCnpj);

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(detail?.strategicReport).toEqual({
      status: "omitted_by_policy",
      content: null,
    });
    expect(JSON.stringify(detail)).not.toMatch(/missing|INVALID/);
  });

  it("keeps optional contact and CRM selection disabled", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(syntheticCnpj);

    expect(statement().text).not.toMatch(
      /crm_|contact|email|phone|telefone|website/i,
    );
  });

  it("keeps injection-like values separate from SELECT-only SQL", async () => {
    const injection = "11222333000181'; DROP TABLE leads; --";
    mocks.query.mockResolvedValueOnce([]);

    await getLeadDetail(injection, `${syntheticLeadRunId}' OR TRUE --`);

    expect(statement().values).toContain(injection);
    expect(statement().values).toContain(
      `${syntheticLeadRunId}' OR TRUE --`,
    );
    expect(statement().text).not.toContain(injection);
    expect(statement().text).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
    );
  });

  it("is server-only, typed, and reuses the bounded read-only client", () => {
    const repositorySource = readFileSync(
      resolve(
        process.cwd(),
        "src/server/repositories/lead-detail-repository.ts",
      ),
      "utf8",
    );

    expect(repositorySource).toContain('import "server-only";');
    expect(repositorySource).toContain('from "../db/client"');
    expect(repositorySource).toContain("mapLeadDetail");
    expect(repositorySource).toContain("LeadDetailRow");
    expect(repositorySource).not.toMatch(/\bany\b/);
    expect(repositorySource).not.toMatch(
      /from\s+["']pg["']|new\s+Pool|fetch\(|axios|n8n|webhook/i,
    );
  });
});
