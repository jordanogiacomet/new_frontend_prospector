import { describe, expect, it } from "vitest";

import {
  mapOutsideAnalysisCompany,
  type OutsideAnalysisCompanyRow,
} from "./outside-analysis-mapper";

const completeRow: OutsideAnalysisCompanyRow = {
  import_batch_id: "batch-synthetic-outside-001",
  source_row: 8,
  cnpj_normalizado: "11222333000181",
  nome_fantasia: "Empresa Sintética CRM",
  razao_social: "Empresa Sintética CRM Ltda.",
  cidade: "Recife",
  uf: "PE",
  cnae_descricao: "Serviços técnicos",
  final_action: "NAO_ABORDAR",
  reason: "Decisão armazenada pelo produtor",
  decided_at: "2026-07-23T14:30:00.000Z",
};

describe("mapOutsideAnalysisCompany", () => {
  it("maps only the approved current CRM decision fields", () => {
    expect(mapOutsideAnalysisCompany(completeRow)).toEqual({
      import_batch_id: "batch-synthetic-outside-001",
      source_row: 8,
      cnpj: "11222333000181",
      companyName: "Empresa Sintética CRM",
      city: "Recife",
      uf: "PE",
      sector: "Serviços técnicos",
      decidedAction: "NAO_ABORDAR",
      decisionReason: "Decisão armazenada pelo produtor",
      decidedAt: "2026-07-23T14:30:00.000Z",
    });
  });

  it("falls back to legal name and preserves nullable approved values", () => {
    expect(
      mapOutsideAnalysisCompany({
        ...completeRow,
        nome_fantasia: " ",
        cidade: null,
        uf: null,
        cnae_descricao: null,
        reason: null,
        import_batch_id: null,
        source_row: null,
      }),
    ).toMatchObject({
      companyName: "Empresa Sintética CRM Ltda.",
      city: null,
      uf: null,
      sector: null,
      decisionReason: null,
      import_batch_id: null,
      source_row: null,
    });
  });

  it("maps blank optional text to null without inventing a reason", () => {
    expect(
      mapOutsideAnalysisCompany({
        ...completeRow,
        nome_fantasia: "\n",
        razao_social: "\t",
        final_action: " ",
        reason: "\n",
      }),
    ).toMatchObject({
      companyName: null,
      decidedAction: null,
      decisionReason: null,
    });
  });

  it("serializes a native decision Date without changing the instant", () => {
    expect(
      mapOutsideAnalysisCompany({
        ...completeRow,
        decided_at: new Date("2026-07-23T11:30:00.000-03:00"),
      }).decidedAt,
    ).toBe("2026-07-23T14:30:00.000Z");
  });

  it("does not expose run, payload, CRM history, score, or report fields", () => {
    const row = {
      ...completeRow,
      lead_run_id: "lr_synthetic_private",
      source_hash: "synthetic-private-hash",
      raw_payload: { private: true },
      crm_history: { private: true },
      trust_score: 91,
      report_json: { private: true },
    };

    const company = mapOutsideAnalysisCompany(row);

    expect(company).not.toHaveProperty("lead_run_id");
    expect(company).not.toHaveProperty("source_hash");
    expect(company).not.toHaveProperty("raw_payload");
    expect(company).not.toHaveProperty("crm_history");
    expect(company).not.toHaveProperty("trust_score");
    expect(company).not.toHaveProperty("report_json");
  });
});
