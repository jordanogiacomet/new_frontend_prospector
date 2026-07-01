import { describe, expect, it } from "vitest";

import {
  mapLeadDetail,
  type LeadDetailRow,
} from "./lead-detail-mapper";

const completeRow: LeadDetailRow = {
  decision_id: "decision-synthetic-015",
  import_batch_id: "batch-synthetic-015",
  lead_run_id: "run-synthetic-015",
  source_row: 15,
  source_hash: "sha256:synthetic-detail-source",
  agent_version: "agent-synthetic-v15",
  cnpj_normalizado: "11222333000181",
  nome_fantasia: "Empresa Sintética",
  razao_social: "Empresa Sintética Ltda.",
  cidade: "Recife",
  uf: "PE",
  cnae_principal: "6201501",
  cnae_descricao: "Desenvolvimento de programas de computador",
  porte_empresa: "Médio",
  regime_tributario: "Lucro presumido",
  faturamento_estimado: "Faixa sintética",
  quadro_funcionarios: "50 a 99",
  quantidade_filiais: 3,
  trust_score: 87,
  trust_verdict: "REVISAO_HUMANA",
  trust_status: "Revisão Humana",
  priority: "B",
  final_action: "PROSPECTAR",
  reason: "Ação armazenada pelo produtor",
  icp_score: 73,
  strategic_asset_score: 64,
  strategic_tier: "TIER_SINTETICO",
  idempotency_key: "idempotency-synthetic-015",
  used_cache: false,
  validated_at: "2026-06-30T15:45:00.000Z",
  created_at: "2026-06-30T15:40:00.000Z",
  updated_at: "2026-06-30T15:50:00.000Z",
  expires_at: "2026-07-30T15:45:00.000Z",
};

function mapWithUnapprovedFields(
  fields: Record<string, unknown>,
): ReturnType<typeof mapLeadDetail> {
  const runtimeRow = Object.assign({}, completeRow, fields) as LeadDetailRow;

  return mapLeadDetail(runtimeRow);
}

describe("mapLeadDetail", () => {
  it("maps a complete row using only approved scalar fields", () => {
    expect(mapLeadDetail(completeRow)).toEqual({
      decision_id: "decision-synthetic-015",
      import_batch_id: "batch-synthetic-015",
      lead_run_id: "run-synthetic-015",
      source_row: 15,
      source_hash: "sha256:synthetic-detail-source",
      agent_version: "agent-synthetic-v15",
      cnpj: "11222333000181",
      companyName: "Empresa Sintética",
      city: "Recife",
      uf: "PE",
      sector: "Desenvolvimento de programas de computador",
      score: 87,
      priority: "B",
      recommendedAction: "PROSPECTAR",
      trustStatus: "Revisão Humana",
      confidenceIndicator: "unknown",
      lastAnalysisAt: "2026-06-30T15:45:00.000Z",
      legalName: "Empresa Sintética Ltda.",
      tradeName: "Empresa Sintética",
      primaryCnae: "6201501",
      primaryCnaeDescription:
        "Desenvolvimento de programas de computador",
      companySize: "Médio",
      taxRegime: "Lucro presumido",
      estimatedRevenue: "Faixa sintética",
      employeeCount: "50 a 99",
      branchCount: 3,
      finalVerdict: "REVISAO_HUMANA",
      recommendedActionReason: "Ação armazenada pelo produtor",
      icpScore: 73,
      strategicAssetScore: 64,
      strategicTier: "TIER_SINTETICO",
      riskFlags: { status: "unavailable", items: null },
      positiveSignals: { status: "unavailable", items: null },
      evidences: { status: "omitted_by_policy", content: null },
      strategicReport: { status: "omitted_by_policy", content: null },
      audit: {
        decision_id: "decision-synthetic-015",
        import_batch_id: "batch-synthetic-015",
        lead_run_id: "run-synthetic-015",
        source_row: 15,
        source_hash: "sha256:synthetic-detail-source",
        agent_version: "agent-synthetic-v15",
        idempotency_key: "idempotency-synthetic-015",
        used_cache: false,
        validated_at: "2026-06-30T15:45:00.000Z",
        created_at: "2026-06-30T15:40:00.000Z",
        updated_at: "2026-06-30T15:50:00.000Z",
        expires_at: "2026-07-30T15:45:00.000Z",
      },
      dataQuality: [
        { code: "CONTENT_WITHHELD", field: "evidences" },
        { code: "CONTENT_WITHHELD", field: "strategicReport" },
      ],
    });
  });

  it("keeps approved nullable scalar and audit values null", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      import_batch_id: null,
      source_row: null,
      source_hash: null,
      nome_fantasia: null,
      razao_social: null,
      cidade: null,
      uf: null,
      cnae_principal: null,
      cnae_descricao: null,
      porte_empresa: null,
      regime_tributario: null,
      faturamento_estimado: null,
      quadro_funcionarios: null,
      quantidade_filiais: null,
      trust_score: null,
      trust_verdict: null,
      trust_status: null,
      priority: null,
      final_action: null,
      reason: null,
      icp_score: null,
      strategic_asset_score: null,
      strategic_tier: null,
      idempotency_key: null,
      used_cache: null,
      updated_at: null,
      expires_at: null,
    });

    expect(detail).toMatchObject({
      import_batch_id: null,
      source_row: null,
      source_hash: null,
      companyName: null,
      city: null,
      uf: null,
      sector: null,
      score: null,
      priority: null,
      recommendedAction: null,
      trustStatus: null,
      legalName: null,
      tradeName: null,
      primaryCnae: null,
      primaryCnaeDescription: null,
      companySize: null,
      taxRegime: null,
      estimatedRevenue: null,
      employeeCount: null,
      branchCount: null,
      finalVerdict: null,
      recommendedActionReason: null,
      icpScore: null,
      strategicAssetScore: null,
      strategicTier: null,
      audit: {
        decision_id: completeRow.decision_id,
        import_batch_id: null,
        lead_run_id: completeRow.lead_run_id,
        source_row: null,
        source_hash: null,
        agent_version: completeRow.agent_version,
        idempotency_key: null,
        used_cache: null,
        validated_at: completeRow.validated_at,
        created_at: completeRow.created_at,
        updated_at: null,
        expires_at: null,
      },
    });
  });

  it("represents non-selected collections as unavailable when inputs are missing", () => {
    const detail = mapLeadDetail(completeRow);

    expect(detail.riskFlags).toEqual({
      status: "unavailable",
      items: null,
    });
    expect(detail.positiveSignals).toEqual({
      status: "unavailable",
      items: null,
    });
  });

  it("does not treat explicitly empty unapproved collections as approved empty data", () => {
    const detail = mapWithUnapprovedFields({
      risk_flags: [],
      positive_signals: [],
      evidences_json: [],
    });

    expect(detail.riskFlags).toEqual({
      status: "unavailable",
      items: null,
    });
    expect(detail.positiveSignals).toEqual({
      status: "unavailable",
      items: null,
    });
    expect(detail.evidences).toEqual({
      status: "omitted_by_policy",
      content: null,
    });
  });

  it("does not accept malformed collection shapes as mapper data", () => {
    const detail = mapWithUnapprovedFields({
      risk_flags: { unexpected: true },
      positive_signals: "not-an-array",
      evidences_json: 42,
    });

    expect(detail.riskFlags.status).toBe("unavailable");
    expect(detail.positiveSignals.status).toBe("unavailable");
    expect(detail.evidences.status).toBe("omitted_by_policy");
  });

  it("does not infer an ambiguous report state from an unapproved match count", () => {
    const detail = mapWithUnapprovedFields({
      strategic_report_match_count: 2,
      strategic_report_status: "ambiguous",
    });

    expect(detail.strategicReport).toEqual({
      status: "omitted_by_policy",
      content: null,
    });
  });

  it("does not infer an unavailable report state from unapproved integrity data", () => {
    const detail = mapWithUnapprovedFields({
      strategic_report_integrity_status: "INVALID",
      integrity_error: "UNAPPROVED_INTEGRITY_CANARY",
    });

    expect(detail.strategicReport).toEqual({
      status: "omitted_by_policy",
      content: null,
    });
    expect(JSON.stringify(detail)).not.toContain(
      "UNAPPROVED_INTEGRITY_CANARY",
    );
  });

  it("marks report and evidence content as withheld by the current policy", () => {
    const detail = mapLeadDetail(completeRow);

    expect(detail.evidences.status).toBe("omitted_by_policy");
    expect(detail.strategicReport.status).toBe("omitted_by_policy");
    expect(detail.dataQuality).toEqual([
      { code: "CONTENT_WITHHELD", field: "evidences" },
      { code: "CONTENT_WITHHELD", field: "strategicReport" },
    ]);
  });

  it("preserves valid numeric lower bounds", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      trust_score: 0,
      quantidade_filiais: 0,
      icp_score: 0,
      strategic_asset_score: 0,
    });

    expect(detail.score).toBe(0);
    expect(detail.branchCount).toBe(0);
    expect(detail.icpScore).toBe(0);
    expect(detail.strategicAssetScore).toBe(0);
  });

  it("preserves valid score upper bounds", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      trust_score: 100,
      icp_score: 100,
      strategic_asset_score: 100,
    });

    expect(detail.score).toBe(100);
    expect(detail.icpScore).toBe(100);
    expect(detail.strategicAssetScore).toBe(100);
  });

  it("maps non-numeric numeric fields to null", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      trust_score: "87",
      quantidade_filiais: "3",
      icp_score: "73",
      strategic_asset_score: "64",
    } as unknown as LeadDetailRow);

    expect(detail.score).toBeNull();
    expect(detail.branchCount).toBeNull();
    expect(detail.icpScore).toBeNull();
    expect(detail.strategicAssetScore).toBeNull();
  });

  it("maps NaN and infinite numeric fields to null", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      trust_score: Number.NaN,
      quantidade_filiais: Number.POSITIVE_INFINITY,
      icp_score: Number.NEGATIVE_INFINITY,
      strategic_asset_score: Number.NaN,
    });

    expect(detail.score).toBeNull();
    expect(detail.branchCount).toBeNull();
    expect(detail.icpScore).toBeNull();
    expect(detail.strategicAssetScore).toBeNull();
  });

  it("maps out-of-range numeric fields to null", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      trust_score: 101,
      quantidade_filiais: -1,
      icp_score: -1,
      strategic_asset_score: 101,
    });

    expect(detail.score).toBeNull();
    expect(detail.branchCount).toBeNull();
    expect(detail.icpScore).toBeNull();
    expect(detail.strategicAssetScore).toBeNull();
  });

  it("maps non-integer scores and branch counts to null", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      trust_score: 87.5,
      quantidade_filiais: 2.5,
      icp_score: 73.25,
      strategic_asset_score: 64.75,
    });

    expect(detail.score).toBeNull();
    expect(detail.branchCount).toBeNull();
    expect(detail.icpScore).toBeNull();
    expect(detail.strategicAssetScore).toBeNull();
  });

  it.each([
    ["non-numeric", "15"],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("maps an invalid %s source row to null", (_case, sourceRow) => {
    const detail = mapLeadDetail({
      ...completeRow,
      source_row: sourceRow,
    } as unknown as LeadDetailRow);

    expect(detail.source_row).toBeNull();
    expect(detail.audit.source_row).toBeNull();
  });

  it("does not fall back to unapproved numeric fields", () => {
    const detail = mapWithUnapprovedFields({
      trust_score: null,
      quantidade_filiais: null,
      icp_score: null,
      strategic_asset_score: null,
      final_score: 99,
      pre_trust_score: 98,
      branch_count_from_payload: 12,
      computed_icp_score: 97,
      computed_strategic_asset_score: 96,
    });

    expect(detail.score).toBeNull();
    expect(detail.branchCount).toBeNull();
    expect(detail.icpScore).toBeNull();
    expect(detail.strategicAssetScore).toBeNull();
  });

  it("omits HTTP evidence URLs", () => {
    const detail = mapWithUnapprovedFields({
      evidences: [
        { label: "Sintética", url: "http://public.example.test/evidence" },
      ],
    });

    expect(JSON.stringify(detail)).not.toContain("http://");
    expect(detail.evidences.status).toBe("omitted_by_policy");
  });

  it("omits structurally invalid evidence URLs", () => {
    const detail = mapWithUnapprovedFields({
      evidences: [{ label: "Sintética", url: "not-a-url" }],
    });

    expect(JSON.stringify(detail)).not.toContain("not-a-url");
    expect(detail.evidences.status).toBe("omitted_by_policy");
  });

  it("omits an absolute HTTPS URL while the semantic allowlist is empty", () => {
    const detail = mapWithUnapprovedFields({
      evidences: [
        {
          label: "Sintética",
          url: "https://public.example.test/evidence",
        },
      ],
    });

    expect(JSON.stringify(detail)).not.toContain(
      "https://public.example.test/evidence",
    );
    expect(detail.evidences).toEqual({
      status: "omitted_by_policy",
      content: null,
    });
  });

  it("omits structurally valid or XSS-sanitized content under the privacy policy", () => {
    const detail = mapWithUnapprovedFields({
      strategic_report_markdown: "Texto sintético sem HTML",
      sanitized_html: "<p>Texto sintético sanitizado</p>",
      xss_safe: true,
    });

    const serialized = JSON.stringify(detail);

    expect(serialized).not.toContain("Texto sintético sem HTML");
    expect(serialized).not.toContain("Texto sintético sanitizado");
    expect(detail.strategicReport.status).toBe("omitted_by_policy");
  });

  it("omits a redacted item without leaking its original", () => {
    const detail = mapWithUnapprovedFields({
      evidences: [
        {
          original: "UNAPPROVED_ORIGINAL_CANARY",
          redacted: "Conteúdo sintético redigido",
        },
      ],
    });

    const serialized = JSON.stringify(detail);

    expect(serialized).not.toContain("UNAPPROVED_ORIGINAL_CANARY");
    expect(serialized).not.toContain("Conteúdo sintético redigido");
    expect(detail.evidences.status).toBe("omitted_by_policy");
  });

  it("never exposes raw payloads, prompts, CRM, or snapshots", () => {
    const detail = mapWithUnapprovedFields({
      raw_payload: { marker: "RAW_PAYLOAD_CANARY" },
      input_snapshot: { marker: "INPUT_SNAPSHOT_CANARY" },
      external_snapshot: { marker: "EXTERNAL_SNAPSHOT_CANARY" },
      crm_history: { marker: "CRM_HISTORY_CANARY" },
      prompt: "UNAPPROVED_PROMPT_CANARY",
      report_json: { marker: "REPORT_JSON_CANARY" },
      decision_payload: { marker: "DECISION_PAYLOAD_CANARY" },
    });

    const serialized = JSON.stringify(detail);

    expect(serialized).not.toContain("RAW_PAYLOAD_CANARY");
    expect(serialized).not.toContain("INPUT_SNAPSHOT_CANARY");
    expect(serialized).not.toContain("EXTERNAL_SNAPSHOT_CANARY");
    expect(serialized).not.toContain("CRM_HISTORY_CANARY");
    expect(serialized).not.toContain("UNAPPROVED_PROMPT_CANARY");
    expect(serialized).not.toContain("REPORT_JSON_CANARY");
    expect(serialized).not.toContain("DECISION_PAYLOAD_CANARY");
  });

  it("preserves every approved audit identifier exactly", () => {
    const detail = mapLeadDetail(completeRow);

    expect(detail.audit).toMatchObject({
      decision_id: completeRow.decision_id,
      import_batch_id: completeRow.import_batch_id,
      lead_run_id: completeRow.lead_run_id,
      source_row: completeRow.source_row,
      source_hash: completeRow.source_hash,
      agent_version: completeRow.agent_version,
      idempotency_key: completeRow.idempotency_key,
    });
    expect(detail).toMatchObject({
      decision_id: completeRow.decision_id,
      import_batch_id: completeRow.import_batch_id,
      lead_run_id: completeRow.lead_run_id,
      source_row: completeRow.source_row,
      source_hash: completeRow.source_hash,
      agent_version: completeRow.agent_version,
    });
  });

  it("preserves stored decision values without recalculation", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      trust_score: 12,
      priority: "R",
      final_action: "NAO_ABORDAR",
      trust_verdict: "VEREDITO_ARMAZENADO",
      trust_status: "STATUS_ARMAZENADO",
      icp_score: 98,
      strategic_asset_score: 1,
      reason: "Razão armazenada",
    });

    expect(detail).toMatchObject({
      score: 12,
      priority: "R",
      recommendedAction: "NAO_ABORDAR",
      finalVerdict: "VEREDITO_ARMAZENADO",
      trustStatus: "STATUS_ARMAZENADO",
      confidenceIndicator: "unknown",
      icpScore: 98,
      strategicAssetScore: 1,
      recommendedActionReason: "Razão armazenada",
    });
  });

  it("uses only the approved trade-name to legal-name fallback", () => {
    const detail = mapWithUnapprovedFields({
      nome_fantasia: null,
      razao_social: "Razão Sintética Aprovada",
      crm_company_name: "Nome CRM não aprovado",
      external_company_name: "Nome externo não aprovado",
    });

    expect(detail.companyName).toBe("Razão Sintética Aprovada");
    expect(JSON.stringify(detail)).not.toContain("Nome CRM não aprovado");
    expect(JSON.stringify(detail)).not.toContain("Nome externo não aprovado");
  });

  it("maps blank optional text to null without substituting unapproved fields", () => {
    const detail = mapWithUnapprovedFields({
      nome_fantasia: " ",
      razao_social: "\t",
      cnae_principal: "",
      porte_empresa: "  ",
      reason: "\n",
      strategic_tier: "",
      crm_company_name: "Fallback proibido",
      computed_reason: "Razão proibida",
    });

    expect(detail.companyName).toBeNull();
    expect(detail.tradeName).toBeNull();
    expect(detail.legalName).toBeNull();
    expect(detail.primaryCnae).toBeNull();
    expect(detail.companySize).toBeNull();
    expect(detail.recommendedActionReason).toBeNull();
    expect(detail.strategicTier).toBeNull();
  });

  it("serializes approved audit dates without changing their instants", () => {
    const detail = mapLeadDetail({
      ...completeRow,
      validated_at: new Date("2026-06-30T12:45:00.000-03:00"),
      created_at: new Date("2026-06-30T12:40:00.000-03:00"),
      updated_at: new Date("2026-06-30T12:50:00.000-03:00"),
      expires_at: new Date("2026-07-30T12:45:00.000-03:00"),
    });

    expect(detail.lastAnalysisAt).toBe("2026-06-30T15:45:00.000Z");
    expect(detail.audit).toMatchObject({
      validated_at: "2026-06-30T15:45:00.000Z",
      created_at: "2026-06-30T15:40:00.000Z",
      updated_at: "2026-06-30T15:50:00.000Z",
      expires_at: "2026-07-30T15:45:00.000Z",
    });
  });
});
