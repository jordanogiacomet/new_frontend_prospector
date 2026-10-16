import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrivateCapabilitiesProvider } from "../../../components/auth/private-capabilities";
import type { LeadSummary } from "../../../types/leads";

const { navigationState, replaceMock } = vi.hoisted(() => ({
  navigationState: { query: "" },
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

import LeadListPage from "./page";

const fetchMock = vi.fn();
const leadRunId = `lr_${"a".repeat(64)}`;

const syntheticLead: LeadSummary = {
  decision_id: "decision-synthetic-page-001",
  import_batch_id: "batch-synthetic-page-001",
  lead_run_id: leadRunId,
  source_row: 3,
  source_hash: "hash-synthetic-page-001",
  agent_version: "agent-synthetic-page-1",
  cnpj: "12345678000195",
  companyName: "Empresa Página Sintética",
  city: "São Paulo",
  uf: "SP",
  sector: "Serviços",
  score: 82,
  priority: "B",
  recommendedAction: "PROSPECTAR_COM_CAUTELA",
  trustStatus: "Revisão Humana",
  confidenceIndicator: "normal",
  lastAnalysisAt: "2026-06-20T15:00:00.000Z",
};

function respondWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulResponse(
  data: LeadSummary[],
  meta: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  } = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? 20,
      total: meta.total ?? data.length,
      totalPages:
        meta.totalPages ?? (data.length === 0 ? 0 : 1),
    },
  };
}

function authorizedPage() {
  return (
    <PrivateCapabilitiesProvider permissions={["leads:read"]}>
      <LeadListPage />
    </PrivateCapabilitiesProvider>
  );
}

describe("lead list page", () => {
  beforeEach(() => {
    navigationState.query = "";
    replaceMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("denies missing read permission before any request", () => {

    render(<LeadListPage />);

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

  it("shows a distinct loading skeleton while the current API request is pending", () => {
    render(authorizedPage());

    expect(
      screen.getByRole("link", { name: "Para análise" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Fora da análise" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("status", { name: "Carregando decisões" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /nenhuma/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the populated server page and preserves URL filters in pagination", async () => {
    navigationState.query = "page=2&pageSize=1&uf=SP&priority=D";
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse([syntheticLead], {
          page: 2,
          pageSize: 1,
          total: 2,
          totalPages: 2,
        }),
      ),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("table", { name: "Resultados de leads" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Empresa Página Sintética")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Página anterior" }),
    ).toHaveAttribute("href", "/leads?page=1&pageSize=1&uf=SP&priority=D");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/leads?page=2&pageSize=1&uf=SP&priority=D",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("refreshes visible results every five seconds without overlapping requests and cleans up on unmount", async () => {
    const visibilityStateSpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    fetchMock.mockResolvedValueOnce(
      respondWithJson(successfulResponse([syntheticLead])),
    );

    const { unmount } = render(authorizedPage());

    await screen.findByText("Empresa Página Sintética");
    const refreshCall = setIntervalSpy.mock.calls.find(
      ([, delay]) => delay === 5_000,
    );
    const refresh = refreshCall?.[0];
    const refreshIntervalId =
      setIntervalSpy.mock.results.find(
        (_, index) => setIntervalSpy.mock.calls[index]?.[1] === 5_000,
      )?.value;
    const initialSignal = (
      fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    )?.signal;

    expect(refreshCall).toBeDefined();
    if (typeof refresh !== "function") {
      throw new Error("Expected the lead list refresh callback.");
    }

    let resolveRefresh: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    await act(async () => {
      refresh();
      refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRefresh?.(
        respondWithJson(
          successfulResponse([
            {
              ...syntheticLead,
              companyName: "Empresa Atualizada Automaticamente",
            },
          ]),
        ),
      );
    });

    expect(
      await screen.findByText("Empresa Atualizada Automaticamente"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Empresa Página Sintética"),
    ).not.toBeInTheDocument();

    visibilityStateSpy.mockReturnValue("hidden");
    await act(async () => {
      refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    unmount();

    expect(initialSignal?.aborted).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalledWith(refreshIntervalId);
    visibilityStateSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("shows a no-data state when no retained decisions are available", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(successfulResponse([])),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma decisão disponível",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/quando houver análises disponíveis/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/não encontramos resultados para os filtros/i),
    ).not.toBeInTheDocument();
  });

  it("keeps the last results after a failed refresh and recovers with an explicit update", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fetchMock
      .mockResolvedValueOnce(respondWithJson(successfulResponse([syntheticLead])))
      .mockResolvedValueOnce(respondWithJson({ error: { message: "private failure" } }, 503));

    render(authorizedPage());
    await screen.findByText("Empresa Página Sintética");
    const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
    if (typeof refresh !== "function") {
      throw new Error("Expected the lead list refresh callback.");
    }
    await act(async () => refresh());

    expect(await screen.findByRole("status")).toHaveTextContent("última consulta disponível");
    expect(screen.getByText("Empresa Página Sintética")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private failure");

    let resolveUpdate: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolveUpdate = resolve;
    }));
    fireEvent.click(screen.getByRole("button", { name: "Atualizar lista" }));
    expect(screen.getByRole("button", { name: "Atualizando…" })).toBeDisabled();

    await act(async () => {
      resolveUpdate?.(respondWithJson(successfulResponse([{ ...syntheticLead, companyName: "Empresa recuperada" }])));
    });

    expect(await screen.findByText("Empresa recuperada")).toBeInTheDocument();
    expect(screen.queryByText(/última consulta disponível/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar lista" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    intervalSpy.mockRestore();
  });

  it.each([401, 403])("clears previous results when a refresh denies access with %i", async (status) => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fetchMock
      .mockResolvedValueOnce(respondWithJson(successfulResponse([syntheticLead])))
      .mockResolvedValueOnce(respondWithJson({ error: { code: "ACCESS_DENIED" } }, status));

    render(authorizedPage());
    await screen.findByText("Empresa Página Sintética");
    const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
    if (typeof refresh !== "function") {
      throw new Error("Expected the lead list refresh callback.");
    }
    await act(async () => refresh());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Empresa Página Sintética")).not.toBeInTheDocument();
    intervalSpy.mockRestore();
  });

  it("retries the same filtered query from the initial safe error", async () => {
    navigationState.query = "page=2&uf=SP&priority=B";
    fetchMock
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce(respondWithJson(successfulResponse([syntheticLead])));

    render(authorizedPage());
    fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Empresa Página Sintética")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/leads?page=2&uf=SP&priority=B", expect.any(Object));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("clears previous results when a refresh returns an invalid contract", async () => {
    fetchMock
      .mockResolvedValueOnce(respondWithJson(successfulResponse([syntheticLead])))
      .mockResolvedValueOnce(respondWithJson({ data: [], meta: { total: 1 } }));

    render(authorizedPage());
    await screen.findByText("Empresa Página Sintética");
    fireEvent.click(screen.getByRole("button", { name: "Atualizar lista" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Empresa Página Sintética")).not.toBeInTheDocument();
    expect(screen.queryByText(/última consulta disponível/)).not.toBeInTheDocument();
  });

  it("shows a no-match state without clearing the active URL filters", async () => {
    navigationState.query = "page=2&pageSize=10&uf=SP&priority=B";
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse([], {
          page: 2,
          pageSize: 10,
          total: 0,
          totalPages: 0,
        }),
      ),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Nenhum resultado para estes filtros",
      }),
    ).toBeInTheDocument();

    const activeFilters = screen.getByRole("region", {
      name: "Filtros ativos",
    });
    expect(within(activeFilters).getByText("Estado: SP")).toBeInTheDocument();
    expect(
      within(activeFilters).getByText("Prioridade B"),
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Limpar filtros e ver empresas" }))
      .toHaveAttribute("href", "/leads?page=1&pageSize=10");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leads?page=2&pageSize=10&uf=SP&priority=B",
      expect.any(Object),
    );
  });

  it("distinguishes an out-of-range page from an empty retained dataset", async () => {
    navigationState.query = "page=999&pageSize=20";
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse([], {
          page: 999,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        }),
      ),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Esta página não tem decisões",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar à primeira página" }),
    ).toHaveAttribute("href", "/leads?page=1&pageSize=20");
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma decisão disponível",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps active filters when returning from an empty page to the first page", async () => {
    navigationState.query = "page=999&pageSize=10&uf=SP&priority=C";
    fetchMock.mockResolvedValue(respondWithJson(successfulResponse([], {
      page: 999,
      pageSize: 10,
      total: 2,
      totalPages: 1,
    })));

    render(authorizedPage());

    expect(await screen.findByRole("link", { name: "Voltar à primeira página" }))
      .toHaveAttribute("href", "/leads?page=1&pageSize=10&uf=SP&priority=C");
  });

  it("renders a fixed safe error without exposing API details", async () => {
    const privateDetails = [
      "postgresql://readonly:secret@database.internal/leads",
      "SELECT * FROM company_validations",
      "correlation-internal-123",
    ];
    fetchMock.mockResolvedValue(
      respondWithJson(
        {
          error: {
            code: "DATA_SOURCE_UNAVAILABLE",
            message: privateDetails[0],
            details: privateDetails.slice(1),
          },
        },
        503,
      ),
    );

    render(authorizedPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as decisões agora.",
    );
    for (const privateDetail of privateDetails) {
      expect(document.body).not.toHaveTextContent(privateDetail);
    }
  });

  it.each([null, { ...syntheticLead, companyName: { unsafe: "object" } }, { ...syntheticLead, score: 101 }])(
    "rejects a malformed lead entry before passing it to the table",
    async (entry) => {
      fetchMock.mockResolvedValue(respondWithJson({ data: [entry], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
      render(authorizedPage());
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    },
  );

  it("uses the same safe error state for a network failure", async () => {
    fetchMock.mockRejectedValue(
      new Error("socket database.internal ECONNRESET"),
    );

    render(authorizedPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as decisões agora.",
    );
    expect(document.body).not.toHaveTextContent(
      "socket database.internal ECONNRESET",
    );
  });

  it("fails safely when a successful response does not match the list envelope", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({
        data: [],
        meta: {
          page: 1,
          pageSize: 20,
          total: 0,
        },
      }),
    );

    render(authorizedPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as decisões agora.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders API results as returned instead of filtering or sorting the page in the browser", async () => {
    navigationState.query = "uf=SP&priority=B";
    const serverOrderedLead = {
      ...syntheticLead,
      decision_id: "decision-synthetic-page-002",
      companyName: "Resultado ordenado pelo servidor",
      uf: "RJ",
      priority: "C",
    };
    fetchMock.mockResolvedValue(
      respondWithJson(successfulResponse([serverOrderedLead])),
    );

    render(authorizedPage());

    expect(
      await screen.findByText("Resultado ordenado pelo servidor"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/ordenar/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nome da empresa/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leads?uf=SP&priority=B",
      expect.any(Object),
    );
  });

  it("uses the approved bounded-scope wording without claiming complete inventory", () => {
    render(authorizedPage());

    expect(document.body).toHaveTextContent(
      /análises disponíveis para consulta/i,
    );
    expect(document.body).toHaveTextContent(
      /não representa um inventário completo/i,
    );
    expect(document.body).not.toHaveTextContent(
      /todas as empresas analisadas|todo o histórico/i,
    );
  });
});
