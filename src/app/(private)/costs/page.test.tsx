import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { query: "", canReadCosts: true },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

vi.mock("../../../components/auth/private-capabilities", () => ({
  usePrivateCapabilities: () => ({
    hasPermission: (permission: string) => permission === "costs:read" && navigationState.canReadCosts,
  }),
}));

import CostOverviewPage from "./page";

const fetchMock =
  vi.fn<(input: string, init: RequestInit) => Promise<Response>>();

function apiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function costEnvelope(
  data: readonly unknown[] = [
    {
      leadRunId: "run-synthetic-001",
      availability: "AVAILABLE",
      estimatedCostUsd: "12.34567890",
    },
  ],
  meta: Partial<{
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly currency: "USD";
    readonly coverage: "COMPLETE" | "PARTIAL" | "UNKNOWN" | "EMPTY";
    readonly subtotalEstimatedUsd: string | null;
  }> = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? 20,
      total: meta.total ?? data.length,
      currency: meta.currency ?? "USD",
      coverage: meta.coverage ?? "COMPLETE",
      subtotalEstimatedUsd:
        meta.subtotalEstimatedUsd === undefined
          ? "12.34567890"
          : meta.subtotalEstimatedUsd,
    },
  };
}

function firstFetchCall(): readonly [string, RequestInit] {
  const call = fetchMock.mock.calls[0];

  if (call === undefined) {
    throw new Error("Expected a costs request.");
  }

  return call as unknown as readonly [string, RequestInit];
}

describe("cost overview page", () => {
  beforeEach(() => {
    navigationState.query = "";
    navigationState.canReadCosts = true;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(costEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("does not request costs without the independent read capability", () => {
    navigationState.canReadCosts = false;

    render(<CostOverviewPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Você não tem acesso aos custos.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("offers sign-in after session expiry without exposing cost data or diagnostics", async () => {
    fetchMock.mockResolvedValue(apiResponse({ error: { message: "private diagnostics" } }, 401));

    render(<CostOverviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sua sessão expirou");
    expect(screen.getByRole("link", { name: "Entrar novamente" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private diagnostics");
  });

  it("removes confirmed costs when capability is withdrawn", async () => {
    const view = render(<CostOverviewPage />);
    await screen.findByRole("table", { name: "Custos por análise" });

    navigationState.canReadCosts = false;
    view.rerender(<CostOverviewPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Você não tem acesso aos custos.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("run-synthetic-001");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows a loading state while the costs request is pending", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    render(<CostOverviewPage />);

    expect(
      screen.getByRole("status", { name: "Carregando custos" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("gets the approved internal envelope and renders a complete estimated cost", async () => {
    render(<CostOverviewPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [endpoint, init] = firstFetchCall();

    expect(endpoint).toBe("/api/costs?page=1&pageSize=20");
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
    expect(init.body).toBeUndefined();

    const table = await screen.findByRole("table", { name: "Custos por análise" });
    expect(table).toHaveClass("responsive-data-table");
    expect(within(table).getByRole("columnheader", { name: "Análise" })).toBeInTheDocument();
    expect(within(table).getAllByRole("cell").map((cell) => cell.getAttribute("data-label"))).toEqual(["Análise", "Disponibilidade", "Custo estimado"]);
    const identifier = within(table).getByText("run-synthetic-001");
    expect(identifier.closest("details")).not.toHaveAttribute("open");
    expect(identifier).not.toBeVisible();
    fireEvent.click(within(table).getByText("Ver identificação"));
    expect(identifier).toBeVisible();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Custo estimado")).toHaveLength(2);
    expect(screen.getAllByText(/US\$\s+12,3456789/)).toHaveLength(2);
    expect(screen.getByText("Disponível")).toBeInTheDocument();
  });

  it("groups every cost summary term with a semantic description", async () => {
    render(<CostOverviewPage />);

    const summary = (
      await screen.findByText("Cobertura completa")
    ).closest("section");

    expect(summary?.querySelectorAll(":scope > dl > div")).toHaveLength(2);
    expect(summary?.querySelectorAll(":scope > dl > div > dt")).toHaveLength(2);
    expect(summary?.querySelectorAll(":scope > dl > div > dd")).toHaveLength(2);
    expect(summary?.querySelector(":scope > dl > p")).toBeNull();
  });

  it("labels partial coverage as a subtotal and preserves every run availability state", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        costEnvelope(
          [
            {
              leadRunId: "run-synthetic-available",
              availability: "AVAILABLE",
              estimatedCostUsd: "1.25000000",
            },
            {
              leadRunId: "run-synthetic-unknown",
              availability: "UNKNOWN",
              estimatedCostUsd: null,
            },
            {
              leadRunId: "run-synthetic-ambiguous",
              availability: "AMBIGUOUS",
              estimatedCostUsd: null,
            },
          ],
          {
            total: 3,
            coverage: "PARTIAL",
            subtotalEstimatedUsd: "1.25000000",
          },
        ),
      ),
    );

    render(<CostOverviewPage />);

    expect(await screen.findByText("Subtotal estimado")).toBeInTheDocument();
    expect(screen.getAllByText(/US\$\s+1,25/)).toHaveLength(2);
    expect(
      screen.getByText(/A cobertura é parcial/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Disponível")).toBeInTheDocument();
    expect(screen.getByText("Desconhecido")).toBeInTheDocument();
    expect(screen.getByText("Ambíguo")).toBeInTheDocument();
  });

  it("shows an unknown coverage state without inventing a value", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        costEnvelope(
          [
            {
              leadRunId: "run-synthetic-unknown",
              availability: "UNKNOWN",
              estimatedCostUsd: null,
            },
          ],
          { coverage: "UNKNOWN", subtotalEstimatedUsd: null },
        ),
      ),
    );

    render(<CostOverviewPage />);

    expect(
      await screen.findByText("Custo estimado indisponível"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument();
  });

  it("shows an empty state without inferring total spend", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        costEnvelope([], {
          total: 0,
          coverage: "EMPTY",
          subtotalEstimatedUsd: null,
        }),
      ),
    );

    render(<CostOverviewPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Nenhum custo estimado disponível",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("US$\u00a00,00");
  });

  it("shows a distinct safe state when the approved source is unavailable", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "DATA_SOURCE_UNAVAILABLE",
            message: "SELECT internal detail FROM producer_costs",
          },
        },
        503,
      ),
    );

    render(<CostOverviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Os custos não puderam ser consultados agora.",
    );
    expect(document.body).not.toHaveTextContent("SELECT internal detail");
  });

  it("shows a safe access-denied state for a direct page visit", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "ACCESS_DENIED",
            message: "permission diagnostics must stay private",
          },
        },
        403,
      ),
    );

    render(<CostOverviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você não tem acesso aos custos.",
    );
    expect(document.body).not.toHaveTextContent("permission diagnostics");
  });

  it("shows a generic safe error for other failed requests", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "UNEXPECTED_ERROR",
            message: "internal trace and producer diagnostics",
          },
        },
        500,
      ),
    );

    render(<CostOverviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os custos agora.",
    );
    expect(document.body).not.toHaveTextContent("internal trace");
  });

  it("fails safely when a success response contains fields outside the approved envelope", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        costEnvelope([
          {
            leadRunId: "run-synthetic-001",
            availability: "AVAILABLE",
            estimatedCostUsd: "12.34567890",
            internalDetails: "should not render",
          },
        ]),
      ),
    );

    render(<CostOverviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os custos agora.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("should not render");
  });

  it("fails safely when a run availability and its value are inconsistent", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        costEnvelope([
          {
            leadRunId: "run-synthetic-001",
            availability: "AVAILABLE",
            estimatedCostUsd: null,
          },
        ]),
      ),
    );

    render(<CostOverviewPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os custos agora.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("uses server-side pagination links and preserves the approved page size", async () => {
    navigationState.query = "page=2&pageSize=10&ignored=value";
    fetchMock.mockResolvedValue(
      apiResponse(costEnvelope(undefined, { page: 2, pageSize: 10, total: 21 })),
    );

    render(<CostOverviewPage />);

    const pagination = await screen.findByRole("navigation", {
      name: "Paginação dos custos",
    });
    expect(firstFetchCall()[0]).toBe("/api/costs?page=2&pageSize=10");
    expect(within(pagination).getByText("Página 2 de 3")).toBeInTheDocument();
    expect(
      within(pagination).getByRole("link", { name: "Página anterior" }),
    ).toHaveAttribute("href", "/costs?page=1&pageSize=10");
    expect(
      within(pagination).getByRole("link", { name: "Próxima página" }),
    ).toHaveAttribute("href", "/costs?page=3&pageSize=10");
  });
  it("refreshes costs with immediate feedback, no duplicate request and retained confirmed data after failure", async () => {
    let rejectRefresh: ((error: Error) => void) | undefined;
    fetchMock.mockResolvedValueOnce(apiResponse(costEnvelope())).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }))
      .mockResolvedValueOnce(apiResponse(costEnvelope()));
    render(<CostOverviewPage />);
    await screen.findByRole("table", { name: "Custos por análise" });
    const refresh = screen.getByRole("button", { name: "Atualizar custos" });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(screen.getByRole("button", { name: "Atualizando custos…" })).toBeDisabled();
    expect(screen.getByRole("table", { name: "Custos por análise" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    rejectRefresh?.(new Error("private detail"));
    expect(await screen.findByRole("alert")).toHaveTextContent("última consulta confirmada");
    expect(screen.getByRole("table", { name: "Custos por análise" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar custos" }));
    expect(await screen.findByText("Custos atualizados.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("releases a pending refresh after leaving and returning to the same query", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(costEnvelope()))
      .mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(apiResponse(costEnvelope(undefined, { page: 2 })))
      .mockResolvedValueOnce(apiResponse(costEnvelope()));
    const view = render(<CostOverviewPage />);
    await screen.findByRole("table", { name: "Custos por análise" });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar custos" }));
    expect(screen.getByRole("button", { name: "Atualizando custos…" })).toBeDisabled();
    navigationState.query = "page=2";
    view.rerender(<CostOverviewPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    navigationState.query = "";
    view.rerender(<CostOverviewPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getByRole("button", { name: "Atualizar custos" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Atualizando custos…" })).not.toBeInTheDocument();
  });

});
