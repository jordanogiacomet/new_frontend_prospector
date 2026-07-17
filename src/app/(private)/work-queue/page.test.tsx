import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommercialWorkQueueItem } from "../../../types/commercial";

const { navigationState, pushMock, replaceMock } = vi.hoisted(() => ({
  navigationState: { query: "" },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/work-queue",
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

import CommercialWorkQueuePage from "./page";

const fetchMock =
  vi.fn<(input: string, init: RequestInit) => Promise<Response>>();

const cnpj = "12345678000195";
const responsibleSubject = "oidc|synthetic-responsible";
const leadRunId = `lr_${"a".repeat(64)}`;

function apiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queueItem(
  overrides: Partial<CommercialWorkQueueItem> = {},
): CommercialWorkQueueItem {
  return {
    producerLead: overrides.producerLead ?? {
      decision_id: "decision-synthetic-work-queue",
      import_batch_id: "batch-synthetic-work-queue",
      lead_run_id: leadRunId,
      source_row: 40,
      source_hash: "hash-synthetic-work-queue",
      agent_version: "agent-synthetic-work-queue-v1",
      cnpj,
      companyName: "Empresa Horizonte Sintética",
      city: "Recife",
      uf: "PE",
      sector: "Serviços sintéticos",
      score: 82,
      priority: "B",
      recommendedAction: "PROSPECTAR",
      trustStatus: "Revisão Humana",
      confidenceIndicator: "normal",
      lastAnalysisAt: "2026-07-10T12:00:00.000Z",
    },
    workspace:
      overrides.workspace === undefined
        ? {
            workspace_id: "00000000-0000-4000-8000-000000000040",
            organization_id: "org-synthetic-work-queue",
            cnpj_normalizado: cnpj,
            observed_lead_run_id: leadRunId,
            responsible_subject: responsibleSubject,
            commercial_stage: "CONTACTED",
            next_action: "Ligar para o financeiro",
            next_action_due_at: "2026-07-11T12:00:00.000Z",
            commercial_outcome: null,
            version: 2,
            created_by_subject: "oidc|synthetic-creator",
            updated_by_subject: "oidc|synthetic-updater",
            created_at: "2026-07-10T12:01:00.000Z",
            updated_at: "2026-07-10T12:02:00.000Z",
            archived_at: null,
            archived_by_subject: null,
          }
        : overrides.workspace,
    sources: overrides.sources ?? {
      producer: { factSource: "producer_current_leads_v1" },
      workspace: {
        factSource: "app_lead_workspaces_v1",
        state: "matched",
      },
    },
  };
}

function queueEnvelope(
  data: readonly CommercialWorkQueueItem[] = [queueItem()],
  meta: Partial<{
    readonly page: number;
    readonly pageSize: number;
    readonly total: number | null;
    readonly producerAvailability: "AVAILABLE" | "UNAVAILABLE" | "NOT_QUERIED";
  }> = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? 20,
      total: meta.total === undefined ? data.length : meta.total,
      provenance: {
        producer: {
          factSource: "producer_current_leads_v1",
          availability: meta.producerAvailability ?? "AVAILABLE",
        },
        workspace: {
          factSource: "app_lead_workspaces_v1",
          availability: "AVAILABLE",
        },
      },
    },
  };
}

function pageSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/(private)/work-queue/page.tsx"),
    "utf8",
  );
}

function firstFetchCall(): readonly [string, RequestInit] {
  const call = fetchMock.mock.calls[0];

  if (call === undefined) {
    throw new Error("Expected a queue request.");
  }

  return call as unknown as readonly [string, RequestInit];
}

describe("commercial work queue page", () => {
  beforeEach(() => {
    navigationState.query = "";
    pushMock.mockReset();
    replaceMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(queueEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders the commercial queue as a private business page", async () => {
    render(<CommercialWorkQueuePage />);

    expect(
      screen.getByRole("heading", { name: "Fila comercial" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("table", { name: "Fila comercial" }),
    ).toBeInTheDocument();
  });

  it("calls only the internal queue GET endpoint with safe request options", async () => {
    render(<CommercialWorkQueuePage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [endpoint, init] = firstFetchCall();

    expect(endpoint).toBe(
      "/api/work-queue?page=1&pageSize=20&sort=last_analysis_desc",
    );
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
    expect(init.body).toBeUndefined();
  });

  it("keeps only valid queue filters, pagination, and the approved ordering in the API query", async () => {
    navigationState.query =
      "page=3&pageSize=50&cnpj_normalizado=12345678000195&uf=PE&priority=B&commercial_stage=CONTACTED&responsible_subject=oidc%7Csynthetic-responsible&sort=last_analysis_desc&ignored=value&uf=SP";

    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    expect(firstFetchCall()[0]).toBe(
      "/api/work-queue?page=3&pageSize=50&cnpj_normalizado=12345678000195&uf=PE&priority=B&commercial_stage=CONTACTED&responsible_subject=oidc%7Csynthetic-responsible&sort=last_analysis_desc",
    );
  });

  it("updates a producer-priority filter with a canonical, first-page URL", async () => {
    navigationState.query = "page=4&pageSize=50&uf=PE";
    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    fireEvent.change(screen.getByLabelText("Prioridade do produtor"), {
      target: { value: "B" },
    });

    expect(replaceMock).toHaveBeenCalledExactlyOnceWith(
      "/work-queue?page=1&pageSize=50&uf=PE&priority=B&sort=last_analysis_desc",
    );
  });

  it("applies the normalized CNPJ and clears all active filters without retaining unknown parameters", async () => {
    navigationState.query =
      "page=2&pageSize=10&uf=PE&unknown=value&sort=score_desc";
    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    fireEvent.change(screen.getByLabelText("CNPJ"), {
      target: { value: "12.345.678/0001-95" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(replaceMock).toHaveBeenLastCalledWith(
      "/work-queue?page=1&pageSize=10&cnpj_normalizado=12345678000195&uf=PE&sort=last_analysis_desc",
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/work-queue?page=1&pageSize=10&sort=last_analysis_desc",
    );
  });

  it("renders known-total pagination while preserving supported queue filters", async () => {
    navigationState.query = "page=2&pageSize=10&uf=PE&priority=B";
    fetchMock.mockResolvedValue(
      apiResponse(queueEnvelope([queueItem()], { page: 2, pageSize: 10, total: 25 })),
    );

    render(<CommercialWorkQueuePage />);

    const pagination = await screen.findByRole("navigation", {
      name: "Paginação da fila comercial",
    });
    expect(within(pagination).getByText("Página 2 de 3")).toBeInTheDocument();
    expect(
      within(pagination).getByRole("link", { name: "Página anterior" }),
    ).toHaveAttribute(
      "href",
      "/work-queue?page=1&pageSize=10&uf=PE&priority=B&sort=last_analysis_desc",
    );
    expect(
      within(pagination).getByRole("link", { name: "Próxima página" }),
    ).toHaveAttribute(
      "href",
      "/work-queue?page=3&pageSize=10&uf=PE&priority=B&sort=last_analysis_desc",
    );
    expect(screen.getByText("25 empresas")).toBeInTheDocument();
  });

  it("renders the desktop table with producer and commercial columns", async () => {
    render(<CommercialWorkQueuePage />);

    const table = await screen.findByRole("table", { name: "Fila comercial" });
    for (const column of [
      "Empresa",
      "CNPJ",
      "Recomendação do produtor",
      "Estado comercial",
      "Próxima ação",
      "Última análise",
    ]) {
      expect(within(table).getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
  });

  it("renders responsive business cards alongside the desktop table", async () => {
    render(<CommercialWorkQueuePage />);

    const cards = await screen.findByRole("region", {
      name: "Cartões da fila comercial",
    });
    expect(within(cards).getByText("Empresa Horizonte Sintética")).toBeInTheDocument();
    expect(
      within(cards).getByText("Acompanhamento comercial"),
    ).toBeInTheDocument();
  });

  it("links each existing commercial workspace from the queue", async () => {
    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    const links = screen.getAllByRole("link", {
      name: "Abrir acompanhamento comercial de Empresa Horizonte Sintética",
    });

    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "/workspaces/00000000-0000-4000-8000-000000000040",
      );
    }
  });

  it("starts a commercial workspace from an unmapped queue item", async () => {
    fetchMock.mockResolvedValue(apiResponse(queueEnvelope([queueItem({ workspace: null })])));
    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    expect(
      screen.queryByRole("link", { name: /Abrir acompanhamento comercial/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: "Iniciar acompanhamento comercial de Empresa Horizonte Sintética",
      }),
    ).toHaveLength(2);
  });

  it("creates a workspace with only the selected producer references and opens it", async () => {
    const createdWorkspace = queueItem().workspace;

    if (createdWorkspace === null) {
      throw new Error("Expected a synthetic workspace.");
    }

    fetchMock.mockImplementation((input) => {
      if (input.startsWith("/api/work-queue?")) {
        return Promise.resolve(apiResponse(queueEnvelope([queueItem({ workspace: null })])));
      }

      if (input === "/api/workspaces") {
        return Promise.resolve(apiResponse({ data: createdWorkspace }, 201));
      }

      return Promise.reject(new Error(`Unexpected endpoint: ${input}`));
    });
    render(<CommercialWorkQueuePage />);

    const [button] = await screen.findAllByRole("button", {
      name: "Iniciar acompanhamento comercial de Empresa Horizonte Sintética",
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledExactlyOnceWith(
        "/workspaces/00000000-0000-4000-8000-000000000040",
      );
    });

    const creationCall = fetchMock.mock.calls.find(
      ([input]) => input === "/api/workspaces",
    );
    expect(creationCall).toBeDefined();

    const [, init] = creationCall as unknown as readonly [string, RequestInit];
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      cnpj_normalizado: cnpj,
      observed_lead_run_id: leadRunId,
    });
  });

  it("shows a safe permission state when workspace creation is denied", async () => {
    fetchMock.mockImplementation((input) => {
      if (input.startsWith("/api/work-queue?")) {
        return Promise.resolve(apiResponse(queueEnvelope([queueItem({ workspace: null })])));
      }

      if (input === "/api/workspaces") {
        return Promise.resolve(apiResponse({ error: { message: "private" } }, 403));
      }

      return Promise.reject(new Error(`Unexpected endpoint: ${input}`));
    });
    render(<CommercialWorkQueuePage />);

    const [button] = await screen.findAllByRole("button", {
      name: "Iniciar acompanhamento comercial de Empresa Horizonte Sintética",
    });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você não tem permissão para iniciar este acompanhamento.",
    );
    expect(document.body).not.toHaveTextContent("private");
  });

  it("formats CNPJ and both queue dates for Brazil", async () => {
    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    expect(screen.getByText("12.345.678/0001-95")).toBeInTheDocument();
    expect(screen.getAllByText("10/07/2026").length).toBeGreaterThan(0);
    expect(document.body).toHaveTextContent("Prazo: 11/07/2026");
  });

  it("keeps producer recommendation textually separate from the commercial workspace", async () => {
    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    expect(document.body).toHaveTextContent(
      "O acompanhamento comercial não altera a recomendação do produtor.",
    );
    expect(document.body).toHaveTextContent("Recomendação do produtor");
    expect(document.body).toHaveTextContent("Acompanhamento comercial");
    expect(document.body).toHaveTextContent("Contatado");
    expect(document.body).toHaveTextContent("Ligar para o financeiro");
  });

  it("renders badges for producer priority, trust, action, and commercial stage", async () => {
    render(<CommercialWorkQueuePage />);

    await screen.findByRole("table", { name: "Fila comercial" });
    expect(screen.getAllByText("Prioridade B").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Revisão humana").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Prospectar").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Estágio: Contatado").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a loading state while the current queue request is pending", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    render(<CommercialWorkQueuePage />);

    expect(
      screen.getByRole("status", { name: "Carregando fila comercial" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a confirmed empty state only when the API total is zero", async () => {
    fetchMock.mockResolvedValue(apiResponse(queueEnvelope([], { total: 0 })));
    render(<CommercialWorkQueuePage />);

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma empresa na fila comercial",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows producer unavailability without inventing a zero total or a final page", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        queueEnvelope([], { total: null, producerAvailability: "UNAVAILABLE" }),
      ),
    );
    render(<CommercialWorkQueuePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A fila comercial não pôde ser consultada agora.",
    );
    expect(document.body).toHaveTextContent("Total não disponível");
    expect(document.body).not.toHaveTextContent("0 empresas");
    expect(screen.queryByText(/Página 1 de/)).not.toBeInTheDocument();
  });

  it("shows a fixed safe error without exposing internal response details", async () => {
    const internalDetails = [
      "SELECT secret FROM producer_table",
      "postgresql://secret@internal.example.test/prospecta",
      "raw producer payload",
    ];
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "UNEXPECTED_ERROR",
            message: internalDetails.join(" "),
          },
        },
        500,
      ),
    );

    render(<CommercialWorkQueuePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a fila comercial agora.",
    );
    for (const detail of internalDetails) {
      expect(document.body).not.toHaveTextContent(detail);
    }
  });

  it.each([
    [401, "Entre para acessar a fila comercial."],
    [403, "Você não tem acesso a esta fila comercial."],
  ])("shows a safe access state for HTTP %i", async (status, message) => {
    fetchMock.mockResolvedValue(apiResponse({ error: { message: "private" } }, status));
    render(<CommercialWorkQueuePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(document.body).not.toHaveTextContent("private");
  });

  it("fails safely for an unrecognized successful envelope", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        data: [{ rawReport: "never render this" }],
        meta: { page: 1, pageSize: 20, total: 1 },
      }),
    );
    render(<CommercialWorkQueuePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a fila comercial agora.",
    );
    expect(document.body).not.toHaveTextContent("never render this");
  });

  it("contains no database, SQL, external ingress, or mutation implementation", () => {
    const source = pageSource();

    expect(source).toContain("fetch(`/api/work-queue?${query}`");
    expect(source).not.toMatch(
      /n8n|webhook|PRODUCER_DATABASE_URL|APP_DATABASE_URL|server\/db|\bSELECT\s+(?:\*|FROM)\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+/i,
    );
    expect(source).toContain('fetch("/api/workspaces", {');
    expect(source).not.toMatch(/\/api\/imports/);
  });
});
