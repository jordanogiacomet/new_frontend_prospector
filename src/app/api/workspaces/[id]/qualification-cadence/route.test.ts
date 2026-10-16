import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest, type NextRequest as NextRequestType } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../../server/auth/require-api-session";
import type {
  GetQualificationCadenceInput,
  GetQualificationCadenceResult,
  RecordQualificationContactInput,
  RecordQualificationContactResult,
  StartQualificationCadenceInput,
  StartQualificationCadenceResult,
} from "../../../../../server/commercial/qualification-cadence-repository";
import type { QualificationCadenceDto } from "../../../../../types/commercial";

type CommercialFeatureEnvironment = {
  readonly FEATURE_COMMERCIAL_ENABLED: boolean;
};

const mocks = vi.hoisted(() => {
  class SyntheticQualificationCadenceRepositoryInputError extends Error {}

  return {
    requirePermission: vi.fn<
      (
        permission: "commercial:read" | "commercial:write",
      ) => Promise<ApiAuthorizationContext>
    >(),
    requireSameOrigin:
      vi.fn<(request: Pick<Request, "headers" | "url">) => void>(),
    getServerEnv: vi.fn<() => CommercialFeatureEnvironment>(),
    getQualificationCadence:
      vi.fn<
        (
          input: GetQualificationCadenceInput,
        ) => Promise<GetQualificationCadenceResult>
      >(),
    startQualificationCadence:
      vi.fn<
        (
          input: StartQualificationCadenceInput,
        ) => Promise<StartQualificationCadenceResult>
      >(),
    recordQualificationContact:
      vi.fn<
        (
          input: RecordQualificationContactInput,
        ) => Promise<RecordQualificationContactResult>
      >(),
    QualificationCadenceRepositoryInputError:
      SyntheticQualificationCadenceRepositoryInputError,
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
vi.mock(
  "../../../../../server/commercial/qualification-cadence-repository",
  () => ({
    getQualificationCadence: mocks.getQualificationCadence,
    startQualificationCadence: mocks.startQualificationCadence,
    recordQualificationContact: mocks.recordQualificationContact,
    QualificationCadenceRepositoryInputError:
      mocks.QualificationCadenceRepositoryInputError,
  }),
);

import { SafeApiError } from "../../../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-cadence-route";
const workspaceId = "00000000-0000-4000-8000-000000000721";
const routeUrl = `http://localhost/api/workspaces/${workspaceId}/qualification-cadence`;
const actor = {
  issuer: "https://issuer.example.test",
  subject: "oidc|synthetic-manager",
  organizationId,
  permissions: ["commercial:read", "commercial:write"] as const,
} as const;
const authorizationContext = {
  status: "authorized",
  actor,
} as const satisfies ApiAuthorizationContext;

interface RouteContext {
  readonly params: Promise<{ readonly id?: unknown }>;
}

interface SyntheticRequest extends Pick<Request, "headers" | "url" | "json"> {
  readonly json: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
}

const cadence: QualificationCadenceDto = {
  status: "ACTIVE",
  current_contact_number: 1,
  contacts: [1, 2, 3, 4].map((contactNumber) => ({
    qualification_contact_id: `00000000-0000-4000-8000-00000000072${contactNumber}`,
    contact_number: contactNumber as 1 | 2 | 3 | 4,
    scheduled_at: `2026-08-${String(10 + contactNumber).padStart(2, "0")}T12:00:00.000Z`,
    state: "PENDING" as const,
    outcome: null,
    channel: null,
    summary: null,
    completed_at: null,
  })),
};

function context(id: unknown = workspaceId): RouteContext {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown): SyntheticRequest {
  const headers = new Headers({
    Origin: "http://localhost",
    "Content-Type": "application/json",
  });

  return {
    url: routeUrl,
    headers,
    json: vi.fn<() => Promise<unknown>>().mockResolvedValue(body),
  };
}

function post(body: unknown, id: unknown = workspaceId): Promise<Response> {
  return routeModule.POST(
    request(body) as unknown as NextRequestType,
    context(id),
  );
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/app/api/workspaces/[id]/qualification-cadence/route.ts",
    ),
    "utf8",
  );
}

function notFound() {
  return {
    kind: "not_found" as const,
    error: {
      code: "LEAD_WORKSPACE_NOT_FOUND",
      httpStatus: 404 as const,
      message: "Commercial workspace was not found.",
    },
  } as const;
}

function conflict() {
  return {
    kind: "conflict" as const,
    error: {
      code: "QUALIFICATION_CADENCE_CONFLICT",
      httpStatus: 409 as const,
      message: "Qualification cadence changed. Refresh before continuing.",
    },
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(authorizationContext);
  mocks.requireSameOrigin.mockImplementation(() => undefined);
  mocks.getServerEnv.mockReturnValue({ FEATURE_COMMERCIAL_ENABLED: true });
  mocks.getQualificationCadence.mockResolvedValue({ kind: "found", cadence });
  mocks.startQualificationCadence.mockResolvedValue({ kind: "started", cadence });
  mocks.recordQualificationContact.mockResolvedValue({
    kind: "recorded",
    cadence,
    pipelineAction: {
      kind: "automatic",
      reasonCode: "QUALIFICATION_NO_RESPONSE_FOLLOW_UP",
      changes: {
        commercialStage: "FOLLOW_UP",
        commercialOutcome: null,
        nextAction: "Realizar o 2º contato de qualificação",
        nextActionDueAt: "2026-08-12T12:00:00.000Z",
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET/POST /api/workspaces/:id/qualification-cadence", () => {
  it("exports only GET and POST and never exposes producer or send paths", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET", "POST"]);
    expect(source()).not.toMatch(/producer|n8n|webhook|fetch\(|sendMessage/i);
  });

  it("requires read permission before feature, params, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await routeModule.GET(
      new NextRequest(`${routeUrl}?unexpected=value`),
      context("invalid"),
    );

    expect(response.status).toBe(401);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getQualificationCadence).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns the organization-scoped cadence with no-store", async () => {
    const response = await routeModule.GET(
      new NextRequest(routeUrl),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: cadence });
    expect(mocks.getQualificationCadence).toHaveBeenCalledWith({
      actor: { organizationId },
      workspaceId,
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("requires write permission and same origin before body or repository work", async () => {
    mocks.requirePermission.mockResolvedValueOnce(authorizationContext);
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      throw new SafeApiError("ACCESS_DENIED");
    });
    const syntheticRequest = request({ action: "start" });

    const response = await routeModule.POST(
      syntheticRequest as unknown as NextRequestType,
      context(),
    );

    expect(response.status).toBe(403);
    expect(syntheticRequest.json).not.toHaveBeenCalled();
    expect(mocks.startQualificationCadence).not.toHaveBeenCalled();
  });

  it("starts the four-contact cadence through the audited actor", async () => {
    const body = {
      action: "start",
      start_at: "2026-08-20T12:00:00Z",
      interval_days: 3,
    };
    const response = await post(body);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: cadence,
      meta: { result: "started" },
    });
    expect(mocks.startQualificationCadence).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        organizationId,
        actorSubject: actor.subject,
      }),
      workspaceId,
      request: body,
    });
  });

  it("records the current contact and returns the updated cadence", async () => {
    const body = {
      action: "record_contact",
      contact_number: 1,
      occurred_at: "2026-08-20T15:00:00Z",
      channel: "WHATSAPP",
      outcome: "NO_RESPONSE",
      summary: "Tentativa sem retorno.",
    };
    const response = await post(body);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: cadence,
      meta: {
        result: "recorded",
        pipelineAction: {
          kind: "automatic",
          commercial_stage: "FOLLOW_UP",
        },
      },
    });
    expect(mocks.recordQualificationContact).toHaveBeenCalledWith({
      actor: expect.objectContaining({ organizationId }),
      workspaceId,
      request: body,
    });
  });

  it.each([
    [{ action: "start", start_at: "invalid", interval_days: 3 }, "start_at"],
    [
      {
        action: "record_contact",
        contact_number: 4,
        occurred_at: "2026-08-20T15:00:00Z",
        channel: "CALL",
        outcome: "FOLLOW_UP_LATER",
        next_contact_at: "2026-08-23T12:00:00Z",
      },
      "next_contact_at",
    ],
    [
      {
        action: "start",
        start_at: "2026-08-20T12:00:00Z",
        interval_days: 3,
        organization_id: organizationId,
      },
      "request",
    ],
  ])("rejects invalid or server-controlled payload %#", async (body, field) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: expect.arrayContaining([{ field, message: "Valor inválido." }]),
      },
    });
    expect(mocks.startQualificationCadence).not.toHaveBeenCalled();
    expect(mocks.recordQualificationContact).not.toHaveBeenCalled();
  });

  it("maps not-found and cadence conflicts to safe business errors", async () => {
    mocks.getQualificationCadence.mockResolvedValueOnce(notFound());
    const missing = await routeModule.GET(new NextRequest(routeUrl), context());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: {
        code: "LEAD_WORKSPACE_NOT_FOUND",
        message: "Commercial workspace was not found.",
      },
    });

    mocks.startQualificationCadence.mockResolvedValueOnce(conflict());
    const changed = await post({
      action: "start",
      start_at: "2026-08-20T12:00:00Z",
      interval_days: 3,
    });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toEqual({
      error: {
        code: "QUALIFICATION_CADENCE_CONFLICT",
        message: "Qualification cadence changed. Refresh before continuing.",
      },
    });
  });
});
