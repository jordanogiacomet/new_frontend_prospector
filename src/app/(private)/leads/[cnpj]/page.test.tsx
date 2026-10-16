import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrivateCapabilitiesProvider } from "../../../../components/auth/private-capabilities";
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

vi.mock("../../../../components/leads/lead-location-map", () => ({
  LeadLocationMap: ({
    city,
    cnpj,
    leadRunId,
    uf,
  }: {
    city: string | null;
    cnpj: string;
    leadRunId: string;
    uf: string | null;
  }) => (
    <section
      aria-label="Localização da empresa"
      data-cnpj={cnpj}
      data-lead-run-id={leadRunId}
    >
      {[city, uf].filter(Boolean).join(" / ")}
    </section>
  ),
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

function authorizedPage() {
  return (
    <PrivateCapabilitiesProvider permissions={["leads:read"]}>
      <LeadDetailPage />
    </PrivateCapabilitiesProvider>
  );
}

describe("lead detail page", () => {
  beforeEach(() => {
    navigationState.cnpj = "11222333000181";
    navigationState.query = "";
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("denies missing read permission before any request", () => {

    render(<LeadDetailPage />);

    expect(screen.getByRole("heading", { name: "Acesso não autorizado" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("gives HTTP %i an access recovery state and stops further polling", async (responseStatus) => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      fetchMock.mockResolvedValue(respondWithJson({}, responseStatus));
      render(authorizedPage());

      expect(await screen.findByRole("heading", { name: responseStatus === 401 ? "Sua sessão expirou" : "Acesso não autorizado" })).toBeInTheDocument();
      const login = screen.queryByRole("link", { name: "Entrar novamente" });
      if (responseStatus === 401) expect(login).toHaveAttribute("href", "/login");
      else expect(login).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Tentar novamente|Atualizar/ })).not.toBeInTheDocument();
      const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
      if (typeof refresh === "function") {
        await act(async () => refresh());
        await act(async () => refresh());
      }
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      intervalSpy.mockRestore();
      visibilitySpy.mockRestore();
    }
  });

  it("shows an accessible loading state while the authenticated API request is pending", () => {
    render(authorizedPage());

    expect(
      screen.getByRole("status", { name: "Carregando detalhes do lead" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Empresa Detalhe Sintética" }),
    ).not.toBeInTheDocument();
  });

  it("preserves the formatted CNPJ and exact optional run identifier in the request contract", async () => {
    navigationState.cnpj = "11.222.333/0001-81";
    navigationState.query = `leadRunId=${syntheticLeadRunId}&returnTo=${encodeURIComponent("/leads?page=3&uf=PE")}`;
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    render(authorizedPage());

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
    expect(
      screen.getByRole("link", { name: "Voltar para leads" }),
    ).toHaveAttribute("href", "/leads?page=3&uf=PE");
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

  it("returns to an approved workspace but rejects an unsafe return URL", async () => {
    const workspaceReturn =
      "/workspaces/00000000-0000-4000-8000-000000000041?returnTo=%2Fwork-queue%3Fpage%3D2";
    navigationState.query = `returnTo=${encodeURIComponent(workspaceReturn)}`;
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    const { rerender } = render(authorizedPage());

    expect(
      await screen.findByRole("link", { name: "Voltar ao acompanhamento" }),
    ).toHaveAttribute("href", workspaceReturn);

    navigationState.query = `returnTo=${encodeURIComponent("https://malicious.example")}`;
    rerender(authorizedPage());

    expect(
      await screen.findByRole("link", { name: "Voltar para leads" }),
    ).toHaveAttribute("href", "/leads");
  });

  it("omits the run query when no execution identifier was provided", async () => {
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    render(authorizedPage());

    await screen.findByRole("heading", {
      name: "Empresa Detalhe Sintética",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leads/11222333000181",
      expect.any(Object),
    );
  });

  it("refreshes the visible detail every five seconds without overlapping requests and cleans up on unmount", async () => {
    const visibilityStateSpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    let detailRequestCount = 0;
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    fetchMock.mockImplementation(async (input) => {
      const endpoint = String(input);

      if (endpoint.endsWith("/history")) {
        return respondWithJson({
          data: [],
          meta: {
            page: 1,
            pageSize: 20,
            total: 0,
            completeness: "retained_only",
            label: "Análises retidas encontradas",
            caveat:
              "Análises mais antigas podem não estar presentes.",
          },
        });
      }

      detailRequestCount += 1;
      return detailRequestCount === 1
        ? respondWithJson(successfulResponse())
        : refreshResponse;
    });

    const { unmount } = render(authorizedPage());

    await screen.findByRole("heading", {
      name: "Empresa Detalhe Sintética",
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const refreshCall = setIntervalSpy.mock.calls.find(
      ([, delay]) => delay === 5_000,
    );
    const refresh = refreshCall?.[0];
    const refreshIntervalId =
      setIntervalSpy.mock.results.find(
        (_, index) => setIntervalSpy.mock.calls[index]?.[1] === 5_000,
      )?.value;
    const detailFetchCall = fetchMock.mock.calls.find(
      ([input]) => !String(input).endsWith("/history"),
    );
    const initialSignal = (
      detailFetchCall?.[1] as RequestInit | undefined
    )?.signal;

    expect(refreshCall?.[1]).toBe(5_000);
    if (typeof refresh !== "function") {
      throw new Error("Expected the lead detail refresh callback.");
    }

    await act(async () => {
      refresh();
      refresh();
    });

    expect(detailRequestCount).toBe(2);

    await act(async () => {
      resolveRefresh?.(
        respondWithJson(
          successfulResponse({
            ...syntheticDetail,
            companyName: "Empresa Detalhe Atualizada",
          }),
        ),
      );
    });

    expect(
      await screen.findByRole("heading", {
        name: "Empresa Detalhe Atualizada",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Empresa Detalhe Sintética",
      }),
    ).not.toBeInTheDocument();

    visibilityStateSpy.mockReturnValue("hidden");
    await act(async () => {
      refresh();
    });

    expect(detailRequestCount).toBe(2);

    unmount();

    expect(initialSignal?.aborted).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalledWith(refreshIntervalId);
    visibilityStateSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
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

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Empresa não encontrada",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      "SELECT secret FROM private_source",
    );
  });

  it("keeps the current analysis after a transient refresh failure and explicitly recovers", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let detailRequests = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/history")) {
        return Promise.resolve(respondWithJson({ data: [], meta: { total: 0 } }));
      }
      detailRequests += 1;
      return Promise.resolve(detailRequests === 2
        ? respondWithJson({ error: { message: "private refresh details" } }, 503)
        : respondWithJson(successfulResponse()));
    });

    render(authorizedPage());
    await screen.findByRole("heading", { name: "Empresa Detalhe Sintética" });
    const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
    if (typeof refresh !== "function") {
      throw new Error("Expected the lead detail refresh callback.");
    }
    await act(async () => refresh());

    expect(await screen.findByText(/última consulta disponível/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Empresa Detalhe Sintética" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private refresh details");

    fireEvent.click(screen.getByRole("button", { name: "Atualizar análise" }));

    await waitFor(() => expect(screen.queryByText(/última consulta disponível/)).not.toBeInTheDocument());
    expect(detailRequests).toBe(3);
    expect(screen.getByRole("heading", { name: "Empresa Detalhe Sintética" })).toBeInTheDocument();
    intervalSpy.mockRestore();
  });

  it.each([401, 403, 404])("clears the last analysis when refresh returns %i", async (status) => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let detailRequests = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/history")) {
        return Promise.resolve(respondWithJson({ data: [], meta: { total: 0 } }));
      }
      detailRequests += 1;
      return Promise.resolve(detailRequests === 1
        ? respondWithJson(successfulResponse())
        : respondWithJson({ error: { code: "UNAVAILABLE" } }, status));
    });

    render(authorizedPage());
    await screen.findByRole("heading", { name: "Empresa Detalhe Sintética" });
    const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
    if (typeof refresh !== "function") {
      throw new Error("Expected the lead detail refresh callback.");
    }
    await act(async () => refresh());

    if (status === 404) {
      expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    } else {
      expect(await screen.findByRole("heading", { name: status === 401 ? "Sua sessão expirou" : "Acesso não autorizado" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "Empresa Detalhe Sintética" })).not.toBeInTheDocument();
    expect(screen.queryByText(/última consulta disponível/)).not.toBeInTheDocument();
    intervalSpy.mockRestore();
  });

  it("keeps the filtered return destination during errors and retries the selected run", async () => {
    navigationState.query = `leadRunId=${syntheticLeadRunId}&returnTo=${encodeURIComponent("/leads?page=3&uf=PE")}`;
    fetchMock.mockResolvedValueOnce(respondWithJson({ error: { code: "UNAVAILABLE" } }, 503));
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    render(authorizedPage());

    expect(await screen.findByRole("link", { name: "Voltar para leads" }))
      .toHaveAttribute("href", "/leads?page=3&uf=PE");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("heading", { name: "Empresa Detalhe Sintética" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      `/api/leads/11222333000181?leadRunId=${syntheticLeadRunId}`,
      expect.any(Object));
  });

  it("clears the last analysis when an update returns an invalid contract", async () => {
    let detailRequests = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/history")) {
        return Promise.resolve(respondWithJson({ data: [], meta: { total: 0 } }));
      }
      detailRequests += 1;
      return Promise.resolve(detailRequests === 1
        ? respondWithJson(successfulResponse())
        : respondWithJson({ data: { companyName: "Unsafe incomplete response" } }));
    });

    render(authorizedPage());
    await screen.findByRole("heading", { name: "Empresa Detalhe Sintética" });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar análise" }));

    expect(await screen.findByRole("heading", { name: "Dados da análise indisponíveis" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Empresa Detalhe Sintética" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Unsafe incomplete response");
    expect(screen.queryByText(/última consulta disponível/)).not.toBeInTheDocument();
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

    render(authorizedPage());

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

    render(authorizedPage());

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

    render(authorizedPage());

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

    render(
      <PrivateCapabilitiesProvider permissions={["leads:read", "commercial:read"]}>
        <LeadDetailPage />
      </PrivateCapabilitiesProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Empresa Detalhe Sintética",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pipeline de prospecção/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Avaliação comercial" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Riscos, sinais e evidências",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Relatório estratégico" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Mensagem personalizada" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Localização da empresa" }),
    ).toHaveTextContent("Recife / PE");
    expect(
      screen.getByRole("region", { name: "Localização da empresa" }),
    ).toHaveAttribute("data-cnpj", syntheticDetail.cnpj);
    expect(
      screen.getByRole("region", { name: "Localização da empresa" }),
    ).toHaveAttribute("data-lead-run-id", syntheticDetail.lead_run_id);
    expect(screen.getByText("Auditoria avançada")).toBeInTheDocument();
    for (const [label, target] of [
      ["Avaliação comercial", "#lead-summary"],
      ["Fundamentos da decisão", "#lead-insights"],
      ["Relatório", "#lead-report"],
      ["Mensagem de abordagem", "#lead-message"],
      ["Histórico", "#lead-history"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", target);
      expect(document.querySelector(target)).toBeInTheDocument();
    }
    const assessment = screen.getByRole("region", { name: "Avaliação comercial" });
    expect(screen.getByRole("heading", { name: "Prospecção recomendada" })).toBeInTheDocument();
    expect(assessment).toHaveTextContent("Data da análise: 02/07/2026");
    for (const subsequent of ["#lead-insights", "#lead-report", "#lead-message"]) {
      expect(assessment.compareDocumentPosition(document.querySelector(subsequent)!))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
    expect(screen.queryByRole("button", { name: /buscar|recuperar|revelar|enriquecer.*contato/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /buscar|recuperar|revelar|enriquecer.*contato/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("audit-lead-run-id")).toHaveTextContent(
      syntheticLeadRunId,
    );
  });

  it.each([
    ["leads:read"] as const,
    ["leads:read", "commercial:read"] as const,
    ["leads:read", "contacts:read"] as const,
    ["leads:read", "contacts:enrich"] as const,
  ])("requires both contact permissions for direct company contact actions: %j", async (...permissions) => {
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse()));

    render(
      <PrivateCapabilitiesProvider permissions={permissions}>
        <LeadDetailPage />
      </PrivateCapabilitiesProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Empresa Detalhe Sintética" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver na pipeline de prospecção" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Encontrar contatos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Contatos" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Contatos profissionais" }))
      .toHaveTextContent("Seu perfil não permite buscar ou visualizar contatos.");
    expect(fetchMock.mock.calls.some(([endpoint]) => String(endpoint).startsWith("/api/contact-enrichment")))
      .toBe(false);
    expect(screen.getByRole("link", { name: "Mensagem de abordagem" }))
      .toHaveAttribute("href", "#lead-message");
  });

  it("finds contacts directly for the displayed company only after an explicit search", async () => {
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/contact-enrichment/v2/company-search") {
        return respondWithJson({ data: {
          searchRequestId: "00000000-0000-4000-8000-000000000041",
          status: "SEARCH_DISPATCHED",
          requestedAt: "2026-10-16T12:00:00.000Z",
          updatedAt: "2026-10-16T12:00:00.000Z",
        } }, 202);
      }
      return respondWithJson(successfulResponse());
    });
    render(
      <PrivateCapabilitiesProvider permissions={["leads:read", "contacts:enrich", "contacts:read"]}>
        <LeadDetailPage />
      </PrivateCapabilitiesProvider>,
    );

    expect(await screen.findByRole("link", { name: "Encontrar contatos" }))
      .toHaveAttribute("href", "#lead-contacts");
    expect(screen.getByRole("link", { name: "Contatos" })).toHaveAttribute("href", "#lead-contacts");
    expect(fetchMock.mock.calls.some(([endpoint]) => String(endpoint).startsWith("/api/contact-enrichment")))
      .toBe(false);
    const contacts = screen.getByRole("region", { name: "Contatos profissionais" });
    fireEvent.click(within(contacts).getByRole("button", { name: /contatos de/i }));
    expect(fetchMock.mock.calls.some(([endpoint]) => String(endpoint).startsWith("/api/contact-enrichment")))
      .toBe(false);
    fireEvent.click(within(contacts).getByRole("button", { name: "Localizar empresa pelo nome" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/contact-enrichment/v2/company-search",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({
          cnpj_normalizado: syntheticDetail.cnpj,
          company_name: syntheticDetail.companyName,
          company_city: syntheticDetail.city,
          company_state: syntheticDetail.uf,
          company_country_iso2: "BR",
        }),
      }),
    ));
    expect(within(contacts).getByRole("button", { name: "Ver empresa localizada" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([endpoint]) => String(endpoint).startsWith("/api/contact-enrichment")))
      .toHaveLength(1);
    expect(contacts.compareDocumentPosition(document.querySelector("#lead-insights")!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps an uncertain contact request during a refreshed company analysis without submitting again", async () => {
    let currentLead = syntheticDetail;
    fetchMock.mockImplementation(async (input) => {
      if (input === "/api/contact-enrichment/v2") {
        return respondWithJson({ data: {
          requestId: "00000000-0000-4000-8000-000000000042",
          status: "DISPATCH_OUTCOME_UNKNOWN",
          requestedAt: "2026-10-16T12:00:00.000Z",
          updatedAt: "2026-10-16T12:00:00.000Z",
        } }, 202);
      }
      return respondWithJson(successfulResponse(currentLead));
    });
    render(
      <PrivateCapabilitiesProvider permissions={["leads:read", "contacts:enrich", "contacts:read"]}>
        <LeadDetailPage />
      </PrivateCapabilitiesProvider>,
    );

    const contacts = await screen.findByRole("region", { name: "Contatos profissionais" });
    fireEvent.click(within(contacts).getByRole("button", { name: /contatos de/i }));
    fireEvent.change(within(contacts).getByRole("textbox", { name: "Domínio da empresa" }), {
      target: { value: "empresa.example" },
    });
    fireEvent.click(within(contacts).getByRole("button", { name: "Buscar decisores" }));
    expect(await within(contacts).findByRole("button", { name: "Ver ou atualizar contatos" })).toBeInTheDocument();

    currentLead = { ...syntheticDetail, decision_id: "decision-synthetic-refreshed", lead_run_id: syntheticPreviousLeadRunId };
    fireEvent.click(screen.getByRole("button", { name: "Atualizar análise" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Localização da empresa" }))
      .toHaveAttribute("data-lead-run-id", syntheticPreviousLeadRunId));
    expect(within(contacts).getByRole("button", { name: "Ver ou atualizar contatos" })).toBeInTheDocument();
    expect(within(contacts).queryByRole("button", { name: /contatos de/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([endpoint]) => String(endpoint).startsWith("/api/contact-enrichment")))
      .toHaveLength(1);
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

    render(authorizedPage());

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

    render(authorizedPage());

    const report = await screen.findByRole("region", { name: "Relatório estratégico" });
    expect(report).toHaveTextContent("Relatório não registrado");
    expect(screen.getByText("Relatório ainda não disponível")).toBeInTheDocument();
    const evidence = screen.getByRole("region", { name: "Evidências" });
    expect(evidence).toHaveTextContent("Evidências ausentes");
    expect(evidence).not.toHaveTextContent("Conteúdo protegido");
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

    render(authorizedPage());

    const withheldStates = await screen.findAllByRole("status", {
      name: "Conteúdo protegido",
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

    render(authorizedPage());

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
    expect(screen.getByRole("heading", { name: "Manter em acompanhamento" })).toBeInTheDocument();
    expect(staleNotice.compareDocumentPosition(screen.getByRole("region", { name: "Avaliação comercial" })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

    render(authorizedPage());

    await screen.findByRole("heading", {
      name: "Empresa Detalhe Sintética",
    });
    expect(screen.getByTestId("lead-score")).toHaveTextContent(
      "Não disponível",
    );
    expect(screen.getByTestId("lead-score")).not.toHaveTextContent("0");
    expect(screen.getByTestId("lead-recommendation-reason")).toHaveTextContent(
      "O motivo da recomendação não está disponível nesta consulta.",
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
