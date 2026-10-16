import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, useEffect } from "react";

import { PrivateCapabilitiesProvider } from "../auth/private-capabilities";
import { ImportCompanyNoticesProvider, useImportCompanyNotices } from "./import-company-notices";

const submissionId = "00000000-0000-4000-8000-000000000041";
const otherSubmissionId = "00000000-0000-4000-8000-000000000042";
const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
const processedAt = "2026-10-14T14:00:00.000Z";
const pathname = vi.hoisted(() => ({ value: "/imports" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

function payload(rows: readonly number[], overrides: Record<string, unknown> = {}) {
  return {
    data: { submissionId },
    meta: { processedCompanies: {
      available: true, factSource: "producer_current_company_results_v1", page: 1, pageSize: 100, total: rows.length,
      data: rows.map((source_row) => ({ source_row, processedAt })), ...overrides,
    } },
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function Actions({ page = "Importar", includeExisting = true }: { readonly page?: string; readonly includeExisting?: boolean }) {
  const watch = useImportCompanyNotices();
  return <div>
    <p>{page}</p>
    <button onClick={() => watch(submissionId, includeExisting)}>Acompanhar importação</button>
    <button onClick={() => watch(otherSubmissionId)}>Acompanhar outra importação</button>
  </div>;
}

function view(includeExisting = true, permitted = true, page = "Importar") {
  return <PrivateCapabilitiesProvider permissions={permitted ? ["imports:read"] : []}>
    <ImportCompanyNoticesProvider><Actions includeExisting={includeExisting} page={page} /></ImportCompanyNoticesProvider>
  </PrivateCapabilitiesProvider>;
}

function PageSubscription({ id = submissionId }: { readonly id?: string }) {
  const watch = useImportCompanyNotices();
  useEffect(() => watch(id, false), [id, watch]);
  return <p>Importação visível</p>;
}

function subscribedPage(id = submissionId, duplicate = false) {
  return <PrivateCapabilitiesProvider permissions={["imports:read"]}>
    <ImportCompanyNoticesProvider>
      <PageSubscription id={id} />
      {duplicate ? <PageSubscription id={id} /> : null}
    </ImportCompanyNoticesProvider>
  </PrivateCapabilitiesProvider>;
}

async function start() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Acompanhar importação" })));
}

async function tick(milliseconds = 5_000) {
  await act(async () => vi.advanceTimersByTime(milliseconds));
}

describe("import company confirmations", () => {
  beforeEach(() => {
    pathname.value = "/imports";
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(response(payload([])));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows each confirmed company in order and deduplicates repeat observations", async () => {
    fetchMock.mockResolvedValue(response(payload([2, 3])));
    render(view());
    await start();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 2 foi processada nesta importação.");
    expect(screen.getByText("Mais 1 confirmação na sequência")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar confirmação" }));
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 3");
    fireEvent.click(screen.getByRole("button", { name: "Fechar confirmação" }));
    await tick();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET" && init.cache === "no-store" && init.credentials === "same-origin")).toBe(true);
  });

  it("ignores upload receipts and confirms only a recorded processing result", async () => {
    fetchMock.mockResolvedValueOnce(response({
      data: { submissionId, workflowReportedStartedAt: processedAt },
      meta: { receivedCompanies: { available: true, page: 1, pageSize: 100, total: 1,
        data: [{ source_row: 2, receivedAt: processedAt }] } },
    })).mockResolvedValueOnce(response(payload([2])));
    render(view());
    await start();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 2 foi processada nesta importação.");
    expect(fetchMock.mock.calls.every(([url]) => url.includes("processedCompaniesPage=") && !url.includes("receivedCompaniesPage="))).toBe(true);
  });

  it("releases batches outside the visible page and retains result deduplication on return", async () => {
    fetchMock.mockImplementation(async (url) => {
      const body = payload(url.includes(otherSubmissionId) ? [] : [2]);
      if (url.includes(otherSubmissionId)) body.data.submissionId = otherSubmissionId;
      return response(body);
    });
    let rendered!: ReturnType<typeof render>;
    await act(async () => { rendered = render(subscribedPage()); });
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    await act(async () => rendered.rerender(subscribedPage(otherSubmissionId)));
    await tick();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes(submissionId))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes(otherSubmissionId))).toHaveLength(2);
    await act(async () => rendered.rerender(subscribedPage()));
    await tick();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes(otherSubmissionId))).toHaveLength(2);
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
  });

  it("keeps a shared observer until the last page subscription releases it", async () => {
    let rendered!: ReturnType<typeof render>;
    await act(async () => { rendered = render(subscribedPage(submissionId, true)); });
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => rendered.rerender(subscribedPage()));
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => rendered.rerender(
      <PrivateCapabilitiesProvider permissions={["imports:read"]}>
        <ImportCompanyNoticesProvider><p>Nenhuma importação visível</p></ImportCompanyNoticesProvider>
      </PrivateCapabilitiesProvider>,
    ));
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("establishes one successful baseline through Strict Mode setup and cleanup", async () => {
    fetchMock.mockResolvedValue(response(payload([2])));
    await act(async () => render(<StrictMode>{subscribedPage()}</StrictMode>));
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    fetchMock.mockResolvedValue(response(payload([2, 3])));
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 3");
    expect(screen.queryByText("Mais 1 confirmação na sequência")).not.toBeInTheDocument();
  });

  it("baselines historical rows when a detail page opens and then confirms new rows", async () => {
    fetchMock.mockResolvedValueOnce(response(payload([2]))).mockResolvedValueOnce(response(payload([2, 3])));
    render(view(false));
    await start();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 3");
  });

  it("keeps monitoring across page changes without repeating an import subscription", async () => {
    fetchMock.mockResolvedValue(response(payload([2])));
    const rendered = render(view());
    await start();
    rendered.rerender(view(false, true, "Detalhe da importação"));
    await start();
    expect(screen.getByText("Detalhe da importação")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 2");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("pauses outside import pages and preserves deduplication when returning", async () => {
    fetchMock.mockResolvedValue(response(payload([2])));
    const rendered = render(view());
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Fechar confirmação" }));
    pathname.value = "/leads";
    rendered.rerender(view());
    await tick(10_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    pathname.value = "/imports/batches/" + submissionId;
    await act(async () => rendered.rerender(view()));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
  });

  it("stops observations only after explicit closure and every expected processing result", async () => {
    const body = { ...payload([2, 3]), data: { submissionId, workflowReportedClosedAt: processedAt, workflowReportedRowCount: 2 } };
    fetchMock.mockResolvedValue(response(body));
    render(view());
    await start();
    await tick(20_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    { workflowReportedClosedAt: null, workflowReportedRowCount: 2 },
    { workflowReportedClosedAt: processedAt, workflowReportedRowCount: 3 },
  ])("keeps observing without closure or with missing processing results", async (closeReport) => {
    fetchMock.mockResolvedValue(response({ ...payload([2, 3]), data: { submissionId, ...closeReport } }));
    render(view());
    await start();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads every page before confirming companies beyond the first hundred", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => index + 2);
    fetchMock.mockResolvedValueOnce(response(payload(firstPage, { total: 101 })))
      .mockResolvedValueOnce(response(payload([102], { page: 2, total: 101 })));
    render(view(false));
    await start();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/imports/${submissionId}?processedCompaniesPage=1&pageSize=100`,
      `/api/imports/${submissionId}?processedCompaniesPage=2&pageSize=100`,
    ]);
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(response(payload(firstPage, { total: 102 })))
      .mockResolvedValueOnce(response(payload([102, 103], { page: 2, total: 102 })));
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 103");
  });

  it("does not seed a historical baseline from an incomplete successful page", async () => {
    fetchMock.mockResolvedValueOnce(response(payload([2], { total: 2 })))
      .mockResolvedValueOnce(response(payload([2, 3])))
      .mockResolvedValueOnce(response(payload([2, 3, 4])));
    render(view(false));
    await start();
    await tick();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 4");
  });

  it("discards a changing pagination total before establishing the historical baseline", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => index + 2);
    const secondPage = Array.from({ length: 51 }, (_, index) => index + 102);
    fetchMock.mockResolvedValueOnce(response(payload(firstPage, { total: 150 })))
      .mockResolvedValueOnce(response(payload(secondPage, { total: 151, page: 2 })))
      .mockResolvedValueOnce(response(payload([2, 3])))
      .mockResolvedValueOnce(response(payload([2, 3, 4])));
    render(view(false));
    await start();
    await tick();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("A empresa da linha 4");
  });

  it("treats the same row in different imports as separate companies", async () => {
    fetchMock.mockImplementation(async (url) => {
      const body = payload([2]);
      if (url.includes(otherSubmissionId)) body.data.submissionId = otherSubmissionId;
      return response(body);
    });
    render(view());
    await start();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Acompanhar outra importação" })));
    expect(screen.getByText("Mais 1 confirmação na sequência")).toBeInTheDocument();
  });

  it("dismisses each company after six seconds while preserving the next confirmation", async () => {
    fetchMock.mockResolvedValue(response(payload([2, 3])));
    render(view());
    await start();
    await tick(5_999);
    expect(screen.getByRole("status")).toHaveTextContent("linha 2");
    await tick(1);
    expect(screen.getByRole("status")).toHaveTextContent("linha 3");
    await tick(6_000);
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
  });

  it("pauses dismissal for pointer and keyboard interaction", async () => {
    fetchMock.mockResolvedValue(response(payload([2])));
    render(view());
    await start();
    const notice = screen.getByRole("complementary", { name: "Confirmação de empresa processada" });
    const close = screen.getByRole("button", { name: "Fechar confirmação" });
    fireEvent.mouseEnter(notice);
    await tick(10_000);
    expect(notice).toBeInTheDocument();
    act(() => close.focus());
    fireEvent.mouseLeave(notice);
    await tick(10_000);
    expect(close).toHaveFocus();
    act(() => close.blur());
    await tick(6_000);
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
  });

  it.each([
    { data: { submissionId: otherSubmissionId }, meta: payload([2]).meta },
    payload([2], { available: false, total: null }),
    payload([2], { data: [{ source_row: null, processedAt }] }),
    payload([2], { data: [{ source_row: 2, processedAt: "invalid" }] }),
    payload([2], { page: 2 }),
    payload([2, 2]),
  ])("does not confirm a company from unavailable or invalid facts", async (body) => {
    fetchMock.mockResolvedValue(response(body));
    render(view());
    await start();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
  });

  it("keeps confirmations queued while the tab is hidden", async () => {
    fetchMock.mockResolvedValue(response(payload([2, 3])));
    render(view());
    await start();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(20_000);
    expect(screen.getByRole("status")).toHaveTextContent("linha 2");
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(6_000);
    expect(screen.getByRole("status")).toHaveTextContent("linha 3");
  });

  it("recovers a failed GET without fabricating a company or submitting again", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: { message: "private" } }, 503))
      .mockResolvedValueOnce(response(payload([2])));
    render(view());
    await start();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("linha 2");
    expect(document.body).not.toHaveTextContent("private");
  });

  it.each([401, 403])("removes confirmations and stops polling after HTTP %i", async (status) => {
    fetchMock.mockResolvedValueOnce(response(payload([2])))
      .mockResolvedValueOnce(response({}, status));
    render(view());
    await start();
    await tick();
    expect(screen.queryByText("Empresa processada")).not.toBeInTheDocument();
    await tick(20_000);
    await start();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does no work without read permission or while the tab is hidden", async () => {
    const rendered = render(view(true, false));
    await start();
    expect(fetchMock).not.toHaveBeenCalled();
    rendered.rerender(view());
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await start();
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents overlapping observations and aborts an unfinished request on unmount", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const rendered = render(view());
    await start();
    await tick(15_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    const signal = fetchMock.mock.calls[0]?.[1].signal;
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
