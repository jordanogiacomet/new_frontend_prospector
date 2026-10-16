import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadHistoryItem } from "../../types/leads";
import { PrivateCapabilitiesProvider } from "../auth/private-capabilities";

import { LeadHistory } from "./lead-history";

function authorizedHistory(cnpj: string) {
  return <PrivateCapabilitiesProvider permissions={["leads:read"]}><LeadHistory cnpj={cnpj} /></PrivateCapabilitiesProvider>;
}

const syntheticCnpj = "11.222.333/0001-81";
const currentRunId = `lr_${"a".repeat(64)}`;
const supersededRunId = `lr_${"b".repeat(64)}`;

const currentItem: LeadHistoryItem = {
  decision_id: "decision-synthetic-history-current",
  import_batch_id: "batch-synthetic-history-shared",
  lead_run_id: currentRunId,
  source_row: 35,
  analyzedAt: "2026-07-03T12:00:00.000Z",
  recommendedAction: "PROSPECTAR",
  recommendedActionReason: "Decisão atual armazenada.",
  isCurrent: true,
};

const supersededItem: LeadHistoryItem = {
  decision_id: "decision-synthetic-history-superseded",
  import_batch_id: "batch-synthetic-history-shared",
  lead_run_id: supersededRunId,
  source_row: 35,
  analyzedAt: "2026-06-01T12:00:00.000Z",
  recommendedAction: "NUTRIR",
  recommendedActionReason: "Decisão anterior armazenada.",
  isCurrent: false,
};

const retainedMetadata = {
  page: 1,
  pageSize: 20,
  total: 2,
  completeness: "retained_only",
  label: "Análises retidas encontradas",
  caveat: "Análises mais antigas podem não estar presentes.",
} as const;

const fetchMock = vi.fn();

function respondWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulHistory(
  data: LeadHistoryItem[] = [currentItem, supersededItem],
  meta: Record<string, unknown> = retainedMetadata,
): Response {
  return respondWithJson({ data, meta });
}

describe("lead retained history", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("denies missing read permission before any request", () => {
    render(<LeadHistory cnpj={syntheticCnpj} />);
    expect(screen.getByRole("heading", { name: "Acesso não autorizado" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("clears retained history and stops polling after HTTP %i", async (status) => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      fetchMock
        .mockResolvedValueOnce(successfulHistory())
        .mockResolvedValueOnce(respondWithJson({ error: { message: "private detail" } }, status));
      render(authorizedHistory(syntheticCnpj));
      await screen.findByText(currentItem.decision_id);
      const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
      if (typeof refresh !== "function") throw new Error("Expected the history refresh callback.");
      await act(async () => refresh());
      expect(await screen.findByRole("heading", { name: status === 401 ? "Sua sessão expirou" : "Acesso não autorizado" })).toBeInTheDocument();
      expect(screen.queryByText(currentItem.decision_id)).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Entrar novamente" }) !== null).toBe(status === 401);
      await act(async () => refresh());
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(document.body).not.toHaveTextContent("private detail");
    } finally {
      intervalSpy.mockRestore();
      visibilitySpy.mockRestore();
    }
  });

  it("shows an accessible loading state while the history request is pending", () => {
    render(authorizedHistory(syntheticCnpj));

    expect(
      screen.getByRole("status", {
        name: "Carregando histórico de análises",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Histórico de decisões" }),
    ).toBeInTheDocument();
  });

  it("uses the encoded CNPJ and exact authenticated GET fetch contract", async () => {
    fetchMock.mockResolvedValue(successfulHistory());

    render(authorizedHistory(syntheticCnpj));

    await screen.findByText("decision-synthetic-history-current");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/leads/11.222.333%2F0001-81/history",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("refreshes visible history every five seconds without overlapping requests and cleans up on unmount", async () => {
    const visibilityStateSpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    fetchMock.mockResolvedValueOnce(successfulHistory([currentItem], {
      ...retainedMetadata,
      total: 1,
    }));

    const { unmount } = render(authorizedHistory(syntheticCnpj));

    await screen.findByText("decision-synthetic-history-current");
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
      throw new Error("Expected the lead history refresh callback.");
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
        successfulHistory([currentItem, supersededItem]),
      );
    });

    expect(
      await screen.findByText(
        "decision-synthetic-history-superseded",
      ),
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

  it("preserves the reverse-chronological API order without client-side sorting", async () => {
    fetchMock.mockResolvedValue(
      successfulHistory([supersededItem, currentItem]),
    );

    render(authorizedHistory(syntheticCnpj));

    const items = await screen.findAllByTestId("lead-history-item");
    expect(
      items.map(
        (item) =>
          within(item).getByTestId("history-decision-id").textContent,
      ),
    ).toEqual([
      "decision-synthetic-history-superseded",
      "decision-synthetic-history-current",
    ]);
  });

  it("keeps technical references in a closed disclosure while showing the recommendation", async () => {
    fetchMock.mockResolvedValue(successfulHistory([currentItem]));

    render(authorizedHistory(syntheticCnpj));

    const item = await screen.findByTestId("lead-history-item");
    const disclosure = item.querySelector("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    expect(disclosure?.querySelector("summary")).toHaveTextContent("Identificação da análise");
    expect(disclosure).toContainElement(within(item).getByTestId("history-decision-id"));
    expect(disclosure).not.toHaveTextContent(currentItem.recommendedActionReason!);
    expect(item).toHaveTextContent(currentItem.recommendedActionReason!);
    expect(within(item).getByRole("link", { name: "Abrir esta análise" })).toBeInTheDocument();
  });

  it("keeps distinct decisions and links each item with its exact leadRunId", async () => {
    const sharedRunId = `lr_${"c".repeat(64)}`;
    fetchMock.mockResolvedValue(
      successfulHistory([
        { ...currentItem, lead_run_id: sharedRunId },
        { ...supersededItem, lead_run_id: sharedRunId },
      ]),
    );

    render(authorizedHistory("11222333000181"));

    const links = await screen.findAllByRole("link", {
      name: "Abrir esta análise",
    });
    expect(screen.getAllByTestId("lead-history-item")).toHaveLength(2);
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        `/leads/11222333000181?leadRunId=${sharedRunId}`,
      );
    }
  });

  it("distinguishes the current analysis from a superseded analysis", async () => {
    fetchMock.mockResolvedValue(successfulHistory());

    render(authorizedHistory(syntheticCnpj));

    expect(await screen.findByText("Análise atual")).toBeInTheDocument();
    expect(screen.getByText("Análise substituída")).toBeInTheDocument();
  });

  it("presents an approved technical reason term in business language", async () => {
    fetchMock.mockResolvedValue(
      successfulHistory(
        [
          {
            ...currentItem,
            recommendedActionReason:
              "Histórico CRM encontrado: REENGAJAR_COM_HISTORICO. Revisão humana obrigatória.",
          },
        ],
        { ...retainedMetadata, total: 1 },
      ),
    );

    render(authorizedHistory(syntheticCnpj));

    const item = await screen.findByTestId("lead-history-item");
    expect(item).toHaveTextContent(
      "Histórico CRM encontrado: Reengajar com histórico. Revisão humana obrigatória.",
    );
    expect(item).not.toHaveTextContent("REENGAJAR_COM_HISTORICO");
  });

  it("preserves the exact retained-only label and caveat", async () => {
    fetchMock.mockResolvedValue(successfulHistory());

    render(authorizedHistory(syntheticCnpj));

    expect(
      await screen.findByText("Análises retidas encontradas"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Análises mais antigas podem não estar presentes.",
      ),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Histórico completo");
    expect(document.body).not.toHaveTextContent("Todas as análises");
  });

  it("renders every nullable history value as unavailable rather than zero", async () => {
    fetchMock.mockResolvedValue(
      successfulHistory(
        [
          {
            ...currentItem,
            import_batch_id: null,
            source_row: null,
            analyzedAt: null,
            recommendedActionReason: null,
          },
        ],
        { ...retainedMetadata, total: 1 },
      ),
    );

    render(authorizedHistory(syntheticCnpj));

    const item = await screen.findByTestId("lead-history-item");
    expect(within(item).getAllByText("Não disponível")).toHaveLength(4);
    expect(item).not.toHaveTextContent(/^0$/);
  });

  it("shows an honest empty retained-history state without claiming no analysis ever existed", async () => {
    fetchMock.mockResolvedValue(
      successfulHistory([], { ...retainedMetadata, total: 0 }),
    );

    render(authorizedHistory(syntheticCnpj));

    const emptyState = await screen.findByRole("status", {
      name: "Nenhuma análise retida disponível",
    });
    expect(emptyState).toHaveTextContent(
      "Nenhuma análise retida está disponível para exibição.",
    );
    expect(emptyState).not.toHaveTextContent(
      /nunca houve|nenhuma análise foi produzida/i,
    );
    expect(
      screen.getByText(
        "Análises mais antigas podem não estar presentes.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a fixed safe unavailable state for HISTORY_UNAVAILABLE/503", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        {
          error: {
            code: "HISTORY_UNAVAILABLE",
            message: "private retention and SQL canary",
          },
        },
        503,
      ),
    );

    render(authorizedHistory(syntheticCnpj));

    const unavailable = await screen.findByRole("status", {
      name: "Histórico indisponível",
    });
    expect(unavailable).toHaveTextContent(
      "O histórico não está disponível no momento.",
    );
    expect(document.body).not.toHaveTextContent(
      "private retention and SQL canary",
    );
  });

  it("shows a fixed safe error without leaking an unexpected API payload", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson(
        {
          error: {
            code: "UNEXPECTED_ERROR",
            message: "postgresql://synthetic-secret@private.invalid",
            details: ["stack trace canary"],
          },
        },
        500,
      ),
    );

    render(authorizedHistory(syntheticCnpj));

    const alert = await screen.findByRole("alert", {
      name: "Erro ao carregar histórico",
    });
    expect(alert).toHaveTextContent(
      "Não foi possível carregar o histórico agora.",
    );
    expect(document.body).not.toHaveTextContent("synthetic-secret");
    expect(document.body).not.toHaveTextContent("stack trace canary");
  });

  it.each([
    {
      name: "invalid envelope",
      response: { data: { rawPayload: "PRIVATE_RAW_CANARY" } },
    },
    {
      name: "invalid metadata",
      response: {
        data: [currentItem],
        meta: {
          ...retainedMetadata,
          completeness: "proven_complete",
          label: "Histórico completo",
        },
      },
    },
  ])("fails safely for $name", async ({ response }) => {
    fetchMock.mockResolvedValue(respondWithJson(response));

    render(authorizedHistory(syntheticCnpj));

    const alert = await screen.findByRole("alert", {
      name: "Resposta de histórico inválida",
    });
    expect(alert).toHaveTextContent(
      "O histórico recebido não pôde ser apresentado com segurança.",
    );
    expect(document.body).not.toHaveTextContent("PRIVATE_RAW_CANARY");
    expect(document.body).not.toHaveTextContent("Histórico completo");
  });

  it("does not render event/retry extras or include prohibited integrations and actions", async () => {
    fetchMock.mockResolvedValue(
      respondWithJson({
        data: [
          {
            ...currentItem,
            events: ["PRIVATE_EVENT_CANARY"],
            retries: ["PRIVATE_RETRY_CANARY"],
            raw_payload: "PRIVATE_PAYLOAD_CANARY",
          },
        ],
        meta: retainedMetadata,
      }),
    );

    render(authorizedHistory(syntheticCnpj));

    await screen.findByText("decision-synthetic-history-current");
    expect(document.body).not.toHaveTextContent("PRIVATE_EVENT_CANARY");
    expect(document.body).not.toHaveTextContent("PRIVATE_RETRY_CANARY");
    expect(document.body).not.toHaveTextContent("PRIVATE_PAYLOAD_CANARY");
    expect(document.body).not.toHaveTextContent(/timeline|tentativa/i);

    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/leads/lead-history.tsx",
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /from ["'](?:pg|.*server\/db|.*repositories)|\bn8n\b|\bwebhook\b|\breprocess(?:ing)?\b|\bupload\b|\/exports?\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i,
    );
    expect(source).toContain("/history");
    expect(source).toContain('method: "GET"');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });
  it("keeps confirmed history after a refresh failure and offers a manual GET recovery", async () => {
    fetchMock.mockResolvedValueOnce(successfulHistory()).mockRejectedValueOnce(new Error("private read failure")).mockResolvedValueOnce(successfulHistory());
    render(authorizedHistory(syntheticCnpj));
    await screen.findByText(currentItem.decision_id);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("última consulta confirmada");
    expect(screen.getByText(currentItem.decision_id)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar histórico" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
    expect(document.body).not.toHaveTextContent("private read failure");
  });

});
