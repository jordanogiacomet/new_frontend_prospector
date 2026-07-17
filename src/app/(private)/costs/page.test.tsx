import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { query: "" },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationState.query),
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
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(costEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
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

    expect(
      await screen.findByRole("table", { name: "Custos por execução" }),
    ).toBeInTheDocument();
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
});
