import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  UNAVAILABLE_LABEL,
} from "../../../../lib/formatters";
import type { BatchSummary } from "../../../../types/imports";

const { navigationState } = vi.hoisted(() => ({
  navigationState: { query: "" },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationState.query),
}));

import BatchListPage from "./page";

const fetchMock =
  vi.fn<(input: string, init: RequestInit) => Promise<Response>>();

const submissionId = "00000000-0000-4000-8000-000000000026";
const importBatchId = "empresaqui_2026-07-08T12:00:00.000Z";

function apiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function batchSummary(
  overrides: Partial<BatchSummary> = {},
): BatchSummary {
  return {
    submissionId: overrides.submissionId ?? submissionId,
    import_batch_id:
      overrides.import_batch_id === undefined
        ? importBatchId
        : overrides.import_batch_id,
    status: overrides.status ?? "SUBMITTED",
    submittedAt:
      overrides.submittedAt ?? "2026-07-08T12:00:00.000Z",
    acceptedAt:
      overrides.acceptedAt === undefined ? null : overrides.acceptedAt,
    lastObservedAt:
      overrides.lastObservedAt === undefined
        ? null
        : overrides.lastObservedAt,
    rowCountAccepted:
      overrides.rowCountAccepted === undefined
        ? null
        : overrides.rowCountAccepted,
    terminalCount:
      overrides.terminalCount === undefined ? null : overrides.terminalCount,
    blockedCount:
      overrides.blockedCount === undefined ? null : overrides.blockedCount,
    failedCount:
      overrides.failedCount === undefined ? null : overrides.failedCount,
    leadCount: overrides.leadCount === undefined ? null : overrides.leadCount,
    statusBasis: overrides.statusBasis ?? "SUBMISSION_RECORDED",
    observationStatus: overrides.observationStatus ?? "AVAILABLE",
    observationBasis:
      overrides.observationBasis === undefined
        ? null
        : overrides.observationBasis,
  };
}

function batchListEnvelope(
  data: readonly BatchSummary[] = [batchSummary()],
  meta: Partial<{
    readonly page: number;
    readonly pageSize: number;
    readonly total: number | null;
  }> = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      pageSize: meta.pageSize ?? 20,
      total: meta.total === undefined ? data.length : meta.total,
    },
  };
}

function pageSource(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/app/(private)/imports/batches/page.tsx",
    ),
    "utf8",
  );
}

function firstFetchCall(): readonly [string, RequestInit] {
  const call = fetchMock.mock.calls[0];

  if (call === undefined) {
    throw new Error("Expected fetch to be called.");
  }

  return call as unknown as readonly [string, RequestInit];
}

describe("batch list page", () => {
  beforeEach(() => {
    navigationState.query = "";
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows a loading state while the current list request is pending", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    render(<BatchListPage />);

    expect(
      screen.getByRole("status", { name: "Carregando importações" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("calls only GET /api/imports with no-store same-origin options", async () => {
    render(<BatchListPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [endpoint, init] = firstFetchCall();

    expect(endpoint).toBe("/api/imports?page=1&pageSize=20");
    expect(endpoint).not.toContain("/api/imports/");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(
      /webhook|192\.168\.0\.20|n8n/i,
    );
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
  });

  it("uses only supported pagination query parameters and ignores unsupported filter text", async () => {
    navigationState.query = "page=2&pageSize=5&status=COMPLETED";
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([batchSummary()], {
          page: 2,
          pageSize: 5,
          total: 11,
        }),
      ),
    );

    render(<BatchListPage />);

    expect(
      await screen.findByRole("table", {
        name: "Importações registradas",
      }),
    ).toBeInTheDocument();
    expect(firstFetchCall()[0]).toBe("/api/imports?page=2&pageSize=5");
    expect(firstFetchCall()[0]).not.toContain("status=");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders returned batch facts with Brazilian dates and safe business labels", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope(
          [
            batchSummary({
              status: "PROCESSING",
              statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
              acceptedAt: "2026-07-08T13:00:00.000Z",
              lastObservedAt: "2026-07-08T14:00:00.000Z",
              rowCountAccepted: 2,
              terminalCount: 1,
              blockedCount: 0,
              failedCount: 0,
              leadCount: 1,
            }),
          ],
          { total: 1 },
        ),
      ),
    );

    render(<BatchListPage />);

    const table = await screen.findByRole("table", {
      name: "Importações registradas",
    });
    const row = screen.getByText(importBatchId).closest("tr");

    expect(table).toBeInTheDocument();
    expect(row).not.toBeNull();
    expect(row!).toHaveTextContent("Em acompanhamento");
    expect(row!).toHaveTextContent("Base: observação aprovada");
    expect(row!).toHaveTextContent("Linhas aceitas: 2");
    expect(row!).toHaveTextContent("Leads: 1");
    expect(row!).toHaveTextContent("Bloqueadas: 0");
    expect(row!).toHaveTextContent("Falhas: 0");
    expect(screen.getAllByText("08/07/2026")).toHaveLength(3);
    expect(document.body).not.toHaveTextContent(submissionId);
  });

  it("shows an empty state when no import batch is available", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(batchListEnvelope([], { total: 0 })),
    );

    render(<BatchListPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Nenhuma importação registrada",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a distinct unavailable state for unavailable list data without leaking details", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "DATA_SOURCE_UNAVAILABLE",
            message: "SELECT secret FROM producer_table",
          },
        },
        503,
      ),
    );

    render(<BatchListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "As importações não puderam ser consultadas agora.",
    );
    expect(document.body).not.toHaveTextContent("SELECT secret");
    expect(document.body).not.toHaveTextContent("producer_table");
  });

  it("shows a safe generic error for failed requests without exposing response internals", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "UNEXPECTED_ERROR",
            message:
              "stack trace sql secret http://192.168.0.20:30098/webhook/empresaqui/import",
          },
        },
        500,
      ),
    );

    render(<BatchListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as importações agora.",
    );
    for (const fragment of [
      "stack trace",
      "sql secret",
      "192.168.0.20",
      "webhook",
      "empresaqui/import",
    ]) {
      expect(document.body).not.toHaveTextContent(fragment);
    }
  });

  it("fails safely when the success envelope is not recognized", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        data: [
          {
            submissionId,
            status: "COMPLETED",
            completion: "raw producer payload",
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1 },
      }),
    );

    render(<BatchListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as importações agora.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("raw producer payload");
  });

  it("renders nullable batch metrics as unavailable and never as zero", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope(
          [
            batchSummary({
              import_batch_id: null,
              rowCountAccepted: null,
              terminalCount: null,
              blockedCount: null,
              failedCount: null,
              leadCount: null,
            }),
          ],
          { total: null },
        ),
      ),
    );

    render(<BatchListPage />);

    const row = await screen.findByText("Envio registrado");
    const tableRow = row.closest("tr");

    expect(tableRow).not.toBeNull();
    expect(tableRow!).toHaveTextContent(
      `Linhas aceitas: ${UNAVAILABLE_LABEL}`,
    );
    expect(tableRow!).toHaveTextContent(`Terminais: ${UNAVAILABLE_LABEL}`);
    expect(tableRow!).toHaveTextContent(`Leads: ${UNAVAILABLE_LABEL}`);
    expect(tableRow!).toHaveTextContent(`Bloqueadas: ${UNAVAILABLE_LABEL}`);
    expect(tableRow!).toHaveTextContent(`Falhas: ${UNAVAILABLE_LABEL}`);
    expect(tableRow!).not.toHaveTextContent("Linhas aceitas: 0");
    expect(document.body).toHaveTextContent("Total indisponível");
    expect(document.body).not.toHaveTextContent("0 importações");
  });

  it("preserves confirmed zero counts when the API returns explicit zero", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([
          batchSummary({
            rowCountAccepted: 0,
            terminalCount: 0,
            blockedCount: 0,
            failedCount: 0,
            leadCount: 0,
          }),
        ]),
      ),
    );

    render(<BatchListPage />);

    const row = await screen.findByText(importBatchId);
    const tableRow = row.closest("tr");

    expect(tableRow).not.toBeNull();
    expect(tableRow!).toHaveTextContent("Linhas aceitas: 0");
    expect(tableRow!).toHaveTextContent("Terminais: 0");
    expect(tableRow!).toHaveTextContent("Leads: 0");
    expect(tableRow!).toHaveTextContent("Bloqueadas: 0");
    expect(tableRow!).toHaveTextContent("Falhas: 0");
  });

  it("renders known-total pagination with previous and next links", async () => {
    navigationState.query = "page=2&pageSize=10";
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([batchSummary()], {
          page: 2,
          pageSize: 10,
          total: 25,
        }),
      ),
    );

    render(<BatchListPage />);

    const pagination = await screen.findByRole("navigation", {
      name: "Paginação das importações",
    });

    expect(within(pagination).getByText("Página 2 de 3")).toBeInTheDocument();
    expect(screen.getByText("25 importações")).toBeInTheDocument();
    expect(
      within(pagination).getByRole("link", { name: "Página anterior" }),
    ).toHaveAttribute("href", "/imports/batches?page=1&pageSize=10");
    expect(
      within(pagination).getByRole("link", { name: "Próxima página" }),
    ).toHaveAttribute("href", "/imports/batches?page=3&pageSize=10");
  });

  it("renders nullable-total pagination without inventing a final page", async () => {
    navigationState.query = "page=3&pageSize=1";
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope(
          [batchSummary()],
          { page: 3, pageSize: 1, total: null },
        ),
      ),
    );

    render(<BatchListPage />);

    const pagination = await screen.findByRole("navigation", {
      name: "Paginação das importações",
    });

    expect(within(pagination).getByText("Página 3")).toBeInTheDocument();
    expect(within(pagination).queryByText(/Página 3 de/)).not.toBeInTheDocument();
    expect(screen.getByText("Total indisponível")).toBeInTheDocument();
    expect(
      within(pagination).getByRole("link", { name: "Próxima página" }),
    ).toHaveAttribute("href", "/imports/batches?page=4&pageSize=1");
  });

  it("shows row-level unavailable observation facts separately from batch status", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([
          batchSummary({
            observationStatus: "UNAVAILABLE",
            observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
          }),
        ]),
      ),
    );

    render(<BatchListPage />);

    expect(
      await screen.findByText("Observações indisponíveis"),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Base: fonte indisponível");
    expect(document.body).toHaveTextContent("Envio registrado");
  });

  it("keeps the batch list source free of detail calls, external endpoints, and future actions", () => {
    const source = pageSource();

    expect(source).toContain("fetch(`/api/imports?${query}`");
    expect(source).not.toMatch(
      /\/api\/imports\/|N8N_IMPORT_URL|webhook|192\.168\.0\.20|n8n|HMAC|signature|canonical|timestamp|nonce|replay|retry|reprocess|crm/i,
    );
    expect(source).not.toMatch(
      /getImportBatchDetail|useParams|PATCH|POST|PUT|DELETE|Idempotency-Key|fileSha256|idempotency/i,
    );
  });
});
