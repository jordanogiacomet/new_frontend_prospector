import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OutsideAnalysisCompany } from "../../../../../types/leads";
import { PrivateCapabilitiesProvider } from "../../../../../components/auth/private-capabilities";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { cnpj: "11222333000181", query: "" },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ cnpj: navigationState.cnpj }),
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

import OutsideAnalysisDetailPage from "./page";

function authorizedPage() {
  return <PrivateCapabilitiesProvider permissions={["leads:read"]}><OutsideAnalysisDetailPage /></PrivateCapabilitiesProvider>;
}

const fetchMock = vi.fn();
const syntheticCompany: OutsideAnalysisCompany = {
  import_batch_id: "batch-synthetic-outside-detail",
  source_row: 6,
  cnpj: "11222333000181",
  companyName: "Empresa Horizonte CRM",
  city: "Recife",
  uf: "PE",
  sector: "Serviços técnicos",
  decidedAction: "NAO_ABORDAR",
  decisionReason:
    "O CRM já registrou uma decisão para esta empresa.\nManter o acompanhamento existente.",
  decidedAt: "2026-07-23T14:30:00.000Z",
};

function respondWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("outside-analysis detail page", () => {
  beforeEach(() => {
    navigationState.cnpj = "11222333000181";
    navigationState.query = "";
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("denies missing read permission before any request", () => {
    render(<OutsideAnalysisDetailPage />);
    expect(screen.getByRole("heading", { name: "Acesso não autorizado" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("distinguishes HTTP %i from a transient error without offering retry", async (status) => {
    fetchMock.mockResolvedValue(respondWithJson({ error: { message: "private detail" } }, status));
    render(authorizedPage());
    expect(await screen.findByRole("heading", { name: status === 401 ? "Sua sessão expirou" : "Acesso não autorizado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Entrar novamente" }) !== null).toBe(status === 401);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveTextContent("private detail");
  });

  it("recovers an unavailable decision with an explicit GET without reloading the page", async () => {
    fetchMock
      .mockResolvedValueOnce(respondWithJson({}, 503))
      .mockResolvedValueOnce(respondWithJson({ data: syntheticCompany }));
    render(authorizedPage());
    fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { name: syntheticCompany.companyName! })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("shows a distinct loading state while the decision is requested", () => {
    render(authorizedPage());

    expect(
      screen.getByRole("status", { name: "Carregando decisão do CRM" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar para fora da análise" }),
    ).toHaveAttribute("href", "/leads/outside-analysis");
  });

  it("restores the exact list page and keeps navigation context out of the detail API", () => {
    navigationState.query = `returnTo=${encodeURIComponent("/leads/outside-analysis?page=3&pageSize=5")}`;
    render(authorizedPage());

    expect(screen.getByRole("link", { name: "Voltar para fora da análise" })).toHaveAttribute(
      "href", "/leads/outside-analysis?page=3&pageSize=5",
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/leads/outside-analysis/11222333000181",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each(["https://malicious.example/leads/outside-analysis?page=3", "/leads?page=3", "/leads/outside-analysis?pageSize=21"])(
    "uses the outside-analysis fallback for an unapproved return destination %s",
    (returnTo) => {
      navigationState.query = `returnTo=${encodeURIComponent(returnTo)}`;
      render(authorizedPage());
      expect(screen.getByRole("link", { name: "Voltar para fora da análise" })).toHaveAttribute("href", "/leads/outside-analysis");
    },
  );

  it("loads the exact CNPJ and presents only the approved business facts", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({ data: syntheticCompany }),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Empresa Horizonte CRM",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("11.222.333/0001-81");
    expect(document.body).toHaveTextContent("Recife / PE");
    expect(document.body).toHaveTextContent("Serviços técnicos");
    expect(document.body).toHaveTextContent("Não abordar");
    expect(document.body).toHaveTextContent(
      "O CRM já registrou uma decisão para esta empresa. Manter o acompanhamento existente.",
    );
    expect(document.body).toHaveTextContent("23/07/2026");
    expect(document.body).toHaveTextContent(
      "batch-synthetic-outside-detail",
    );
    expect(document.body).toHaveTextContent("Linha 6");
    expect(
      screen.getByRole("link", { name: "Voltar para fora da análise" }),
    ).toHaveAttribute("href", "/leads/outside-analysis");
    expect(
      screen.queryByRole("link", { name: /abrir análise/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/leads/outside-analysis/11222333000181",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
  });

  it("presents an approved technical reason term in business language", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({
        data: {
          ...syntheticCompany,
          decisionReason:
            "Histórico CRM encontrado: REENGAJAR_COM_HISTORICO. Revisão humana obrigatória.",
        },
      }),
    );

    render(authorizedPage());

    expect(
      await screen.findByText(/Histórico CRM encontrado/),
    ).toHaveTextContent(
      "Histórico CRM encontrado: Reengajar com histórico. Revisão humana obrigatória.",
    );
    expect(document.body).not.toHaveTextContent(
      "REENGAJAR_COM_HISTORICO",
    );
  });

  it("uses safe fallbacks and never exposes an unknown action", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({
        data: {
          ...syntheticCompany,
          import_batch_id: null,
          source_row: null,
          companyName: null,
          city: null,
          uf: null,
          sector: null,
          decidedAction: "ACAO_INTERNA_NAO_MAPEADA",
          decisionReason: null,
        },
      }),
    );

    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Empresa sem nome disponível",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Não mapeado")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Não disponível");
    expect(document.body).not.toHaveTextContent(
      "ACAO_INTERNA_NAO_MAPEADA",
    );
  });

  it("distinguishes an absent decision from an unavailable consultation", async () => {
    fetchMock.mockResolvedValueOnce(
      respondWithJson(
        {
          error: {
            code: "LEAD_NOT_FOUND",
            message: "Empresa não encontrada.",
          },
        },
        404,
      ),
    );

    const firstRender = render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Decisão do CRM não encontrada",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /pode ter deixado de fazer parte desta visão/i,
    );
    firstRender.unmount();

    fetchMock.mockResolvedValueOnce(
      respondWithJson(
        {
          error: {
            code: "DATA_SOURCE_UNAVAILABLE",
            message:
              "SELECT private FROM database.internal with synthetic-password",
          },
        },
        503,
      ),
    );
    render(authorizedPage());

    expect(
      await screen.findByRole("heading", {
        name: "Não foi possível carregar esta decisão agora.",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("database.internal");
    expect(document.body).not.toHaveTextContent("synthetic-password");
  });

  it("fails safely for network errors and invalid success envelopes", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("socket database.internal ECONNRESET"),
    );
    const firstRender = render(authorizedPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar esta decisão agora.",
    );
    expect(document.body).not.toHaveTextContent("database.internal");
    firstRender.unmount();

    fetchMock.mockResolvedValueOnce(
      respondWithJson({ data: { cnpj: "11222333000181" } }),
    );
    render(authorizedPage());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar esta decisão agora.",
    );
  });

  it("aborts the active request on unmount", () => {
    const { unmount } = render(authorizedPage());
    const signal = (
      fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    )?.signal;

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
