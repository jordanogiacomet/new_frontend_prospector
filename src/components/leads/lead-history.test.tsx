import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadHistoryItem } from "../../types/leads";

import { LeadHistory } from "./lead-history";

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

  it("shows an accessible loading state while the history request is pending", () => {
    render(<LeadHistory cnpj={syntheticCnpj} />);

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

    render(<LeadHistory cnpj={syntheticCnpj} />);

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

  it("preserves the reverse-chronological API order without client-side sorting", async () => {
    fetchMock.mockResolvedValue(
      successfulHistory([supersededItem, currentItem]),
    );

    render(<LeadHistory cnpj={syntheticCnpj} />);

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

  it("keeps distinct decisions and links each item with its exact leadRunId", async () => {
    const sharedRunId = `lr_${"c".repeat(64)}`;
    fetchMock.mockResolvedValue(
      successfulHistory([
        { ...currentItem, lead_run_id: sharedRunId },
        { ...supersededItem, lead_run_id: sharedRunId },
      ]),
    );

    render(<LeadHistory cnpj="11222333000181" />);

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

    render(<LeadHistory cnpj={syntheticCnpj} />);

    expect(await screen.findByText("Análise atual")).toBeInTheDocument();
    expect(screen.getByText("Análise substituída")).toBeInTheDocument();
  });

  it("preserves the exact retained-only label and caveat", async () => {
    fetchMock.mockResolvedValue(successfulHistory());

    render(<LeadHistory cnpj={syntheticCnpj} />);

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

    render(<LeadHistory cnpj={syntheticCnpj} />);

    const item = await screen.findByTestId("lead-history-item");
    expect(within(item).getAllByText("Não disponível")).toHaveLength(4);
    expect(item).not.toHaveTextContent(/^0$/);
  });

  it("shows an honest empty retained-history state without claiming no analysis ever existed", async () => {
    fetchMock.mockResolvedValue(
      successfulHistory([], { ...retainedMetadata, total: 0 }),
    );

    render(<LeadHistory cnpj={syntheticCnpj} />);

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

    render(<LeadHistory cnpj={syntheticCnpj} />);

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

    render(<LeadHistory cnpj={syntheticCnpj} />);

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

    render(<LeadHistory cnpj={syntheticCnpj} />);

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

    render(<LeadHistory cnpj={syntheticCnpj} />);

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
});
