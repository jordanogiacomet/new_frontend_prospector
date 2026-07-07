import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../server/auth/require-api-session";
import type {
  SubmitImportDependencies,
  SubmitImportInput,
  SubmitImportResult,
} from "../../../server/imports/submit-import";
import type { ImportSubmissionRecord } from "../../../server/repositories/imports/import-submissions-repository";

type ImportsFeatureEnvironment = {
  readonly FEATURE_IMPORTS_ENABLED: boolean;
};

const mocks = vi.hoisted(() => ({
  requireApiSession:
    vi.fn<() => Promise<ApiAuthorizationContext>>(),
  requireSameOrigin: vi.fn<(request: Pick<Request, "headers" | "url">) => void>(),
  getServerEnv: vi.fn<() => ImportsFeatureEnvironment>(),
  submitImport:
    vi.fn<
      (
        input: SubmitImportInput,
        dependencies: SubmitImportDependencies,
      ) => Promise<SubmitImportResult>
    >(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth/require-api-session", () => ({
  requireApiSession: mocks.requireApiSession,
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../server/imports/submit-import", () => ({
  submitImport: mocks.submitImport,
}));

import { SafeApiError } from "../../../server/api/errors";
import { UploadFileValidationError } from "../../../server/imports/upload-file";
import * as routeModule from "./route";

const organizationId = "org-synthetic-route";
const actor = {
  issuer: "https://issuer.example.test",
  subject: "oidc|synthetic-route-manager",
  organizationId,
  permissions: [],
} as const;
const authorizationContext = {
  status: "authorized",
  actor,
} as const satisfies ApiAuthorizationContext;
const idempotencyKey = "idem-synthetic-route-016";
const submissionId = "00000000-0000-4000-8000-000000000016";
const submittedAt = new Date("2026-07-07T16:00:00.000Z");
const acknowledgedAt = new Date("2026-07-07T16:01:00.000Z");
const importBatchId = "empresaqui_2026-07-07T16:00:00.000Z";
const routeUrl = "http://localhost/api/imports";

interface SyntheticRouteRequest
  extends Pick<Request, "headers" | "url" | "formData"> {
  readonly formData: ReturnType<typeof vi.fn<() => Promise<FormData>>>;
}

interface RouteRequestOptions {
  readonly origin?: string | null;
  readonly url?: string;
  readonly idempotencyKey?: string | null;
  readonly contentType?: string | null;
  readonly contentLength?: string | null;
  readonly formData?: FormData;
  readonly formDataError?: Error;
  readonly headers?: readonly [string, string][];
}

function uploadFile(name = "empresas-sinteticas.csv"): File {
  return new File(
    ["CNPJ;Razao\n00000000000000;Empresa Sintetica\n"],
    name,
    { type: "text/csv" },
  );
}

function validFormData(file: File = uploadFile()): FormData {
  const formData = new FormData();
  formData.set("arquivo_csv", file);
  return formData;
}

function formDataWith(entries: readonly [string, FormDataEntryValue][]): FormData {
  const formData = new FormData();

  for (const [key, value] of entries) {
    formData.append(key, value);
  }

  return formData;
}

function createRequest(
  options: RouteRequestOptions = {},
): SyntheticRouteRequest {
  const headers = new Headers();
  const origin =
    options.origin === undefined ? "http://localhost" : options.origin;
  const contentType =
    options.contentType === undefined
      ? "multipart/form-data; boundary=synthetic"
      : options.contentType;
  const requestedIdempotencyKey =
    options.idempotencyKey === undefined
      ? idempotencyKey
      : options.idempotencyKey;

  if (origin !== null) {
    headers.set("Origin", origin);
  }

  if (contentType !== null) {
    headers.set("Content-Type", contentType);
  }

  if (requestedIdempotencyKey !== null) {
    headers.set("Idempotency-Key", requestedIdempotencyKey);
  }

  for (const [name, value] of options.headers ?? []) {
    headers.set(name, value);
  }

  if (options.contentLength !== undefined && options.contentLength !== null) {
    headers.set("Content-Length", options.contentLength);
  }

  const formData = vi.fn<() => Promise<FormData>>();

  if (options.formDataError !== undefined) {
    formData.mockRejectedValue(options.formDataError);
  } else {
    formData.mockResolvedValue(options.formData ?? validFormData());
  }

  return {
    url: options.url ?? routeUrl,
    headers,
    formData,
  };
}

async function post(request: SyntheticRouteRequest): Promise<Response> {
  return routeModule.POST(request as unknown as NextRequest);
}

function submission(
  overrides: Partial<ImportSubmissionRecord> = {},
): ImportSubmissionRecord {
  return {
    submissionId: overrides.submissionId ?? submissionId,
    organizationId: overrides.organizationId ?? organizationId,
    idempotencyKey: overrides.idempotencyKey ?? idempotencyKey,
    fileSha256: overrides.fileSha256 ?? "d".repeat(64),
    originalFilename: overrides.originalFilename ?? "empresas-sinteticas.csv",
    sizeBytes: overrides.sizeBytes ?? 48,
    mediaType: overrides.mediaType ?? "text/csv",
    appContractVersion: overrides.appContractVersion ?? "prospecta-import-v1",
    status: overrides.status ?? "SUBMISSION_RECORDED",
    statusFactSource: overrides.statusFactSource ?? "app_submission",
    submittedAt: overrides.submittedAt ?? submittedAt,
    producerAcknowledgement:
      overrides.producerAcknowledgement === undefined
        ? null
        : overrides.producerAcknowledgement,
  };
}

function acknowledgedSubmission(): ImportSubmissionRecord {
  return submission({
    status: "PRODUCER_ACKNOWLEDGED",
    statusFactSource: "workflow_acknowledgement",
    producerAcknowledgement: {
      import_batch_id: importBatchId,
      row_count: 2,
      producerAcknowledgedAt: acknowledgedAt,
    },
  });
}

function unknownSubmission(): ImportSubmissionRecord {
  return submission({
    status: "ACCEPTANCE_UNKNOWN",
    statusFactSource: "ingress_unknown",
  });
}

function submittedAcknowledgedResult(): SubmitImportResult {
  return {
    kind: "submitted",
    producerOutcome: "acknowledged",
    submission: acknowledgedSubmission(),
  };
}

function submittedUnknownResult(): SubmitImportResult {
  return {
    kind: "submitted",
    producerOutcome: "unknown",
    submission: unknownSubmission(),
  };
}

function duplicateAcknowledgedResult(): SubmitImportResult {
  return {
    kind: "duplicate",
    producerOutcome: "acknowledged",
    submission: acknowledgedSubmission(),
  };
}

function conflictResult(): SubmitImportResult {
  return {
    kind: "conflict",
    error: {
      code: "IMPORT_IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
      message: "Submission conflicts with an earlier file.",
    },
  };
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
}

function firstSubmitImportCall(): readonly [
  SubmitImportInput,
  SubmitImportDependencies,
] {
  const call = mocks.submitImport.mock.calls[0];

  if (call === undefined) {
    throw new Error("Expected submitImport to be called.");
  }

  return call;
}

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/imports/route.ts"),
    "utf8",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiSession.mockResolvedValue(authorizationContext);
  mocks.requireSameOrigin.mockImplementation(() => undefined);
  mocks.getServerEnv.mockReturnValue({
    FEATURE_IMPORTS_ENABLED: true,
  });
  mocks.submitImport.mockResolvedValue(submittedAcknowledgedResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/imports", () => {
  it("exports only POST so unsupported methods are not implemented here", () => {
    expect(Object.keys(routeModule)).toEqual(["POST"]);
    expect(routeSource()).not.toMatch(/\bexport\s+async\s+function\s+GET\b/);
  });

  it("requires authentication before origin, body, feature, or service work", async () => {
    mocks.requireApiSession.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const request = createRequest();

    const response = await post(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Entre para acessar os dados.",
      },
    });
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mocks.submitImport).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires same-origin before feature, body, or service work", async () => {
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      throw new SafeApiError("ACCESS_DENIED");
    });
    const request = createRequest({ origin: "http://attacker.test" });

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.requireApiSession).toHaveBeenCalledOnce();
    expect(mocks.requireSameOrigin).toHaveBeenCalledWith(request);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mocks.submitImport).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires the server-side feature flag before body or service work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_IMPORTS_ENABLED: false,
    });
    const request = createRequest();

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(request.formData).not.toHaveBeenCalled();
    expect(mocks.submitImport).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("runs guards and body parsing in the required order", async () => {
    const events: string[] = [];
    const request = createRequest();
    mocks.requireApiSession.mockImplementationOnce(async () => {
      events.push("auth");
      return authorizationContext;
    });
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      events.push("origin");
    });
    mocks.getServerEnv.mockImplementationOnce(() => {
      events.push("feature");
      return { FEATURE_IMPORTS_ENABLED: true };
    });
    request.formData.mockImplementationOnce(async () => {
      events.push("body");
      return validFormData();
    });
    mocks.submitImport.mockImplementationOnce(async () => {
      events.push("service");
      return submittedAcknowledgedResult();
    });

    const response = await post(request);

    expect(response.status).toBe(202);
    expect(events).toEqual([
      "auth",
      "origin",
      "feature",
      "body",
      "service",
    ]);
  });

  it("rejects non-multipart requests without reading the body", async () => {
    const request = createRequest({ contentType: "text/plain" });

    const response = await post(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "request", message: "Valor inválido." }],
      },
    });
    expect(request.formData).not.toHaveBeenCalled();
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("maps malformed multipart parsing to a safe validation error", async () => {
    const request = createRequest({
      formDataError: new Error("raw csv body and stack should not leak"),
    });

    const response = await post(request);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(serialized).toContain("VALIDATION_ERROR");
    expect(serialized).not.toContain("raw csv body");
    expect(serialized).not.toContain("stack");
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("rejects multipart without a file", async () => {
    const response = await post(
      createRequest({ formData: new FormData() }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "arquivo_csv", message: "Valor inválido." }],
      },
    });
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("rejects a wrong file field", async () => {
    const response = await post(
      createRequest({
        formData: formDataWith([["arquivo", uploadFile()]]),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("rejects more than one file", async () => {
    const response = await post(
      createRequest({
        formData: formDataWith([
          ["arquivo_csv", uploadFile("a.csv")],
          ["arquivo_csv", uploadFile("b.csv")],
        ]),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("rejects extra body fields including organization attempts", async () => {
    const response = await post(
      createRequest({
        formData: formDataWith([
          ["arquivo_csv", uploadFile()],
          ["organizationId", "org-from-body"],
        ]),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("requires an app idempotency header before body parsing", async () => {
    const request = createRequest({ idempotencyKey: null });

    const response = await post(request);

    expect(response.status).toBe(400);
    expect(request.formData).not.toHaveBeenCalled();
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("uses the verified actor and organization instead of request-supplied values", async () => {
    const request = createRequest({
      url: `${routeUrl}?organizationId=org-from-query`,
      headers: [["X-Organization-Id", "org-from-header"]],
    });

    const response = await post(request);
    const [input] = firstSubmitImportCall();

    expect(response.status).toBe(202);
    expect(input.organizationId).toBe(organizationId);
    expect(input.actor).toBe(actor);
    expect(JSON.stringify(input)).not.toContain("org-from-query");
    expect(JSON.stringify(input)).not.toContain("org-from-header");
  });

  it("calls submitImport exactly once for a valid request", async () => {
    const file = uploadFile();
    const request = createRequest({ formData: validFormData(file) });

    const response = await post(request);
    const [input, dependencies] = firstSubmitImportCall();

    expect(response.status).toBe(202);
    expect(mocks.submitImport).toHaveBeenCalledOnce();
    expect(input).toMatchObject({
      organizationId,
      actor,
      idempotencyKey,
      file,
    });
    expect(typeof dependencies.ingressClient.fetch).toBe("function");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns a safe 202 acknowledgement response", async () => {
    const response = await post(createRequest());
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(202);
    expect(body).toEqual({
      data: {
        submissionId,
        appStatus: "PRODUCER_ACKNOWLEDGED",
        statusFactSource: "workflow_acknowledgement",
        submittedAt: submittedAt.toISOString(),
        producerOutcome: "acknowledged",
        workflowAcknowledgement: {
          import_batch_id: importBatchId,
          row_count: 2,
          acknowledgedAt: acknowledgedAt.toISOString(),
        },
        durableAcceptance: null,
      },
      meta: { result: "submitted" },
    });
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain(idempotencyKey);
    expect(serialized).not.toContain("d".repeat(64));
    expect(serialized).not.toMatch(/producerBatchId|rowCountAccepted|COMPLETED|PROCESSING/);
    expectPrivateNoStore(response);
  });

  it("returns a safe 202 unknown response without retry", async () => {
    mocks.submitImport.mockResolvedValueOnce(submittedUnknownResult());

    const response = await post(createRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      data: {
        appStatus: "ACCEPTANCE_UNKNOWN",
        producerOutcome: "unknown",
        workflowAcknowledgement: null,
        durableAcceptance: null,
      },
    });
    expect(mocks.submitImport).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns the duplicate original app result without a new external call", async () => {
    mocks.submitImport.mockResolvedValueOnce(duplicateAcknowledgedResult());

    const response = await post(createRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      data: {
        submissionId,
        producerOutcome: "acknowledged",
        workflowAcknowledgement: {
          import_batch_id: importBatchId,
        },
      },
      meta: { result: "duplicate" },
    });
    expect(mocks.submitImport).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("maps idempotency conflicts to a safe 409 envelope", async () => {
    mocks.submitImport.mockResolvedValueOnce(conflictResult());

    const response = await post(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(409);
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code: "IMPORT_IDEMPOTENCY_CONFLICT",
        message: "Este envio conflita com um arquivo já registrado.",
      },
    });
    expect(serialized).not.toContain("raw producer body");
    expect(serialized).not.toContain("secret");
    expectPrivateNoStore(response);
  });

  it("maps upload validation errors to a safe file error", async () => {
    mocks.submitImport.mockRejectedValueOnce(
      new UploadFileValidationError("INVALID_UTF8"),
    );

    const response = await post(createRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise o arquivo informado.",
        details: [{ field: "arquivo_csv", message: "Valor inválido." }],
      },
    });
  });

  it("maps oversized uploads to a safe 413 response", async () => {
    const response = await post(
      createRequest({ contentLength: String(11 * 1024 * 1024) }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "arquivo_csv", message: "Valor inválido." }],
      },
    });
    expect(mocks.submitImport).not.toHaveBeenCalled();
  });

  it("does not leak internal failures, SQL, secrets, stacks, CSV content, or endpoints", async () => {
    const failure = Object.assign(
      new Error(
        "SELECT * FROM private_table with secret-token and CNPJ;Razao csv",
      ),
      {
        sql: "SELECT * FROM private_table",
        endpoint: "http://192.168.0.20:30098/webhook/empresaqui/import",
        secret: "secret-token",
      },
    );
    failure.stack = "internal stack at route.ts:1";
    mocks.submitImport.mockRejectedValueOnce(failure);

    const response = await post(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).toContain("UNEXPECTED_ERROR");
    for (const fragment of [
      "SELECT",
      "private_table",
      "secret-token",
      "CNPJ;Razao",
      "192.168.0.20",
      "webhook",
      "internal stack",
    ]) {
      expect(serialized).not.toContain(fragment);
    }
  });

  it("uses private no-store caching for success and error responses", async () => {
    const success = await post(createRequest());
    const validation = await post(createRequest({ idempotencyKey: null }));
    mocks.submitImport.mockResolvedValueOnce(conflictResult());
    const conflict = await post(createRequest());
    mocks.submitImport.mockRejectedValueOnce(new Error("synthetic failure"));
    const unexpected = await post(createRequest());

    expect([
      success.status,
      validation.status,
      conflict.status,
      unexpected.status,
    ]).toEqual([202, 400, 409, 500]);

    for (const response of [success, validation, conflict, unexpected]) {
      expectPrivateNoStore(response);
    }
  });

  it("has no GET handler, direct fetch call, HMAC, retry, or reprocessing source", () => {
    const source = routeSource();

    expect(source).toContain("requireApiSession");
    expect(source).toContain("requireSameOrigin");
    expect(source).toContain("FEATURE_IMPORTS_ENABLED");
    expect(source).not.toMatch(/\bexport\s+async\s+function\s+GET\b/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(
      /HMAC|signature|canonical|timestamp|nonce|replay|retry|reprocess/i,
    );
    expect(
      existsSync(resolve(process.cwd(), "src/app/(private)/imports")),
    ).toBe(true);
  });

  it("does not use producer database clients or producer objects", () => {
    expect(routeSource()).not.toMatch(
      /PRODUCER_DATABASE_URL|producer-client|prospecta-producer-read|company_validations|company_validation_runs|company_strategic_research_reports|server\/db/i,
    );
  });

  it("does not contain an n8n endpoint or execute a real external call in tests", async () => {
    expect(routeSource()).not.toMatch(
      /N8N_IMPORT_URL|webhook|192\.168\.0\.20|n8n/i,
    );

    const response = await post(createRequest());

    expect(response.status).toBe(202);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
