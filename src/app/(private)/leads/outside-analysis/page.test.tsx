import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OutsideAnalysisCompany } from "../../../../types/leads";
import { PrivateCapabilitiesProvider } from "../../../../components/auth/private-capabilities";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { query: "" },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

import OutsideAnalysisPage from "./page";

function authorizedPage() {
  return <PrivateCapabilitiesProvider permissions={["leads:read"]}><OutsideAnalysisPage /></PrivateCapabilitiesProvider>;
}

const fetchMock = vi.fn();
const syntheticCompany: OutsideAnalysisCompany = {
  import_batch_id: "batch-synthetic-outside-page",
  source_row: 6,
  cnpj: "11222333000181",
  companyName: "Empresa Sintética Fora da Análise",
  city: "Recife",
  uf: "PE",
  sector: "Serviços técnicos",
  decidedAction: "NAO_ABORDAR",
  decisionReason: "Motivo sintético armazenado pelo produtor",
  decidedAt: "2026-07-23T14:30:00.000Z",
};

function respondWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulResponse(
  data: OutsideAnalysisCompany[],
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
      totalPages: meta.totalPages ?? (data.length === 0 ? 0 : 1),
    },
  };
}

describe("outside-analysis page", () => {
  beforeEach(() => {
    navigationState.query = "";
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("denies missing read permission before any request", () => {
    render(<OutsideAnalysisPage />);
    expect(screen.getByRole("heading", { name: "Acesso não autorizado" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("removes previous results and stops polling after HTTP %i", async (status) => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      fetchMock
        .mockResolvedValueOnce(respondWithJson(successfulResponse([syntheticCompany])))
        .mockResolvedValueOnce(respondWithJson({ error: { message: "private detail" } }, status));
      render(authorizedPage());
      await screen.findByText(syntheticCompany.companyName!);
      const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
      if (typeof refresh !== "function") throw new Error("Expected the outside-analysis refresh callback.");
      await act(async () => refresh());
      expect(await screen.findByRole("heading", { name: status === 401 ? "Sua sessão expirou" : "Acesso não autorizado" })).toBeInTheDocument();
      expect(screen.queryByText(syntheticCompany.companyName!)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Atualizar|Tentar novamente/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Entrar novamente" }) !== null).toBe(status === 401);
      await act(async () => refresh());
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(document.body).not.toHaveTextContent("private detail");
    } finally {
      intervalSpy.mockRestore();
      visibilitySpy.mockRestore();
    }
  });

  it("preserves the last confirmed list during an unavailable refresh and recovers with GET", async () => {
    fetchMock
      .mockResolvedValueOnce(respondWithJson(successfulResponse([syntheticCompany])))
      .mockResolvedValueOnce(respondWithJson({}, 503))
      .mockResolvedValueOnce(respondWithJson(successfulResponse([{ ...syntheticCompany, companyName: "Consulta atualizada" }])));
    render(authorizedPage());
    await screen.findByText(syntheticCompany.companyName!);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar lista" }));
    expect(await screen.findByText(/Exibindo a última consulta disponível/)).toBeInTheDocument();
    expect(screen.getByText(syntheticCompany.companyName!)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar lista" }));
    expect(await screen.findByText("Consulta atualizada")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("rejects malformed company entries before rendering a table", async () => {
    fetchMock.mockResolvedValue(respondWithJson({ data: [null], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    render(authorizedPage());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the current view and a distinct loading state", () => {
    render(authorizedPage());

    expect(
      screen.getByRole("link", { name: "Fora da análise" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Para análise" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("status", { name: "Carregando decisões do CRM" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the server page and preserves pagination query", async () => {
    navigationState.query = "page=2&pageSize=1";
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse([syntheticCompany], {
          page: 2,
          pageSize: 1,
          total: 2,
          totalPages: 2,
        }),
      ),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("table", {
        name: "Empresas fora da análise",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Empresa Sintética Fora da Análise"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver decisão do CRM" })).toHaveAttribute(
      "href",
      `/leads/outside-analysis/${syntheticCompany.cnpj}?returnTo=${encodeURIComponent("/leads/outside-analysis?page=2&pageSize=1")}`,
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/leads/outside-analysis?page=2&pageSize=1",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });

  it("refreshes while visible without overlap and cleans up on unmount", async () => {
    const visibilityStateSpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    fetchMock.mockResolvedValueOnce(
      respondWithJson(successfulResponse([syntheticCompany])),
    );

    const { unmount } = render(authorizedPage());

    await screen.findByText("Empresa Sintética Fora da Análise");
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

    if (typeof refresh !== "function") {
      throw new Error("Expected the outside-analysis refresh callback.");
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
              ...syntheticCompany,
              companyName: "Empresa Atualizada pelo CRM",
            },
          ]),
        ),
      );
    });
    expect(
      await screen.findByText("Empresa Atualizada pelo CRM"),
    ).toBeInTheDocument();

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

  it("shows an instructive empty state", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(successfulResponse([])),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma decisão do CRM disponível",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /aparecerão aqui quando houver uma decisão registrada pelo CRM/i,
    );
  });

  it("distinguishes an out-of-range page from an empty view", async () => {
    navigationState.query = "page=999&pageSize=20";
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse([], {
          page: 999,
          pageSize: 20,
          total: 17,
          totalPages: 1,
        }),
      ),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Esta página não tem decisões do CRM",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar à primeira página" }),
    ).toHaveAttribute("href", "/leads/outside-analysis");
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma decisão do CRM disponível",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses a fixed safe error for API and network failures", async () => {
    const privateDetail =
      "SELECT private FROM database.internal with synthetic-password";
    fetchMock.mockResolvedValueOnce(
      respondWithJson(
        {
          error: {
            code: "DATA_SOURCE_UNAVAILABLE",
            message: privateDetail,
          },
        },
        503,
      ),
    );

    const firstRender = render(authorizedPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as decisões do CRM agora.",
    );
    expect(document.body).not.toHaveTextContent(privateDetail);
    firstRender.unmount();

    fetchMock.mockRejectedValueOnce(
      new Error("socket database.internal ECONNRESET"),
    );
    render(authorizedPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as decisões do CRM agora.",
    );
    expect(document.body).not.toHaveTextContent("database.internal");
  });

  it("fails safely for an invalid success envelope", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      }),
    );

    render(authorizedPage());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps server ordering and uses precise business language", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        successfulResponse([
          {
            ...syntheticCompany,
            cnpj: "00000000000002",
            companyName: "Segunda na ordem do servidor",
          },
          {
            ...syntheticCompany,
            cnpj: "00000000000001",
            companyName: "Primeira alfabeticamente",
          },
        ]),
      ),
    );

    render(authorizedPage());

    const rows = await screen.findAllByRole("row");
    expect(rows[1]).toHaveTextContent("Segunda na ordem do servidor");
    expect(rows[2]).toHaveTextContent("Primeira alfabeticamente");
    expect(document.body).toHaveTextContent(
      /decisão registrada pelo CRM sem entrarem na análise pública/i,
    );
    expect(document.body).not.toHaveTextContent(/falha|descartad/i);
  });
});
