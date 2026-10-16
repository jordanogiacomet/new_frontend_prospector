import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UNAVAILABLE_LABEL } from "../../../../../lib/formatters";
import type { BatchSummary } from "../../../../../types/imports";

const { navigationState } = vi.hoisted(() => ({
  navigationState: {
    id: "00000000-0000-4000-8000-000000000027",
    query: "",
    canReadLeads: true, canReadImports: true,
  },
}));

vi.mock("../../../../../components/auth/private-capabilities", () => ({
  usePrivateCapabilities: () => ({
    hasPermission: (permission: string) =>
      permission === "leads:read"
        ? navigationState.canReadLeads
        : permission === "imports:read" && navigationState.canReadImports,
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: navigationState.id }),
  useSearchParams: () => new URLSearchParams(navigationState.query),
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
    workflowReportedClosedAt:
      overrides.workflowReportedClosedAt === undefined
        ? null
        : overrides.workflowReportedClosedAt,
    workflowReportedStartedAt:
      overrides.workflowReportedStartedAt === undefined
        ? null
        : overrides.workflowReportedStartedAt,
    workflowReportedRowCount:
      overrides.workflowReportedRowCount === undefined
        ? null
        : overrides.workflowReportedRowCount,
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
    navigationState.query = "";
    navigationState.canReadLeads = true;
    navigationState.canReadImports = true;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(detailEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("denies missing read permission before any request", () => {
    navigationState.canReadImports = false;
    render(<BatchDetailPage />);

    expect(screen.getByRole("heading", { name: "Acesso não autorizado" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("gives HTTP %i an access recovery state and stops further polling", async (responseStatus) => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      fetchMock.mockResolvedValue(apiResponse({}, responseStatus));
      render(<BatchDetailPage />);

      expect(await screen.findByRole("heading", { name: responseStatus === 401 ? "Sua sessão expirou" : "Acesso não autorizado" })).toBeInTheDocument();
      const login = screen.queryByRole("link", { name: "Entrar novamente" });
      if (responseStatus === 401) expect(login).toHaveAttribute("href", "/login");
      else expect(login).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Tentar novamente|Atualizar/ })).not.toBeInTheDocument();
      const refresh = intervalSpy.mock.calls.find(([, delay]) => delay === 5_000)?.[0];
      if (typeof refresh === "function") {
        await act(async () => refresh());
        await act(async () => refresh());
      }
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      intervalSpy.mockRestore();
      visibilitySpy.mockRestore();
    }
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
      screen.queryByRole("heading", { name: "Acompanhar importação" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(importBatchId)).not.toBeInTheDocument();
  });

  it("returns to the approved batch list page without forwarding navigation context to the API", async () => {
    navigationState.query = `returnTo=${encodeURIComponent("/imports/batches?page=3&pageSize=5&status=COMPLETED")}`;
    render(<BatchDetailPage />);

    expect(screen.getByRole("link", { name: "Voltar para importações" })).toHaveAttribute(
      "href", "/imports/batches?page=3&pageSize=5",
    );
    await screen.findByText(importBatchId);
    expect(firstFetchCall()[0]).toBe(`/api/imports/${submissionId}`);
  });

  it.each(["https://malicious.example/imports/batches?page=3", "/leads?page=3"])(
    "uses the import list fallback for an unapproved return destination %s",
    async (returnTo) => {
      navigationState.query = `returnTo=${encodeURIComponent(returnTo)}`;
      render(<BatchDetailPage />);
      expect(screen.getByRole("link", { name: "Voltar para importações" })).toHaveAttribute("href", "/imports/batches");
      await screen.findByText(importBatchId);
    },
  );

  it("guides the manager to analysis while keeping the batch correlation in its detail", async () => {
    render(<BatchDetailPage />);

    expect(screen.getByRole("link", { name: "Abrir lista geral de empresas" })).toHaveAttribute("href", "/leads");
    expect(screen.getByText("A lista reúne empresas elegíveis de todas as importações.")).toBeInTheDocument();
    await screen.findByText(importBatchId);
    expect(firstFetchCall()[0]).toBe(`/api/imports/${submissionId}`);
    expect(document.body).not.toHaveTextContent(/workflow|Terminais|Proveniência/);
  });

  it("withholds the analysis shortcut without lead read permission", () => {
    navigationState.canReadLeads = false;
    render(<BatchDetailPage />);

    expect(screen.queryByRole("link", { name: "Abrir lista geral de empresas" })).not.toBeInTheDocument();
  });

  it("keeps identification and status basis behind optional details while showing results and analysis first", async () => {
    render(<BatchDetailPage />);

    const identifier = await screen.findByText(importBatchId);
    const details = identifier.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Detalhes da importação");
    expect(details).toHaveTextContent("Situação confirmada porregistro do envio");
    expect(identifier).not.toBeVisible();
    fireEvent.click(details!.querySelector("summary")!);
    expect(details).toHaveAttribute("open");
    expect(identifier).toBeVisible();
    expect(screen.getByRole("region", { name: "Contagens do lote" }).closest("details")).toBeNull();
    expect(screen.getByRole("link", { name: "Abrir lista geral de empresas" })).toHaveClass("ui-action--secondary");
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

  it("refreshes the detail automatically while the page is visible", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    render(<BatchDetailPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const refreshCall = setIntervalSpy.mock.calls.find(
      ([, delay]) => delay === 5_000,
    );
    const refresh = refreshCall?.[0];

    expect(refreshCall).toBeDefined();
    if (typeof refresh !== "function") {
      throw new Error("Expected the batch detail refresh callback.");
    }

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

    await act(async () => {
      refresh();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("heading", {
        name: "Em acompanhamento",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the last confirmed situation after a temporary refresh failure and recovers without resubmitting", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse(detailEnvelope()))
      .mockResolvedValueOnce(apiResponse({}, 503))
      .mockResolvedValueOnce(apiResponse(detailEnvelope(
        batchSummary({ status: "COMPLETED", statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL" }),
      )));
    render(<BatchDetailPage />);
    await screen.findByRole("heading", { name: "Envio registrado" });

    fireEvent.click(screen.getByRole("button", { name: "Atualizar situação" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A atualização não foi concluída. O motivo não foi informado. Você está vendo a última consulta confirmada.");
    expect(screen.getByRole("heading", { name: "Envio registrado" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Contagens do lote" })).toHaveTextContent(`Linhas aceitas: ${UNAVAILABLE_LABEL}`);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar situação" }));
    expect(await screen.findByRole("heading", { name: "Concluído" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it.each([401, 403])("removes the previous batch details when refresh authorization fails with %i", async (status) => {
    fetchMock
      .mockResolvedValueOnce(apiResponse(detailEnvelope()))
      .mockResolvedValueOnce(apiResponse({}, status));
    render(<BatchDetailPage />);
    await screen.findByRole("heading", { name: "Envio registrado" });

    fireEvent.click(screen.getByRole("button", { name: "Atualizar situação" }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: "Envio registrado" })).not.toBeInTheDocument();
    expect(screen.queryByText(importBatchId)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    expect(document.body).toHaveTextContent("Situação confirmada poratividade confirmada");
    expect(document.body).toHaveTextContent("Linhas aceitas: 5");
    expect(document.body).toHaveTextContent("Linhas com resultado: 3");
    expect(document.body).toHaveTextContent("Leads gerados: 2");
    expect(document.body).toHaveTextContent("Bloqueadas: 1");
    expect(document.body).toHaveTextContent("Falhas: 0");
    expect(
      screen.getByRole("heading", {
        name: "Atualização confirmada",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Atualizações disponíveis");
    expect(screen.getAllByText("08/07/2026").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("link", { name: /voltar/i })).toHaveAttribute(
      "href",
      "/imports/batches",
    );
    expect(document.body).not.toHaveTextContent(submissionId);
  });

  it("reports workflow processing as finished without promoting contractual completion", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "SUBMITTED",
            workflowReportedClosedAt: "2026-07-08T15:30:00.000Z",
            workflowReportedRowCount: 5,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Processamento encerrado",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "O término do processamento deste arquivo foi informado.",
    );
    expect(document.body).toHaveTextContent(
      "Situação confirmada porencerramento informado",
    );
    expect(document.body).toHaveTextContent(
      "Linhas informadas5",
    );
    const counts = screen.getByRole("region", { name: "Contagens do lote" });
    expect(counts).toHaveTextContent("Resultados ainda não confirmados");
    expect(counts).toHaveTextContent("Linhas informadas: 5");
    expect(within(counts).getByText("Linhas informadas:")).toBeVisible();
    expect(document.body).toHaveTextContent(
      `Linhas aceitas: ${UNAVAILABLE_LABEL}`,
    );
    expect(document.body).toHaveTextContent(
      `Linhas com resultado: ${UNAVAILABLE_LABEL}`,
    );
  });

  it("reports the first workflow row as operational start without durable acceptance", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "SUBMITTED",
            workflowReportedStartedAt: "2026-07-08T15:05:00.000Z",
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Processamento iniciado",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "O início do processamento deste arquivo foi informado.",
    );
    expect(document.body).toHaveTextContent(
      "O aceite das linhas e os resultados ainda precisam de confirmação.",
    );
    expect(document.body).toHaveTextContent(
      "Situação confirmada porinício do processamento informado",
    );
    expect(document.body).toHaveTextContent(
      "Início do processamento informado08/07/2026",
    );
    expect(document.body).toHaveTextContent(
      `Linhas aceitas: ${UNAVAILABLE_LABEL}`,
    );
    expect(document.body).not.toHaveTextContent(
      "Aceite confirmado08/07/2026",
    );
  });

  it("keeps workflow closure ahead of the earlier operational start", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "SUBMITTED",
            workflowReportedStartedAt: "2026-07-08T15:05:00.000Z",
            workflowReportedClosedAt: "2026-07-08T15:30:00.000Z",
            workflowReportedRowCount: 5,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Processamento encerrado",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      "Processamento iniciado",
    );
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

    expect(within(counts).getByText("Resultados ainda não confirmados")).toBeVisible();
    const countsSummary = within(counts).getByText("Contagens detalhadas");
    const detailedCounts = countsSummary.closest("details");
    expect(detailedCounts).not.toHaveAttribute("open");
    fireEvent.click(countsSummary);
    expect(detailedCounts).toHaveAttribute("open");
    expect(counts).toHaveTextContent(
      `Linhas aceitas: ${UNAVAILABLE_LABEL}`,
    );
    expect(counts).toHaveTextContent(`Linhas com resultado: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Leads gerados: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Bloqueadas: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Falhas: ${UNAVAILABLE_LABEL}`);
    expect(counts).not.toHaveTextContent("Linhas aceitas: 0");
    expect(counts).not.toHaveTextContent("Linhas com resultado: 0");
  });

  it("distinguishes a recorded update from confirmed acceptance and result totals", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            workflowReportedStartedAt: "2026-07-08T15:01:00.000Z",
            lastObservedAt: "2026-07-08T15:02:00.000Z",
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Registro de acompanhamento disponível" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Atualização registrada");
    expect(document.body).toHaveTextContent(
      "Há registros de acompanhamento desta importação. Eles não confirmam o aceite das linhas nem os totais de resultados.",
    );
    expect(document.body).not.toHaveTextContent("Atualizações disponíveis");
    expect(document.body).not.toHaveTextContent(
      "A situação e as contagens exibidas usam somente atualizações confirmadas",
    );
    const counts = screen.getByRole("region", { name: "Contagens do lote" });
    expect(within(counts).getByText("Resultados ainda não confirmados")).toBeVisible();
    expect(counts).toHaveTextContent(`Leads gerados: ${UNAVAILABLE_LABEL}`);
    expect(counts).not.toHaveTextContent("Leads gerados: 0");
  });

  it("distinguishes an available source with no correlated producer facts", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            observationStatus: "AVAILABLE",
            lastObservedAt: null,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Ainda sem atualização deste lote",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Sem atualização deste lote");
    expect(document.body).toHaveTextContent(
      "ainda não há atualização confirmada para este lote",
    );
    expect(document.body).toHaveTextContent(
      "Detalhe da atualizaçãosem atualização deste lote",
    );
    expect(document.body).not.toHaveTextContent("Atualizações disponíveis");
    expect(document.body).not.toHaveTextContent(
      "A situação e as contagens exibidas usam somente atualizações confirmadas",
    );
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
    expect(counts).toHaveTextContent("Linhas com resultado: 0");
    expect(counts).toHaveTextContent("Leads gerados: 0");
    expect(counts).toHaveTextContent("Bloqueadas: 0");
    expect(counts).toHaveTextContent("Falhas: 0");
    expect(within(counts).queryByText("Resultados ainda não confirmados")).not.toBeInTheDocument();
    expect(within(counts).queryByText("Contagens detalhadas")).not.toBeInTheDocument();
  });

  it("preserves partial counts and distinguishes a confirmed zero from missing totals", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "ACCEPTED",
            statusBasis: "ACCEPTANCE_CONFIRMED",
            acceptedAt: "2026-07-08T15:01:00.000Z",
            lastObservedAt: "2026-07-08T15:02:00.000Z",
            rowCountAccepted: 5,
            terminalCount: 0,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    const counts = await screen.findByRole("region", { name: "Contagens do lote" });
    expect(counts).toHaveTextContent("Linhas aceitas: 5");
    expect(counts).toHaveTextContent("Linhas com resultado: 0");
    expect(counts).toHaveTextContent(`Leads gerados: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Bloqueadas: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Falhas: ${UNAVAILABLE_LABEL}`);
    expect(within(counts).queryByText("Resultados ainda não confirmados")).not.toBeInTheDocument();
    expect(within(counts).queryByText("Contagens detalhadas")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Atualização confirmada" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Registro de acompanhamento disponível");
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
      "Situação confirmada porsem atualização recente",
    );
    expect(document.body).not.toHaveTextContent("Incompleto");
    expect(document.body).not.toHaveTextContent("O processamento foi concluído");
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
      "uma ou mais linhas ainda não têm resultado confirmado",
    );
    expect(document.body).toHaveTextContent(
      "Situação confirmada porencerramento com resultados pendentes",
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
      "O processamento foi concluído e todas as linhas aceitas têm um resultado confirmado.",
    );
    expect(document.body).toHaveTextContent(
      "Situação confirmada portodos os resultados confirmados",
    );
    expect(document.body).toHaveTextContent("Linhas com resultado: 3");
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
        name: "Atualização indisponível",
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Detalhe da atualizaçãoconsulta indisponível",
    );
    expect(document.body).toHaveTextContent(
      "As contagens permanecem indisponíveis.",
    );
    expect(document.body).not.toHaveTextContent("Sem atualização recente");
    expect(document.body).not.toHaveTextContent("Incompleto");
  });

  it.each([
    {
      observationStatus: "UNAVAILABLE",
      observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
      heading: "Atualização indisponível",
      explanation: "As contagens confirmadas continuam exibidas; os resultados sem confirmação permanecem indisponíveis.",
    },
    {
      observationStatus: "INCONSISTENT",
      observationBasis: "PRODUCER_EVIDENCE_CONFLICT",
      heading: "Dados divergentes",
      explanation: "O Prospecta mantém a última situação confirmada até que a divergência seja esclarecida.",
    },
  ] as const)("preserves durable acceptance when observations are $observationStatus", async ({ observationStatus, observationBasis, heading, explanation }) => {
    fetchMock.mockResolvedValue(
      apiResponse(
        detailEnvelope(
          batchSummary({
            status: "ACCEPTED",
            statusBasis: "ACCEPTANCE_CONFIRMED",
            acceptedAt: "2026-07-08T15:01:00.000Z",
            rowCountAccepted: 5,
            observationStatus,
            observationBasis,
          }),
        ),
      ),
    );

    render(<BatchDetailPage />);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aceite confirmado" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent(explanation);
    expect(document.body).not.toHaveTextContent("As contagens permanecem indisponíveis.");
    const counts = screen.getByRole("region", { name: "Contagens do lote" });
    expect(within(counts).getByText("Linhas aceitas:")).toBeVisible();
    expect(counts).toHaveTextContent("Linhas aceitas: 5");
    expect(counts).toHaveTextContent(`Linhas com resultado: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Leads gerados: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Bloqueadas: ${UNAVAILABLE_LABEL}`);
    expect(counts).toHaveTextContent(`Falhas: ${UNAVAILABLE_LABEL}`);
    expect(counts).not.toHaveTextContent("Linhas com resultado: 0");
    expect(document.body).not.toHaveTextContent("Concluído");
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
  it("announces a manual refresh immediately, keeps the confirmed data and ignores double clicks", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    fetchMock.mockResolvedValueOnce(apiResponse(detailEnvelope())).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    render(<BatchDetailPage />);
    await screen.findByRole("heading", { name: "Envio registrado" });
    const refresh = screen.getByRole("button", { name: "Atualizar situação" });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(screen.getByRole("button", { name: "Atualizando situação…" })).toBeDisabled();
    expect(screen.getByText("Consultando dados atualizados…")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveRefresh?.(apiResponse(detailEnvelope()));
    expect(await screen.findByText("Situação atualizada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar situação" })).toBeEnabled();
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

});
