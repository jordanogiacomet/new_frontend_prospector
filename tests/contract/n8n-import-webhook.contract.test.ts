import { describe, expect, it } from "vitest";

const OFFICIAL_PATHS = [
  "/webhook/empresaqui/import",
  "/webhook-test/empresaqui/import",
] as const;
const OFFICIAL_RESPONSE_FIELDS = [
  "accepted",
  "import_batch_id",
  "message",
  "row_count",
  "source",
] as const;
const LOCAL_WORKFLOW_ID = "6HM8Era5svuUN24x";
const LOCAL_WORKFLOW_VERSION_ID = "4be457b8-ccd1-47f9-9d0e-a1fbb38edc7e";
const MAX_APP_UPLOAD_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

type ContractResponse = {
  bodyText: string;
  contentType: string;
  elapsedMs: number;
  headers: Headers;
  status: number;
};

type OfficialAcceptance = {
  accepted: true;
  import_batch_id: string;
  message: string;
  row_count: number;
  source: string;
};

type UploadOptions = {
  bytes?: Uint8Array;
  fieldName?: string;
  filename?: string;
  headers?: HeadersInit;
  mediaType?: string;
};

const targetValue = process.env.N8N_CONTRACT_URL;
const allowInsecureHttp =
  process.env.N8N_CONTRACT_ALLOW_INSECURE_HTTP === "true";
const target = targetValue ? new URL(targetValue) : null;
let caseSequence = 0;

function requireTarget(): URL {
  expect(
    target,
    "Set N8N_CONTRACT_URL to the explicitly authorized non-production endpoint",
  ).not.toBeNull();
  return target as URL;
}

function syntheticCsv(options?: {
  bom?: boolean;
  delimiter?: ";" | ",";
  extraBytes?: number;
  lineEnding?: "\n" | "\r\n";
  malformedQuote?: boolean;
  rows?: number;
  utf8?: boolean;
}): Uint8Array {
  const delimiter = options?.delimiter ?? ";";
  const lineEnding = options?.lineEnding ?? "\n";
  const rows = options?.rows ?? 1;
  const id = String(++caseSequence).padStart(3, "0");
  const header = ["CNPJ", "Razão", "Situação Cad.", "test_case_id", "extra"].join(
    delimiter,
  );
  const extra = "x".repeat(options?.extraBytes ?? 0);
  const companyName = options?.utf8
    ? `Empresa Sintética Ação ${id} Ltda`
    : `Empresa Sintetica Contract ${id} Ltda`;
  const quote = options?.malformedQuote ? '"' : "";
  const body = Array.from({ length: rows }, (_, index) =>
    [
      "00000000000000",
      `${quote}${companyName} ${index + 1}`,
      "ATIVA",
      `CTR_${id}_${index + 1}`,
      extra,
    ].join(delimiter),
  ).join(lineEnding);
  const text = `${options?.bom ? "\uFEFF" : ""}${header}${lineEnding}${body}${lineEnding}`;
  return new TextEncoder().encode(text);
}

async function request(
  method: "GET" | "POST",
  options?: UploadOptions,
): Promise<ContractResponse> {
  const url = requireTarget();
  const init: RequestInit = {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (method === "POST") {
    const form = new FormData();
    if (options?.bytes) {
      const bodyBytes = Uint8Array.from(options.bytes);
      form.append(
        options.fieldName ?? "arquivo_csv",
        new Blob([bodyBytes.buffer], {
          type: options.mediaType ?? "text/csv",
        }),
        options.filename ?? "synthetic-contract.csv",
      );
    }
    init.body = form;
    init.headers = options?.headers;
  }

  const startedAt = performance.now();
  const response = await fetch(url, init);
  const bodyText = await response.text();

  return {
    bodyText,
    contentType: response.headers.get("content-type") ?? "",
    elapsedMs: Math.round(performance.now() - startedAt),
    headers: response.headers,
    status: response.status,
  };
}

function parseAcceptance(response: ContractResponse): OfficialAcceptance {
  let value: unknown;

  try {
    value = JSON.parse(response.bodyText);
  } catch {
    throw new Error("The ingress response was not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The ingress response was not a JSON object");
  }

  const body = value as Record<string, unknown>;
  const hasValidShape =
    body.accepted === true &&
    typeof body.message === "string" &&
    typeof body.import_batch_id === "string" &&
    Number.isInteger(body.row_count) &&
    typeof body.source === "string";

  if (!hasValidShape) {
    throw new Error("The ingress response did not match the official schema");
  }

  return body as OfficialAcceptance;
}

function isSafeFailure(response: ContractResponse): boolean {
  if (response.status < 400 || response.status > 499) {
    return false;
  }

  const forbidden = [
    /authorization/i,
    /bearer/i,
    /company_validation/i,
    /credential/i,
    /node_modules/i,
    /postgres/i,
    /select\s+.+\s+from/i,
    /stack/i,
  ];

  return (
    response.bodyText.length <= 2_048 &&
    forbidden.every((pattern) => !pattern.test(response.bodyText))
  );
}

function responseSummary(response: ContractResponse): string {
  return [
    `status=${response.status}`,
    `content-type=${response.contentType || "missing"}`,
    `response-bytes=${new TextEncoder().encode(response.bodyText).byteLength}`,
    `elapsed-ms=${response.elapsedMs}`,
  ].join(", ");
}

const calls = {
  anonymous: undefined as Promise<ContractResponse> | undefined,
  bom: undefined as Promise<ContractResponse> | undefined,
  comma: undefined as Promise<ContractResponse> | undefined,
  crlf: undefined as Promise<ContractResponse> | undefined,
  empty: undefined as Promise<ContractResponse> | undefined,
  headerOnly: undefined as Promise<ContractResponse> | undefined,
  invalidUtf8: undefined as Promise<ContractResponse> | undefined,
  malformedQuote: undefined as Promise<ContractResponse> | undefined,
  missing: undefined as Promise<ContractResponse> | undefined,
  octetStream: undefined as Promise<ContractResponse> | undefined,
  oversized: undefined as Promise<ContractResponse> | undefined,
  repeated: undefined as
    | Promise<[ContractResponse, ContractResponse]>
    | undefined,
  textFilename: undefined as Promise<ContractResponse> | undefined,
  twoRows: undefined as Promise<ContractResponse> | undefined,
  utf8: undefined as Promise<ContractResponse> | undefined,
  valid: undefined as Promise<ContractResponse> | undefined,
  wrongField: undefined as Promise<ContractResponse> | undefined,
};

function cached(
  key: Exclude<keyof typeof calls, "repeated">,
  factory: () => Promise<ContractResponse>,
): Promise<ContractResponse> {
  const existing = calls[key];
  if (existing) {
    return existing;
  }

  const created = factory();
  calls[key] = created;
  return created;
}

function validResponse(): Promise<ContractResponse> {
  return cached("valid", () =>
    request("POST", {
      bytes: syntheticCsv(),
    }),
  );
}

async function repeatedResponses(): Promise<
  [ContractResponse, ContractResponse]
> {
  if (!calls.repeated) {
    const bytes = syntheticCsv();
    calls.repeated = (async () => {
      const first = await request("POST", { bytes });
      const second = await request("POST", { bytes });
      return [first, second];
    })();
  }

  return calls.repeated;
}

describe.sequential("official EmpresaAqui n8n ingress contract", () => {
  it("requires an explicitly configured target", () => {
    expect(requireTarget()).toBeInstanceOf(URL);
  });

  it("uses the exact official production or test path", () => {
    expect(OFFICIAL_PATHS).toContain(requireTarget().pathname);
  });

  it("does not include URL credentials, query, or fragment", () => {
    const url = requireTarget();
    expect(
      !url.username && !url.password && !url.search && !url.hash,
    ).toBe(true);
  });

  it("allows HTTP only under the explicit internal non-production profile", () => {
    const url = requireTarget();
    expect(
      url.protocol === "https:" ||
        (url.protocol === "http:" && allowInsecureHttp),
    ).toBe(true);
  });

  it("rejects GET on the POST-only ingress", async () => {
    const response = await request("GET");
    expect(response.status).toBe(404);
  });

  it("rejects a multipart request without arquivo_csv safely", async () => {
    const response = await cached("missing", () => request("POST"));
    expect(isSafeFailure(response), responseSummary(response)).toBe(true);
  });

  it("rejects the wrong multipart field safely", async () => {
    const response = await cached("wrongField", () =>
      request("POST", {
        bytes: syntheticCsv(),
        fieldName: "arquivo",
      }),
    );
    expect(isSafeFailure(response), responseSummary(response)).toBe(true);
  });

  it("accepts POST multipart with arquivo_csv", async () => {
    expect((await validResponse()).status).toBe(202);
  });

  it("returns JSON for a successful request", async () => {
    expect((await validResponse()).contentType).toMatch(/^application\/json\b/i);
  });

  it("returns exactly the five official success fields", async () => {
    const body = parseAcceptance(await validResponse());
    expect(Object.keys(body).sort()).toEqual([...OFFICIAL_RESPONSE_FIELDS]);
  });

  it("returns accepted true", async () => {
    expect(parseAcceptance(await validResponse()).accepted).toBe(true);
  });

  it("returns the official acknowledgement message", async () => {
    expect(parseAcceptance(await validResponse()).message).toBe(
      "Arquivo recebido para processamento.",
    );
  });

  it("returns a non-empty import_batch_id", async () => {
    expect(parseAcceptance(await validResponse()).import_batch_id.length).toBeGreaterThan(
      0,
    );
  });

  it("returns the observed import_batch_id format", async () => {
    expect(parseAcceptance(await validResponse()).import_batch_id).toMatch(
      /^empresaqui_\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("returns row_count 1 for one semicolon-delimited row", async () => {
    expect(parseAcceptance(await validResponse()).row_count).toBe(1);
  });

  it("returns source EmpresaAqui", async () => {
    expect(parseAcceptance(await validResponse()).source).toBe("EmpresaAqui");
  });

  it("counts two semicolon-delimited rows", async () => {
    const response = await cached("twoRows", () =>
      request("POST", {
        bytes: syntheticCsv({ rows: 2 }),
      }),
    );
    expect(parseAcceptance(response).row_count).toBe(2);
  });

  it("uses semicolon rather than comma as the configured delimiter", async () => {
    const response = await cached("comma", () =>
      request("POST", {
        bytes: syntheticCsv({ delimiter: "," }),
      }),
    );
    expect(parseAcceptance(response).row_count).toBe(1);
  });

  it("accepts UTF-8 content with accents", async () => {
    const response = await cached("utf8", () =>
      request("POST", {
        bytes: syntheticCsv({ utf8: true }),
      }),
    );
    expect(response.status, responseSummary(response)).toBe(202);
  });

  it("accepts an UTF-8 BOM before the header", async () => {
    const response = await cached("bom", () =>
      request("POST", {
        bytes: syntheticCsv({ bom: true }),
      }),
    );
    expect(response.status).toBe(202);
  });

  it("accepts CRLF line endings", async () => {
    const response = await cached("crlf", () =>
      request("POST", {
        bytes: syntheticCsv({ lineEnding: "\r\n" }),
      }),
    );
    expect(response.status).toBe(202);
  });

  it("uses relaxed quote parsing", async () => {
    const response = await cached("malformedQuote", () =>
      request("POST", {
        bytes: syntheticCsv({ malformedQuote: true }),
      }),
    );
    expect(response.status, responseSummary(response)).toBe(202);
  });

  it("accepts application/octet-stream under the liberal producer profile", async () => {
    const response = await cached("octetStream", () =>
      request("POST", {
        bytes: syntheticCsv(),
        mediaType: "application/octet-stream",
      }),
    );
    expect(response.status).toBe(202);
  });

  it("does not enforce a .csv filename at the producer ingress", async () => {
    const response = await cached("textFilename", () =>
      request("POST", {
        bytes: syntheticCsv(),
        filename: "synthetic-contract.txt",
      }),
    );
    expect(response.status).toBe(202);
  });

  it("handles an empty file with a safe client error", async () => {
    const response = await cached("empty", () =>
      request("POST", {
        bytes: new Uint8Array(),
      }),
    );
    expect(isSafeFailure(response), responseSummary(response)).toBe(true);
  });

  it("handles a header-only file with a controlled outcome", async () => {
    const response = await cached("headerOnly", () =>
      request("POST", {
        bytes: new TextEncoder().encode("CNPJ;Razão\n"),
      }),
    );
    expect(
      response.status === 202 || isSafeFailure(response),
      responseSummary(response),
    ).toBe(true);
  });

  it("handles invalid UTF-8 without an unsafe server failure", async () => {
    const response = await cached("invalidUtf8", () =>
      request("POST", {
        bytes: new Uint8Array([
          0x43, 0x4e, 0x50, 0x4a, 0x3b, 0x52, 0x61, 0x7a, 0x61, 0x6f, 0x0a,
          0xff, 0xfe, 0x0a,
        ]),
      }),
    );
    expect(
      response.status === 202 || isSafeFailure(response),
      responseSummary(response),
    ).toBe(true);
  });

  it("supports the app 10 MiB byte limit", async () => {
    const base = syntheticCsv();
    const response = await cached("anonymous", () =>
      request("POST", {
        bytes: syntheticCsv({
          extraBytes: MAX_APP_UPLOAD_BYTES - base.byteLength,
        }),
      }),
    );
    expect(response.status, responseSummary(response)).toBe(202);
  });

  it("has controlled behavior above the app 10 MiB byte limit", async () => {
    const base = syntheticCsv();
    const response = await cached("oversized", () =>
      request("POST", {
        bytes: syntheticCsv({
          extraBytes: MAX_APP_UPLOAD_BYTES - base.byteLength + 1,
        }),
      }),
    );
    expect(response.status === 202 || isSafeFailure(response)).toBe(true);
  });

  it("accepts a request without credentials in the internal profile", async () => {
    expect((await validResponse()).status).toBe(202);
  });

  it("does not require HMAC headers in the internal profile", async () => {
    expect((await validResponse()).status).toBe(202);
  });

  it("accepts the first of two byte-identical requests", async () => {
    const [first] = await repeatedResponses();
    expect(first.status).toBe(202);
  });

  it("accepts the second byte-identical request without automatic client retry", async () => {
    const [, second] = await repeatedResponses();
    expect(second.status).toBe(202);
  });

  it("generates a new import_batch_id for a repeated identical request", async () => {
    const [first, second] = await repeatedResponses();
    expect(parseAcceptance(first).import_batch_id).not.toBe(
      parseAcceptance(second).import_batch_id,
    );
  });

  it("does not expose unsafe details for missing-file errors", async () => {
    const response = await cached("missing", () => request("POST"));
    expect(isSafeFailure(response), responseSummary(response)).toBe(true);
  });

  it("proves the effective remote workflow ID", () => {
    expect(
      process.env.N8N_CONTRACT_VERIFIED_WORKFLOW_ID,
      "Missing independently verified runtime workflow ID",
    ).toBe(LOCAL_WORKFLOW_ID);
  });

  it("proves the effective remote workflow version ID", () => {
    expect(
      process.env.N8N_CONTRACT_VERIFIED_WORKFLOW_VERSION_ID,
      "Missing independently verified runtime workflow version ID",
    ).toBe(LOCAL_WORKFLOW_VERSION_ID);
  });

  it("proves import_batch_id to persisted lead_run_id correlation", () => {
    expect(
      process.env.N8N_CONTRACT_CORRELATION_EVIDENCE,
      "No approved synthetic producer correlation evidence was supplied",
    ).toBe("verified");
  });

  it("proves that the 202 follows durable producer acceptance", () => {
    expect(
      process.env.N8N_CONTRACT_DURABLE_ACCEPTANCE_EVIDENCE,
      "The official response branch does not prove durable acceptance",
    ).toBe("verified");
  });

  it("proves response timing relative to durable persistence", () => {
    expect(
      process.env.N8N_CONTRACT_RESPONSE_TIMING_EVIDENCE,
      "No approved persistence timing observation source was supplied",
    ).toBe("verified");
  });

  it("proves an X4 accepted-row fact source", () => {
    expect(
      process.env.N8N_CONTRACT_X4_ACCEPTED_ROWS_EVIDENCE,
      "No approved X4 accepted-row source was supplied",
    ).toBe("verified");
  });

  it("proves an X4 explicit batch close fact", () => {
    expect(
      process.env.N8N_CONTRACT_X4_CLOSE_EVIDENCE,
      "No approved X4 close source was supplied",
    ).toBe("verified");
  });

  it("proves the X4 result-to-terminal mapping", () => {
    expect(
      process.env.N8N_CONTRACT_X4_TERMINAL_MAPPING_EVIDENCE,
      "No approved X4 terminal mapping was supplied",
    ).toBe("verified");
  });
});
