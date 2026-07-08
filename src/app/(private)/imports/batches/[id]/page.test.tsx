import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UNAVAILABLE_LABEL } from "../../../../../lib/formatters";
import type { BatchSummary } from "../../../../../types/imports";

const { navigationState } = vi.hoisted(() => ({
  navigationState: {
    id: "00000000-0000-4000-8000-000000000027",
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigationState.id }),
}));

import BatchDetailPage from "./page";

const fetchMock =
  vi.fn<(input: string, init: RequestInit) => Promise<Response>>();

const submissionId = "00000000-0000-4000-8000-000000000027";
const importBatchId = "empresaqui_2026-07-08T15:00:00.000Z";

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
      overrides.submittedAt ?? "2026-07-08T15:00:00.000Z",
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

function detailEnvelope(data: BatchSummary = batchSummary()) {
  return { data };
}

function pageSource(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/app/(private)/imports/batches/[id]/page.tsx",
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

describe("batch detail page", () => {
  beforeEach(() => {
    navigationState.id = submissionId;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(detailEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows a loading state while the current detail request is pending", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    render(<BatchDetailPage />);

    expect(
      screen.getByRole("status", {
        name: "Carregando detalhe da importação",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Detalhe do lote" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(importBatchId)).not.toBeInTheDocument();
  });

  it("calls only GET /api/imports/:id with no-store same-origin options", async () => {
    render(<BatchDetailPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [endpoint, init] = firstFetchCall();

    expect(endpoint).toBe(`/api/imports/${submissionId}`);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(
      /webhook|192\.168\.0\.20|n8n/i,
    );
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(new Headers(init.headers).get("Accept")).toBe("application/json");
    expect(init.body).toBeUndefined();
  });

  it("renders returned batch facts, provenance, counts, and Brazilian dates", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "PROCESSING",
            statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
            acceptedAt: "2026-07-08T15:01:00.000Z",
            lastObservedAt: "2026-07-08T15:02:00.000Z",
            rowCountAccepted: 5,
            terminalCount: 3,
            blockedCount: 1,
            failedCount: 0,
            leadCount: 2,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Em acompanhamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText(importBatchId)).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Base da situaçãoobservação aprovada");
    expect(document.body).toHaveTextContent("Linhas aceitas: 5");
    expect(document.body).toHaveTextContent("Terminais: 3");
    expect(document.body).toHaveTextContent("Leads: 2");
    expect(document.body).toHaveTextContent("Bloqueadas: 1");
    expect(document.body).toHaveTextContent("Falhas: 0");
    expect(screen.getAllByText("08/07/2026").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("link", { name: /voltar/i })).toHaveAttribute(
      "href",
      "/imports/batches",
    );
    expect(document.body).not.toHaveTextContent(submissionId);
  });

  it("renders nullable metrics as unavailable and never as zero", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            import_batch_id: null,
            rowCountAccepted: null,
            terminalCount: null,
            blockedCount: null,
            failedCount: null,
            leadCount: null,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    const counts = await screen.findByRole("region", {
      name: "Contagens do lote",
    });

    expect(counts).toHaveTextContent(
      `Linhas aceitas: ${UNAVAILABLE_LABEL}`,
    );
    expect(counts).toHaveTextContent(`Terminais: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Leads: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Bloqueadas: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Falhas: ${UNAVAILABLE_LABEL}`);
    expect(counts).not.toHaveTextContent("Linhas aceitas: 0");
    expect(counts).not.toHaveTextContent("Terminais: 0");
  });

  it("preserves explicit zero metrics when the API returns confirmed zero", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            rowCountAccepted: 0,
            terminalCount: 0,
            blockedCount: 0,
            failedCount: 0,
            leadCount: 0,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    const counts = await screen.findByRole("region", {
      name: "Contagens do lote",
    });

    expect(counts).toHaveTextContent("Linhas aceitas: 0");
    expect(counts).toHaveTextContent("Terminais: 0");
    expect(counts).toHaveTextContent("Leads: 0");
    expect(counts).toHaveTextContent("Bloqueadas: 0");
    expect(counts).toHaveTextContent("Falhas: 0");
  });

  it("renders a distinct not-found state without exposing API details", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "IMPORT_SUBMISSION_NOT_FOUND",
            message: "SELECT * FROM prospecting_app.import_submissions",
          },
        },
        404,
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Importação não encontrada",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("SELECT");
    expect(document.body).not.toHaveTextContent("prospecting_app");
  });

  it("shows a page-level unavailable state for unavailable detail data", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        {
          error: {
            code: "DATA_SOURCE_UNAVAILABLE",
            message: "producer source timeout with sql details",
          },
        },
        503,
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Dados do lote indisponíveis",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Valores ausentes não serão tratados como zero.",
    );
    expect(document.body).not.toHaveTextContent("producer source timeout");
    expect(document.body).not.toHaveTextContent("sql details");
  });

  it("shows a safe generic error for failed requests without exposing internals", async () => {
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

    render(<BatchDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar este lote agora.",
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
        data: {
          submissionId,
          status: "COMPLETED",
          rawPayload: "raw producer payload",
        },
      }),
    );

    render(<BatchDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar este lote agora.",
    );
    expect(document.body).not.toHaveTextContent("raw producer payload");
    expect(screen.queryByText("COMPLETED")).not.toBeInTheDocument();
  });

  it("presents NO_UPDATE as recent-observation absence, not failure or completion", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "NO_UPDATE",
            statusBasis: "FRESHNESS_WINDOW_EXCEEDED",
            lastObservedAt: "2026-07-08T13:00:00.000Z",
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Sem atualização recente",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Não indica falha nem conclusão.",
    );
    expect(document.body).toHaveTextContent(
      "Base da situaçãojanela de atualização excedida",
    );
    expect(document.body).not.toHaveTextContent("Incompleto");
    expect(document.body).not.toHaveTextContent("Conclusão explícita");
  });

  it("presents INCOMPLETE as explicit closure with missing terminal outcomes", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "INCOMPLETE",
            statusBasis: "PRODUCER_CLOSED_ROWS_MISSING",
            rowCountAccepted: 4,
            terminalCount: 3,
            leadCount: 2,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Incompleto" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "uma ou mais linhas não têm resultado terminal aprovado",
    );
    expect(document.body).toHaveTextContent(
      "Base da situaçãofechamento com pendências",
    );
    expect(document.body).not.toHaveTextContent("Sem atualização recente");
  });

  it("presents explicit completion separately from incomplete or no-update states", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "COMPLETED",
            statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
            acceptedAt: "2026-07-08T15:01:00.000Z",
            lastObservedAt: "2026-07-08T15:02:00.000Z",
            rowCountAccepted: 3,
            terminalCount: 3,
            blockedCount: 1,
            failedCount: 1,
            leadCount: 1,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Concluído" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Conclusão explícita aprovada para todas as linhas aceitas.",
    );
    expect(document.body).toHaveTextContent(
      "Base da situaçãofechamento completo aprovado",
    );
    expect(document.body).toHaveTextContent("Terminais: 3");
    expect(document.body).not.toHaveTextContent("Incompleto");
    expect(document.body).not.toHaveTextContent("Sem atualização recente");
  });

  it("presents source unavailable as distinct from NO_UPDATE and INCOMPLETE", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            observationStatus: "UNAVAILABLE",
            observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
            rowCountAccepted: null,
            terminalCount: null,
            blockedCount: null,
            failedCount: null,
            leadCount: null,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Fonte de observação indisponível",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Base das observaçõesfonte indisponível",
    );
    expect(document.body).toHaveTextContent(
      "As contagens derivadas permanecem indisponíveis.",
    );
    expect(document.body).not.toHaveTextContent("Sem atualização recente");
    expect(document.body).not.toHaveTextContent("Incompleto");
  });

  it("does not render raw telemetry or internal fields returned beside the approved summary", async () => {
    fetchMock.mockResolvedValue(
      apiResponse({
        data: {
          ...batchSummary(),
          actor: "subject-internal",
          organizationId: "org-internal",
          fileSha256: "sha256-internal",
          idempotencyKey: "key-internal",
          n8nExecutionId: "execution-internal",
          rawTelemetry: "raw producer telemetry",
          sql: "SELECT secret FROM internal_table",
        },
      }),
    );

    render(<BatchDetailPage />);

    await screen.findByText(importBatchId);

    for (const fragment of [
      "subject-internal",
      "org-internal",
      "sha256-internal",
      "key-internal",
      "execution-internal",
      "raw producer telemetry",
      "SELECT secret",
      "internal_table",
      submissionId,
    ]) {
      expect(document.body).not.toHaveTextContent(fragment);
    }
  });

  it("does not call the API when the route id is not a safe batch detail id", async () => {
    navigationState.id = "../not-a-uuid";

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Importação não encontrada",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the page source free of external endpoints, mutation methods, and future actions", () => {
    const source = pageSource();

    expect(source).toContain(
      "fetch(\n          `/api/imports/${encodeURIComponent(batchId)}`",
    );
    expect(source).not.toMatch(
      /N8N_IMPORT_URL|webhook|192\.168\.0\.20|n8n|HMAC|signature|canonical|timestamp|nonce|replay|retry|reprocess|crm/i,
    );
    expect(source).not.toMatch(
      /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']|Idempotency-Key|fileSha256|idempotencyKey|rawTelemetry|n8nExecutionId|fetch\(["']https?:\/\//,
    );
  });
});
