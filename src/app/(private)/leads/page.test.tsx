import {
  act,
  render,
  screen,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("lead list page", () => {
  beforeEach(() => {
    navigationState.query = "";
    replaceMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows a distinct loading skeleton while the current API request is pending", () => {
    render(<LeadListPage />);

    expect(
      screen.getByRole("status", { name: "Carregando decisões" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /nenhuma/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the populated server page and preserves URL filters in pagination", async () => {
    navigationState.query = "page=2&pageSize=1&uf=SP";
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

    render(<LeadListPage />);

    expect(
      await screen.findByRole("table", { name: "Resultados de leads" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Empresa Página Sintética")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Página anterior" }),
    ).toHaveAttribute("href", "/leads?page=1&pageSize=1&uf=SP");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/leads?page=2&pageSize=1&uf=SP",
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

    const { unmount } = render(<LeadListPage />);

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

    render(<LeadListPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma decisão disponível",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/assim que houver decisões/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/não encontramos resultados para os filtros/i),
    ).not.toBeInTheDocument();
  });

  it("shows a no-match state without clearing the active URL filters", async () => {
    navigationState.query = "page=2&uf=SP&priority=B";
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse([], {
          page: 2,
          total: 0,
          totalPages: 0,
        }),
      ),
    );

    render(<LeadListPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Nenhum resultado para estes filtros",
      }),
    ).toBeInTheDocument();

    const activeFilters = screen.getByRole("region", {
      name: "Filtros ativos",
    });
    expect(within(activeFilters).getByText("UF: SP")).toBeInTheDocument();
    expect(
      within(activeFilters).getByText("Prioridade: Prioridade B"),
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leads?page=2&uf=SP&priority=B",
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

    render(<LeadListPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Esta página não tem decisões",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar à primeira página" }),
    ).toHaveAttribute("href", "/leads");
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma decisão disponível",
      }),
    ).not.toBeInTheDocument();
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

    render(<LeadListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as decisões agora.",
    );
    for (const privateDetail of privateDetails) {
      expect(document.body).not.toHaveTextContent(privateDetail);
    }
  });

  it("uses the same safe error state for a network failure", async () => {
    fetchMock.mockRejectedValue(
      new Error("socket database.internal ECONNRESET"),
    );

    render(<LeadListPage />);

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

    render(<LeadListPage />);

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

    render(<LeadListPage />);

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
    render(<LeadListPage />);

    expect(document.body).toHaveTextContent(
      /decisões elegíveis, legíveis e retidas/i,
    );
    expect(document.body).toHaveTextContent(
      /não representa um inventário completo/i,
    );
    expect(document.body).not.toHaveTextContent(
      /todas as empresas analisadas|todo o histórico/i,
    );
  });
});
