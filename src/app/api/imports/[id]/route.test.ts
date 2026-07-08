import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../server/auth/require-api-session";
import type {
  GetImportBatchDetailInput,
  GetImportBatchDetailResult,
} from "../../../../server/imports/batch-read-service";
import type { BatchSummary } from "../../../../types/imports";

type ImportsFeatureEnvironment = {
  readonly FEATURE_IMPORTS_ENABLED: boolean;
};

const mocks = vi.hoisted(() => ({
  requireApiSession:
    vi.fn<() => Promise<ApiAuthorizationContext>>(),
  getServerEnv: vi.fn<() => ImportsFeatureEnvironment>(),
  getImportBatchDetail:
    vi.fn<
      (
        input: GetImportBatchDetailInput,
      ) => Promise<GetImportBatchDetailResult>
    >(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../server/auth/require-api-session", () => ({
  requireApiSession: mocks.requireApiSession,
}));
vi.mock("../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../../server/imports/batch-read-service", () => ({
  getImportBatchDetail: mocks.getImportBatchDetail,
}));

import { SafeApiError } from "../../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-detail";
const actor = {
  issuer: "https://issuer.example.test",
  subject: "oidc|synthetic-detail-manager",
  organizationId,
  permissions: [],
} as const;
const authorizationContext = {
  status: "authorized",
  actor,
} as const satisfies ApiAuthorizationContext;
const submissionId = "00000000-0000-4000-8000-000000000025";
const importBatchId = "empresaqui_2026-07-08T10:00:00.000Z";
const routeUrl = "http://localhost/api/imports";

interface DetailRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

interface GetOptions {
  readonly id?: unknown;
  readonly url?: string;
  readonly headers?: HeadersInit;
}

function batchSummary(
  overrides: Partial<BatchSummary> = {},
): BatchSummary {
  return {
    submissionId: overrides.submissionId ?? submissionId,
    import_batch_id:
      overrides.import_batch_id === undefined
        ? null
        : overrides.import_batch_id,
    status: overrides.status ?? "SUBMITTED",
    submittedAt:
      overrides.submittedAt ?? "2026-07-08T10:00:00.000Z",
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

function foundResult(
  batch: BatchSummary = batchSummary(),
): GetImportBatchDetailResult {
  return {
    kind: "found",
    batch,
  };
}

function notFoundResult(): GetImportBatchDetailResult {
  return {
    kind: "not_found",
    error: {
      code: "IMPORT_SUBMISSION_NOT_FOUND",
      httpStatus: 404,
      message: "Import submission was not found.",
    },
  };
}

function get(options: GetOptions = {}): Promise<Response> {
  const id = Object.hasOwn(options, "id")
    ? options.id
    : submissionId;
  const url =
    options.url ??
    `${routeUrl}/${typeof id === "string" ? id : "invalid"}`;
  const context: DetailRouteContext = {
    params: Promise.resolve({ id }),
  };

  return routeModule.GET(
    new NextRequest(url, { headers: options.headers }),
    context,
  );
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
}

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/imports/[id]/route.ts"),
    "utf8",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireApiSession.mockResolvedValue(authorizationContext);
  mocks.getServerEnv.mockReturnValue({
    FEATURE_IMPORTS_ENABLED: true,
  });
  mocks.getImportBatchDetail.mockResolvedValue(foundResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/imports/:id", () => {
  it("exports only GET so mutation methods are not implemented here", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET"]);
    expect(routeSource()).not.toMatch(
      /\bexport\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/,
    );
  });

  it("requires authentication before feature, parameter, or service work", async () => {
    mocks.requireApiSession.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await get({ id: "not-a-uuid" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Entre para acessar os dados.",
      },
    });
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires the allowed-organization session before reading detail", async () => {
    mocks.requireApiSession.mockRejectedValueOnce(
      new SafeApiError("ACCESS_DENIED"),
    );

    const response = await get();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires the server-side import feature flag before validating the id", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_IMPORTS_ENABLED: false,
    });

    const response = await get({ id: "not-a-uuid" });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("authenticates, checks the feature flag, and reads detail in order", async () => {
    const events: string[] = [];
    mocks.requireApiSession.mockImplementationOnce(async () => {
      events.push("auth");
      return authorizationContext;
    });
    mocks.getServerEnv.mockImplementationOnce(() => {
      events.push("feature");
      return { FEATURE_IMPORTS_ENABLED: true };
    });
    mocks.getImportBatchDetail.mockImplementationOnce(async () => {
      events.push("service");
      return foundResult();
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect(events).toEqual(["auth", "feature", "service"]);
  });

  it.each([
    ["missing id", undefined],
    ["blank id", ""],
    ["trimmed id", `${submissionId} `],
    ["not uuid", "not-a-uuid"],
    ["unsafe object", { value: submissionId }],
  ] as const)(
    "rejects invalid ids without service work: %s",
    async (_label, id) => {
      const response = await get({ id });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field: "id", message: "Valor inválido." }],
        },
      });
      expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("uses the verified actor organization and ignores request-supplied organization values", async () => {
    const response = await get({
      url: `${routeUrl}/${submissionId}?organizationId=org-from-query`,
      headers: {
        "X-Organization-Id": "org-from-header",
      },
    });
    const serializedInput = JSON.stringify(
      mocks.getImportBatchDetail.mock.calls[0]?.[0],
    );

    expect(response.status).toBe(200);
    expect(mocks.getImportBatchDetail).toHaveBeenCalledOnce();
    expect(mocks.getImportBatchDetail).toHaveBeenCalledWith({
      organizationId,
      submissionId,
    });
    expect(serializedInput).not.toContain("org-from-query");
    expect(serializedInput).not.toContain("org-from-header");
  });

  it("returns a detail envelope preserving nullable counts and evidence bases", async () => {
    const batch = batchSummary({
      import_batch_id: importBatchId,
      observationStatus: "UNAVAILABLE",
      observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
      rowCountAccepted: null,
      terminalCount: null,
      blockedCount: null,
      failedCount: null,
      leadCount: null,
    });
    mocks.getImportBatchDetail.mockResolvedValueOnce(foundResult(batch));

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: batch,
    });
    expectPrivateNoStore(response);
  });

  it("returns explicit producer-derived counts and status bases without recomputing them", async () => {
    const batch = batchSummary({
      import_batch_id: importBatchId,
      status: "COMPLETED",
      acceptedAt: "2026-07-08T10:01:00.000Z",
      lastObservedAt: "2026-07-08T10:02:00.000Z",
      rowCountAccepted: 3,
      terminalCount: 3,
      blockedCount: 1,
      failedCount: 1,
      leadCount: 1,
      statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
      observationStatus: "AVAILABLE",
      observationBasis: null,
    });
    mocks.getImportBatchDetail.mockResolvedValueOnce(foundResult(batch));

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: batch,
    });
  });

  it("maps missing or cross-organization ids to a safe closed 404", async () => {
    mocks.getImportBatchDetail.mockResolvedValueOnce(notFoundResult());

    const response = await get();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(404);
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        message: "Importação não encontrada.",
      },
    });
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain(actor.subject);
    expect(serialized).not.toContain(submissionId);
    expectPrivateNoStore(response);
  });

  it("maps data-source failures to a safe 503 envelope", async () => {
    mocks.getImportBatchDetail.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );

    const response = await get();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("maps unexpected failures without exposing internals", async () => {
    const failure = Object.assign(
      new Error(
        "SELECT file_sha256, idempotency_key FROM internal_table with secret-token",
      ),
      {
        sql: "SELECT file_sha256, idempotency_key FROM internal_table",
        endpoint: "http://192.168.0.20:30098/webhook/empresaqui/import",
        secret: "secret-token",
        organizationId,
        submissionId,
      },
    );
    failure.stack = "internal stack at route.ts:1";
    mocks.getImportBatchDetail.mockRejectedValueOnce(failure);

    const response = await get();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).toContain("UNEXPECTED_ERROR");
    for (const fragment of [
      "SELECT",
      "file_sha256",
      "idempotency_key",
      "internal_table",
      "secret-token",
      "192.168.0.20",
      "webhook",
      "internal stack",
      organizationId,
      submissionId,
    ]) {
      expect(serialized).not.toContain(fragment);
    }
    expectPrivateNoStore(response);
  });

  it("uses private no-store caching for success and error responses", async () => {
    const success = await get();
    const validation = await get({ id: "not-a-uuid" });
    mocks.requireApiSession.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const authentication = await get();
    mocks.getImportBatchDetail.mockResolvedValueOnce(notFoundResult());
    const notFound = await get();
    mocks.getImportBatchDetail.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    const unavailable = await get();

    expect([
      success.status,
      validation.status,
      authentication.status,
      notFound.status,
      unavailable.status,
    ]).toEqual([200, 400, 401, 404, 503]);

    for (const response of [
      success,
      validation,
      authentication,
      notFound,
      unavailable,
    ]) {
      expectPrivateNoStore(response);
    }
  });

  it("does not call upload, mutation, n8n, fetch, or database APIs directly", async () => {
    const response = await get();
    const source = routeSource();

    expect(response.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(source).toContain("getImportBatchDetail");
    expect(source).not.toMatch(/submitImport|listImportBatches|requireSameOrigin/);
    expect(source).not.toMatch(
      /N8N_IMPORT_URL|webhook|192\.168\.0\.20|n8n|fetch\s*\(/i,
    );
    expect(source).not.toMatch(
      /PRODUCER_DATABASE_URL|APP_DATABASE_URL|server\/db|producer-client|app-client|prospecting_app|company_validation/i,
    );
  });
});
