import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    meta: { result: "submitted" },
  };
}

function unknownPayload(): unknown {
  return {
    data: {
      submissionId: "submission-unknown-ui",
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

  it("exists only as an authorized private UI route", () => {
    expect(
      existsSync(
        resolve(process.cwd(), "src/app/(private)/imports/page.tsx"),
      ),
    ).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/app/imports/page.tsx"))).toBe(
      false,
    );
    expect(navigationSource()).toContain('href: "/imports"');
    expect(pageSource()).toContain('const uploadEndpoint = "/api/imports"');
  });

  it("renders the initial empty upload state", () => {
    render(<ImportUploadPage />);

    expect(
      screen.getByRole("heading", { name: "Enviar CSV EmpresaAqui" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum arquivo selecionado.")).toBeInTheDocument();
    expect(screen.getByText(/um único CSV da EmpresaAqui/i)).toBeInTheDocument();
    expect(screen.getAllByText(/até 10 MiB/i)).toHaveLength(2);
    expect(screen.getByLabelText("Arquivo CSV")).toHaveAttribute(
      "accept",
      ".csv,text/csv",
    );
    expect(screen.getByRole("button", { name: "Enviar CSV" })).toBeDisabled();
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
      await screen.findByRole("heading", { name: "Recebido pelo fluxo" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nova tentativa" }));
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

  it("shows safe acknowledged copy for a 202 acknowledgement", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(
      await screen.findByRole("heading", { name: "Recebido pelo fluxo" }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "A tentativa foi registrada e o fluxo retornou confirmação de recebimento.",
    );
    expect(document.body).not.toHaveTextContent("empresaqui_2026");
    expect(document.body).not.toHaveTextContent("submission-secret-ui");
    expect(document.body).not.toHaveTextContent(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(document.body).not.toHaveTextContent(/leads importados/i);
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
      "A tentativa foi registrada, mas a confirmação do fluxo não ficou disponível",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Nova tentativa" })).toBeEnabled();
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

  it("maps validation, access, and generic failures without leaking internals", async () => {
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
      [403, "Envio não autorizado"],
      [500, "Não foi possível enviar agora"],
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

  it("fails safely when a 202 response envelope is not recognized", async () => {
    fetchMock.mockResolvedValueOnce(
      apiResponse(
        {
          data: {
            producerOutcome: "processed",
            completion: "complete",
            internal: "stack sql secret",
          },
        },
        202,
      ),
    );
    render(<ImportUploadPage />);

    uploadSelectedFile();
    submitUpload();

    expect(
      await screen.findByRole("heading", {
        name: "Não foi possível enviar agora",
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("processed");
    expect(document.body).not.toHaveTextContent("completion");
  });

  it("starts a clean explicit attempt from terminal states", async () => {
    render(<ImportUploadPage />);

    uploadSelectedFile(csvFile("primeiro.csv"));
    submitUpload();
    expect(
      await screen.findByRole("heading", { name: "Recebido pelo fluxo" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nova tentativa" }));

    expect(screen.getByText("Nenhum arquivo selecionado.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Recebido pelo fluxo" }),
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
