import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../server/auth/require-api-session";
import type {
  CommercialWorkQueueFilters,
  ListCommercialWorkQueueInput,
  ListCommercialWorkQueueResult,
} from "../../../server/commercial/work-queue-repository";
import type {
  CommercialWorkQueueItem,
  CommercialWorkQueueSort,
} from "../../../types/commercial";

type CommercialFeatureEnvironment = {
  readonly FEATURE_COMMERCIAL_ENABLED: boolean;
};

interface DemoWorkQueueInput {
  readonly page: number;
  readonly pageSize: number;
  readonly filters: CommercialWorkQueueFilters;
  readonly sort: CommercialWorkQueueSort;
}

const mocks = vi.hoisted(() => ({
  requirePermission:
    vi.fn<(permission: "commercial:read") => Promise<ApiAuthorizationContext>>(),
  getServerEnv: vi.fn<() => CommercialFeatureEnvironment>(),
  isDemoDataEnabled: vi.fn<() => boolean>(),
  resolveLeadReadVisibility: vi.fn(),
  listDemoCommercialWorkQueue:
    vi.fn<(input: DemoWorkQueueInput) => ListCommercialWorkQueueResult>(),
  listCommercialWorkQueue:
    vi.fn<
      (
        input: ListCommercialWorkQueueInput,
      ) => Promise<ListCommercialWorkQueueResult>
    >(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../server/demo/mode", () => ({
  isDemoDataEnabled: mocks.isDemoDataEnabled,
}));
vi.mock("../../../server/demo/prospecta-demo-data", () => ({
  listDemoCommercialWorkQueue: mocks.listDemoCommercialWorkQueue,
}));
vi.mock("../../../server/leads/lead-read-visibility", () => ({
  resolveLeadReadVisibility: mocks.resolveLeadReadVisibility,
}));
vi.mock("../../../server/commercial/work-queue-repository", () => ({
  listCommercialWorkQueue: mocks.listCommercialWorkQueue,
}));

import { SafeApiError } from "../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-work-queue";
const actorSubject = "oidc|synthetic-commercial-reader";
const routeUrl = "http://localhost/api/work-queue";
const cnpj = "12345678000195";
const leadRunId = `lr_${"a".repeat(64)}`;
const workspaceId = "00000000-0000-4000-8000-000000000034";

const actor = {
  issuer: "https://issuer.example.test",
  subject: actorSubject,
  organizationId,
  permissions: ["commercial:read"],
} as const;
const authorizationContext = {
  status: "authorized",
  actor,
} as const satisfies ApiAuthorizationContext;

function queueItem(
  overrides: Partial<CommercialWorkQueueItem> = {},
): CommercialWorkQueueItem {
  return {
    companyDomain:
      overrides.companyDomain === undefined
        ? "empresa.example"
        : overrides.companyDomain,
    producerLead: overrides.producerLead ?? {
      decision_id: "synthetic-decision-034",
      import_batch_id: "batch-synthetic-034",
      lead_run_id: leadRunId,
      source_row: 34,
      source_hash: "sha256:synthetic-source-034",
      agent_version: "agent-synthetic-v1",
      cnpj,
      companyName: "Empresa Sintetica",
      city: "Recife",
      uf: "PE",
      sector: "Servicos sinteticos",
      score: 82,
      priority: "B",
      recommendedAction: "PROSPECTAR",
      trustStatus: "Revisao Humana",
      confidenceIndicator: "normal",
      lastAnalysisAt: "2026-07-09T12:00:00.000Z",
    },
    workspace:
      overrides.workspace === undefined
        ? {
            workspace_id: workspaceId,
            organization_id: organizationId,
            cnpj_normalizado: cnpj,
            observed_lead_run_id: leadRunId,
            responsible_subject: actorSubject,
            commercial_stage: "CONTACTED",
            next_action: "Ligar para financeiro",
            next_action_due_at: "2026-07-10T12:00:00.000Z",
            commercial_outcome: null,
            version: 2,
            created_by_subject: actorSubject,
            updated_by_subject: actorSubject,
            created_at: "2026-07-09T12:01:00.000Z",
            updated_at: "2026-07-09T12:02:00.000Z",
            archived_at: null,
            archived_by_subject: null,
          }
        : overrides.workspace,
    sources: overrides.sources ?? {
      producer: { factSource: "producer_current_leads_v1" },
      workspace: {
        factSource: "app_lead_workspaces_v1",
        state: "matched",
      },
    },
  };
}

function listedResult(
  overrides: Partial<ListCommercialWorkQueueResult> = {},
): ListCommercialWorkQueueResult {
  return {
    kind: "listed",
    items: overrides.items ?? [queueItem()],
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
    total: overrides.total === undefined ? 1 : overrides.total,
    provenance: overrides.provenance ?? {
      producer: {
        factSource: "producer_current_leads_v1",
        availability: "AVAILABLE",
      },
      workspace: {
        factSource: "app_lead_workspaces_v1",
        availability: "AVAILABLE",
      },
    },
  };
}

function get(query = "", headers?: HeadersInit): Promise<Response> {
  return routeModule.GET(
    new NextRequest(`${routeUrl}${query}`, { headers }),
  );
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
}

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/work-queue/route.ts"),
    "utf8",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(authorizationContext);
  mocks.getServerEnv.mockReturnValue({
    FEATURE_COMMERCIAL_ENABLED: true,
  });
  mocks.isDemoDataEnabled.mockReturnValue(false);
  mocks.resolveLeadReadVisibility.mockResolvedValue({});
  mocks.listDemoCommercialWorkQueue.mockReturnValue(listedResult());
  mocks.listCommercialWorkQueue.mockResolvedValue(listedResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/work-queue", () => {
  it("exports only GET so mutation methods are not implemented here", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET"]);
    expect(routeSource()).not.toMatch(
      /\bexport\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/,
    );
  });

  it("requires commercial read permission before feature, validation, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await get("?page=invalid");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Entre para acessar os dados.",
      },
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith("commercial:read");
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns access denied for missing commercial read permission without repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
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
    expect(mocks.requirePermission).toHaveBeenCalledWith("commercial:read");
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires the commercial feature flag before validation or repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });

    const response = await get("?page=invalid");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks permission, feature, visibility, and repository access in order", async () => {
    const events: string[] = [];
    mocks.requirePermission.mockImplementationOnce(async () => {
      events.push("permission");
      return authorizationContext;
    });
    mocks.getServerEnv.mockImplementationOnce(() => {
      events.push("feature");
      return { FEATURE_COMMERCIAL_ENABLED: true };
    });
    mocks.resolveLeadReadVisibility.mockImplementationOnce(async () => {
      events.push("visibility");
      return {};
    });
    mocks.listCommercialWorkQueue.mockImplementationOnce(async () => {
      events.push("repository");
      return listedResult();
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect(events).toEqual([
      "permission",
      "feature",
      "visibility",
      "repository",
    ]);
  });

  it("uses only synthetic queue data when the explicit demo profile is enabled", async () => {
    const result = listedResult({ page: 2, pageSize: 10, total: 1 });
    mocks.isDemoDataEnabled.mockReturnValueOnce(true);
    mocks.listDemoCommercialWorkQueue.mockReturnValueOnce(result);

    const response = await get("?page=2&pageSize=10&uf=PE&priority=B");

    expect(response.status).toBe(200);
    expect(mocks.listDemoCommercialWorkQueue).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      filters: { uf: "PE", priority: "B" },
      sort: "last_analysis_desc",
    });
    expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
    expect(mocks.resolveLeadReadVisibility).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      data: result.items,
      meta: {
        page: 2,
        pageSize: 10,
        total: 1,
        provenance: result.provenance,
      },
    });
  });

  it("uses default pagination and the verified actor organization", async () => {
    const response = await get("", {
      "X-Organization-Id": "org-from-header",
    });

    expect(response.status).toBe(200);
    expect(mocks.listCommercialWorkQueue).toHaveBeenCalledOnce();
    expect(mocks.listCommercialWorkQueue).toHaveBeenCalledWith(
      {
        actor: { organizationId },
        page: 1,
        pageSize: 20,
        filters: {},
        sort: "last_analysis_desc",
      },
      {},
    );
    expect(
      JSON.stringify(mocks.listCommercialWorkQueue.mock.calls[0]?.[0]),
    ).not.toContain(actorSubject);
  });

  it("forwards valid page and pageSize query parameters", async () => {
    const response = await get("?page=3&pageSize=50");

    expect(response.status).toBe(200);
    expect(mocks.listCommercialWorkQueue).toHaveBeenCalledWith(
      {
        actor: { organizationId },
        page: 3,
        pageSize: 50,
        filters: {},
        sort: "last_analysis_desc",
      },
      {},
    );
  });

  it("passes current-lead visibility resolved from the authenticated actor", async () => {
    const visibility = {
      includeTestRunsFromImportBatchIds: ["synthetic-correlated-batch"],
    } as const;
    mocks.resolveLeadReadVisibility.mockResolvedValueOnce(visibility);

    const response = await get();

    expect(response.status).toBe(200);
    expect(mocks.resolveLeadReadVisibility).toHaveBeenCalledWith(
      authorizationContext.actor,
    );
    expect(mocks.listCommercialWorkQueue).toHaveBeenCalledWith(
      {
        actor: { organizationId },
        page: 1,
        pageSize: 20,
        filters: {},
        sort: "last_analysis_desc",
      },
      visibility,
    );
  });

  it.each([
    ["zero page", "?page=0", "page"],
    ["fractional page", "?page=1.5", "page"],
    ["oversized page", "?page=10001", "page"],
    ["zero page size", "?pageSize=0", "pageSize"],
    ["oversized page size", "?pageSize=101", "pageSize"],
  ] as const)(
    "rejects invalid pagination before repository work: %s",
    async (_label, query, field) => {
      const response = await get(query);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field, message: "Valor inválido." }],
        },
      });
      expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("rejects unknown query parameters before repository work", async () => {
    const response = await get("?organizationId=org-from-query");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "organizationId", message: "Valor inválido." }],
      },
    });
    expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("rejects repeated query parameters before repository work", async () => {
    const response = await get("?priority=B&priority=C");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "priority", message: "Valor inválido." }],
      },
    });
    expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("forwards valid producer and commercial filters", async () => {
    const response = await get(
      `?cnpj_normalizado=${cnpj}&uf=PE&priority=B&commercial_stage=CONTACTED&responsible_subject=${encodeURIComponent(
        actorSubject,
      )}`,
    );

    expect(response.status).toBe(200);
    expect(mocks.listCommercialWorkQueue).toHaveBeenCalledWith(
      {
        actor: { organizationId },
        page: 1,
        pageSize: 20,
        filters: {
          cnpj_normalizado: cnpj,
          uf: "PE",
          priority: "B",
          commercial_stage: "CONTACTED",
          responsible_subject: actorSubject,
        },
        sort: "last_analysis_desc",
      },
      {},
    );
  });

  it.each([
    ["invalid cnpj", "?cnpj_normalizado=123", "cnpj_normalizado"],
    ["invalid uf", "?uf=XX", "uf"],
    ["invalid priority", "?priority=A", "priority"],
    ["invalid commercial stage", "?commercial_stage=OPEN", "commercial_stage"],
    ["blank responsible", "?responsible_subject=", "responsible_subject"],
  ] as const)(
    "rejects invalid filters before repository work: %s",
    async (_label, query, field) => {
      const response = await get(query);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field, message: "Valor inválido." }],
        },
      });
      expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("forwards the approved sort parameter", async () => {
    const response = await get("?sort=last_analysis_desc");

    expect(response.status).toBe(200);
    expect(mocks.listCommercialWorkQueue).toHaveBeenCalledWith(
      {
        actor: { organizationId },
        page: 1,
        pageSize: 20,
        filters: {},
        sort: "last_analysis_desc",
      },
      {},
    );
  });

  it("rejects invalid sort values before repository work", async () => {
    const response = await get("?sort=score_desc");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: [{ field: "sort", message: "Valor inválido." }],
      },
    });
    expect(mocks.listCommercialWorkQueue).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns a paginated work queue envelope with safe provenance metadata", async () => {
    const result = listedResult({ page: 2, pageSize: 10, total: 12 });
    mocks.listCommercialWorkQueue.mockResolvedValueOnce(result);

    const response = await get("?page=2&pageSize=10");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: result.items,
      meta: {
        page: 2,
        pageSize: 10,
        total: 12,
        provenance: result.provenance,
      },
    });
    expectPrivateNoStore(response);
  });

  it("preserves null totals and producer unavailability provenance", async () => {
    const result = listedResult({
      items: [],
      total: null,
      provenance: {
        producer: {
          factSource: "producer_current_leads_v1",
          availability: "UNAVAILABLE",
          unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
        },
        workspace: {
          factSource: "app_lead_workspaces_v1",
          availability: "AVAILABLE",
        },
      },
    });
    mocks.listCommercialWorkQueue.mockResolvedValueOnce(result);

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: null,
        provenance: result.provenance,
      },
    });
    expectPrivateNoStore(response);
  });

  it("maps data-source failures to a safe no-store envelope", async () => {
    mocks.listCommercialWorkQueue.mockRejectedValueOnce(
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

  it("does not expose stack traces, SQL, producer payloads, actor data, or sensitive content in errors", async () => {
    const failure = Object.assign(
      new Error(
        "SELECT report_json FROM company_validations with secret-token and person@example.test",
      ),
      {
        sql: "SELECT report_json FROM company_validations",
        producerPayload: { report_json: "sensitive report" },
        secret: "secret-token",
        email: "person@example.test",
        organizationId,
        subject: actorSubject,
      },
    );
    failure.stack = "internal stack at route.ts:1";
    mocks.listCommercialWorkQueue.mockRejectedValueOnce(failure);

    const response = await get();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).toContain("UNEXPECTED_ERROR");
    for (const fragment of [
      "SELECT",
      "report_json",
      "company_validations",
      "secret-token",
      "person@example.test",
      "sensitive report",
      "internal stack",
      organizationId,
      actorSubject,
    ]) {
      expect(serialized).not.toContain(fragment);
    }
    expectPrivateNoStore(response);
  });

  it("sets private no-store on success and validation errors", async () => {
    const success = await get();
    const validation = await get("?sort=invalid");

    expect([success.status, validation.status]).toEqual([200, 400]);
    expectPrivateNoStore(success);
    expectPrivateNoStore(validation);
  });

  it("contains no n8n, webhook, fetch, or mutation SQL in the route source", () => {
    const source = routeSource();

    expect(source).not.toMatch(/n8n|webhook|fetch\s*\(/i);
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(source).not.toMatch(
      /\bexport\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/,
    );
  });
});
