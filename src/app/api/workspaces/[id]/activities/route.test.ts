import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  NextRequest,
  type NextRequest as NextRequestType,
} from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../../server/auth/require-api-session";
import type {
  AppendLeadActivityInput,
  AppendLeadActivityResult,
  ListLeadActivitiesInput,
  ListLeadActivitiesResult,
} from "../../../../../server/commercial/activity-repository";
import type { LeadActivityDto } from "../../../../../types/commercial";

type CommercialFeatureEnvironment = {
  readonly FEATURE_COMMERCIAL_ENABLED: boolean;
};

const mocks = vi.hoisted(() => {
  class SyntheticLeadActivityRepositoryInputError extends Error {
    readonly code = "INVALID_LEAD_ACTIVITY_INPUT";

    constructor() {
      super("Invalid lead activity persistence input.");
      this.name = "LeadActivityRepositoryInputError";
    }
  }

  return {
    requirePermission:
      vi.fn<
        (
          permission: "commercial:read" | "commercial:write",
        ) => Promise<ApiAuthorizationContext>
      >(),
    requireSameOrigin:
      vi.fn<(request: Pick<Request, "headers" | "url">) => void>(),
    getServerEnv: vi.fn<() => CommercialFeatureEnvironment>(),
    listLeadActivities:
      vi.fn<
        (input: ListLeadActivitiesInput) => Promise<ListLeadActivitiesResult>
      >(),
    appendLeadActivity:
      vi.fn<
        (input: AppendLeadActivityInput) => Promise<AppendLeadActivityResult>
      >(),
    LeadActivityRepositoryInputError:
      SyntheticLeadActivityRepositoryInputError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../../../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("../../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../../../server/commercial/activity-repository", () => ({
  listLeadActivities: mocks.listLeadActivities,
  appendLeadActivity: mocks.appendLeadActivity,
  LeadActivityRepositoryInputError:
    mocks.LeadActivityRepositoryInputError,
}));

import { SafeApiError } from "../../../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-activities";
const actorSubject = "oidc|synthetic-commercial-manager";
const workspaceId = "00000000-0000-4000-8000-000000000037";
const leadRunId = `lr_${"c".repeat(64)}`;
const activityId = "00000000-0000-4000-8000-000000000038";
const routeUrl = "http://localhost/api/workspaces";

const actor = {
  issuer: "https://issuer.example.test",
  subject: actorSubject,
  organizationId,
  permissions: ["commercial:read", "commercial:write"] as const,
} as const;
const authorizationContext = {
  status: "authorized",
  actor,
} as const satisfies ApiAuthorizationContext;

interface ActivityRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

interface SyntheticJsonRequest
  extends Pick<Request, "headers" | "url" | "json"> {
  readonly json: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
}

interface RequestOptions {
  readonly origin?: string | null;
  readonly url?: string;
  readonly jsonBody?: unknown;
  readonly jsonError?: Error;
  readonly headers?: readonly [string, string][];
}

interface ActivityOptions {
  readonly id?: unknown;
  readonly url?: string;
  readonly headers?: HeadersInit;
}

function validActivityBody(overrides: Record<string, unknown> = {}) {
  return {
    occurred_at: "2026-07-10T12:00:00.000Z",
    activity_type: "CALL",
    ...overrides,
  };
}

function createRequest(
  options: RequestOptions = {},
): SyntheticJsonRequest {
  const headers = new Headers();
  const origin =
    options.origin === undefined ? "http://localhost" : options.origin;

  if (origin !== null) {
    headers.set("Origin", origin);
  }

  headers.set("Content-Type", "application/json");

  for (const [name, value] of options.headers ?? []) {
    headers.set(name, value);
  }

  const json = vi.fn<() => Promise<unknown>>();

  if (options.jsonError !== undefined) {
    json.mockRejectedValue(options.jsonError);
  } else {
    json.mockResolvedValue(options.jsonBody ?? validActivityBody());
  }

  return {
    url: options.url ?? `${routeUrl}/${workspaceId}/activities`,
    headers,
    json,
  };
}

function activityContext(id: unknown): ActivityRouteContext {
  return {
    params: Promise.resolve({ id }),
  };
}

function get(options: ActivityOptions = {}): Promise<Response> {
  const id = Object.hasOwn(options, "id") ? options.id : workspaceId;
  const url =
    options.url ??
    `${routeUrl}/${typeof id === "string" ? id : "invalid"}/activities`;

  return routeModule.GET(
    new NextRequest(url, { headers: options.headers }),
    activityContext(id),
  );
}

function post(
  request: SyntheticJsonRequest,
  ...ids: readonly unknown[]
): Promise<Response> {
  const id = ids.length === 0 ? workspaceId : ids[0];

  return routeModule.POST(
    request as unknown as NextRequestType,
    activityContext(id),
  );
}

function activity(
  overrides: Partial<LeadActivityDto> = {},
): LeadActivityDto {
  return {
    activity_id: overrides.activity_id ?? activityId,
    organization_id: overrides.organization_id ?? organizationId,
    workspace_id: overrides.workspace_id ?? workspaceId,
    observed_lead_run_id:
      overrides.observed_lead_run_id ?? leadRunId,
    actor_subject: overrides.actor_subject ?? actorSubject,
    occurred_at: overrides.occurred_at ?? "2026-07-10T12:00:00.000Z",
    activity_type: overrides.activity_type ?? "CALL",
    activity_outcome:
      overrides.activity_outcome === undefined
        ? null
        : overrides.activity_outcome,
    summary: overrides.summary === undefined ? null : overrides.summary,
    created_at: overrides.created_at ?? "2026-07-10T12:01:00.000Z",
  };
}

function listedResult(
  overrides: Partial<Extract<ListLeadActivitiesResult, { kind: "listed" }>> = {},
): ListLeadActivitiesResult {
  return {
    kind: "listed",
    activities: overrides.activities ?? [activity()],
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
    total: overrides.total === undefined ? 1 : overrides.total,
  };
}

function appendedResult(
  appendedActivity: LeadActivityDto = activity(),
): AppendLeadActivityResult {
  return {
    kind: "appended",
    activity: appendedActivity,
  };
}

function listNotFoundResult(): ListLeadActivitiesResult {
  return {
    kind: "not_found",
    error: {
      code: "LEAD_WORKSPACE_NOT_FOUND",
      httpStatus: 404,
      message: "Commercial workspace was not found.",
    },
  };
}

function appendNotFoundResult(): AppendLeadActivityResult {
  return {
    kind: "not_found",
    error: {
      code: "LEAD_WORKSPACE_NOT_FOUND",
      httpStatus: 404,
      message: "Commercial workspace was not found.",
    },
  };
}

function routeSource(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/app/api/workspaces/[id]/activities/route.ts",
    ),
    "utf8",
  );
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(authorizationContext);
  mocks.requireSameOrigin.mockImplementation(() => undefined);
  mocks.getServerEnv.mockReturnValue({
    FEATURE_COMMERCIAL_ENABLED: true,
  });
  mocks.listLeadActivities.mockResolvedValue(listedResult());
  mocks.appendLeadActivity.mockResolvedValue(appendedResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET/POST /api/workspaces/:id/activities", () => {
  it("exports only GET and POST", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET", "POST"]);
    expect(routeSource()).not.toMatch(
      /\bexport\s+async\s+function\s+(?:PATCH|PUT|DELETE)\b/,
    );
  });

  it("requires commercial read before feature, params, query, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await get({
      id: "not-a-uuid",
      url: `${routeUrl}/not-a-uuid/activities?unexpected=value`,
    });

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:read",
    );
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.listLeadActivities).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires commercial write before origin, feature, params, body, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const request = createRequest({
      jsonError: new Error("body must not be read"),
    });

    const response = await post(request, "not-a-uuid");

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:write",
    );
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.appendLeadActivity).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires same-origin before feature, body, or repository work for POST", async () => {
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      throw new SafeApiError("ACCESS_DENIED");
    });
    const request = createRequest({ origin: "http://attacker.test" });

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(mocks.requireSameOrigin).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.appendLeadActivity).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks the GET feature flag before params, query, or repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });

    const response = await get({
      id: "not-a-uuid",
      url: `${routeUrl}/not-a-uuid/activities?unexpected=value`,
    });

    expect(response.status).toBe(403);
    expect(mocks.listLeadActivities).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks the POST feature flag before params, body, or repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });
    const request = createRequest({
      jsonError: new Error("body must not be read"),
    });

    const response = await post(request, "not-a-uuid");

    expect(response.status).toBe(403);
    expect(mocks.requireSameOrigin).toHaveBeenCalledExactlyOnceWith(request);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.appendLeadActivity).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([
    ["missing", undefined],
    ["blank", ""],
    ["trimmed", `${workspaceId} `],
    ["not UUID", "not-a-uuid"],
    ["unsafe object", { value: workspaceId }],
  ] as const)(
    "rejects invalid GET ids without repository work: %s",
    async (_label, id) => {
      const response = await get({ id });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field: "id", message: "Valor inválido." }],
        },
      });
      expect(mocks.listLeadActivities).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it.each([
    ["missing", undefined],
    ["blank", ""],
    ["trimmed", `${workspaceId} `],
    ["not UUID", "not-a-uuid"],
    ["unsafe object", { value: workspaceId }],
  ] as const)(
    "rejects invalid POST ids before body or repository work: %s",
    async (_label, id) => {
      const request = createRequest({
        jsonError: new Error("body must not be read"),
      });
      const response = await post(request, id);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field: "id", message: "Valor inválido." }],
        },
      });
      expect(request.json).not.toHaveBeenCalled();
      expect(mocks.appendLeadActivity).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("uses default pagination and only the verified organization for GET", async () => {
    const response = await get({
      headers: { "X-Organization-Id": "org-from-header" },
    });
    const serializedInput = JSON.stringify(
      mocks.listLeadActivities.mock.calls[0]?.[0],
    );

    expect(response.status).toBe(200);
    expect(mocks.listLeadActivities).toHaveBeenCalledExactlyOnceWith({
      actor: { organizationId },
      workspaceId,
      page: 1,
      pageSize: 20,
    });
    expect(serializedInput).not.toContain("org-from-header");
    expect(await response.json()).toEqual({
      data: [activity()],
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    expectPrivateNoStore(response);
  });

  it("accepts valid bounded pagination", async () => {
    mocks.listLeadActivities.mockResolvedValueOnce(
      listedResult({ page: 10_000, pageSize: 100, total: null }),
    );

    const response = await get({
      url: `${routeUrl}/${workspaceId}/activities?page=10000&pageSize=100`,
    });

    expect(response.status).toBe(200);
    expect(mocks.listLeadActivities).toHaveBeenCalledExactlyOnceWith({
      actor: { organizationId },
      workspaceId,
      page: 10_000,
      pageSize: 100,
    });
    expect(await response.json()).toEqual({
      data: [activity()],
      meta: { page: 10_000, pageSize: 100, total: null },
    });
    expectPrivateNoStore(response);
  });

  it.each([
    ["unknown", "unexpected=value", "unexpected"],
    ["repeated", "page=1&page=2", "page"],
    ["non-integer", "page=1.5", "page"],
    ["zero", "page=0", "page"],
    ["page above maximum", "page=10001", "page"],
    ["page size above maximum", "pageSize=101", "pageSize"],
  ] as const)(
    "rejects %s GET query without repository work",
    async (_label, query, field) => {
      const response = await get({
        url: `${routeUrl}/${workspaceId}/activities?${query}`,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field, message: "Valor inválido." }],
        },
      });
      expect(mocks.listLeadActivities).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("maps malformed POST JSON to a safe 400 before repository work", async () => {
    const request = createRequest({
      jsonError: new Error("raw request body and stack must not leak"),
    });

    const response = await post(request);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(serialized).toContain("VALIDATION_ERROR");
    expect(serialized).toContain("request");
    expect(serialized).not.toContain("raw request body");
    expect(serialized).not.toContain("stack");
    expect(mocks.appendLeadActivity).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([
    ["missing occurrence", { activity_type: "CALL" }],
    ["invalid activity type", validActivityBody({ activity_type: "SMS" })],
    ["unknown field", validActivityBody({ unexpected: "value" })],
    ["server organization", validActivityBody({ organizationId: "client-org" })],
    ["server actor", validActivityBody({ actor_subject: "client-subject" })],
  ] as const)(
    "rejects invalid or server-controlled POST body before repository work: %s",
    async (_label, jsonBody) => {
      const response = await post(createRequest({ jsonBody }));

      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(
        "VALIDATION_ERROR",
      );
      expect(mocks.appendLeadActivity).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("lists paginated activities in a private no-store envelope", async () => {
    const activities = [
      activity({ summary: "Ligação inicial" }),
      activity({
        activity_id: "00000000-0000-4000-8000-000000000039",
        activity_type: "EMAIL",
        summary: "Resumo sintético",
      }),
    ];
    mocks.listLeadActivities.mockResolvedValueOnce(
      listedResult({ activities, page: 2, pageSize: 2, total: 5 }),
    );

    const response = await get({
      url: `${routeUrl}/${workspaceId}/activities?page=2&pageSize=2`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: activities,
      meta: { page: 2, pageSize: 2, total: 5 },
    });
    expectPrivateNoStore(response);
  });

  it("appends with verified organization and subject only", async () => {
    const appendedActivity = activity({
      activity_type: "WHATSAPP",
      activity_outcome: "Agendado",
      summary: "Mensagem enviada",
    });
    mocks.appendLeadActivity.mockResolvedValueOnce(
      appendedResult(appendedActivity),
    );
    const request = createRequest({
      url: `${routeUrl}/${workspaceId}/activities?actorSubject=query-subject&organizationId=query-org`,
      headers: [
        ["X-Organization-Id", "header-org"],
        ["X-Actor-Subject", "header-subject"],
      ],
      jsonBody: validActivityBody({
        activity_type: "WHATSAPP",
        activity_outcome: "Agendado",
        summary: "Mensagem enviada",
      }),
    });

    const response = await post(request);
    const serializedInput = JSON.stringify(
      mocks.appendLeadActivity.mock.calls[0]?.[0],
    );

    expect(response.status).toBe(201);
    expect(mocks.appendLeadActivity).toHaveBeenCalledExactlyOnceWith({
      actor: {
        organizationId,
        actorSubject,
        actorIssuer: actor.issuer,
        requestCorrelationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        authorizationBasis: "verified_oidc",
      },
      workspaceId,
      request: {
        occurred_at: "2026-07-10T12:00:00.000Z",
        activity_type: "WHATSAPP",
        activity_outcome: "Agendado",
        summary: "Mensagem enviada",
      },
    });
    for (const value of [
      "query-subject",
      "query-org",
      "header-org",
      "header-subject",
    ]) {
      expect(serializedInput).not.toContain(value);
    }
    expect(await response.json()).toEqual({
      data: appendedActivity,
      meta: { result: "appended" },
    });
    expectPrivateNoStore(response);
  });

  it("maps GET and POST not_found results to safe 404 envelopes", async () => {
    mocks.listLeadActivities.mockResolvedValueOnce(listNotFoundResult());
    const listed = await get();
    mocks.appendLeadActivity.mockResolvedValueOnce(appendNotFoundResult());
    const appended = await post(createRequest());

    for (const response of [listed, appended]) {
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

  it("maps repository input, source, and unexpected failures to safe envelopes", async () => {
    mocks.listLeadActivities.mockRejectedValueOnce(
      new mocks.LeadActivityRepositoryInputError(),
    );
    const invalidInput = await get();
    mocks.appendLeadActivity.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    const unavailable = await post(createRequest());

    const failure = Object.assign(
      new Error(
        `SELECT summary FROM prospecting_app.lead_activities WHERE workspace_id = ${workspaceId}`,
      ),
      {
        sql: "SELECT summary FROM prospecting_app.lead_activities",
        secret: "secret-token",
        organizationId,
        actorSubject,
      },
    );
    failure.stack = "internal stack at route.ts:1";
    mocks.appendLeadActivity.mockRejectedValueOnce(failure);
    const unexpected = await post(createRequest());
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
      "secret-token",
      "internal stack",
      organizationId,
      actorSubject,
      workspaceId,
    ]) {
      expect(unexpectedSerialized).not.toContain(fragment);
    }
    expectPrivateNoStore(invalidInput);
    expectPrivateNoStore(unavailable);
    expectPrivateNoStore(unexpected);
  });

  it("keeps the route free of external calls, producer access, and direct SQL", async () => {
    const response = await get();
    const source = routeSource();

    expect(response.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(source).toContain("listLeadActivities");
    expect(source).toContain("appendLeadActivity");
    expect(source).not.toMatch(/n8n|webhook|fetch\s*\(/i);
    expect(source).not.toMatch(
      /PRODUCER_DATABASE_URL|APP_DATABASE_URL|producer-client|app-client|server\/db|company_validations|company_validation_runs|company_strategic_research_reports/i,
    );
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i);
  });
});
