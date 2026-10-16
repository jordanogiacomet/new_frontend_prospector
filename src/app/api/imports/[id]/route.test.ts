import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../server/auth/require-api-session";
import type {
  BatchReadServiceDependencies,
  GetImportBatchDetailInput,
  GetImportBatchDetailResult,
} from "../../../../server/imports/batch-read-service";
import type { BatchSummary } from "../../../../types/imports";
import type { listImportReceivedCompanies } from "../../../../server/repositories/imports/import-received-companies-repository";
import type { listProcessedImportCompanies } from "../../../../server/repositories/imports/processed-import-companies-repository";
import type { resolveLeadReadVisibility } from "../../../../server/leads/lead-read-visibility";

type ImportsFeatureEnvironment = {
  readonly FEATURE_IMPORTS_ENABLED: boolean;
  readonly FEATURE_BATCH_OBSERVATION_ENABLED?: boolean;
  readonly DEMO3_LOCAL_RUNTIME_ENABLED?: boolean;
};

const mocks = vi.hoisted(() => ({
  requireApiSession:
    vi.fn<() => Promise<ApiAuthorizationContext>>(),
  getServerEnv: vi.fn<() => ImportsFeatureEnvironment>(),
  getImportBatchDetail:
    vi.fn<
      (
        input: GetImportBatchDetailInput,
        dependencies?: BatchReadServiceDependencies,
      ) => Promise<GetImportBatchDetailResult>
    >(),
  listImportReceivedCompanies: vi.fn<typeof listImportReceivedCompanies>(),
  listProcessedImportCompanies: vi.fn<typeof listProcessedImportCompanies>(),
  resolveLeadReadVisibility: vi.fn<typeof resolveLeadReadVisibility>(),
  isDemoDataEnabled: vi.fn<() => boolean>(),
  getDemoImportBatchDetail:
    vi.fn<(id: string) => GetImportBatchDetailResult>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../server/auth/require-api-session", () => ({
  requireApiSession: mocks.requireApiSession,
  requirePermission: mocks.requireApiSession,
}));
vi.mock("../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../../server/imports/batch-read-service", () => ({
  getImportBatchDetail: mocks.getImportBatchDetail,
}));
vi.mock(
  "../../../../server/repositories/imports/import-received-companies-repository",
  () => ({ listImportReceivedCompanies: mocks.listImportReceivedCompanies }),
);
vi.mock(
  "../../../../server/repositories/imports/processed-import-companies-repository",
  () => ({ listProcessedImportCompanies: mocks.listProcessedImportCompanies }),
);
vi.mock("../../../../server/leads/lead-read-visibility", () => ({
  resolveLeadReadVisibility: mocks.resolveLeadReadVisibility,
}));
vi.mock("../../../../server/demo/mode", () => ({
  isDemoDataEnabled: mocks.isDemoDataEnabled,
}));
vi.mock("../../../../server/demo/prospecta-demo-data", () => ({
  getDemoImportBatchDetail: mocks.getDemoImportBatchDetail,
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
    workflowReportedStartedAt:
      overrides.workflowReportedStartedAt === undefined
        ? null
        : overrides.workflowReportedStartedAt,
    workflowReportedClosedAt:
      overrides.workflowReportedClosedAt === undefined
        ? null
        : overrides.workflowReportedClosedAt,
    workflowReportedRowCount:
      overrides.workflowReportedRowCount === undefined
        ? null
        : overrides.workflowReportedRowCount,
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
  vi.resetAllMocks();
  mocks.requireApiSession.mockResolvedValue(authorizationContext);
  mocks.getServerEnv.mockReturnValue({
    FEATURE_IMPORTS_ENABLED: true,
    FEATURE_BATCH_OBSERVATION_ENABLED: true,
    DEMO3_LOCAL_RUNTIME_ENABLED: false,
  });
  mocks.getImportBatchDetail.mockResolvedValue(foundResult());
  mocks.listImportReceivedCompanies.mockResolvedValue({
    companies: [],
    page: 1,
    pageSize: 100,
    total: 0,
  });
  mocks.listProcessedImportCompanies.mockResolvedValue({
    companies: [], page: 1, pageSize: 100, total: 0,
  });
  mocks.resolveLeadReadVisibility.mockResolvedValue({});
  mocks.isDemoDataEnabled.mockReturnValue(false);
  mocks.getDemoImportBatchDetail.mockReturnValue(foundResult());
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
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
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
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
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
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
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
      expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
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
    expect(mocks.requireApiSession).toHaveBeenCalledWith("imports:read");
    expect(mocks.getImportBatchDetail).toHaveBeenCalledOnce();
    expect(mocks.getImportBatchDetail).toHaveBeenCalledWith({
      organizationId,
      submissionId,
    });
    expect(serializedInput).not.toContain("org-from-query");
    expect(serializedInput).not.toContain("org-from-header");
  });

  it("reads the real pre-production detail with configured observations", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_IMPORTS_ENABLED: true,
      DEMO3_LOCAL_RUNTIME_ENABLED: true,
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect(mocks.getImportBatchDetail).toHaveBeenCalledWith(
      {
        organizationId,
        submissionId,
      },
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
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

  it("preserves the original response without reading company facts unless requested", async () => {
    const response = await get({
      url: `${routeUrl}/${submissionId}?pageSize=invalid&pageSize=0&unknown=ignored`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: batchSummary() });
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
    expect(mocks.resolveLeadReadVisibility).not.toHaveBeenCalled();
    expect(mocks.listProcessedImportCompanies).not.toHaveBeenCalled();
  });

  it("appends only paginated receipt facts scoped to the verified organization", async () => {
    const company = {
      source_row: 5,
      receivedAt: "2026-07-08T10:02:00.000Z",
    };
    mocks.listImportReceivedCompanies.mockResolvedValueOnce({
      companies: [Object.assign({}, company, {
        cnpj_normalizado: "00000000000000",
        name: "Synthetic withheld company name",
        payload: { private: "withheld" },
      })],
      page: 2,
      pageSize: 4,
      total: 7,
    });

    const response = await get({
      url: `${routeUrl}/${submissionId}?receivedCompaniesPage=2&pageSize=4`,
      headers: { "X-Organization-Id": "org-from-header" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: batchSummary(),
      meta: {
        receivedCompanies: {
          available: true,
          data: [company],
          page: 2,
          pageSize: 4,
          total: 7,
        },
      },
    });
    expect(mocks.requireApiSession).toHaveBeenCalledWith("imports:read");
    expect(mocks.listImportReceivedCompanies).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      submissionId,
      page: 2,
      pageSize: 4,
    });
    expectPrivateNoStore(response);
  });

  it("uses a bounded default receipt page size and preserves confirmed empty results", async () => {
    const response = await get({
      url: `${routeUrl}/${submissionId}?receivedCompaniesPage=1`,
    });

    expect(response.status).toBe(200);
    expect(mocks.listImportReceivedCompanies).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      submissionId,
      page: 1,
      pageSize: 100,
    });
    expect(await response.json()).toEqual({
      data: batchSummary(),
      meta: {
        receivedCompanies: {
          available: true,
          data: [],
          page: 1,
          pageSize: 100,
          total: 0,
        },
      },
    });
  });

  it("allows the maximum receipt pagination bounds", async () => {
    const response = await get({
      url: `${routeUrl}/${submissionId}?receivedCompaniesPage=10000&pageSize=100`,
    });

    expect(response.status).toBe(200);
    expect(mocks.listImportReceivedCompanies).toHaveBeenCalledExactlyOnceWith({
      organizationId,
      submissionId,
      page: 10_000,
      pageSize: 100,
    });
  });

  it.each([
    ["blank page", "receivedCompaniesPage=", "receivedCompaniesPage"],
    ["zero page", "receivedCompaniesPage=0", "receivedCompaniesPage"],
    ["negative page", "receivedCompaniesPage=-1", "receivedCompaniesPage"],
    ["fractional page", "receivedCompaniesPage=1.5", "receivedCompaniesPage"],
    ["exponent page", "receivedCompaniesPage=1e2", "receivedCompaniesPage"],
    ["page above maximum", "receivedCompaniesPage=10001", "receivedCompaniesPage"],
    ["unsafe page", "receivedCompaniesPage=9007199254740993", "receivedCompaniesPage"],
    ["duplicated page", "receivedCompaniesPage=1&receivedCompaniesPage=2", "receivedCompaniesPage"],
    ["blank page size", "receivedCompaniesPage=1&pageSize=", "pageSize"],
    ["zero page size", "receivedCompaniesPage=1&pageSize=0", "pageSize"],
    ["page size above maximum", "receivedCompaniesPage=1&pageSize=101", "pageSize"],
    ["duplicated page size", "receivedCompaniesPage=1&pageSize=1&pageSize=2", "pageSize"],
    ["unknown field", "receivedCompaniesPage=1&unknown=1", "unknown"],
    ["organization injection", "receivedCompaniesPage=1&organizationId=other-org", "organizationId"],
  ])("rejects invalid receipt queries before database work: %s", async (_label, query, field) => {
    const response = await get({
      url: `${routeUrl}/${submissionId}?${query}`,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field, message: "Valor inválido." }],
      },
    });
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks authorization and feature gates before receipt query validation", async () => {
    const url = `${routeUrl}/${submissionId}?receivedCompaniesPage=invalid`;
    mocks.requireApiSession.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const unauthorized = await get({ url });

    expect(unauthorized.status).toBe(401);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    mocks.getServerEnv.mockReturnValueOnce({ FEATURE_IMPORTS_ENABLED: false });
    const disabled = await get({ url });

    expect(disabled.status).toBe(403);
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
  });

  it("verifies the scoped submission before reading received companies", async () => {
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
      events.push("detail");
      return foundResult();
    });
    mocks.listImportReceivedCompanies.mockImplementationOnce(async () => {
      events.push("receipts");
      return { companies: [], page: 1, pageSize: 100, total: 0 };
    });

    const response = await get({
      url: `${routeUrl}/${submissionId}?receivedCompaniesPage=1`,
    });

    expect(response.status).toBe(200);
    expect(events).toEqual(["auth", "feature", "detail", "receipts"]);
  });

  it("withholds received companies when a submission is missing or belongs to another organization", async () => {
    mocks.getImportBatchDetail.mockResolvedValueOnce(notFoundResult());

    const response = await get({
      url: `${routeUrl}/${submissionId}?receivedCompaniesPage=1`,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        message: "Importação não encontrada.",
      },
    });
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([false, true])("marks synthetic demo receipt facts unavailable without repository reads (Demo 3: %s)", async (demo3) => {
    mocks.isDemoDataEnabled.mockReturnValue(true);
    mocks.getServerEnv.mockReturnValue({
      FEATURE_IMPORTS_ENABLED: true,
      DEMO3_LOCAL_RUNTIME_ENABLED: demo3,
    });

    const response = await get({
      url: `${routeUrl}/${submissionId}?receivedCompaniesPage=3&pageSize=25`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: batchSummary(),
      meta: {
        receivedCompanies: {
          available: false,
          data: [],
          page: 3,
          pageSize: 25,
          total: null,
        },
      },
    });
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("maps unavailable receipt facts to a safe 503 without fabricating an empty result", async () => {
    mocks.listImportReceivedCompanies.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );

    const response = await get({
      url: `${routeUrl}/${submissionId}?receivedCompaniesPage=1`,
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("returns only scoped individual processing facts and preserves nullable batch counts", async () => {
    const batch = batchSummary({ import_batch_id: importBatchId });
    const company = { source_row: 2, processedAt: "2026-07-08T10:04:00.000Z" };
    const visibility = { includeTestRunsFromImportBatchIds: [importBatchId] };
    mocks.getImportBatchDetail.mockResolvedValueOnce(foundResult(batch));
    mocks.resolveLeadReadVisibility.mockResolvedValueOnce(visibility);
    mocks.listProcessedImportCompanies.mockResolvedValueOnce({
      companies: [Object.assign({}, company, {
        cnpj_normalizado: "00000000000000", name: "Withheld synthetic name",
        result: "INSERIDO_VALIDATION", payload: { private: "withheld" },
      })],
      page: 2, pageSize: 4, total: 5,
    });

    const response = await get({
      url: `${routeUrl}/${submissionId}?processedCompaniesPage=2&pageSize=4`,
      headers: { "X-Organization-Id": "org-from-header" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: batch,
      meta: { processedCompanies: {
        available: true, data: [company], page: 2, pageSize: 4, total: 5,
        factSource: "producer_current_company_results_v1",
      } },
    });
    expect(mocks.requireApiSession).toHaveBeenCalledExactlyOnceWith("imports:read");
    expect(mocks.getImportBatchDetail).toHaveBeenCalledExactlyOnceWith({ organizationId, submissionId });
    expect(mocks.resolveLeadReadVisibility).toHaveBeenCalledExactlyOnceWith(actor);
    expect(mocks.listProcessedImportCompanies).toHaveBeenCalledExactlyOnceWith(
      { importBatchId, page: 2, pageSize: 4 }, visibility,
    );
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("defaults individual processing page size to 100 and preserves confirmed empty results", async () => {
    const batch = batchSummary({ import_batch_id: importBatchId });
    mocks.getImportBatchDetail.mockResolvedValueOnce(foundResult(batch));

    const response = await get({ url: `${routeUrl}/${submissionId}?processedCompaniesPage=1` });

    expect(response.status).toBe(200);
    expect(mocks.listProcessedImportCompanies).toHaveBeenCalledExactlyOnceWith(
      { importBatchId, page: 1, pageSize: 100 }, {},
    );
    expect(await response.json()).toEqual({
      data: batch,
      meta: { processedCompanies: {
        available: true, data: [], page: 1, pageSize: 100, total: 0,
        factSource: "producer_current_company_results_v1",
      } },
    });
  });

  it("allows the maximum individual-processing pagination bounds", async () => {
    mocks.getImportBatchDetail.mockResolvedValueOnce(
      foundResult(batchSummary({ import_batch_id: importBatchId })),
    );

    const response = await get({
      url: `${routeUrl}/${submissionId}?processedCompaniesPage=10000&pageSize=100`,
    });

    expect(response.status).toBe(200);
    expect(mocks.listProcessedImportCompanies).toHaveBeenCalledExactlyOnceWith(
      { importBatchId, page: 10_000, pageSize: 100 }, {},
    );
  });

  it.each([
    ["unknown correlation", false, false, true, null],
    ["disabled observations", false, false, false, importBatchId],
    ["synthetic demo", true, false, true, importBatchId],
    ["Demo 3 with demo data", true, true, true, importBatchId],
  ] as const)("withholds processing facts without a permitted source: %s", async (_label, demo, demo3, observations, batchId) => {
    const batch = batchSummary({ import_batch_id: batchId });
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_IMPORTS_ENABLED: true,
      FEATURE_BATCH_OBSERVATION_ENABLED: observations,
      DEMO3_LOCAL_RUNTIME_ENABLED: demo3,
    });
    mocks.isDemoDataEnabled.mockReturnValue(demo);
    mocks.getImportBatchDetail.mockResolvedValueOnce(foundResult(batch));
    mocks.getDemoImportBatchDetail.mockReturnValueOnce(foundResult(batch));

    const response = await get({ url: `${routeUrl}/${submissionId}?processedCompaniesPage=3&pageSize=25` });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: batch,
      meta: { processedCompanies: {
        available: false, data: [], page: 3, pageSize: 25, total: null,
        factSource: "producer_current_company_results_v1",
      } },
    });
    expect(mocks.resolveLeadReadVisibility).not.toHaveBeenCalled();
    expect(mocks.listProcessedImportCompanies).not.toHaveBeenCalled();
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([
    ["blank page", "processedCompaniesPage=", "processedCompaniesPage"],
    ["zero page", "processedCompaniesPage=0", "processedCompaniesPage"],
    ["negative page", "processedCompaniesPage=-1", "processedCompaniesPage"],
    ["fractional page", "processedCompaniesPage=1.5", "processedCompaniesPage"],
    ["exponent page", "processedCompaniesPage=1e2", "processedCompaniesPage"],
    ["page above maximum", "processedCompaniesPage=10001", "processedCompaniesPage"],
    ["unsafe page", "processedCompaniesPage=9007199254740993", "processedCompaniesPage"],
    ["duplicated page", "processedCompaniesPage=1&processedCompaniesPage=2", "processedCompaniesPage"],
    ["blank page size", "processedCompaniesPage=1&pageSize=", "pageSize"],
    ["zero page size", "processedCompaniesPage=1&pageSize=0", "pageSize"],
    ["page size above maximum", "processedCompaniesPage=1&pageSize=101", "pageSize"],
    ["duplicated page size", "processedCompaniesPage=1&pageSize=1&pageSize=2", "pageSize"],
    ["unknown field", "processedCompaniesPage=1&unknown=1", "unknown"],
    ["organization injection", "processedCompaniesPage=1&organizationId=other-org", "organizationId"],
    ["conflicting views", "processedCompaniesPage=1&receivedCompaniesPage=1", "processedCompaniesPage"],
  ])("rejects invalid individual-processing queries before any read: %s", async (_label, query, field) => {
    const response = await get({ url: `${routeUrl}/${submissionId}?${query}` });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: {
      code: "VALIDATION_ERROR", details: [{ field, message: "Valor inválido." }],
    } });
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expect(mocks.resolveLeadReadVisibility).not.toHaveBeenCalled();
    expect(mocks.listProcessedImportCompanies).not.toHaveBeenCalled();
    expect(mocks.listImportReceivedCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("validates processing access and IDs before resolving visibility or querying a producer", async () => {
    const url = `${routeUrl}/${submissionId}?processedCompaniesPage=invalid`;
    mocks.requireApiSession.mockRejectedValueOnce(new SafeApiError("AUTHENTICATION_REQUIRED"));
    const unauthorized = await get({ url });
    expect(unauthorized.status).toBe(401);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    mocks.getServerEnv.mockReturnValueOnce({ FEATURE_IMPORTS_ENABLED: false });
    const disabled = await get({ url });
    expect(disabled.status).toBe(403);
    const invalidId = await get({ id: "invalid", url: `${routeUrl}/invalid?processedCompaniesPage=1` });
    expect(invalidId.status).toBe(400);
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expect(mocks.resolveLeadReadVisibility).not.toHaveBeenCalled();
    expect(mocks.listProcessedImportCompanies).not.toHaveBeenCalled();
  });

  it("denies processing reads without imports permission before any source work", async () => {
    mocks.requireApiSession.mockRejectedValueOnce(new SafeApiError("ACCESS_DENIED"));

    const response = await get({
      url: `${routeUrl}/${submissionId}?processedCompaniesPage=invalid`,
    });

    expect(response.status).toBe(403);
    expect(mocks.requireApiSession).toHaveBeenCalledExactlyOnceWith("imports:read");
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getImportBatchDetail).not.toHaveBeenCalled();
    expect(mocks.resolveLeadReadVisibility).not.toHaveBeenCalled();
    expect(mocks.listProcessedImportCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires a scoped app submission before reading individual producer results", async () => {
    mocks.getImportBatchDetail.mockResolvedValueOnce(notFoundResult());

    const response = await get({ url: `${routeUrl}/${submissionId}?processedCompaniesPage=1` });

    expect(response.status).toBe(404);
    expect(mocks.resolveLeadReadVisibility).not.toHaveBeenCalled();
    expect(mocks.listProcessedImportCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("reads scoped batch, actor visibility, and individual facts in order", async () => {
    const events: string[] = [];
    mocks.getImportBatchDetail.mockImplementationOnce(async () => {
      events.push("scoped-batch");
      return foundResult(batchSummary({ import_batch_id: importBatchId }));
    });
    mocks.resolveLeadReadVisibility.mockImplementationOnce(async () => {
      events.push("visibility"); return {};
    });
    mocks.listProcessedImportCompanies.mockImplementationOnce(async () => {
      events.push("producer");
      return { companies: [], page: 1, pageSize: 100, total: 0 };
    });

    const response = await get({ url: `${routeUrl}/${submissionId}?processedCompaniesPage=1` });

    expect(response.status).toBe(200);
    expect(events).toEqual(["scoped-batch", "visibility", "producer"]);
  });

  it("maps unavailable individual-processing results to a safe 503 without fabrication", async () => {
    mocks.getImportBatchDetail.mockResolvedValueOnce(foundResult(batchSummary({ import_batch_id: importBatchId })));
    mocks.listProcessedImportCompanies.mockRejectedValueOnce(new SafeApiError("DATA_SOURCE_UNAVAILABLE"));

    const response = await get({ url: `${routeUrl}/${submissionId}?processedCompaniesPage=1` });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: {
      code: "DATA_SOURCE_UNAVAILABLE", message: "Não foi possível consultar os dados agora.",
    } });
    expectPrivateNoStore(response);
  });

  it("withholds processing facts when actor visibility cannot be resolved", async () => {
    mocks.getImportBatchDetail.mockResolvedValueOnce(
      foundResult(batchSummary({ import_batch_id: importBatchId })),
    );
    mocks.resolveLeadReadVisibility.mockRejectedValueOnce(new SafeApiError("DATA_SOURCE_UNAVAILABLE"));

    const response = await get({
      url: `${routeUrl}/${submissionId}?processedCompaniesPage=1`,
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: {
      code: "DATA_SOURCE_UNAVAILABLE", message: "Não foi possível consultar os dados agora.",
    } });
    expect(mocks.listProcessedImportCompanies).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("maps unexpected processing failures without exposing source or actor details", async () => {
    mocks.getImportBatchDetail.mockResolvedValueOnce(
      foundResult(batchSummary({ import_batch_id: importBatchId })),
    );
    mocks.listProcessedImportCompanies.mockRejectedValueOnce(
      new Error(`SELECT private_payload FROM internal_table ${organizationId} ${actor.subject} secret-token`),
    );

    const response = await get({
      url: `${routeUrl}/${submissionId}?processedCompaniesPage=1`,
    });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).toContain("UNEXPECTED_ERROR");
    for (const fragment of ["SELECT", "private_payload", "internal_table", organizationId, actor.subject, "secret-token"]) {
      expect(serialized).not.toContain(fragment);
    }
    expectPrivateNoStore(response);
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
