import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LeadDetail } from "../../types/leads";

import { LeadDetailSummary } from "./lead-detail-summary";

const completeLead: LeadDetail = {
  decision_id: "decision-synthetic-summary-001",
  import_batch_id: "batch-synthetic-summary-001",
  lead_run_id: `lr_${"a".repeat(64)}`,
  source_row: 4,
  source_hash: "hash-synthetic-summary-001",
  agent_version: "agent-synthetic-summary-1",
  cnpj: "12345678000195",
  companyName: "Empresa Horizonte",
  city: "São Paulo",
  uf: "SP",
  sector: "Serviços de tecnologia",
  score: 87,
  priority: "B",
  recommendedAction: "PROSPECTAR_COM_CAUTELA",
  trustStatus: "Revisão Humana",
  confidenceIndicator: "normal",
  lastAnalysisAt: "2026-06-15T15:00:00.000Z",
  legalName: "Empresa Horizonte Tecnologia Ltda.",
  tradeName: "Horizonte",
  primaryCnae: "6201-5/01",
  primaryCnaeDescription:
    "Desenvolvimento de programas de computador sob encomenda",
  companySize: "Médio porte",
  taxRegime: "Lucro presumido",
  estimatedRevenue: "R$ 8 milhões",
  employeeCount: "42",
  branchCount: 2,
  finalVerdict: "REVISAO_HUMANA",
  recommendedActionReason:
    "Há aderência comercial, mas a abordagem precisa validar o momento da empresa.",
  icpScore: 81,
  strategicAssetScore: 74,
  strategicTier: "T2",
  riskFlags: { status: "unavailable", items: null },
  positiveSignals: { status: "unavailable", items: null },
  evidences: { status: "omitted_by_policy", content: null },
  strategicReport: { status: "omitted_by_policy", content: null },
  audit: {
    decision_id: "decision-synthetic-summary-001",
    import_batch_id: "batch-synthetic-summary-001",
    lead_run_id: `lr_${"a".repeat(64)}`,
    source_row: 4,
    source_hash: "hash-synthetic-summary-001",
    agent_version: "agent-synthetic-summary-1",
    idempotency_key: "idempotency-synthetic-summary-001",
    used_cache: false,
    validated_at: "2026-06-15T15:00:00.000Z",
    created_at: "2026-06-15T15:01:00.000Z",
    updated_at: null,
    expires_at: null,
  },
  dataQuality: [],
};

function renderSummary(lead: LeadDetail = completeLead) {
  return render(<LeadDetailSummary lead={lead} />);
}

describe("lead detail identity and recommendation summary", () => {
  it("renders the company identity using Brazilian formatting", () => {
    renderSummary();

    const summary = screen.getByRole("region", {
      name: "Resumo da análise",
    });

    expect(
      within(summary).getByRole("heading", {
        level: 1,
        name: "Empresa Horizonte",
      }),
    ).toBeInTheDocument();
    expect(summary).toHaveTextContent("12.345.678/0001-95");
    expect(summary).toHaveTextContent("São Paulo / SP");
    expect(summary).toHaveTextContent("15/06/2026");
  });

  it("renders stored recommendation fields through approved labels", () => {
    renderSummary();

    const decision = screen.getByRole("region", {
      name: "Recomendação da análise",
    });

    expect(decision).toHaveTextContent("Prospectar com cautela");
    expect(decision).toHaveTextContent("Prioridade B");
    expect(decision).toHaveTextContent("Revisão humana");
  });

  it("renders the stored score and recommendation reason without recalculation", () => {
    renderSummary();

    const decision = screen.getByRole("region", {
      name: "Recomendação da análise",
    });

    expect(decision).toHaveTextContent("87");
    expect(decision).toHaveTextContent(
      "Há aderência comercial, mas a abordagem precisa validar o momento da empresa.",
    );
    expect(decision).not.toHaveTextContent("81");
    expect(decision).not.toHaveTextContent("74");
  });

  it("keeps missing action, reason, and score explicitly unavailable", () => {
    renderSummary({
      ...completeLead,
      score: null,
      recommendedAction: null,
      recommendedActionReason: null,
    });

    const decision = screen.getByRole("region", {
      name: "Recomendação da análise",
    });

    expect(
      within(decision).getByTestId("lead-recommended-action"),
    ).toHaveTextContent("Não disponível");
    expect(
      within(decision).getByTestId("lead-recommendation-reason"),
    ).toHaveTextContent("Não disponível");
    expect(within(decision).getByTestId("lead-score")).toHaveTextContent(
      "Não disponível",
    );
    expect(decision).not.toHaveTextContent(/\b0\b/);
  });

  it("represents missing identity values as unavailable instead of inventing them", () => {
    renderSummary({
      ...completeLead,
      companyName: null,
      city: null,
      uf: null,
      lastAnalysisAt: "",
    });

    const summary = screen.getByRole("region", {
      name: "Resumo da análise",
    });

    expect(
      within(summary).getByRole("heading", {
        level: 1,
        name: "Não disponível",
      }),
    ).toBeInTheDocument();
    expect(within(summary).getAllByText("Não disponível")).toHaveLength(3);
  });

  it("renders unknown stored domains neutrally without exposing raw tokens", () => {
    renderSummary({
      ...completeLead,
      priority: "A",
      recommendedAction: "CONTATAR_AGORA",
      finalVerdict: "APROVADO",
      trustStatus: "CONFIANCA_ALTISSIMA",
      confidenceIndicator: "unknown",
    });

    expect(screen.getAllByText("Não mapeado")).toHaveLength(4);
    expect(document.body).not.toHaveTextContent("CONTATAR_AGORA");
    expect(document.body).not.toHaveTextContent("CONFIANCA_ALTISSIMA");
    expect(document.body).not.toHaveTextContent("APROVADO");
  });

  it("shows low confidence as an explicit accessible warning", () => {
    renderSummary({
      ...completeLead,
      confidenceIndicator: "low",
    });

    const warning = screen.getByRole("alert");

    expect(warning).toHaveTextContent("Baixa confiança");
    expect(warning).toHaveTextContent(
      "Considere validar os dados antes da abordagem.",
    );
    expect(screen.queryByText("Confiança não mapeada")).toBeNull();
  });

  it("shows unknown confidence as a neutral status distinct from low confidence", () => {
    renderSummary({
      ...completeLead,
      trustStatus: null,
      confidenceIndicator: "unknown",
    });

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent("Confiança não mapeada");
    expect(status).toHaveTextContent(
      "Não foi possível classificar a confiança com os valores armazenados.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Baixa confiança")).toBeNull();
  });

  it("does not show a warning when stored confidence is normal", () => {
    renderSummary();

    expect(screen.getByText("Confiança normal")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
