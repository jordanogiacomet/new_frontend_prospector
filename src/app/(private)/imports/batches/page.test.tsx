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

import {
  UNAVAILABLE_LABEL,
} from "../../../../lib/formatters";
import type { BatchSummary } from "../../../../types/imports";

const { navigationState, watchImportCompanies } = vi.hoisted(() => ({
  navigationState: { query: "", canReadLeads: true, canReadImports: true },
  watchImportCompanies: vi.fn<(submissionId: string, includeExisting?: boolean) => () => void>(),
}));

vi.mock("../../../../components/imports/import-company-notices", () => ({
  useImportCompanyNotices: () => watchImportCompanies,
}));

vi.mock("../../../../components/auth/private-capabilities", () => ({
  usePrivateCapabilities: () => ({
    hasPermission: (permission: string) =>
      permission === "leads:read"
        ? navigationState.canReadLeads
        : permission === "imports:read" && navigationState.canReadImports,
  }),
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
    navigationState.canReadLeads = true;
    navigationState.canReadImports = true;
    watchImportCompanies.mockReset();
    watchImportCompanies.mockImplementation(() => vi.fn<() => void>());
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("denies missing read permission before any request", () => {
    navigationState.canReadImports = false;
    render(<BatchListPage />);

    expect(screen.getByRole("heading", { name: "Acesso não autorizado" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(watchImportCompanies).not.toHaveBeenCalled();
  });

  it.each([401, 403])("gives HTTP %i an access recovery state and stops further polling", async (responseStatus) => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    try {
      fetchMock.mockResolvedValue(apiResponse({}, responseStatus));
      render(<BatchListPage />);

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
      expect(watchImportCompanies).not.toHaveBeenCalled();
    } finally {
      intervalSpy.mockRestore();
      visibilitySpy.mockRestore();
    }
  });

  it("shows a loading state while the current list request is pending", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    render(<BatchListPage />);

    expect(
      screen.getByRole("status", { name: "Carregando importações" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(watchImportCompanies).not.toHaveBeenCalled();
  });

  it("watches each validated batch on the list with a historical baseline", async () => {
    const secondId = "00000000-0000-4000-8000-000000000027";
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope([
      batchSummary(), batchSummary({ submissionId: secondId }),
    ])));

    render(<BatchListPage />);
    await screen.findByRole("table", { name: "Importações registradas" });

    await waitFor(() => expect(watchImportCompanies.mock.calls).toEqual([
      [submissionId, false], [secondId, false],
    ]));
    expect(screen.getByRole("table")).toHaveTextContent("Resultados ainda não confirmados");
    expect(screen.getByRole("table")).not.toHaveTextContent("Leads gerados: 0");
  });

  it("keeps observations active when a refresh returns the same visible submissions", async () => {
    const secondId = "00000000-0000-4000-8000-000000000027";
    fetchMock.mockResolvedValueOnce(apiResponse(batchListEnvelope([
      batchSummary(), batchSummary({ submissionId: secondId }),
    ])));
    fetchMock.mockResolvedValueOnce(apiResponse(batchListEnvelope([
      batchSummary({ submissionId: secondId }),
      batchSummary({ workflowReportedStartedAt: "2026-07-08T12:01:00.000Z" }),
    ])));
    render(<BatchListPage />);
    await screen.findByRole("table", { name: "Importações registradas" });
    await waitFor(() => expect(watchImportCompanies).toHaveBeenCalledTimes(2));
    const releases = watchImportCompanies.mock.results.map((result) => result.value);

    fireEvent.click(screen.getByRole("button", { name: "Atualizar importações" }));
    await screen.findByText("Processamento iniciado");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(watchImportCompanies).toHaveBeenCalledTimes(2);
    releases.forEach((release) => expect(release).not.toHaveBeenCalled());
  });

  it("does not subscribe to a malformed submission identifier", async () => {
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope([
      batchSummary({ submissionId: "untrusted/not-an-id" }),
    ])));
    render(<BatchListPage />);

    await screen.findByRole("table", { name: "Importações registradas" });
    expect(watchImportCompanies).not.toHaveBeenCalled();
  });

  it("releases observations on pagination and when leaving the list", async () => {
    const rendered = render(<BatchListPage />);
    await screen.findByRole("table", { name: "Importações registradas" });
    await waitFor(() => expect(watchImportCompanies).toHaveBeenCalledExactlyOnceWith(submissionId, false));
    const firstRelease = watchImportCompanies.mock.results[0]?.value;
    expect(firstRelease).toBeTypeOf("function");

    navigationState.query = "page=2&pageSize=20";
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope([batchSummary()], { page: 2 })));
    rendered.rerender(<BatchListPage />);
    await waitFor(() => expect(watchImportCompanies).toHaveBeenCalledTimes(2));

    expect(firstRelease).toHaveBeenCalledOnce();
    const secondRelease = watchImportCompanies.mock.results[1]?.value;
    rendered.unmount();
    expect(secondRelease).toHaveBeenCalledOnce();
  });

  it("observes individual import processing without granting access to lead pages", async () => {
    navigationState.canReadLeads = false;
    render(<BatchListPage />);
    await screen.findByRole("table", { name: "Importações registradas" });

    await waitFor(() => expect(watchImportCompanies).toHaveBeenCalledExactlyOnceWith(submissionId, false));
    expect(screen.queryByRole("link", { name: "Abrir lista geral de empresas" })).not.toBeInTheDocument();
  });

  it.each([
    ["unavailable", 503, {}, "As importações não puderam ser consultadas agora."],
    ["error", 500, {}, "Não foi possível carregar as importações agora."],
    ["invalid envelope", 200, { data: [{ submissionId }] }, "Não foi possível carregar as importações agora."],
  ])("does not observe batches from an unconfirmed list: %s", async (_label, status, body, heading) => {
    fetchMock.mockResolvedValue(apiResponse(body, Number(status)));
    render(<BatchListPage />);

    await screen.findByRole("heading", { name: String(heading) });
    expect(watchImportCompanies).not.toHaveBeenCalled();
  });

  it("does not create an observation for a confirmed empty list", async () => {
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope([])));
    render(<BatchListPage />);

    await screen.findByRole("heading", { name: "Nenhuma importação registrada" });
    expect(watchImportCompanies).not.toHaveBeenCalled();
  });

  it("guides the manager to the approved company list without inventing a batch filter", async () => {
    render(<BatchListPage />);

    expect(screen.getByRole("link", { name: "Abrir lista geral de empresas" })).toHaveAttribute("href", "/leads");
    expect(screen.getByText("A lista reúne empresas elegíveis de todas as importações.")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Importações registradas" });
    expect(table).not.toHaveTextContent(/workflow|Terminais|Proveniência/);
    expect(table).toHaveTextContent("Sem atualização deste lote");
    expect(table).not.toHaveTextContent("Atualizações disponíveis");
  });

  it("withholds the analysis shortcut without lead read permission", () => {
    navigationState.canReadLeads = false;
    render(<BatchListPage />);

    expect(screen.queryByRole("link", { name: "Abrir lista geral de empresas" })).not.toBeInTheDocument();
  });

  it("keeps the batch identifier and fact basis in closed details instead of a main table column", async () => {
    render(<BatchListPage />);

    const identifier = await screen.findByText(importBatchId);
    const details = identifier.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Detalhes da importação");
    expect(details).toHaveTextContent("Situação: registro do envio");
    expect(identifier).not.toBeVisible();
    fireEvent.click(details!.querySelector("summary")!);
    expect(details).toHaveAttribute("open");
    expect(identifier).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Lote" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir lista geral de empresas" })).toHaveClass("ui-action--secondary");
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

  it("refreshes the list automatically while the page is visible", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    render(<BatchListPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const refreshCall = setIntervalSpy.mock.calls.find(
      ([, delay]) => delay === 5_000,
    );
    const refresh = refreshCall?.[0];

    expect(refreshCall).toBeDefined();
    if (typeof refresh !== "function") {
      throw new Error("Expected the batch refresh callback.");
    }

    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([
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
        ]),
      ),
    );

    await act(async () => {
      refresh();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Em acompanhamento"),
    ).toBeInTheDocument();
  });

  it("keeps the last confirmed list after a temporary refresh failure and recovers with a read-only action", async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse(batchListEnvelope()))
      .mockResolvedValueOnce(apiResponse({}, 503))
      .mockResolvedValueOnce(apiResponse(batchListEnvelope([
        batchSummary({ status: "COMPLETED", statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL" }),
      ])));
    render(<BatchListPage />);
    const table = await screen.findByRole("table", { name: "Importações registradas" });

    fireEvent.click(screen.getByRole("button", { name: "Atualizar importações" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A atualização não foi concluída. O motivo não foi informado. Você está vendo a última consulta confirmada.");
    expect(table).toBeVisible();
    expect(table).toHaveTextContent("Envio registrado");
    expect(table).toHaveTextContent(`Linhas aceitas: ${UNAVAILABLE_LABEL}`);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar importações" }));
    expect(await screen.findByText("Concluído")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it.each([401, 403])("removes the previous list when refresh authorization fails with %i", async (status) => {
    fetchMock
      .mockResolvedValueOnce(apiResponse(batchListEnvelope()))
      .mockResolvedValueOnce(apiResponse({}, status));
    render(<BatchListPage />);
    await screen.findByRole("table", { name: "Importações registradas" });

    fireEvent.click(screen.getByRole("button", { name: "Atualizar importações" }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(importBatchId)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    const detailHref = `/imports/batches/${submissionId}?returnTo=${encodeURIComponent("/imports/batches?page=2&pageSize=5")}`;
    expect(screen.getByRole("link", { name: "Ver detalhes da importação enviada em 08/07/2026" })).toHaveAttribute("href", detailHref);
    expect(screen.getByRole("link", { name: "Ver atualização da importação enviada em 08/07/2026" })).toHaveAttribute("href", detailHref);
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
    expect(row!).toHaveTextContent("Situação: atividade confirmada");
    expect(row!).toHaveTextContent("Linhas aceitas: 2");
    expect(row!).toHaveTextContent("Leads gerados: 1");
    expect(row!).toHaveTextContent("Bloqueadas: 0");
    expect(row!).toHaveTextContent("Falhas: 0");
    expect(screen.getAllByText("08/07/2026")).toHaveLength(3);
    expect(document.body).not.toHaveTextContent(submissionId);
  });

  it("shows the legacy workflow close report without inventing result counts", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([
          batchSummary({
            status: "SUBMITTED",
            workflowReportedClosedAt: "2026-07-08T14:30:00.000Z",
            workflowReportedRowCount: 2,
          }),
        ]),
      ),
    );

    render(<BatchListPage />);

    const row = (await screen.findByText(importBatchId)).closest("tr");

    expect(row).not.toBeNull();
    expect(row!).toHaveTextContent("Processamento encerrado");
    expect(row!).toHaveTextContent(
      "Situação: encerramento informado",
    );
    expect(row!).toHaveTextContent(`Linhas aceitas: ${UNAVAILABLE_LABEL}`);
    expect(row!).toHaveTextContent(`Linhas com resultado: ${UNAVAILABLE_LABEL}`);
  });

  it("shows the first workflow row as operational start without claiming durable acceptance", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([
          batchSummary({
            status: "SUBMITTED",
            workflowReportedStartedAt: "2026-07-08T14:05:00.000Z",
          }),
        ]),
      ),
    );

    render(<BatchListPage />);

    const row = (await screen.findByText(importBatchId)).closest("tr");

    expect(row).not.toBeNull();
    expect(row!).toHaveTextContent("Processamento iniciado");
    expect(row!).toHaveTextContent(
      "Situação: início do processamento informado",
    );
    expect(row!).toHaveTextContent(`Linhas aceitas: ${UNAVAILABLE_LABEL}`);
    expect(row!).toHaveTextContent(`Linhas com resultado: ${UNAVAILABLE_LABEL}`);
    expect(row!).not.toHaveTextContent("Aceite confirmado: 08/07/2026");
  });

  it.each([
    {
      name: "started",
      overrides: { workflowReportedStartedAt: "2026-07-08T14:05:00.000Z" },
      explanation: "O início foi informado. As contagens de linhas e resultados ainda aguardam confirmação.",
    },
    {
      name: "closed",
      overrides: {
        workflowReportedClosedAt: "2026-07-08T14:30:00.000Z",
        workflowReportedRowCount: 2,
      },
      explanation: "O encerramento foi informado, mas os resultados de cada linha ainda não foram confirmados.",
    },
  ])("distinguishes $name reports and retained updates from confirmed results", async ({ overrides, explanation }) => {
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope([
      batchSummary({ lastObservedAt: "2026-07-08T14:30:00.000Z", ...overrides }),
    ])));

    render(<BatchListPage />);

    const table = await screen.findByRole("table", { name: "Importações registradas" });
    const row = within(table).getByText(importBatchId).closest("tr")!;
    const results = row.querySelector('[data-label="Resultados"]')!;
    const update = within(row).getByRole("link", { name: "Ver atualização da importação enviada em 08/07/2026" });

    expect(update).toHaveTextContent("Atualização registrada");
    expect(row).not.toHaveTextContent("Atualizações disponíveis");
    expect(results).toHaveTextContent("Resultados ainda não confirmados");
    expect(results).toHaveTextContent(explanation);
    const accepted = within(results as HTMLElement).getByText("Linhas aceitas:");
    expect(accepted).not.toBeVisible();
    expect(accepted.closest("p")).toHaveTextContent(`Linhas aceitas: ${UNAVAILABLE_LABEL}`);
    fireEvent.click(within(results as HTMLElement).getByText("Contagens detalhadas"));
    expect(accepted).toBeVisible();
    expect(row).not.toHaveTextContent("Concluído");
    expect(row).not.toHaveTextContent("Linhas aceitas: 2");
    expect(row).not.toHaveTextContent("Linhas com resultado: 2");
    if ("workflowReportedRowCount" in overrides) {
      expect(results).toHaveTextContent("Linhas informadas: 2");
      expect(within(results as HTMLElement).getByText("Linhas informadas:")).toBeVisible();
    }
  });

  it("keeps partial confirmed counts visible without replacing missing counts", async () => {
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope([
      batchSummary({
        status: "ACCEPTED",
        statusBasis: "ACCEPTANCE_CONFIRMED",
        rowCountAccepted: 2,
        terminalCount: null,
      }),
    ])));

    render(<BatchListPage />);

    const table = await screen.findByRole("table", { name: "Importações registradas" });
    const results = table.querySelector('[data-label="Resultados"]')!;
    expect(within(results as HTMLElement).getByText("Linhas aceitas:")).toBeVisible();
    expect(results).toHaveTextContent("Linhas aceitas: 2");
    expect(results).toHaveTextContent(`Linhas com resultado: ${UNAVAILABLE_LABEL}`);
    expect(results).not.toHaveTextContent("Resultados ainda não confirmados");
    expect(results).not.toHaveTextContent("Contagens detalhadas");
    expect(results).not.toHaveTextContent("Linhas com resultado: 0");
  });

  it.each([
    { status: "UNAVAILABLE", heading: "Consulta de resultados indisponível", explanation: "Não foi possível consultar os resultados agora." },
    { status: "INCONSISTENT", heading: "Resultados em verificação", explanation: "Há informações divergentes." },
  ] as const)("distinguishes $status results from pending confirmation", async ({ status, heading, explanation }) => {
    fetchMock.mockResolvedValue(apiResponse(batchListEnvelope([
      batchSummary({ observationStatus: status }),
    ])));

    render(<BatchListPage />);

    const table = await screen.findByRole("table", { name: "Importações registradas" });
    const results = table.querySelector('[data-label="Resultados"]')!;
    expect(results).toHaveTextContent(heading);
    expect(results).toHaveTextContent(explanation);
    expect(results).not.toHaveTextContent("Resultados ainda não confirmados");
    expect(results).not.toHaveTextContent("Falhas: 0");
  });

  it("keeps workflow closure ahead of the earlier operational start", async () => {
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([
          batchSummary({
            status: "SUBMITTED",
            workflowReportedStartedAt: "2026-07-08T14:05:00.000Z",
            workflowReportedClosedAt: "2026-07-08T14:30:00.000Z",
            workflowReportedRowCount: 2,
          }),
        ]),
      ),
    );

    render(<BatchListPage />);

    const row = (await screen.findByText(importBatchId)).closest("tr");

    expect(row).not.toBeNull();
    expect(row!).toHaveTextContent("Processamento encerrado");
    expect(row!).not.toHaveTextContent(
      "Processamento iniciado",
    );
  });

  it("links each import to its app-owned detail route without displaying its identifier", async () => {
    render(<BatchListPage />);

    const link = await screen.findByRole("link", {
      name: "Ver detalhes da importação enviada em 08/07/2026",
    });

    expect(link).toHaveAttribute(
      "href",
      `/imports/batches/${submissionId}?returnTo=${encodeURIComponent("/imports/batches?page=1&pageSize=20")}`,
    );
    expect(document.body).not.toHaveTextContent(submissionId);
  });

  it("links the observation status to the app-owned batch detail", async () => {
    render(<BatchListPage />);

    const link = await screen.findByRole("link", {
      name: "Ver atualização da importação enviada em 08/07/2026",
    });

    expect(link).toHaveAttribute(
      "href",
      `/imports/batches/${submissionId}?returnTo=${encodeURIComponent("/imports/batches?page=1&pageSize=20")}`,
    );
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

  it("distinguishes an out-of-range page from an empty import history", async () => {
    navigationState.query = "page=999&pageSize=20";
    fetchMock.mockResolvedValue(
      apiResponse(
        batchListEnvelope([], {
          page: 999,
          pageSize: 20,
          total: 2,
        }),
      ),
    );

    render(<BatchListPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Esta página não tem importações",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar à primeira página" }),
    ).toHaveAttribute("href", "/imports/batches");
    expect(
      screen.queryByRole("heading", {
        name: "Nenhuma importação registrada",
      }),
    ).not.toBeInTheDocument();
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
    expect(tableRow!).toHaveTextContent(`Linhas com resultado: ${UNAVAILABLE_LABEL}`);
    expect(tableRow!).toHaveTextContent(`Leads gerados: ${UNAVAILABLE_LABEL}`);
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
    expect(tableRow!).toHaveTextContent("Linhas com resultado: 0");
    expect(tableRow!).toHaveTextContent("Leads gerados: 0");
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
      await screen.findByText("Atualização indisponível"),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Situação: consulta indisponível");
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
  it("announces a manual refresh immediately, keeps the confirmed data and ignores double clicks", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    fetchMock.mockResolvedValueOnce(apiResponse(batchListEnvelope())).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    render(<BatchListPage />);
    await screen.findByRole("table", { name: "Importações registradas" });
    const refresh = screen.getByRole("button", { name: "Atualizar importações" });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(screen.getByRole("button", { name: "Atualizando importações…" })).toBeDisabled();
    expect(screen.getByText("Consultando dados atualizados…")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveRefresh?.(apiResponse(batchListEnvelope()));
    expect(await screen.findByText("Importações atualizadas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar importações" })).toBeEnabled();
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

});
