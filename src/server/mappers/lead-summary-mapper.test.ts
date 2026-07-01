import { describe, expect, it } from "vitest";

import {
  mapLeadSummary,
  type LeadSummaryRow,
} from "./lead-summary-mapper";

const completeRow: LeadSummaryRow = {
  decision_id: "decision-synthetic-001",
  import_batch_id: "batch-synthetic-001",
  lead_run_id: "run-synthetic-001",
  source_row: 17,
  source_hash: "sha256:synthetic-source-hash",
  agent_version: "agent-synthetic-v1",
  cnpj_normalizado: "11222333000181",
  nome_fantasia: "Empresa Sintética",
  razao_social: "Empresa Sintética Ltda.",
  cidade: "Caxias do Sul",
  uf: "RS",
  cnae_descricao: "Serviços técnicos",
  trust_score: 87,
  priority: "B",
  final_action: "PROSPECTAR",
  trust_status: "Revisão Humana",
  validated_at: "2026-06-30T15:45:00.000Z",
};

describe("mapLeadSummary", () => {
  it("maps a complete approved row to the browser DTO", () => {
    expect(mapLeadSummary(completeRow)).toEqual({
      decision_id: "decision-synthetic-001",
      import_batch_id: "batch-synthetic-001",
      lead_run_id: "run-synthetic-001",
      source_row: 17,
      source_hash: "sha256:synthetic-source-hash",
      agent_version: "agent-synthetic-v1",
      cnpj: "11222333000181",
      companyName: "Empresa Sintética",
      city: "Caxias do Sul",
      uf: "RS",
      sector: "Serviços técnicos",
      score: 87,
      priority: "B",
      recommendedAction: "PROSPECTAR",
      trustStatus: "Revisão Humana",
      confidenceIndicator: "unknown",
      lastAnalysisAt: "2026-06-30T15:45:00.000Z",
    });
  });

  it("falls back to the legal name when the trade name is null", () => {
    expect(
      mapLeadSummary({ ...completeRow, nome_fantasia: null }).companyName,
    ).toBe("Empresa Sintética Ltda.");
  });

  it("falls back to the legal name when the trade name is blank", () => {
    expect(
      mapLeadSummary({ ...completeRow, nome_fantasia: "   " }).companyName,
    ).toBe("Empresa Sintética Ltda.");
  });

  it("keeps the company name null when both approved names are unavailable", () => {
    expect(
      mapLeadSummary({
        ...completeRow,
        nome_fantasia: null,
        razao_social: null,
      }).companyName,
    ).toBeNull();
  });

  it("keeps nullable business values explicitly null", () => {
    const summary = mapLeadSummary({
      ...completeRow,
      cidade: null,
      uf: null,
      cnae_descricao: null,
      trust_score: null,
      priority: null,
      final_action: null,
      trust_status: null,
    });

    expect(summary).toMatchObject({
      city: null,
      uf: null,
      sector: null,
      score: null,
      priority: null,
      recommendedAction: null,
      trustStatus: null,
      confidenceIndicator: "unknown",
    });
  });

  it("preserves a stored zero score without treating it as missing", () => {
    expect(mapLeadSummary({ ...completeRow, trust_score: 0 }).score).toBe(0);
  });

  it("does not default a missing score to zero or an unapproved score field", () => {
    const row = {
      ...completeRow,
      trust_score: null,
      final_score: 99,
      pre_trust_score: 74,
    };

    expect(mapLeadSummary(row).score).toBeNull();
  });

  it("preserves unknown stored domain values without reclassifying confidence", () => {
    const summary = mapLeadSummary({
      ...completeRow,
      priority: "PRIORIDADE_DESCONHECIDA",
      final_action: "ACAO_DESCONHECIDA",
      trust_status: "STATUS_DESCONHECIDO",
    });

    expect(summary.priority).toBe("PRIORIDADE_DESCONHECIDA");
    expect(summary.recommendedAction).toBe("ACAO_DESCONHECIDA");
    expect(summary.trustStatus).toBe("STATUS_DESCONHECIDO");
    expect(summary.confidenceIndicator).toBe("unknown");
  });

  it("does not classify the approved review status as low confidence", () => {
    expect(mapLeadSummary(completeRow).confidenceIndicator).toBe("unknown");
  });

  it("preserves nullable audit identifiers exactly", () => {
    const summary = mapLeadSummary({
      ...completeRow,
      import_batch_id: null,
      source_row: null,
      source_hash: null,
    });

    expect(summary).toMatchObject({
      decision_id: "decision-synthetic-001",
      import_batch_id: null,
      lead_run_id: "run-synthetic-001",
      source_row: null,
      source_hash: null,
      agent_version: "agent-synthetic-v1",
    });
  });

  it("serializes a database Date without changing the instant", () => {
    const validatedAt = new Date("2026-06-30T12:45:00.000-03:00");

    expect(
      mapLeadSummary({ ...completeRow, validated_at: validatedAt })
        .lastAnalysisAt,
    ).toBe("2026-06-30T15:45:00.000Z");
  });

  it("does not expose raw payload, input snapshot, CRM, or report fields", () => {
    const row = {
      ...completeRow,
      raw_payload: { confidential: true },
      input_snapshot: { confidential: true },
      crm_history: { confidential: true },
      report_json: { confidential: true },
      decision_payload: { confidential: true },
    };

    const summary = mapLeadSummary(row);

    expect(summary).not.toHaveProperty("raw_payload");
    expect(summary).not.toHaveProperty("input_snapshot");
    expect(summary).not.toHaveProperty("crm_history");
    expect(summary).not.toHaveProperty("report_json");
    expect(summary).not.toHaveProperty("decision_payload");
  });

  it("does not use unapproved fields to fill missing approved values", () => {
    const row = {
      ...completeRow,
      nome_fantasia: null,
      razao_social: null,
      cidade: null,
      cnae_descricao: null,
      company_name: "Nome não aprovado",
      crm_city: "Cidade não aprovada",
      sector_detected: "Setor não aprovado",
    };

    const summary = mapLeadSummary(row);

    expect(summary.companyName).toBeNull();
    expect(summary.city).toBeNull();
    expect(summary.sector).toBeNull();
  });

  it("maps malformed optional scalar values to null without inventing defaults", () => {
    const malformedRow = {
      ...completeRow,
      nome_fantasia: 123,
      razao_social: {},
      cidade: [],
      uf: false,
      cnae_descricao: Number.NaN,
      trust_score: "87",
      priority: {},
      final_action: [],
      trust_status: false,
    } as unknown as LeadSummaryRow;

    expect(mapLeadSummary(malformedRow)).toMatchObject({
      companyName: null,
      city: null,
      uf: null,
      sector: null,
      score: null,
      priority: null,
      recommendedAction: null,
      trustStatus: null,
      confidenceIndicator: "unknown",
    });
  });
});
