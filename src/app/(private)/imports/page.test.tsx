import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { permissionState } = vi.hoisted(() => ({
  permissionState: { canCreate: true, canRead: true },
}));

vi.mock("../../../components/auth/private-capabilities", () => ({
  usePrivateCapabilities: () => ({
    hasPermission: (permission: string) =>
      permission === "imports:create"
        ? permissionState.canCreate
        : permission === "imports:read" && permissionState.canRead,
  }),
}));

import ImportUploadPage from "./page";

const fetchMock =
  vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
const randomUUIDMock = vi.fn();

function csvFile(name = "empresas-sinteticas.csv"): File {
  return new File(["Empresa;Cidade\nEmpresa Sintetica;Sao Paulo\n"], name, {
    type: "text/csv",
  });
}

function nonCsvFile(): File {
  return new File(["conteudo sintetico"], "empresas.txt", {
    type: "text/plain",
  });
}

function apiResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function acknowledgedPayload(): unknown {
  return {
    data: {
      submissionId: "00000000-0000-4000-8000-000000000041",
      appStatus: "PRODUCER_ACKNOWLEDGED",
      statusFactSource: "workflow_acknowledgement",
      submittedAt: "2026-07-07T16:00:00.000Z",
      producerOutcome: "acknowledged",
      workflowAcknowledgement: {
        import_batch_id: "empresaqui_2026-07-07T16:00:00.000Z",
        row_count: 2,
        acknowledgedAt: "2026-07-07T16:01:00.000Z",
      },
      durableAcceptance: null,
    },
    meta: { result: "submitted" },
  };
}

function unknownPayload(): unknown {
  return {
    data: {
      submissionId: "00000000-0000-4000-8000-000000000042",
      appStatus: "ACCEPTANCE_UNKNOWN",
      statusFactSource: "ingress_unknown",
      submittedAt: "2026-07-07T16:00:00.000Z",
      producerOutcome: "unknown",
      workflowAcknowledgement: null,
      durableAcceptance: null,
    },
    meta: { result: "submitted" },
  };
}

function invalidSubmissionIdPayload(): unknown {
  return {
    data: {
      submissionId: "submission-secret-ui",
      appStatus: "PRODUCER_ACKNOWLEDGED",
      statusFactSource: "workflow_acknowledgement",
      submittedAt: "2026-07-07T16:00:00.000Z",
      producerOutcome: "acknowledged",
      workflowAcknowledgement: {
        import_batch_id: "empresaqui_2026-07-07T16:00:00.000Z",
        row_count: 2,
        acknowledgedAt: "2026-07-07T16:01:00.000Z",
      },
      durableAcceptance: null,
    },
  };
}

function uploadSelectedFile(file = csvFile()): void {
  fireEvent.change(screen.getByLabelText("Arquivo CSV"), {
    target: { files: [file] },
  });
}

function uploadMultipleFiles(): void {
  fireEvent.change(screen.getByLabelText("Arquivo CSV"), {
    target: { files: [csvFile("a.csv"), csvFile("b.csv")] },
  });
}

function submitUpload(): void {
  fireEvent.click(screen.getByRole("button", { name: "Enviar CSV" }));
}

function pageSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/(private)/imports/page.tsx"),
    "utf8",
  );
}

function navigationSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/(private)/private-navigation.tsx"),
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

function idempotencyHeader(init: RequestInit): string | null {
  const headers = init.headers;

  if (headers instanceof Headers) {
    return headers.get("Idempotency-Key");
  }

  if (Array.isArray(headers)) {
    return new Headers(headers).get("Idempotency-Key");
  }

  return new Headers(headers).get("Idempotency-Key");
}

describe("controlled import upload page", () => {
  beforeEach(() => {
    permissionState.canCreate = true;
    permissionState.canRead = true;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(apiResponse(acknowledgedPayload(), 202));
    randomUUIDMock.mockReset();
    randomUUIDMock
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
      .mockReturnValue("33333333-3333-4333-8333-333333333333");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: randomUUIDMock });
  });

  it("hides and reopens only the notice while retaining one exact-byte attempt", async () => {
    let complete: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolveResponse) => { complete = resolveResponse; }));
    render(<ImportUploadPage />);
    const selected = csvFile();
    uploadSelectedFile(selected);
    submitUpload();

    const panel = screen.getByRole("complementary", { name: "Aviso da importação" });
    expect(panel).toHaveTextContent("Enviando importação…");
    expect(panel).toHaveTextContent("não cancela o envio");
    fireEvent.click(within(panel).getByRole("button", { name: "Ocultar aviso" }));
    expect(screen.queryByRole("complementary", { name: "Aviso da importação" })).not.toBeInTheDocument();
    expect(screen.getByText("Enviando CSV...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reabrir aviso" })).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Arquivo CSV"), { target: { files: [csvFile("substituto.csv")] } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar CSV" }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((firstFetchCall()[1].body as FormData).get("arquivo_csv")).toBe(selected);
    expect(randomUUIDMock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Reabrir aviso" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ocultar aviso" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Ocultar aviso" }));
    await act(async () => { complete(apiResponse(acknowledgedPayload(), 202)); });
    expect(await screen.findByRole("heading", { name: "Envio recebido" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Aviso da importação" })).toHaveTextContent("recebimento confirmado");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(randomUUIDMock).toHaveBeenCalledOnce();
  });

  it("surfaces an unknown result after a hidden notice without unlocking the attempt", async () => {
    let fail: (reason: Error) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise((_resolveResponse, reject) => { fail = reject; }));
    render(<ImportUploadPage />);
    uploadSelectedFile();
    submitUpload();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar aviso" }));
    await act(async () => { fail(new Error("private synthetic network detail")); });

    expect(await screen.findByRole("heading", { name: "Resultado desconhecido" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Aviso da importação" })).toHaveTextContent("Registro do envio não confirmado");
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
    expect(document.body).not.toHaveTextContent("private synthetic network detail");
    expect(document.body).toHaveTextContent("Consulte as importações registradas antes");
  });

  it("protects links, sign-out, reload and browser back only while the page owns a pending request", async () => {
    const navigation = new EventTarget();
    const priorNavigation = Object.getOwnPropertyDescriptor(window, "navigation");
    Object.defineProperty(window, "navigation", { configurable: true, value: navigation });
    let complete: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolveResponse) => { complete = resolveResponse; }));
    render(<ImportUploadPage />);
    uploadSelectedFile();
    submitUpload();

    const linkEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByRole("link", { name: "Ver importações registradas" }).dispatchEvent(linkEvent);
    expect(linkEvent.defaultPrevented).toBe(true);
    expect(await screen.findByRole("alert")).toHaveTextContent("Aguarde o retorno antes de sair");
    const signOutForm = document.createElement("form");
    document.body.append(signOutForm);
    const signOutEvent = new Event("submit", { bubbles: true, cancelable: true });
    signOutForm.dispatchEvent(signOutEvent);
    expect(signOutEvent.defaultPrevented).toBe(true);
    const unloadEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);
    const navigateEvent = new Event("navigate", { cancelable: true });
    Object.defineProperty(navigateEvent, "destination", { value: { url: new URL("/inicio", window.location.href).href, sameDocument: true } });
    navigation.dispatchEvent(navigateEvent);
    expect(navigateEvent.defaultPrevented).toBe(true);
    const restore = vi.spyOn(window.history, "pushState");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(restore).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => { complete(apiResponse(unknownPayload(), 202)); });
    const finishedUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(finishedUnload);
    expect(finishedUnload.defaultPrevented).toBe(false);
    signOutForm.remove();
    restore.mockRestore();
    if (priorNavigation) Object.defineProperty(window, "navigation", priorNavigation);
    else Reflect.deleteProperty(window, "navigation");
  });

  it("exists only as an authorized private UI route", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "src/app/(private)/imports/page.tsx"),
      ),
    ).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/app/imports/page.tsx"))).toBe(
      false,
    );
    expect(navigationSource()).toContain("importsHref");
    expect(pageSource()).toContain('const uploadEndpoint = "/api/imports"');
  });

  it("renders the initial empty upload state", () => {
    render(<ImportUploadPage />);

    expect(
      screen.getByRole("heading", { name: "Enviar CSV EmpresaAqui" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum arquivo selecionado.")).toBeInTheDocument();
    expect(screen.getByText(/um único CSV da EmpresaAqui/i)).toBeInTheDocument();
    expect(screen.getAllByText(/até 10 MiB/i)).toHaveLength(1);
    const guidance = screen.getByRole("complementary", { name: "Orientação da importação" });
    expect(within(guidance).getAllByRole("listitem")).toHaveLength(3);
    expect(guidance).toHaveTextContent("Envie uma única vez e aguarde a confirmação nesta tela.");
    expect(guidance).toHaveTextContent("Consulte o histórico antes de qualquer novo envio.");
    expect(screen.getByLabelText("Arquivo CSV")).toHaveAttribute(
      "accept",
      ".csv,text/csv",
    );
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
  });

  it("keeps the server-rendered file chooser disabled until its client change handler is ready", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ImportUploadPage />);

    expect(container.querySelector('input[type="file"]')).toBeDisabled();
    expect(container).toHaveTextContent("Preparando formulário…");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows registered imports instead of an unusable form to a read-only actor", () => {
    permissionState.canCreate = false;
    render(<ImportUploadPage />);

    expect(
      screen.getByRole("heading", { name: "Importações registradas" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Arquivo CSV")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Consultar importações" })).toHaveAttribute(
      "href",
      "/imports/batches",
    );
  });

  it("does not offer an import or history action without either permission", () => {
    permissionState.canCreate = false;
    permissionState.canRead = false;
    render(<ImportUploadPage />);

    expect(screen.getByRole("heading", { name: "Importação sem permissão" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Arquivo CSV")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Consultar importações" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not promise history access to a create-only actor", async () => {
    permissionState.canRead = false;
    fetchMock.mockResolvedValueOnce(apiResponse(unknownPayload(), 202));
    render(<ImportUploadPage />);
    uploadSelectedFile();
    submitUpload();

    expect(await screen.findByRole("heading", { name: "Resultado desconhecido" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /importações registradas|Acompanhar importação/ })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("Solicite ao responsável o acesso ao histórico");
    expect(screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ })).not.toBeInTheDocument();
  });

  it.each([401, 403])("preserves the selected attempt after HTTP %i without offering another upload", async (responseStatus) => {
    const file = csvFile("sessao-ou-permissao.csv");
    fetchMock.mockResolvedValueOnce(apiResponse({ error: { message: "synthetic auth detail" } }, responseStatus));
    render(<ImportUploadPage />);
    uploadSelectedFile(file);
    submitUpload();

    expect(await screen.findByRole("heading", { name: responseStatus === 401 ? "Sua sessão expirou" : "Importação sem permissão" })).toBeInTheDocument();
    const login = screen.queryByRole("link", { name: "Entrar novamente" });
    if (responseStatus === 401) expect(login).toHaveAttribute("href", "/login");
    else expect(login).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Arquivo CSV")).toBeDisabled();
    expect(document.body).toHaveTextContent("Arquivo selecionado: sessao-ou-permissao.csv");
    fireEvent.submit(screen.getByRole("button", { name: "Enviar CSV" }).closest("form")!);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    expect(idempotencyHeader(firstFetchCall()[1])).toBe("11111111-1111-4111-8111-111111111111");
    expect(document.body).not.toHaveTextContent("synthetic auth detail");
  });

  it.each([
    ["empty", "O arquivo está vazio"],
    ["oversized", "O arquivo ultrapassa o limite"],
    ["unsupported_type", "O tipo do arquivo não é aceito"],
    ["invalid_filename", "O arquivo precisa estar no formato CSV"],
  ] as const)("rejects %s file metadata before sending the CSV", (kind, expectedCopy) => {
    const file = new File([kind === "empty" ? "" : "Empresa\n"], kind === "invalid_filename" ? ".csv" : "revisar.csv", {
      type: kind === "unsupported_type" ? "application/pdf" : "text/csv",
    });
    if (kind === "oversized") Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 + 1 });
    render(<ImportUploadPage />);
    uploadSelectedFile(file);

    expect(screen.getByRole("alert")).toHaveTextContent(expectedCopy);
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["text/csv", "application/csv", "application/vnd.ms-excel"])("accepts the approved %s file type without reading its bytes", (type) => {
    render(<ImportUploadPage />);
    uploadSelectedFile(new File(["Empresa\n"], "lista.CSV", { type }));

    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a valid selected CSV before upload", () => {
    render(<ImportUploadPage />);

    uploadSelectedFile(csvFile("lista-empresaqui.csv"));

    expect(
      screen.getByText(/Arquivo selecionado: lista-empresaqui\.csv/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks multiple files without calling the app API", () => {
    render(<ImportUploadPage />);

    expect(screen.getByLabelText("Arquivo CSV")).not.toHaveAttribute(
      "multiple",
    );
    uploadMultipleFiles();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Selecione apenas um arquivo CSV por envio.",
    );
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks a non-CSV file without reading or sending it", () => {
    render(<ImportUploadPage />);

    uploadSelectedFile(nonCsvFile());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "O arquivo precisa estar no formato CSV.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls only the app import endpoint from the browser", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(firstFetchCall()[0]).toBe("/api/imports");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(
      /webhook|192\.168\.0\.20|n8n/i,
    );
  });

  it("places the received result next to the form before the guidance", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    const result = (await screen.findByRole("heading", { name: "Envio recebido" })).closest("section")!;
    const form = screen.getByLabelText("Arquivo CSV").closest("form")!;
    const guidance = screen.getByRole("complementary", { name: "Orientação da importação" });
    expect(result.parentElement).toBe(form.parentElement);
    expect(result.compareDocumentPosition(guidance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    [202, "Envio recebido"],
    [503, "Resultado desconhecido"],
  ] as const)("brings the terminal HTTP %i result into view without animation", async (responseStatus, heading) => {
    const scrollIntoViewMock = vi.fn();
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    try {
      fetchMock.mockResolvedValueOnce(apiResponse(acknowledgedPayload(), responseStatus));
      render(<ImportUploadPage />);
      uploadSelectedFile();
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
      submitUpload();

      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalledOnce());
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      if (originalScroll) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("sends POST FormData with arquivo_csv and Idempotency-Key", async () => {
    const file = csvFile("prospecta.csv");
    render(<ImportUploadPage />);

    uploadSelectedFile(file);
    submitUpload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = firstFetchCall();
    const body = init.body;

    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("arquivo_csv")).toBe(file);
    expect(idempotencyHeader(init)).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("falls back when crypto.randomUUID is unavailable", async () => {
    const getRandomValuesMock = vi.fn((bytes: Uint8Array) => {
      bytes.set([
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
        0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
      ]);
      return bytes;
    });
    vi.stubGlobal("crypto", {
      getRandomValues: getRandomValuesMock,
    });
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(getRandomValuesMock).toHaveBeenCalledOnce();
    expect(randomUUIDMock).not.toHaveBeenCalled();
    expect(idempotencyHeader(firstFetchCall()[1])).toBe(
      "00112233-4455-4677-8899-aabbccddeeff",
    );
  });

  it("keeps the idempotency key stable during the same upload attempt", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile(csvFile("primeiro.csv"));
    uploadSelectedFile(csvFile("segundo.csv"));
    submitUpload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    expect(idempotencyHeader(firstFetchCall()[1])).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("uses a new idempotency key only after an explicit new attempt", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile(csvFile("primeiro.csv"));
    submitUpload();
    expect(
      await screen.findByRole("heading", { name: "Envio recebido" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importar outro arquivo" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    uploadSelectedFile(csvFile("segundo.csv"));
    submitUpload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(idempotencyHeader(fetchMock.mock.calls[0][1])).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(idempotencyHeader(fetchMock.mock.calls[1][1])).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("disables relevant controls while the upload is loading", async () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    const loadingStatus = await screen.findByText("Enviando CSV...");
    expect(loadingStatus).toHaveAttribute("role", "status");
    expect(screen.getByLabelText("Arquivo CSV")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  it("submits once when two submit events arrive before the loading render", () => {
    render(<ImportUploadPage />);
    uploadSelectedFile();
    const form = screen.getByRole("button", { name: "Enviar CSV" }).closest("form")!;

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
  });

  it("shows safe acknowledged copy for a 202 acknowledgement", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(
      await screen.findByRole("heading", { name: "Envio recebido" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "O envio foi registrado e o recebimento foi confirmado.",
    );
    expect(document.body).not.toHaveTextContent("empresaqui_2026");
    expect(document.body).not.toHaveTextContent("submission-secret-ui");
    expect(document.body).not.toHaveTextContent(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(document.body).not.toHaveTextContent(/leads importados/i);
  });

  it("links an acknowledged submission to its private batch detail without displaying its identifier", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    const link = await screen.findByRole("link", {
      name: "Acompanhar importação",
    });

    expect(link).toHaveAttribute(
      "href",
      "/imports/batches/00000000-0000-4000-8000-000000000041",
    );
    expect(document.body).not.toHaveTextContent(
      "00000000-0000-4000-8000-000000000041",
    );
  });

  it("shows safe unknown copy for a 202 unknown outcome without an automatic new call", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(unknownPayload(), 202));
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(
      await screen.findByRole("heading", { name: "Resultado desconhecido" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "O envio foi registrado, mas o recebimento ainda não foi confirmado",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Acompanhar importação" }),
    ).toHaveAttribute(
      "href",
      "/imports/batches/00000000-0000-4000-8000-000000000042",
    );
  });

  it("treats transport failure after POST starts as unknown and preserves the attempt", async () => {
    const file = csvFile("transporte-incerto.csv");
    fetchMock.mockRejectedValueOnce(new TypeError("synthetic network failure"));
    render(<ImportUploadPage />);

    uploadSelectedFile(file);
    submitUpload();

    expect(
      await screen.findByRole("heading", { name: "Resultado desconhecido" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Não foi possível confirmar o registro deste envio",
    );
    expect(document.body).toHaveTextContent(
      "Arquivo selecionado: transporte-incerto.csv",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(idempotencyHeader(firstFetchCall()[1])).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Consultar importações registradas" }),
    ).toHaveAttribute("href", "/imports/batches");
  });

  it("keeps an invalid submission identifier unknown without offering another upload", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(invalidSubmissionIdPayload(), 202),
    );
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(
      await screen.findByRole("heading", { name: "Resultado desconhecido" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Acompanhar importação" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Consultar importações registradas" })).toHaveAttribute("href", "/imports/batches");
    expect(screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Arquivo CSV")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(document.body).not.toHaveTextContent("submission-secret-ui");
  });

  it("keeps an array acknowledgement unknown even when its submission identifier is valid", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({
      data: {
        submissionId: "00000000-0000-4000-8000-000000000041",
        producerOutcome: "acknowledged",
        workflowAcknowledgement: [],
        durableAcceptance: null,
      },
    }, 202));
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(await screen.findByRole("heading", { name: "Resultado desconhecido" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Acompanhar importação" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    {},
    { import_batch_id: "", row_count: 2, acknowledgedAt: "2026-07-07T16:01:00.000Z" },
    { import_batch_id: "batch-synthetic", row_count: -1, acknowledgedAt: "2026-07-07T16:01:00.000Z" },
    { import_batch_id: "batch-synthetic", row_count: 2, acknowledgedAt: "invalid" },
  ])("keeps an incomplete acknowledgement unknown without enabling resubmission", async (workflowAcknowledgement) => {
    fetchMock.mockResolvedValueOnce(apiResponse({ data: {
      submissionId: "00000000-0000-4000-8000-000000000041",
      producerOutcome: "acknowledged",
      workflowAcknowledgement,
      durableAcceptance: null,
    } }, 202));
    render(<ImportUploadPage />);
    uploadSelectedFile();
    submitUpload();
    expect(await screen.findByRole("heading", { name: "Resultado desconhecido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts the legacy workflow acknowledgement count of zero without inferring results", async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ data: {
      submissionId: "00000000-0000-4000-8000-000000000041",
      producerOutcome: "acknowledged",
      workflowAcknowledgement: { import_batch_id: "batch-synthetic", row_count: 0, acknowledgedAt: "2026-07-07T16:01:00.000Z" },
      durableAcceptance: null,
    } }, 202));
    render(<ImportUploadPage />);
    uploadSelectedFile();
    submitUpload();
    expect(await screen.findByRole("heading", { name: "Envio recebido" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Concluído|0 resultados/);
  });

  it("maps a 409 conflict to safe business copy", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(
        {
          error: {
            code: "IMPORT_IDEMPOTENCY_CONFLICT",
            message: "raw conflicting key should stay hidden",
          },
        },
        409,
      ),
    );
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(
      await screen.findByRole("heading", { name: "Conflito de envio" }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("raw conflicting key");
  });

  it("maps validation, access, and unknown failures without leaking internals", async () => {
    const unsafePayload = {
      error: {
        code: "UNSAFE",
        message:
          "SELECT secret FROM table; raw,csv,content; stack; http://192.168.0.20:30098/webhook/empresaqui/import",
        details: ["n8n", "sql", "token"],
      },
    };

    for (const [status, heading] of [
      [400, "Revise o CSV"],
      [403, "Importação sem permissão"],
      [500, "Resultado desconhecido"],
    ] as const) {
      fetchMock.mockResolvedValueOnce(apiResponse(unsafePayload, status));
      render(<ImportUploadPage />);

      uploadSelectedFile();
      submitUpload();

      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      for (const fragment of [
        "SELECT",
        "raw,csv,content",
        "stack",
        "192.168.0.20",
        "webhook",
        "n8n",
        "token",
      ]) {
        expect(document.body).not.toHaveTextContent(fragment);
      }
      cleanup();
    }
  });

  it.each([500, 502, 503, 504])(
    "preserves the attempt after an uncertain server HTTP %i response",
    async (responseStatus) => {
      const file = csvFile("servidor-incerto.csv");
      fetchMock.mockResolvedValueOnce(
        apiResponse({ error: { message: "synthetic internal failure" } }, responseStatus),
      );
      render(<ImportUploadPage />);

      uploadSelectedFile(file);
      submitUpload();

      expect(
        await screen.findByRole("heading", { name: "Resultado desconhecido" }),
      ).toBeInTheDocument();
      expect(document.body).toHaveTextContent("Arquivo selecionado: servidor-incerto.csv");
      expect(screen.getByLabelText("Arquivo CSV")).toBeDisabled();
      const submitButton = screen.getByRole("button", { name: "Enviar CSV" });
      expect(submitButton).toBeDisabled();
      expect(screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Consultar importações registradas" })).toHaveAttribute("href", "/imports/batches");
      expect(idempotencyHeader(firstFetchCall()[1])).toBe("11111111-1111-4111-8111-111111111111");
      expect((firstFetchCall()[1].body as FormData).get("arquivo_csv")).toBe(file);
      fireEvent.submit(submitButton.closest("form")!);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(randomUUIDMock).toHaveBeenCalledTimes(1);
      expect(document.body).not.toHaveTextContent("synthetic internal failure");
    },
  );

  it.each([200, 201, 202, 204])(
    "preserves an unknown attempt after an unrecognized successful HTTP %i response",
    async (responseStatus) => {
      const file = csvFile("confirmacao-incerta.csv");
      fetchMock.mockResolvedValueOnce(
        responseStatus === 204
          ? new Response(null, { status: responseStatus })
          : apiResponse(
              {
                data: {
                  producerOutcome: "processed",
                  completion: "complete",
                  internal: "stack sql secret",
                },
              },
              responseStatus,
            ),
      );
      render(<ImportUploadPage />);

      uploadSelectedFile(file);
      submitUpload();

      expect(
        await screen.findByRole("heading", { name: "Resultado desconhecido" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Arquivo selecionado: confirmacao-incerta.csv/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Arquivo CSV")).toBeDisabled();
      const submitButton = screen.getByRole("button", { name: "Enviar CSV" });
      expect(submitButton).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Consultar importações registradas" }),
      ).toHaveAttribute("href", "/imports/batches");
      expect(idempotencyHeader(firstFetchCall()[1])).toBe(
        "11111111-1111-4111-8111-111111111111",
      );
      expect((firstFetchCall()[1].body as FormData).get("arquivo_csv")).toBe(file);
      fireEvent.submit(submitButton.closest("form")!);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(randomUUIDMock).toHaveBeenCalledTimes(1);
      expect(document.body).not.toHaveTextContent("processed");
      expect(document.body).not.toHaveTextContent("completion");
    },
  );

  it("preserves an unknown attempt after invalid JSON in a 202 response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("synthetic invalid json", { status: 202 }),
    );
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(
      await screen.findByRole("heading", { name: "Resultado desconhecido" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Nova tentativa|Importar outro arquivo/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Consultar importações registradas" }),
    ).toHaveAttribute("href", "/imports/batches");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(randomUUIDMock).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent("synthetic invalid json");
  });

  it("starts a clean explicit attempt from terminal states", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile(csvFile("primeiro.csv"));
    submitUpload();
    expect(
      await screen.findByRole("heading", { name: "Envio recebido" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Importar outro arquivo" }));

    expect(screen.getByText("Nenhum arquivo selecionado.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Envio recebido" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
  });

  it("keeps the import UI source free of forbidden browser behavior", () => {
    const source = [pageSource(), navigationSource()].join("\n");

    expect(source).toContain('fetch(uploadEndpoint');
    expect(source).toContain('method: "POST"');
    expect(source).not.toMatch(
      /N8N_IMPORT_URL|webhook|192\.168\.0\.20|n8n|HMAC|signature|canonical|timestamp|nonce|replay|retry|reprocess/i,
    );
    expect(source).not.toMatch(
      /method:\s*["']GET["']|cnpj|finalScore|score|qualifica|file\.text|arrayBuffer|FileReader|console\./i,
    );
  });
});
