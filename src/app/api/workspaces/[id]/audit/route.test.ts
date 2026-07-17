import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../../server/auth/require-api-session";
import type {
  ListCommercialAuditEventsInput,
  ListCommercialAuditEventsResult,
} from "../../../../../server/commercial/audit-repository";
import type { CommercialAuditEventDto } from "../../../../../types/commercial";

type CommercialFeatureEnvironment = {
  readonly FEATURE_COMMERCIAL_ENABLED: boolean;
};

const mocks = vi.hoisted(() => {
  class SyntheticCommercialAuditRepositoryInputError extends Error {
    readonly code = "INVALID_COMMERCIAL_AUDIT_INPUT";

    constructor() {
      super("Invalid commercial audit read input.");
      this.name = "CommercialAuditRepositoryInputError";
    }
  }

  return {
    requirePermission:
      vi.fn<
        (permission: "audit:read") => Promise<ApiAuthorizationContext>
      >(),
    getServerEnv: vi.fn<() => CommercialFeatureEnvironment>(),
    listCommercialAuditEvents:
      vi.fn<
        (
          input: ListCommercialAuditEventsInput,
        ) => Promise<ListCommercialAuditEventsResult>
      >(),
    CommercialAuditRepositoryInputError:
      SyntheticCommercialAuditRepositoryInputError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../../../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("../../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../../../server/commercial/audit-repository", () => ({
  listCommercialAuditEvents: mocks.listCommercialAuditEvents,
  CommercialAuditRepositoryInputError:
    mocks.CommercialAuditRepositoryInputError,
}));

import { SafeApiError } from "../../../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-audit";
const actorSubject = "oidc|synthetic-auditor";
const workspaceId = "00000000-0000-4000-8000-000000000039";
const auditEventId = "00000000-0000-4000-8000-000000000139";
const routeUrl = "http://localhost/api/workspaces";

const authorizationContext = {
  status: "authorized",
  actor: {
    issuer: "https://issuer.example.test",
    subject: actorSubject,
    organizationId,
    permissions: ["audit:read"] as const,
  },
} as const satisfies ApiAuthorizationContext;

interface AuditRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

interface GetOptions {
  readonly id?: unknown;
  readonly url?: string;
  readonly headers?: HeadersInit;
}

function auditEvent(
  overrides: Partial<CommercialAuditEventDto> = {},
): CommercialAuditEventDto {
  return {
    audit_event_id: overrides.audit_event_id ?? auditEventId,
    organization_id: overrides.organization_id ?? organizationId,
    workspace_id: overrides.workspace_id ?? workspaceId,
    actor_subject: overrides.actor_subject ?? actorSubject,
    action: overrides.action ?? "STAGE_CHANGED",
    target_type: overrides.target_type ?? "lead_workspace",
    target_id: overrides.target_id ?? workspaceId,
    observed_lead_run_id: overrides.observed_lead_run_id ?? null,
    previous_metadata:
      overrides.previous_metadata ?? { commercial_stage: "ASSIGNED" },
    new_metadata:
      overrides.new_metadata ?? { commercial_stage: "CONTACTED" },
    metadata:
      overrides.metadata ?? { source: "app", field: "commercial_stage" },
    occurred_at: overrides.occurred_at ?? "2026-07-13T12:00:00.000Z",
  };
}

function listedResult(
  overrides: Partial<Extract<ListCommercialAuditEventsResult, { kind: "listed" }>> = {},
): ListCommercialAuditEventsResult {
  return {
    kind: "listed",
    auditEvents: overrides.auditEvents ?? [auditEvent()],
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
    total: overrides.total === undefined ? 1 : overrides.total,
  };
}

function notFoundResult(): Extract<
  ListCommercialAuditEventsResult,
  { kind: "not_found" }
> {
  return {
    kind: "not_found",
    error: {
      code: "LEAD_WORKSPACE_NOT_FOUND",
      httpStatus: 404,
      message: "Commercial workspace was not found.",
    },
  };
}

function auditContext(id: unknown): AuditRouteContext {
  return { params: Promise.resolve({ id }) };
}

function get(options: GetOptions = {}): Promise<Response> {
  const id = Object.hasOwn(options, "id") ? options.id : workspaceId;
  const url =
    options.url ??
    `${routeUrl}/${typeof id === "string" ? id : "invalid"}/audit`;

  return routeModule.GET(
    new NextRequest(url, { headers: options.headers }),
    auditContext(id),
  );
}

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/workspaces/[id]/audit/route.ts"),
    "utf8",
  );
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(authorizationContext);
  mocks.getServerEnv.mockReturnValue({ FEATURE_COMMERCIAL_ENABLED: true });
  mocks.listCommercialAuditEvents.mockResolvedValue(listedResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/workspaces/:id/audit", () => {
  it("exports only GET", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET"]);
    expect(routeSource()).not.toMatch(
      /\bexport\s+async\s+function\s+(?:POST|PATCH|PUT|DELETE)\b/,
    );
  });

  it("requires audit read before feature, params, query, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await get({
      id: "not-a-uuid",
      url: `${routeUrl}/not-a-uuid/audit?unexpected=value`,
    });

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "audit:read",
    );
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.listCommercialAuditEvents).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks the feature flag before params, query, or repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });

    const response = await get({
      id: "not-a-uuid",
      url: `${routeUrl}/not-a-uuid/audit?unexpected=value`,
    });

    expect(response.status).toBe(403);
    expect(mocks.listCommercialAuditEvents).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([
    ["missing", undefined],
    ["blank", ""],
    ["trimmed", `${workspaceId} `],
    ["not UUID", "not-a-uuid"],
    ["unsafe object", { value: workspaceId }],
  ] as const)(
    "rejects invalid workspace ids before repository work: %s",
    async (_label, id) => {
      const response = await get({ id });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field: "id", message: "Valor inválido." }],
        },
      });
      expect(mocks.listCommercialAuditEvents).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("uses default pagination and only the verified organization", async () => {
    const response = await get({
      headers: { "X-Organization-Id": "organization-from-header" },
    });
    const serializedInput = JSON.stringify(
      mocks.listCommercialAuditEvents.mock.calls[0]?.[0],
    );

    expect(response.status).toBe(200);
    expect(mocks.listCommercialAuditEvents).toHaveBeenCalledExactlyOnceWith({
      actor: { organizationId },
      workspaceId,
      page: 1,
      pageSize: 20,
    });
    expect(serializedInput).not.toContain("organization-from-header");
    expectPrivateNoStore(response);
  });

  it("accepts the valid pagination limits", async () => {
    mocks.listCommercialAuditEvents.mockResolvedValueOnce(
      listedResult({ page: 10_000, pageSize: 100, total: null }),
    );

    const response = await get({
      url: `${routeUrl}/${workspaceId}/audit?page=10000&pageSize=100`,
    });

    expect(response.status).toBe(200);
    expect(mocks.listCommercialAuditEvents).toHaveBeenCalledExactlyOnceWith({
      actor: { organizationId },
      workspaceId,
      page: 10_000,
      pageSize: 100,
    });
    expectPrivateNoStore(response);
  });

  it.each([
    ["unknown", "unexpected=value", "unexpected"],
    ["repeated", "page=1&page=2", "page"],
    ["decimal", "page=1.5", "page"],
    ["zero", "page=0", "page"],
    ["negative", "page=-1", "page"],
    ["page above maximum", "page=10001", "page"],
    ["pageSize above maximum", "pageSize=101", "pageSize"],
  ] as const)(
    "rejects %s query values before repository work",
    async (_label, query, field) => {
      const response = await get({
        url: `${routeUrl}/${workspaceId}/audit?${query}`,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field, message: "Valor inválido." }],
        },
      });
      expect(mocks.listCommercialAuditEvents).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("returns the paginated audit envelope without adding metadata fields", async () => {
    const events = [auditEvent()];
    mocks.listCommercialAuditEvents.mockResolvedValueOnce(
      listedResult({ auditEvents: events, page: 2, pageSize: 1, total: 5 }),
    );

    const response = await get({
      url: `${routeUrl}/${workspaceId}/audit?page=2&pageSize=1`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: events,
      meta: { page: 2, pageSize: 1, total: 5 },
    });
    expectPrivateNoStore(response);
  });

  it("maps missing or cross-organization workspaces to the safe 404", async () => {
    mocks.listCommercialAuditEvents.mockResolvedValueOnce(notFoundResult());
    const missing = await get();
    mocks.listCommercialAuditEvents.mockResolvedValueOnce(notFoundResult());
    const crossOrganization = await get();

    for (const response of [missing, crossOrganization]) {
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(404);
      expect(JSON.parse(serialized)).toEqual({
        error: {
          code: "LEAD_WORKSPACE_NOT_FOUND",
          message: "Commercial workspace was not found.",
        },
      });
      for (const fragment of [organizationId, actorSubject, workspaceId]) {
        expect(serialized).not.toContain(fragment);
      }
      expectPrivateNoStore(response);
    }
  });

  it("maps input, unavailable, and unexpected repository failures safely", async () => {
    mocks.listCommercialAuditEvents.mockRejectedValueOnce(
      new mocks.CommercialAuditRepositoryInputError(),
    );
    const invalidInput = await get();
    mocks.listCommercialAuditEvents.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    const unavailable = await get();

    const failure = Object.assign(
      new Error(
        `SELECT metadata FROM prospecting_app.commercial_audit_events WHERE workspace_id = ${workspaceId}`,
      ),
      {
        sql: "SELECT metadata FROM prospecting_app.commercial_audit_events",
        secret: "synthetic-secret",
        rawMetadata: { note_body: "synthetic note body" },
      },
    );
    failure.stack = "internal stack at audit/route.ts:1";
    mocks.listCommercialAuditEvents.mockRejectedValueOnce(failure);
    const unexpected = await get();
    const unexpectedSerialized = JSON.stringify(await unexpected.json());

    expect(invalidInput.status).toBe(400);
    expect(await invalidInput.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expect(unexpected.status).toBe(500);
    expect(unexpectedSerialized).toContain("UNEXPECTED_ERROR");
    for (const fragment of [
      "SELECT",
      "prospecting_app",
      "synthetic-secret",
      "synthetic note body",
      "internal stack",
      workspaceId,
    ]) {
      expect(unexpectedSerialized).not.toContain(fragment);
    }
    expectPrivateNoStore(invalidInput);
    expectPrivateNoStore(unavailable);
    expectPrivateNoStore(unexpected);
  });

  it("keeps the route free of external calls, direct data access, producer paths, and mutations", async () => {
    const response = await get();
    const source = routeSource();

    expect(response.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(source).toContain("listCommercialAuditEvents");
    expect(source).not.toMatch(/n8n|webhook|fetch\s*\(|console\.|logger/i);
    expect(source).not.toMatch(
      /PRODUCER_DATABASE_URL|APP_DATABASE_URL|producer-client|app-client|server\/db|company_validations|company_validation_runs/i,
    );
    expect(source).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i);
  });
});
