import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: {
    N8N_IMPORT_URL:
      "http://internal-n8n.invalid/webhook/empresaqui/import",
    IMPORT_PRODUCER_TIMEOUT_MS: 1_000,
    N8N_HMAC_KEY_ID: undefined as string | undefined,
    N8N_HMAC_SECRET: undefined as string | undefined,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({
  getServerEnv: () => mocks.environment,
}));

import {
  submitToN8nIngress,
  type N8nIngressFetch,
} from "./ingress-client";
import type { ValidatedUploadFile } from "./upload-file";

const encoder = new TextEncoder();
const ingressUrl =
  "http://internal-n8n.invalid/webhook/empresaqui/import";

const validAcknowledgement = {
  accepted: true,
  message: "Arquivo recebido para processamento.",
  import_batch_id: "empresaqui_2026-07-06T12:00:00.000Z",
  row_count: 2,
  source: "EmpresaAqui",
} as const;

function validatedFile(
  overrides: Partial<ValidatedUploadFile> = {},
): ValidatedUploadFile {
  const content = encoder.encode(
    "CNPJ;Razão\n00000000000000;Empresa Sintética\n",
  );

  return {
    bytes: overrides.bytes ?? content,
    filename: overrides.filename ?? "empresas-sinteticas.csv",
    mediaType: overrides.mediaType ?? "text/csv",
    sha256:
      overrides.sha256 ??
      "7d83d0bc84ca0d8f77dcce3a882fc43b65d3ed37ab6f21f71cfb84702bb18e9f",
    sizeBytes: overrides.sizeBytes ?? content.byteLength,
  };
}

function configureEnvironment(
  overrides: Partial<typeof mocks.environment> = {},
): void {
  mocks.environment = {
    N8N_IMPORT_URL: overrides.N8N_IMPORT_URL ?? ingressUrl,
    IMPORT_PRODUCER_TIMEOUT_MS:
      overrides.IMPORT_PRODUCER_TIMEOUT_MS ?? 1_000,
    N8N_HMAC_KEY_ID: overrides.N8N_HMAC_KEY_ID,
    N8N_HMAC_SECRET: overrides.N8N_HMAC_SECRET,
  };
}

function response(
  payload: unknown = validAcknowledgement,
  status = 202,
): Pick<Response, "status" | "json"> {
  return {
    status,
    json: vi.fn(async () => payload),
  };
}

function fetchReturning(
  producerResponse: Pick<Response, "status" | "json"> = response(),
): ReturnType<typeof vi.fn<N8nIngressFetch>> {
  return vi.fn<N8nIngressFetch>(
    async () => producerResponse,
  );
}

async function submit(
  fetch: N8nIngressFetch,
  file: ValidatedUploadFile = validatedFile(),
) {
  return submitToN8nIngress(file, {
    fetch,
  });
}

function capturedFormData(
  fetch: ReturnType<typeof vi.fn<N8nIngressFetch>>,
): FormData {
  const init = fetch.mock.calls[0]?.[1];

  expect(init?.body).toBeInstanceOf(FormData);
  return init?.body as FormData;
}

afterEach(() => {
  configureEnvironment();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("submitToN8nIngress", () => {
  it("posts once to the validated server-only ingress URL", async () => {
    const fetch = fetchReturning();

    await submit(fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      ingressUrl,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends only the arquivo_csv multipart field", async () => {
    const fetch = fetchReturning();

    await submit(fetch);

    expect([...capturedFormData(fetch).keys()]).toEqual([
      "arquivo_csv",
    ]);
  });

  it("preserves the exact validated bytes", async () => {
    const exactBytes = new Uint8Array([
      0xef, 0xbb, 0xbf, 0x43, 0x4e, 0x50, 0x4a, 0x0d, 0x0a, 0xc3, 0xa7,
    ]);
    const fetch = fetchReturning();

    await submit(fetch, validatedFile({ bytes: exactBytes }));

    const part = capturedFormData(fetch).get("arquivo_csv");
    expect(part).toBeInstanceOf(File);
    await expect(
      (part as File).arrayBuffer().then((value) => [
        ...new Uint8Array(value),
      ]),
    ).resolves.toEqual([...exactBytes]);
  });

  it("preserves the validated filename", async () => {
    const fetch = fetchReturning();

    await submit(
      fetch,
      validatedFile({ filename: "EMPRESAS-SINTÉTICAS.CSV" }),
    );

    const part = capturedFormData(fetch).get("arquivo_csv");
    expect((part as File).name).toBe("EMPRESAS-SINTÉTICAS.CSV");
  });

  it("preserves the validated media type", async () => {
    const fetch = fetchReturning();

    await submit(
      fetch,
      validatedFile({ mediaType: "application/vnd.ms-excel" }),
    );

    const part = capturedFormData(fetch).get("arquivo_csv");
    expect((part as File).type).toBe("application/vnd.ms-excel");
  });

  it("does not set Content-Type or any other request header", async () => {
    const fetch = fetchReturning();

    await submit(fetch);

    const init = fetch.mock.calls[0]?.[1];
    expect(init).not.toHaveProperty("headers");
  });

  it("emits zero authentication headers even when deferred placeholders exist", async () => {
    const fetch = fetchReturning();
    configureEnvironment({
      N8N_HMAC_KEY_ID: "unused-key",
      N8N_HMAC_SECRET: "unused-secret-unused-secret-unused-secret",
    });

    await submit(fetch);

    const init = fetch.mock.calls[0]?.[1];
    expect(init).not.toHaveProperty("headers");
  });

  it("returns the exact validated acknowledgement fields", async () => {
    await expect(submit(fetchReturning())).resolves.toEqual({
      kind: "acknowledged",
      acknowledgement: validAcknowledgement,
    });
  });

  it("does not promote an acknowledgement to durable acceptance", async () => {
    const result = await submit(fetchReturning());

    expect(result.kind).toBe("acknowledged");
    expect(result).not.toHaveProperty("acceptedAt");
    expect(result).not.toHaveProperty("producerBatchId");
    expect(result).not.toHaveProperty("schemaVersion");
    expect(result).not.toHaveProperty("rowCountAccepted");
    expect(result).not.toHaveProperty("durableAcceptance");
  });

  it.each([200, 201, 400, 500])(
    "maps non-202 status %s to unknown without reading its body",
    async (status) => {
      const producerResponse = response(
        { privateProducerBody: "must-not-leak" },
        status,
      );

      const result = await submit(fetchReturning(producerResponse));

      expect(result).toEqual({ kind: "unknown" });
      expect(producerResponse.json).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("must-not-leak");
    },
  );

  it("rejects accepted false", async () => {
    await expect(
      submit(
        fetchReturning(
          response({ ...validAcknowledgement, accepted: false }),
        ),
      ),
    ).resolves.toEqual({ kind: "unknown" });
  });

  it.each([
    "accepted",
    "message",
    "import_batch_id",
    "row_count",
    "source",
  ] as const)("rejects acknowledgement missing %s", async (field) => {
    const payload: Record<string, unknown> = {
      ...validAcknowledgement,
    };
    delete payload[field];

    await expect(
      submit(fetchReturning(response(payload))),
    ).resolves.toEqual({ kind: "unknown" });
  });

  it("rejects acknowledgement with an extra field", async () => {
    await expect(
      submit(
        fetchReturning(
          response({
            ...validAcknowledgement,
            acceptedAt: "2026-07-06T12:00:00.000Z",
          }),
        ),
      ),
    ).resolves.toEqual({ kind: "unknown" });
  });

  it.each(["", "   "])(
    "rejects empty import_batch_id %j",
    async (import_batch_id) => {
      await expect(
        submit(
          fetchReturning(
            response({ ...validAcknowledgement, import_batch_id }),
          ),
        ),
      ).resolves.toEqual({ kind: "unknown" });
    },
  );

  it.each([-1, 1.5, "2", null])(
    "rejects invalid row_count %j",
    async (row_count) => {
      await expect(
        submit(
          fetchReturning(
            response({ ...validAcknowledgement, row_count }),
          ),
        ),
      ).resolves.toEqual({ kind: "unknown" });
    },
  );

  it("rejects a row_count outside the safe integer range", async () => {
    await expect(
      submit(
        fetchReturning(
          response({
            ...validAcknowledgement,
            row_count: Number.MAX_SAFE_INTEGER + 1,
          }),
        ),
      ),
    ).resolves.toEqual({ kind: "unknown" });
  });

  it.each([
    ["message", 1],
    ["import_batch_id", 1],
    ["source", false],
  ] as const)("rejects invalid type for %s", async (field, value) => {
    await expect(
      submit(
        fetchReturning(
          response({ ...validAcknowledgement, [field]: value }),
        ),
      ),
    ).resolves.toEqual({ kind: "unknown" });
  });

  it.each([null, [], "acknowledged", 202])(
    "rejects non-object acknowledgement %j",
    async (payload) => {
      await expect(
        submit(fetchReturning(response(payload))),
      ).resolves.toEqual({ kind: "unknown" });
    },
  );

  it("maps invalid JSON to unknown", async () => {
    const invalidJsonResponse = {
      status: 202,
      json: vi.fn(async () => {
        throw new SyntaxError("producer body details");
      }),
    };

    const result = await submit(fetchReturning(invalidJsonResponse));

    expect(result).toEqual({ kind: "unknown" });
    expect(JSON.stringify(result)).not.toContain("producer body details");
  });

  it("maps a network error to unknown without exposing its details", async () => {
    const fetch = vi.fn<N8nIngressFetch>(async () => {
      throw new Error("private producer network details");
    });

    const result = await submit(fetch);

    expect(result).toEqual({ kind: "unknown" });
    expect(JSON.stringify(result)).not.toContain(
      "private producer network details",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts on timeout and returns unknown", async () => {
    vi.useFakeTimers();
    configureEnvironment({ IMPORT_PRODUCER_TIMEOUT_MS: 250 });
    let capturedSignal: AbortSignal | undefined;
    const fetch = vi.fn<N8nIngressFetch>(
      async (_url, init) =>
        new Promise((_, reject) => {
          capturedSignal = init.signal ?? undefined;
          capturedSignal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const pendingResult = submit(fetch);
    await vi.advanceTimersByTimeAsync(250);

    await expect(pendingResult).resolves.toEqual({ kind: "unknown" });
    expect(capturedSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns unknown on timeout even if injected fetch ignores abort", async () => {
    vi.useFakeTimers();
    configureEnvironment({ IMPORT_PRODUCER_TIMEOUT_MS: 100 });
    const fetch = vi.fn<N8nIngressFetch>(
      async () => new Promise(() => undefined),
    );

    const pendingResult = submit(fetch);
    await vi.advanceTimersByTimeAsync(100);

    await expect(pendingResult).resolves.toEqual({ kind: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a malformed acknowledgement", async () => {
    const fetch = fetchReturning(response({ accepted: true }));

    await expect(submit(fetch)).resolves.toEqual({ kind: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not log producer failures or response bodies", async () => {
    const consoleError = vi.spyOn(console, "error");
    const consoleWarn = vi.spyOn(console, "warn");
    const consoleLog = vi.spyOn(console, "log");

    await submit(
      fetchReturning(
        response({ producerSecret: "private-response-body" }),
      ),
    );

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("is server-only and contains no authentication or retry implementation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/imports/ingress-client.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
    expect(source).not.toMatch(
      /HMAC|signature|canonical|key.?id|timestamp|nonce|authorization|retry|console\./i,
    );
  });
});
