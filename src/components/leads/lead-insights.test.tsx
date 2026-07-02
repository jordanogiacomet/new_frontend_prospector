import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LeadDetail } from "../../types/leads";

import { LeadInsights } from "./lead-insights";

const completeLead: LeadDetail = {
  decision_id: "decision-synthetic-insights-001",
  import_batch_id: "batch-synthetic-insights-001",
  lead_run_id: `lr_${"b".repeat(64)}`,
  source_row: 8,
  source_hash: "hash-synthetic-insights-001",
  agent_version: "agent-synthetic-insights-1",
  cnpj: "12345678000195",
  companyName: "Empresa Aurora",
  city: "Curitiba",
  uf: "PR",
  sector: "Serviços empresariais",
  score: 82,
  priority: "B",
  recommendedAction: "PROSPECTAR",
  trustStatus: "Revisão Humana",
  confidenceIndicator: "normal",
  lastAnalysisAt: "2026-06-18T15:00:00.000Z",
  legalName: "Empresa Aurora Serviços Ltda.",
  tradeName: "Aurora",
  primaryCnae: "7020-4/00",
  primaryCnaeDescription:
    "Atividades de consultoria em gestão empresarial",
  companySize: "Médio porte",
  taxRegime: "Lucro presumido",
  estimatedRevenue: "Entre R$ 5 milhões e R$ 8 milhões",
  employeeCount: "De 50 a 99 pessoas",
  branchCount: 3,
  finalVerdict: "REVISAO_HUMANA",
  recommendedActionReason: "Ação armazenada pelo produtor",
  icpScore: 78,
  strategicAssetScore: 69,
  strategicTier: "T2",
  riskFlags: { status: "available", items: [] },
  positiveSignals: { status: "available", items: [] },
  evidences: { status: "omitted_by_policy", content: null },
  strategicReport: { status: "omitted_by_policy", content: null },
  audit: {
    decision_id: "decision-synthetic-insights-001",
    import_batch_id: "batch-synthetic-insights-001",
    lead_run_id: `lr_${"b".repeat(64)}`,
    source_row: 8,
    source_hash: "hash-synthetic-insights-001",
    agent_version: "agent-synthetic-insights-1",
    idempotency_key: "idempotency-synthetic-insights-001",
    used_cache: false,
    validated_at: "2026-06-18T15:00:00.000Z",
    created_at: "2026-06-18T15:01:00.000Z",
    updated_at: null,
    expires_at: null,
  },
  dataQuality: [],
};

function renderInsights(overrides: Partial<LeadDetail> = {}) {
  return render(<LeadInsights lead={{ ...completeLead, ...overrides }} />);
}

describe("lead facts and insights", () => {
  it("renders the stored business, fiscal, and commercial facts", () => {
    renderInsights();

    const business = screen.getByRole("region", {
      name: "Fatos empresariais",
    });
    const fiscal = screen.getByRole("region", {
      name: "Fatos fiscais",
    });
    const commercial = screen.getByRole("region", {
      name: "Fatos comerciais",
    });

    expect(business).toHaveTextContent("Empresa Aurora Serviços Ltda.");
    expect(business).toHaveTextContent("Aurora");
    expect(business).toHaveTextContent("7020-4/00");
    expect(business).toHaveTextContent(
      "Atividades de consultoria em gestão empresarial",
    );
    expect(fiscal).toHaveTextContent("Médio porte");
    expect(fiscal).toHaveTextContent("Lucro presumido");
    expect(commercial).toHaveTextContent(
      "Entre R$ 5 milhões e R$ 8 milhões",
    );
    expect(commercial).toHaveTextContent("De 50 a 99 pessoas");
    expect(commercial).toHaveTextContent("3");
  });

  it("formats a stored numeric branch count for Brazilian reading", () => {
    renderInsights({ branchCount: 1234 });

    expect(screen.getByTestId("lead-branch-count")).toHaveTextContent(
      "1.234",
    );
  });

  it("represents every missing fact as unavailable without inventing zero", () => {
    renderInsights({
      legalName: null,
      tradeName: null,
      primaryCnae: null,
      primaryCnaeDescription: null,
      companySize: null,
      taxRegime: null,
      estimatedRevenue: null,
      employeeCount: null,
      branchCount: null,
    });

    const facts = screen.getByRole("region", {
      name: "Fatos armazenados",
    });

    expect(within(facts).getAllByText("Não disponível")).toHaveLength(9);
    expect(facts).not.toHaveTextContent(/\b0\b/);
  });

  it("preserves revenue and employee ranges as exact stored text", () => {
    renderInsights({
      estimatedRevenue: "R$ 1,2 mi — faixa declarada",
      employeeCount: "aproximadamente dez pessoas",
    });

    expect(screen.getByTestId("lead-estimated-revenue")).toHaveTextContent(
      "R$ 1,2 mi — faixa declarada",
    );
    expect(screen.getByTestId("lead-employee-count")).toHaveTextContent(
      "aproximadamente dez pessoas",
    );
    expect(document.body).not.toHaveTextContent("R$ 1.200.000,00");
    expect(document.body).not.toHaveTextContent("10 funcionários");
  });

  it("treats blank stored text as unavailable instead of rendering empty values", () => {
    renderInsights({
      legalName: "",
      tradeName: "   ",
      primaryCnae: "",
      primaryCnaeDescription: "\n",
      companySize: "",
      taxRegime: "\t",
      estimatedRevenue: "",
      employeeCount: " ",
    });

    const facts = screen.getByRole("region", {
      name: "Fatos armazenados",
    });

    expect(within(facts).getAllByText("Não disponível")).toHaveLength(8);
  });

  it.each([
    ["negativa", -1],
    ["fracionária", 1.5],
    ["não finita", Number.NaN],
    ["infinita", Number.POSITIVE_INFINITY],
  ])(
    "keeps a malformed %s branch count unavailable",
    (_case, branchCount) => {
      renderInsights({ branchCount });

      expect(screen.getByTestId("lead-branch-count")).toHaveTextContent(
        "Não disponível",
      );
    },
  );

  it("distinguishes a missing risk collection from an explicit empty collection", () => {
    const { rerender } = render(
      <LeadInsights
        lead={{
          ...completeLead,
          riskFlags: { status: "missing", items: null },
        }}
      />,
    );

    const risks = screen.getByRole("region", {
      name: "Riscos encontrados",
    });
    expect(risks).toHaveTextContent("Dados ausentes");
    expect(risks).toHaveTextContent(
      "Nenhuma informação de risco foi armazenada para esta análise.",
    );

    rerender(<LeadInsights lead={completeLead} />);

    expect(risks).toHaveTextContent("Sem riscos registrados");
    expect(risks).toHaveTextContent(
      "A análise armazenada contém uma coleção vazia de riscos.",
    );
    expect(risks).not.toHaveTextContent("Dados ausentes");
  });

  it("renders unavailable risk and signal collections as accessible alerts", () => {
    renderInsights({
      riskFlags: { status: "unavailable", items: null },
      positiveSignals: { status: "unavailable", items: null },
    });

    const alerts = screen.getAllByRole("alert", {
      name: "Dados indisponíveis",
    });

    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent(
      "Não foi possível consultar os riscos desta análise.",
    );
    expect(alerts[1]).toHaveTextContent(
      "Não foi possível consultar os sinais positivos desta análise.",
    );
  });

  it("distinguishes an explicit empty signal collection from missing data", () => {
    renderInsights({
      positiveSignals: { status: "available", items: [] },
    });

    const signals = screen.getByRole("region", {
      name: "Sinais positivos",
    });

    expect(signals).toHaveTextContent("Sem sinais registrados");
    expect(signals).toHaveTextContent(
      "A análise armazenada contém uma coleção vazia de sinais positivos.",
    );
    expect(signals).not.toHaveTextContent("Dados ausentes");
  });

  it("renders policy-omitted risk and signal states without content", () => {
    renderInsights({
      riskFlags: { status: "omitted_by_policy", items: null },
      positiveSignals: {
        status: "omitted_by_policy",
        items: null,
      },
    });

    const withheldStates = screen.getAllByRole("status", {
      name: "Retido por política",
    });

    expect(withheldStates).toHaveLength(3);
    expect(withheldStates[0]).toHaveTextContent(
      "O conteúdo de riscos não foi aprovado para exibição.",
    );
    expect(withheldStates[1]).toHaveTextContent(
      "O conteúdo de sinais positivos não foi aprovado para exibição.",
    );
  });

  it("shows evidence as withheld with no clickable content", () => {
    renderInsights();

    const evidence = screen.getByRole("region", {
      name: "Evidências",
    });

    expect(evidence).toHaveTextContent("Retido por política");
    expect(evidence).toHaveTextContent(
      "As evidências desta análise não foram aprovadas para exibição.",
    );
    expect(within(evidence).queryByRole("link")).toBeNull();
  });

  it("ignores malformed or unsafe evidence extras supplied at runtime", () => {
    const leadWithUnapprovedEvidence = {
      ...completeLead,
      evidences: {
        ...completeLead.evidences,
        markdown: "[Abrir](javascript:alert('unsafe'))",
        html: '<a href="javascript:alert(1)">EVIDENCE_HTML_CANARY</a>',
        url: "http://unsafe.example.test/EVIDENCE_URL_CANARY",
        text: "EVIDENCE_TEXT_CANARY",
      },
    };

    render(<LeadInsights lead={leadWithUnapprovedEvidence} />);

    const evidence = screen.getByRole("region", {
      name: "Evidências",
    });

    expect(evidence).not.toHaveTextContent("EVIDENCE_HTML_CANARY");
    expect(evidence).not.toHaveTextContent("EVIDENCE_TEXT_CANARY");
    expect(evidence.innerHTML).not.toContain("EVIDENCE_URL_CANARY");
    expect(evidence.querySelector("[href]")).toBeNull();
    expect(within(evidence).queryByRole("link")).toBeNull();
  });
});
