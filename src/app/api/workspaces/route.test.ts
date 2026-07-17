import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { type NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../server/auth/require-api-session";
import type {
  CreateLeadWorkspaceInput,
  CreateLeadWorkspaceResult,
} from "../../../server/commercial/workspace-repository";
import type { LeadWorkspaceDto } from "../../../types/commercial";

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
          permission: "commercial:write",
        ) => Promise<ApiAuthorizationContext>
      >(),
    requireSameOrigin:
      vi.fn<(request: Pick<Request, "headers" | "url">) => void>(),
    getServerEnv: vi.fn<() => CommercialFeatureEnvironment>(),
    createLeadWorkspace:
      vi.fn<
        (
          input: CreateLeadWorkspaceInput,
        ) => Promise<CreateLeadWorkspaceResult>
      >(),
    LeadWorkspaceRepositoryInputError:
      SyntheticLeadWorkspaceRepositoryInputError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../server/commercial/workspace-repository", () => ({
  createLeadWorkspace: mocks.createLeadWorkspace,
  LeadWorkspaceRepositoryInputError:
    mocks.LeadWorkspaceRepositoryInputError,
}));

import { SafeApiError } from "../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-workspaces";
const actorSubject = "oidc|synthetic-commercial-writer";
const assignedSubject = "oidc|synthetic-commercial-owner";
const cnpj = "12345678000195";
const leadRunId = `lr_${"a".repeat(64)}`;
const workspaceId = "00000000-0000-4000-8000-000000000035";
const routeUrl = "http://localhost/api/workspaces";

const actor = {
  issuer: "https://issuer.example.test",
  subject: actorSubject,
  organizationId,
  permissions: ["commercial:write"],
} as const;
const authorizationContext = {
  status: "authorized",
  actor,
} as const satisfies ApiAuthorizationContext;

interface SyntheticJsonRequest
  extends Pick<Request, "headers" | "url" | "json"> {
  readonly json: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
}

interface RouteRequestOptions {
  readonly origin?: string | null;
  readonly url?: string;
  readonly jsonBody?: unknown;
  readonly jsonError?: Error;
  readonly headers?: readonly [string, string][];
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    cnpj_normalizado: cnpj,
    observed_lead_run_id: leadRunId,
    ...overrides,
  };
}

function createRequest(
  options: RouteRequestOptions = {},
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
    json.mockResolvedValue(options.jsonBody ?? validBody());
  }

  return {
    url: options.url ?? routeUrl,
    headers,
    json,
  };
}

async function post(request: SyntheticJsonRequest): Promise<Response> {
  return routeModule.POST(request as unknown as NextRequest);
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
    next_action:
      overrides.next_action === undefined ? null : overrides.next_action,
    next_action_due_at:
      overrides.next_action_due_at === undefined
        ? null
        : overrides.next_action_due_at,
    commercial_outcome:
      overrides.commercial_outcome === undefined
        ? null
        : overrides.commercial_outcome,
    version: overrides.version ?? 1,
    created_by_subject:
      overrides.created_by_subject ?? actorSubject,
    updated_by_subject:
      overrides.updated_by_subject ?? actorSubject,
    created_at:
      overrides.created_at ?? "2026-07-09T12:00:00.000Z",
    updated_at:
      overrides.updated_at ?? "2026-07-09T12:00:00.000Z",
    archived_at:
      overrides.archived_at === undefined ? null : overrides.archived_at,
    archived_by_subject:
      overrides.archived_by_subject === undefined
        ? null
        : overrides.archived_by_subject,
  };
}

function createdResult(
  createdWorkspace: LeadWorkspaceDto = workspace(),
): CreateLeadWorkspaceResult {
  return {
    kind: "created",
    workspace: createdWorkspace,
  };
}

function conflictResult(): CreateLeadWorkspaceResult {
  return {
    kind: "conflict",
    error: {
      code: "LEAD_WORKSPACE_ALREADY_EXISTS",
      httpStatus: 409,
      message: "A commercial workspace already exists for this company.",
    },
  };
}

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/workspaces/route.ts"),
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
  mocks.createLeadWorkspace.mockResolvedValue(createdResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/workspaces", () => {
  it("exports only POST so read, update, and nested workspace APIs are not implemented here", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["POST"]);
    expect(routeSource()).not.toMatch(
      /\bexport\s+async\s+function\s+(?:GET|PUT|PATCH|DELETE)\b/,
    );
  });

  it("requires commercial write before origin, feature, body, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const request = createRequest({
      jsonError: new Error("body must not be read"),
    });

    const response = await post(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Entre para acessar os dados.",
      },
    });
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:write",
    );
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns access denied for missing commercial write without origin, body, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("ACCESS_DENIED"),
    );
    const request = createRequest();

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:write",
    );
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires same-origin before feature, body, or repository work", async () => {
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
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:write",
    );
    expect(mocks.requireSameOrigin).toHaveBeenCalledExactlyOnceWith(
      request,
    );
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires the commercial feature flag before body or repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });
    const request = createRequest();

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(mocks.requireSameOrigin).toHaveBeenCalledExactlyOnceWith(
      request,
    );
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("runs guards, body parsing, and repository delegation in the required order", async () => {
    const events: string[] = [];
    const request = createRequest();
    mocks.requirePermission.mockImplementationOnce(async () => {
      events.push("permission");
      return authorizationContext;
    });
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      events.push("origin");
    });
    mocks.getServerEnv.mockImplementationOnce(() => {
      events.push("feature");
      return { FEATURE_COMMERCIAL_ENABLED: true };
    });
    request.json.mockImplementationOnce(async () => {
      events.push("body");
      return validBody();
    });
    mocks.createLeadWorkspace.mockImplementationOnce(async () => {
      events.push("repository");
      return createdResult();
    });

    const response = await post(request);

    expect(response.status).toBe(201);
    expect(events).toEqual([
      "permission",
      "origin",
      "feature",
      "body",
      "repository",
    ]);
  });

  it("maps malformed JSON to a safe validation error before repository work", async () => {
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
    expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([
    ["invalid cnpj", validBody({ cnpj_normalizado: "123" }), "cnpj_normalizado"],
    [
      "invalid observed run",
      validBody({ observed_lead_run_id: "lead-run" }),
      "observed_lead_run_id",
    ],
    ["array body", [validBody()], "request"],
  ] as const)(
    "rejects invalid JSON body before repository work: %s",
    async (_label, jsonBody, field) => {
      const response = await post(createRequest({ jsonBody }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field, message: "Valor inválido." }],
        },
      });
      expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it.each([
    "organizationId",
    "organization_id",
    "actor",
    "actorSubject",
    "author_subject",
    "permissions",
    "created_by_subject",
    "updated_at",
  ] as const)(
    "rejects server-controlled or unknown body field %s before repository work",
    async (field) => {
      const response = await post(
        createRequest({
          jsonBody: validBody({ [field]: "client-controlled" }),
        }),
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(
        "VALIDATION_ERROR",
      );
      expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("creates an unassigned workspace with verified actor organization and subject", async () => {
    const request = createRequest({
      url: `${routeUrl}?organizationId=org-from-query`,
      headers: [["X-Organization-Id", "org-from-header"]],
      jsonBody: validBody({
        next_action: "Ligar para financeiro",
        next_action_due_at: "2026-07-10T12:00:00.000Z",
      }),
    });
    const createdWorkspace = workspace({
      next_action: "Ligar para financeiro",
      next_action_due_at: "2026-07-10T12:00:00.000Z",
    });
    mocks.createLeadWorkspace.mockResolvedValueOnce(
      createdResult(createdWorkspace),
    );

    const response = await post(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      data: createdWorkspace,
      meta: { result: "created" },
    });
    expect(mocks.createLeadWorkspace).toHaveBeenCalledOnce();
    expect(mocks.createLeadWorkspace).toHaveBeenCalledWith({
      actor: {
        organizationId,
        actorSubject,
        actorIssuer: actor.issuer,
        requestCorrelationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        authorizationBasis: "verified_oidc",
        permissions: ["commercial:write"],
      },
      request: {
        cnpj_normalizado: cnpj,
        observed_lead_run_id: leadRunId,
        next_action: "Ligar para financeiro",
        next_action_due_at: "2026-07-10T12:00:00.000Z",
      },
    });
    const serializedInput = JSON.stringify(
      mocks.createLeadWorkspace.mock.calls[0]?.[0],
    );
    expect(serializedInput).not.toContain("org-from-query");
    expect(serializedInput).not.toContain("org-from-header");
    expectPrivateNoStore(response);
  });

  it("creates a NOT_STARTED workspace for responsible_subject null without commercial assign", async () => {
    const createdWorkspace = workspace({
      responsible_subject: null,
      commercial_stage: "NOT_STARTED",
    });
    mocks.createLeadWorkspace.mockResolvedValueOnce(
      createdResult(createdWorkspace),
    );

    const response = await post(
      createRequest({
        jsonBody: validBody({ responsible_subject: null }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.requirePermission).toHaveBeenCalledOnce();
    expect(mocks.createLeadWorkspace).toHaveBeenCalledWith({
      actor: {
        organizationId,
        actorSubject,
        actorIssuer: actor.issuer,
        requestCorrelationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        authorizationBasis: "verified_oidc",
        permissions: ["commercial:write"],
      },
      request: {
        cnpj_normalizado: cnpj,
        observed_lead_run_id: leadRunId,
        responsible_subject: null,
      },
    });
    expect(await response.json()).toMatchObject({
      data: {
        responsible_subject: null,
        commercial_stage: "NOT_STARTED",
      },
    });
    expectPrivateNoStore(response);
  });

  it("requires commercial assign for non-null responsible_subject before repository work", async () => {
    const response = await post(
      createRequest({
        jsonBody: validBody({ responsible_subject: assignedSubject }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.createLeadWorkspace).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("creates an assigned workspace when the actor has commercial assign", async () => {
    mocks.requirePermission.mockResolvedValueOnce({
      status: "authorized",
      actor: {
        ...actor,
        permissions: ["commercial:write", "commercial:assign"] as const,
      },
    });
    const createdWorkspace = workspace({
      responsible_subject: assignedSubject,
      commercial_stage: "ASSIGNED",
    });
    mocks.createLeadWorkspace.mockResolvedValueOnce(
      createdResult(createdWorkspace),
    );

    const response = await post(
      createRequest({
        jsonBody: validBody({ responsible_subject: assignedSubject }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createLeadWorkspace).toHaveBeenCalledWith({
      actor: {
        organizationId,
        actorSubject,
        actorIssuer: actor.issuer,
        requestCorrelationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        authorizationBasis: "verified_oidc",
        permissions: ["commercial:write", "commercial:assign"],
      },
      request: {
        cnpj_normalizado: cnpj,
        observed_lead_run_id: leadRunId,
        responsible_subject: assignedSubject,
      },
    });
    expect(await response.json()).toMatchObject({
      data: {
        responsible_subject: assignedSubject,
        commercial_stage: "ASSIGNED",
      },
      meta: { result: "created" },
    });
    expectPrivateNoStore(response);
  });

  it("maps existing workspace conflicts to a safe 409 envelope", async () => {
    mocks.createLeadWorkspace.mockResolvedValueOnce(conflictResult());

    const response = await post(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(409);
    expect(JSON.parse(serialized)).toEqual({
      error: {
        code: "LEAD_WORKSPACE_ALREADY_EXISTS",
        message: "A commercial workspace already exists for this company.",
      },
    });
    expect(serialized).not.toContain(cnpj);
    expect(serialized).not.toContain(leadRunId);
    expectPrivateNoStore(response);
  });

  it("maps repository validation failures to a safe 400 envelope", async () => {
    mocks.createLeadWorkspace.mockRejectedValueOnce(
      new mocks.LeadWorkspaceRepositoryInputError(),
    );

    const response = await post(createRequest());

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

  it("does not expose stack traces, SQL, producer payloads, actor data, CNPJ, or secrets in unexpected errors", async () => {
    const failure = Object.assign(
      new Error(
        `SELECT report_json FROM company_validations WHERE cnpj = ${cnpj}`,
      ),
      {
        sql: "INSERT INTO prospecting_app.lead_workspaces VALUES (...)",
        producerPayload: { report_json: "sensitive report" },
        secret: "secret-token",
        organizationId,
        actorSubject,
        cnpj,
      },
    );
    failure.stack = "internal stack at route.ts:1";
    mocks.createLeadWorkspace.mockRejectedValueOnce(failure);

    const response = await post(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).toContain("UNEXPECTED_ERROR");
    for (const fragment of [
      "SELECT",
      "INSERT",
      "report_json",
      "company_validations",
      "prospecting_app",
      "sensitive report",
      "secret-token",
      "internal stack",
      organizationId,
      actorSubject,
      cnpj,
    ]) {
      expect(serialized).not.toContain(fragment);
    }
    expectPrivateNoStore(response);
  });

  it("sets private no-store on success and every safe error response", async () => {
    const success = await post(createRequest());
    const validation = await post(
      createRequest({ jsonBody: validBody({ cnpj_normalizado: "123" }) }),
    );
    mocks.createLeadWorkspace.mockResolvedValueOnce(conflictResult());
    const conflict = await post(createRequest());
    mocks.createLeadWorkspace.mockRejectedValueOnce(
      new Error("synthetic failure"),
    );
    const unexpected = await post(createRequest());

    expect([
      success.status,
      validation.status,
      conflict.status,
      unexpected.status,
    ]).toEqual([201, 400, 409, 500]);

    for (const response of [
      success,
      validation,
      conflict,
      unexpected,
    ]) {
      expectPrivateNoStore(response);
    }
  });

  it("contains no n8n, webhook, fetch, producer client, or direct SQL mutation source", async () => {
    const source = routeSource();
    const response = await post(createRequest());

    expect(response.status).toBe(201);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(source).not.toMatch(/n8n|webhook|fetch\s*\(/i);
    expect(source).not.toMatch(
      /PRODUCER_DATABASE_URL|producer-client|company_validations|company_validation_runs|company_strategic_research_reports/i,
    );
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i);
  });
});
