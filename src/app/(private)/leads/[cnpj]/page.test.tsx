import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadDetail } from "../../../../types/leads";

const { navigationState } = vi.hoisted(() => ({
  navigationState: {
    cnpj: "11222333000181",
    query: "",
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ cnpj: navigationState.cnpj }),
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

import LeadDetailPage from "./page";

const fetchMock = vi.fn();
const syntheticLeadRunId = `lr_${"a".repeat(64)}`;
const syntheticPreviousLeadRunId = `lr_${"b".repeat(64)}`;

const syntheticDetail: LeadDetail = {
  decision_id: "decision-synthetic-page-032",
  import_batch_id: "batch-synthetic-page-032",
  lead_run_id: syntheticLeadRunId,
  source_row: 32,
  source_hash: "hash-synthetic-page-032",
  agent_version: "agent-synthetic-page-32",
  cnpj: "11222333000181",
  companyName: "Empresa Detalhe Sintética",
  city: "Recife",
  uf: "PE",
  sector: "Serviços sintéticos",
  score: 82,
  priority: "B",
  recommendedAction: "PROSPECTAR",
  trustStatus: "Aprovado",
  confidenceIndicator: "normal",
  lastAnalysisAt: "2026-07-02T12:00:00.000Z",
  legalName: "Empresa Detalhe Sintética Ltda.",
  tradeName: "Detalhe Sintético",
  primaryCnae: "6201501",
  primaryCnaeDescription: "Serviços sintéticos",
  companySize: "Médio",
  taxRegime: "Lucro presumido",
  estimatedRevenue: "Faixa sintética",
  employeeCount: "50 a 99",
  branchCount: 3,
  finalVerdict: "APROVADO",
  recommendedActionReason: "Recomendação armazenada pelo produtor.",
  icpScore: 73,
  strategicAssetScore: 64,
  strategicTier: "TIER_SINTETICO",
  riskFlags: { status: "available", items: [] },
  positiveSignals: { status: "available", items: [] },
  evidences: { status: "omitted_by_policy", content: null },
  strategicReport: { status: "omitted_by_policy", content: null },
  audit: {
    decision_id: "decision-synthetic-page-032",
    import_batch_id: "batch-synthetic-page-032",
    lead_run_id: syntheticLeadRunId,
    source_row: 32,
    source_hash: "hash-synthetic-page-032",
    agent_version: "agent-synthetic-page-32",
    idempotency_key: "idempotency-synthetic-page-032",
    used_cache: false,
    validated_at: "2026-07-02T12:00:00.000Z",
    created_at: "2026-07-02T11:55:00.000Z",
    updated_at: "2026-07-02T12:05:00.000Z",
    expires_at: "2026-08-02T12:00:00.000Z",
  },
  dataQuality: [
    { code: "CONTENT_WITHHELD", field: "evidences" },
    { code: "CONTENT_WITHHELD", field: "strategicReport" },
  ],
};

function respondWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulResponse(data: LeadDetail = syntheticDetail) {
  return { data };
}

describe("lead detail page", () => {
  beforeEach(() => {
    navigationState.cnpj = "11222333000181";
    navigationState.query = "";
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows an accessible loading state while the authenticated API request is pending", () => {
    render(<LeadDetailPage />);

    expect(
      screen.getByRole("status", { name: "Carregando detalhes do lead" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Empresa Detalhe Sintética" }),
    ).not.toBeInTheDocument();
  });

  it("preserves the formatted CNPJ and exact optional run identifier in the request contract", async () => {
    navigationState.cnpj = "11.222.333/0001-81";
    navigationState.query = `leadRunId=${syntheticLeadRunId}`;
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    render(<LeadDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Empresa Detalhe Sintética",
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/leads/11.222.333%2F0001-81?leadRunId=${syntheticLeadRunId}`,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        method: "GET",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/leads/11.222.333%2F0001-81/history",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        method: "GET",
      }),
    );
  });

  it("omits the run query when no execution identifier was provided", async () => {
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    render(<LeadDetailPage />);

    await screen.findByRole("heading", {
      name: "Empresa Detalhe Sintética",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leads/11222333000181",
      expect.any(Object),
    );
  });

  it("renders a distinct not-found state without exposing API details", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        {
          error: {
            code: "LEAD_NOT_FOUND",
            message: "SELECT secret FROM private_source",
          },
        },
        404,
      ),
    );

    render(<LeadDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Empresa não encontrada",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      "SELECT secret FROM private_source",
    );
  });

  it("renders a fixed safe API error for an unexpected response", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        {
          error: {
            code: "UNEXPECTED_ERROR",
            message: "postgresql://readonly:secret@database.internal/leads",
            details: ["stack trace canary"],
          },
        },
        500,
      ),
    );

    render(<LeadDetailPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não foi possível carregar esta análise agora.",
    );
    expect(document.body).not.toHaveTextContent("database.internal");
    expect(document.body).not.toHaveTextContent("stack trace canary");
  });

  it("renders data unavailable separately for a safe unavailable API response", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        {
          error: {
            code: "DATA_SOURCE_UNAVAILABLE",
            message: "internal database timeout canary",
          },
        },
        503,
      ),
    );

    render(<LeadDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Dados da análise indisponíveis",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      "internal database timeout canary",
    );
  });

  it("fails closed as unavailable when a successful response violates the detail contract", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({
        data: {
          cnpj: "11222333000181",
          companyName: "Resposta incompleta",
          rawPayload: { sql: "SELECT * FROM private_source" },
        },
      }),
    );

    render(<LeadDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Dados da análise indisponíveis",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Resposta incompleta");
    expect(document.body).not.toHaveTextContent("private_source");
  });

  it("assembles the complete detail from existing summary, insight, report, and audit components", async () => {
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    render(<LeadDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Empresa Detalhe Sintética",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recomendação da análise" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Riscos, sinais e evidências",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Relatório estratégico" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Auditoria avançada")).toBeInTheDocument();
    expect(screen.getByTestId("audit-lead-run-id")).toHaveTextContent(
      syntheticLeadRunId,
    );
  });

  it("integrates the retained history section using only the history API response", async () => {
    fetchMock.mockImplementation(async (input) => {
      const endpoint = String(input);

      if (endpoint.endsWith("/history")) {
        return respondWithJson({
          data: [
            {
              decision_id: "decision-synthetic-page-history-current",
              import_batch_id: "batch-synthetic-page-history",
              lead_run_id: syntheticLeadRunId,
              source_row: 35,
              analyzedAt: "2026-07-03T12:00:00.000Z",
              recommendedAction: "PROSPECTAR",
              recommendedActionReason: "Decisão atual armazenada.",
              isCurrent: true,
            },
            {
              decision_id: "decision-synthetic-page-history-previous",
              import_batch_id: "batch-synthetic-page-history",
              lead_run_id: syntheticPreviousLeadRunId,
              source_row: 34,
              analyzedAt: "2026-06-03T12:00:00.000Z",
              recommendedAction: "NUTRIR",
              recommendedActionReason: "Decisão anterior armazenada.",
              isCurrent: false,
            },
          ],
          meta: {
            page: 1,
            pageSize: 20,
            total: 2,
            completeness: "retained_only",
            label: "Análises retidas encontradas",
            caveat:
              "Análises mais antigas podem não estar presentes.",
          },
        });
      }

      return respondWithJson(successfulResponse());
    });

    render(<LeadDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Histórico de decisões",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "decision-synthetic-page-history-current",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("decision-synthetic-page-history-previous"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves explicit missing report and evidence states without inferring content", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse({
          ...syntheticDetail,
          evidences: { status: "missing", content: null },
          strategicReport: { status: "missing", content: null },
          dataQuality: [
            { code: "MISSING_VALUE", field: "evidences" },
            { code: "MISSING_VALUE", field: "strategicReport" },
          ],
        }),
      ),
    );

    render(<LeadDetailPage />);

    expect(
      await screen.findByText("Relatório ainda não disponível"),
    ).toBeInTheDocument();
    const evidence = screen.getByRole("region", { name: "Evidências" });
    expect(evidence).toHaveTextContent("Evidências ausentes");
    expect(evidence).not.toHaveTextContent("Retido por política");
  });

  it("preserves policy-withheld report and evidence states without rendering raw extras", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({
        data: {
          ...syntheticDetail,
          evidences: {
            ...syntheticDetail.evidences,
            text: "PRIVATE_EVIDENCE_CANARY",
            url: "https://private.invalid/EVIDENCE_URL_CANARY",
          },
          strategicReport: {
            ...syntheticDetail.strategicReport,
            markdown: "# PRIVATE_REPORT_CANARY",
          },
        },
      }),
    );

    render(<LeadDetailPage />);

    const withheldStates = await screen.findAllByRole("status", {
      name: "Retido por política",
    });
    expect(withheldStates).toHaveLength(2);
    expect(document.body).not.toHaveTextContent("PRIVATE_EVIDENCE_CANARY");
    expect(document.body).not.toHaveTextContent("PRIVATE_REPORT_CANARY");
    expect(document.body.innerHTML).not.toContain("EVIDENCE_URL_CANARY");
  });

  it("makes stale stored data visible without recalculating its values", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse({
          ...syntheticDetail,
          score: 37,
          recommendedAction: "NUTRIR",
          dataQuality: [
            { code: "STALE_VALUE", field: "expires_at" },
            ...syntheticDetail.dataQuality,
          ],
        }),
      ),
    );

    render(<LeadDetailPage />);

    const staleNotice = await screen.findByRole("status", {
      name: "Dados desatualizados",
    });
    expect(staleNotice).toHaveTextContent(
      "Os valores continuam sendo exibidos como foram armazenados.",
    );
    expect(screen.getByTestId("lead-score")).toHaveTextContent("37");
    expect(screen.getByTestId("lead-recommended-action")).toHaveTextContent(
      "Nutrir",
    );
  });

  it("keeps nullable decision values unavailable instead of converting them to zero", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse({
          ...syntheticDetail,
          score: null,
          recommendedAction: null,
          recommendedActionReason: null,
          priority: null,
          finalVerdict: null,
        }),
      ),
    );

    render(<LeadDetailPage />);

    await screen.findByRole("heading", {
      name: "Empresa Detalhe Sintética",
    });
    expect(screen.getByTestId("lead-score")).toHaveTextContent(
      "Não disponível",
    );
    expect(screen.getByTestId("lead-score")).not.toHaveTextContent("0");
    expect(screen.getByTestId("lead-recommendation-reason")).toHaveTextContent(
      "Não disponível",
    );
  });

  it("contains no direct database, n8n, write, or reprocessing integration", () => {
    const source = readFileSync(
      resolve(__dirname, "page.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["'](?:pg|.*server\/db|.*repositories)/);
    expect(source).not.toMatch(
      /\bn8n\b|\bwebhook\b|\breprocess(?:ing)?\b|\bupload\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i,
    );
    expect(source).toContain('fetch(endpoint, {');
    expect(source).toContain('method: "GET"');
  });
});
