import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest, type NextRequest as NextRequestType } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../server/auth/require-api-session";
import type {
  GetLeadWorkspaceInput,
  GetLeadWorkspaceResult,
  UpdateLeadWorkspaceInput,
  UpdateLeadWorkspaceResult,
} from "../../../../server/commercial/workspace-repository";
import type { LeadWorkspaceDto } from "../../../../types/commercial";

type CommercialFeatureEnvironment = {
  readonly FEATURE_COMMERCIAL_ENABLED: boolean;
};

const mocks = vi.hoisted(() => {
  class SyntheticLeadWorkspaceRepositoryInputError extends Error {
    readonly code = "INVALID_LEAD_WORKSPACE_INPUT";

    constructor() {
      super("Invalid lead workspace persistence input.");
      this.name = "LeadWorkspaceRepositoryInputError";
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
    getLeadWorkspace:
      vi.fn<
        (input: GetLeadWorkspaceInput) => Promise<GetLeadWorkspaceResult>
      >(),
    updateLeadWorkspace:
      vi.fn<
        (
          input: UpdateLeadWorkspaceInput,
        ) => Promise<UpdateLeadWorkspaceResult>
      >(),
    LeadWorkspaceRepositoryInputError:
      SyntheticLeadWorkspaceRepositoryInputError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../../server/commercial/workspace-repository", () => ({
  getLeadWorkspace: mocks.getLeadWorkspace,
  updateLeadWorkspace: mocks.updateLeadWorkspace,
  LeadWorkspaceRepositoryInputError:
    mocks.LeadWorkspaceRepositoryInputError,
}));

import { SafeApiError } from "../../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-workspace-detail";
const actorSubject = "oidc|synthetic-commercial-manager";
const assignedSubject = "oidc|synthetic-commercial-owner";
const workspaceId = "00000000-0000-4000-8000-000000000036";
const cnpj = "12345678000195";
const leadRunId = `lr_${"b".repeat(64)}`;
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

interface WorkspaceDetailRouteContext {
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

interface DetailOptions {
  readonly id?: unknown;
  readonly url?: string;
  readonly headers?: HeadersInit;
}

function validPatchBody(overrides: Record<string, unknown> = {}) {
  return {
    expected_version: 1,
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
    json.mockResolvedValue(options.jsonBody ?? validPatchBody());
  }

  return {
    url: options.url ?? `${routeUrl}/${workspaceId}`,
    headers,
    json,
  };
}

function detailContext(id: unknown): WorkspaceDetailRouteContext {
  return {
    params: Promise.resolve({ id }),
  };
}

function get(options: DetailOptions = {}): Promise<Response> {
  const id = Object.hasOwn(options, "id") ? options.id : workspaceId;
  const url =
    options.url ??
    `${routeUrl}/${typeof id === "string" ? id : "invalid"}`;

  return routeModule.GET(
    new NextRequest(url, { headers: options.headers }),
    detailContext(id),
  );
}

function patch(
  request: SyntheticJsonRequest,
  ...ids: readonly unknown[]
): Promise<Response> {
  const id = ids.length === 0 ? workspaceId : ids[0];

  return routeModule.PATCH(
    request as unknown as NextRequestType,
    detailContext(id),
  );
}

function workspace(
  overrides: Partial<LeadWorkspaceDto> = {},
): LeadWorkspaceDto {
  return {
    workspace_id: overrides.workspace_id ?? workspaceId,
    organization_id: overrides.organization_id ?? organizationId,
    cnpj_normalizado: overrides.cnpj_normalizado ?? cnpj,
    observed_lead_run_id:
      overrides.observed_lead_run_id ?? leadRunId,
    responsible_subject:
      overrides.responsible_subject === undefined
        ? null
        : overrides.responsible_subject,
    commercial_stage: overrides.commercial_stage ?? "NOT_STARTED",
    next_action: overrides.next_action === undefined ? null : overrides.next_action,
    next_action_due_at:
      overrides.next_action_due_at === undefined
        ? null
        : overrides.next_action_due_at,
    commercial_outcome:
      overrides.commercial_outcome === undefined
        ? null
        : overrides.commercial_outcome,
    version: overrides.version ?? 1,
    created_by_subject: overrides.created_by_subject ?? actorSubject,
    updated_by_subject: overrides.updated_by_subject ?? actorSubject,
    created_at: overrides.created_at ?? "2026-07-10T12:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-07-10T12:00:00.000Z",
    archived_at: overrides.archived_at === undefined ? null : overrides.archived_at,
    archived_by_subject:
      overrides.archived_by_subject === undefined
        ? null
        : overrides.archived_by_subject,
  };
}

function foundResult(
  foundWorkspace: LeadWorkspaceDto = workspace(),
): GetLeadWorkspaceResult {
  return {
    kind: "found",
    workspace: foundWorkspace,
  };
}

function notFoundGetResult(): GetLeadWorkspaceResult {
  return {
    kind: "not_found",
    error: {
      code: "LEAD_WORKSPACE_NOT_FOUND",
      httpStatus: 404,
      message: "Commercial workspace was not found.",
    },
  };
}

function updatedResult(
  updatedWorkspace: LeadWorkspaceDto = workspace({ version: 2 }),
): UpdateLeadWorkspaceResult {
  return {
    kind: "updated",
    workspace: updatedWorkspace,
  };
}

function updateFailureResult(
  kind: Exclude<UpdateLeadWorkspaceResult["kind"], "updated">,
): Exclude<UpdateLeadWorkspaceResult, { readonly kind: "updated" }> {
  switch (kind) {
    case "not_found":
      return {
        kind,
        error: {
          code: "LEAD_WORKSPACE_NOT_FOUND",
          httpStatus: 404,
          message: "Commercial workspace was not found.",
        },
      };
    case "stale_version":
      return {
        kind,
        error: {
          code: "LEAD_WORKSPACE_VERSION_CONFLICT",
          httpStatus: 409,
          message: "Commercial workspace changed. Refresh before saving.",
        },
      };
    case "assignment_conflict":
      return {
        kind,
        error: {
          code: "LEAD_WORKSPACE_ASSIGNMENT_CONFLICT",
          httpStatus: 409,
          message: "Commercial workspace assignment changed. Refresh before saving.",
        },
      };
    case "invalid_transition":
      return {
        kind,
        error: {
          code: "LEAD_WORKSPACE_INVALID_TRANSITION",
          httpStatus: 409,
          message: "Commercial stage transition is not allowed.",
          reason: "UNLISTED_TRANSITION",
        },
      };
  }
}

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/workspaces/[id]/route.ts"),
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
  mocks.getLeadWorkspace.mockResolvedValue(foundResult());
  mocks.updateLeadWorkspace.mockResolvedValue(updatedResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET/PATCH /api/workspaces/:id", () => {
  it("exports only GET and PATCH", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET", "PATCH"]);
    expect(routeSource()).not.toMatch(
      /\bexport\s+async\s+function\s+(?:POST|PUT|DELETE)\b/,
    );
  });

  it("requires commercial read before feature, params, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
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
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:read",
    );
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires commercial write before origin, feature, params, body, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const request = createRequest({
      jsonError: new Error("body must not be read"),
    });

    const response = await patch(request, "not-a-uuid");

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:write",
    );
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.updateLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires same-origin before feature, body, or repository work for PATCH", async () => {
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      throw new SafeApiError("ACCESS_DENIED");
    });
    const request = createRequest({ origin: "http://attacker.test" });

    const response = await patch(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.requireSameOrigin).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.updateLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks the GET feature flag before parameters or repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });

    const response = await get({ id: "not-a-uuid" });

    expect(response.status).toBe(403);
    expect(mocks.getLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks the PATCH feature flag before parameters, body, or repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });
    const request = createRequest({
      jsonError: new Error("body must not be read"),
    });

    const response = await patch(request, "not-a-uuid");

    expect(response.status).toBe(403);
    expect(mocks.requireSameOrigin).toHaveBeenCalledExactlyOnceWith(request);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.updateLeadWorkspace).not.toHaveBeenCalled();
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
      expect(mocks.getLeadWorkspace).not.toHaveBeenCalled();
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
    "rejects invalid PATCH ids before body or repository work: %s",
    async (_label, id) => {
      const request = createRequest({
        jsonError: new Error("body must not be read"),
      });
      const response = await patch(request, id);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field: "id", message: "Valor inválido." }],
        },
      });
      expect(request.json).not.toHaveBeenCalled();
      expect(mocks.updateLeadWorkspace).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("maps malformed PATCH JSON to a safe 400 before repository work", async () => {
    const request = createRequest({
      jsonError: new Error("raw request body and stack must not leak"),
    });

    const response = await patch(request);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(serialized).toContain("VALIDATION_ERROR");
    expect(serialized).toContain("request");
    expect(serialized).not.toContain("raw request body");
    expect(serialized).not.toContain("stack");
    expect(mocks.updateLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([
    ["missing expected version", {}],
    ["zero expected version", validPatchBody({ expected_version: 0 })],
    ["array", [validPatchBody()]],
    ["server organization", validPatchBody({ organizationId: "client-org" })],
    ["server actor", validPatchBody({ actor_subject: "client-subject" })],
    ["unknown permissions", validPatchBody({ permissions: ["commercial:assign"] })],
  ] as const)(
    "rejects invalid or server-controlled PATCH body before repository work: %s",
    async (_label, jsonBody) => {
      const response = await patch(createRequest({ jsonBody }));

      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(
        "VALIDATION_ERROR",
      );
      expect(mocks.updateLeadWorkspace).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("uses only the verified actor organization for GET", async () => {
    const response = await get({
      url: `${routeUrl}/${workspaceId}?organizationId=org-from-query`,
      headers: { "X-Organization-Id": "org-from-header" },
    });
    const serializedInput = JSON.stringify(
      mocks.getLeadWorkspace.mock.calls[0]?.[0],
    );

    expect(response.status).toBe(200);
    expect(mocks.getLeadWorkspace).toHaveBeenCalledExactlyOnceWith({
      actor: { organizationId },
      workspaceId,
    });
    expect(serializedInput).not.toContain("org-from-query");
    expect(serializedInput).not.toContain("org-from-header");
    expectPrivateNoStore(response);
  });

  it("uses verified organization, subject, and permissions for PATCH", async () => {
    const request = createRequest({
      url: `${routeUrl}/${workspaceId}?organizationId=org-from-query`,
      headers: [["X-Organization-Id", "org-from-header"]],
      jsonBody: validPatchBody({
        responsible_subject: assignedSubject,
        next_action: "Retornar para a empresa",
      }),
    });
    const updatedWorkspace = workspace({
      responsible_subject: assignedSubject,
      commercial_stage: "ASSIGNED",
      next_action: "Retornar para a empresa",
      version: 2,
    });
    mocks.updateLeadWorkspace.mockResolvedValueOnce(updatedResult(updatedWorkspace));

    const response = await patch(request);
    const serializedInput = JSON.stringify(
      mocks.updateLeadWorkspace.mock.calls[0]?.[0],
    );

    expect(response.status).toBe(200);
    expect(mocks.updateLeadWorkspace).toHaveBeenCalledExactlyOnceWith({
      actor: {
        organizationId,
        actorSubject,
        actorIssuer: actor.issuer,
        requestCorrelationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        authorizationBasis: "verified_oidc",
        permissions: ["commercial:read", "commercial:write"],
      },
      workspaceId,
      request: {
        expected_version: 1,
        responsible_subject: assignedSubject,
        next_action: "Retornar para a empresa",
      },
    });
    expect(serializedInput).not.toContain("org-from-query");
    expect(serializedInput).not.toContain("org-from-header");
    expectPrivateNoStore(response);
  });

  it("returns GET success as a private no-store data envelope", async () => {
    const foundWorkspace = workspace({ commercial_stage: "CONTACTED" });
    mocks.getLeadWorkspace.mockResolvedValueOnce(foundResult(foundWorkspace));

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: foundWorkspace });
    expectPrivateNoStore(response);
  });

  it("maps GET not_found to a safe 404", async () => {
    mocks.getLeadWorkspace.mockResolvedValueOnce(notFoundGetResult());

    const response = await get();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(404);
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code: "LEAD_WORKSPACE_NOT_FOUND",
        message: "Commercial workspace was not found.",
      },
    });
    for (const fragment of [organizationId, actorSubject, workspaceId, cnpj]) {
      expect(serialized).not.toContain(fragment);
    }
    expectPrivateNoStore(response);
  });

  it("maps GET source failures and unexpected failures to safe envelopes", async () => {
    mocks.getLeadWorkspace.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    const unavailable = await get();

    const failure = Object.assign(
      new Error(`SELECT cnpj FROM prospecting_app.lead_workspaces WHERE id = ${workspaceId}`),
      {
        sql: "SELECT cnpj FROM prospecting_app.lead_workspaces",
        secret: "secret-token",
        organizationId,
        actorSubject,
        cnpj,
      },
    );
    failure.stack = "internal stack at route.ts:1";
    mocks.getLeadWorkspace.mockRejectedValueOnce(failure);
    const unexpected = await get();
    const serialized = JSON.stringify(await unexpected.json());

    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expect(unexpected.status).toBe(500);
    expect(serialized).toContain("UNEXPECTED_ERROR");
    for (const fragment of [
      "SELECT",
      "prospecting_app",
      "secret-token",
      "internal stack",
      organizationId,
      actorSubject,
      cnpj,
      workspaceId,
    ]) {
      expect(serialized).not.toContain(fragment);
    }
    expectPrivateNoStore(unavailable);
    expectPrivateNoStore(unexpected);
  });

  it("returns PATCH success as a private no-store updated envelope", async () => {
    const updatedWorkspace = workspace({
      commercial_stage: "CONTACTED",
      version: 2,
    });
    mocks.updateLeadWorkspace.mockResolvedValueOnce(updatedResult(updatedWorkspace));

    const response = await patch(
      createRequest({
        jsonBody: validPatchBody({ commercial_stage: "CONTACTED" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: updatedWorkspace,
      meta: { result: "updated" },
    });
    expectPrivateNoStore(response);
  });

  it.each([
    ["stale_version", "LEAD_WORKSPACE_VERSION_CONFLICT"],
    ["assignment_conflict", "LEAD_WORKSPACE_ASSIGNMENT_CONFLICT"],
    ["invalid_transition", "LEAD_WORKSPACE_INVALID_TRANSITION"],
  ] as const)(
    "maps PATCH %s to a safe 409 envelope",
    async (kind, code) => {
      mocks.updateLeadWorkspace.mockResolvedValueOnce(updateFailureResult(kind));

      const response = await patch(createRequest());
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(409);
      expect(JSON.parse(serialized)).toMatchObject({
        error: { code },
      });
      expect(serialized).not.toContain("UNLISTED_TRANSITION");
      expect(serialized).not.toContain(organizationId);
      expect(serialized).not.toContain(actorSubject);
      expectPrivateNoStore(response);
    },
  );

  it("maps PATCH not_found to a safe 404", async () => {
    mocks.updateLeadWorkspace.mockResolvedValueOnce(
      updateFailureResult("not_found"),
    );

    const response = await patch(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(404);
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code: "LEAD_WORKSPACE_NOT_FOUND",
        message: "Commercial workspace was not found.",
      },
    });
    expect(serialized).not.toContain(workspaceId);
    expectPrivateNoStore(response);
  });

  it("forwards commercial assign only when it belongs to the verified actor", async () => {
    mocks.requirePermission.mockResolvedValueOnce({
      status: "authorized",
      actor: {
        ...actor,
        permissions: [
          "commercial:read",
          "commercial:write",
          "commercial:assign",
        ] as const,
      },
    });

    const response = await patch(
      createRequest({
        jsonBody: validPatchBody({ responsible_subject: assignedSubject }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateLeadWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          organizationId,
          actorSubject,
          actorIssuer: actor.issuer,
          requestCorrelationId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          ),
          authorizationBasis: "verified_oidc",
          permissions: [
            "commercial:read",
            "commercial:write",
            "commercial:assign",
          ],
        },
      }),
    );
    expectPrivateNoStore(response);
  });

  it("maps repository input failures to a safe 400", async () => {
    mocks.updateLeadWorkspace.mockRejectedValueOnce(
      new mocks.LeadWorkspaceRepositoryInputError(),
    );

    const response = await patch(createRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
        details: [{ field: "request", message: "Valor inválido." }],
      },
    });
    expectPrivateNoStore(response);
  });

  it("keeps the route free of n8n, fetch, producer, direct database, and SQL mutation code", async () => {
    const response = await get();
    const source = routeSource();

    expect(response.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(source).toContain("getLeadWorkspace");
    expect(source).toContain("updateLeadWorkspace");
    expect(source).not.toMatch(/n8n|webhook|fetch\s*\(/i);
    expect(source).not.toMatch(
      /PRODUCER_DATABASE_URL|APP_DATABASE_URL|producer-client|app-client|server\/db|company_validations|company_validation_runs|company_strategic_research_reports/i,
    );
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i);
  });
});
