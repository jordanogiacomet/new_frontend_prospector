import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  NextRequest,
  type NextRequest as NextRequestType,
} from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../../server/auth/require-api-session";
import type {
  AppendLeadNoteInput,
  AppendLeadNoteResult,
  ListLeadNotesInput,
  ListLeadNotesResult,
} from "../../../../../server/commercial/note-repository";
import type { LeadNoteDto } from "../../../../../types/commercial";

type CommercialFeatureEnvironment = {
  readonly FEATURE_COMMERCIAL_ENABLED: boolean;
};

const mocks = vi.hoisted(() => {
  class SyntheticLeadNoteRepositoryInputError extends Error {
    readonly code = "INVALID_LEAD_NOTE_INPUT";

    constructor() {
      super("Invalid lead note persistence input.");
      this.name = "LeadNoteRepositoryInputError";
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
    listLeadNotes:
      vi.fn<(input: ListLeadNotesInput) => Promise<ListLeadNotesResult>>(),
    appendLeadNote:
      vi.fn<(input: AppendLeadNoteInput) => Promise<AppendLeadNoteResult>>(),
    LeadNoteRepositoryInputError: SyntheticLeadNoteRepositoryInputError,
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
vi.mock("../../../../../server/commercial/note-repository", () => ({
  listLeadNotes: mocks.listLeadNotes,
  appendLeadNote: mocks.appendLeadNote,
  LeadNoteRepositoryInputError: mocks.LeadNoteRepositoryInputError,
}));

import { SafeApiError } from "../../../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-notes";
const actorSubject = "oidc|synthetic-commercial-manager";
const workspaceId = "00000000-0000-4000-8000-000000000038";
const leadRunId = `lr_${"d".repeat(64)}`;
const noteId = "00000000-0000-4000-8000-000000000039";
const routeUrl = "http://localhost/api/workspaces";
const distinctiveNoteBody = "NOTA-SINTETICA-NUNCA-VAZAR-8472";

const authorizationContext = {
  status: "authorized",
  actor: {
    issuer: "https://issuer.example.test",
    subject: actorSubject,
    organizationId,
    permissions: ["commercial:read", "commercial:write"] as const,
  },
} as const satisfies ApiAuthorizationContext;

interface NoteRouteContext {
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

interface GetOptions {
  readonly id?: unknown;
  readonly url?: string;
  readonly headers?: HeadersInit;
}

function validNoteBody(overrides: Record<string, unknown> = {}) {
  return { body: distinctiveNoteBody, ...overrides };
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
    json.mockResolvedValue(options.jsonBody ?? validNoteBody());
  }

  return {
    url: options.url ?? `${routeUrl}/${workspaceId}/notes`,
    headers,
    json,
  };
}

function noteContext(id: unknown): NoteRouteContext {
  return { params: Promise.resolve({ id }) };
}

function get(options: GetOptions = {}): Promise<Response> {
  const id = Object.hasOwn(options, "id") ? options.id : workspaceId;
  const url =
    options.url ?? `${routeUrl}/${typeof id === "string" ? id : "invalid"}/notes`;

  return routeModule.GET(
    new NextRequest(url, { headers: options.headers }),
    noteContext(id),
  );
}

function post(
  request: SyntheticJsonRequest,
  id: unknown = workspaceId,
): Promise<Response> {
  return routeModule.POST(
    request as unknown as NextRequestType,
    noteContext(id),
  );
}

function note(overrides: Partial<LeadNoteDto> = {}): LeadNoteDto {
  return {
    note_id: overrides.note_id ?? noteId,
    organization_id: overrides.organization_id ?? organizationId,
    workspace_id: overrides.workspace_id ?? workspaceId,
    observed_lead_run_id: overrides.observed_lead_run_id ?? leadRunId,
    author_subject: overrides.author_subject ?? actorSubject,
    body: overrides.body ?? distinctiveNoteBody,
    created_at: overrides.created_at ?? "2026-07-10T12:01:00.000Z",
  };
}

function listedResult(
  overrides: Partial<Extract<ListLeadNotesResult, { kind: "listed" }>> = {},
): ListLeadNotesResult {
  return {
    kind: "listed",
    notes: overrides.notes ?? [note()],
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
    total: overrides.total === undefined ? 1 : overrides.total,
  };
}

function appendedResult(appendedNote: LeadNoteDto = note()): AppendLeadNoteResult {
  return { kind: "appended", note: appendedNote };
}

function notFoundResult(): Extract<
  ListLeadNotesResult,
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

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/workspaces/[id]/notes/route.ts"),
    "utf8",
  );
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(authorizationContext);
  mocks.requireSameOrigin.mockImplementation(() => undefined);
  mocks.getServerEnv.mockReturnValue({ FEATURE_COMMERCIAL_ENABLED: true });
  mocks.listLeadNotes.mockResolvedValue(listedResult());
  mocks.appendLeadNote.mockResolvedValue(appendedResult());
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected external fetch.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET/POST /api/workspaces/:id/notes", () => {
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
      url: `${routeUrl}/not-a-uuid/notes?unexpected=value`,
    });

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:read",
    );
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.listLeadNotes).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires commercial write before origin, feature, params, body, or repository work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const request = createRequest({
      jsonError: new Error(distinctiveNoteBody),
    });

    const response = await post(request, "not-a-uuid");
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "commercial:write",
    );
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.appendLeadNote).not.toHaveBeenCalled();
    expect(serialized).not.toContain(distinctiveNoteBody);
    expectPrivateNoStore(response);
  });

  it("requires same-origin before feature, body, or repository work for POST", async () => {
    mocks.requireSameOrigin.mockImplementationOnce(() => {
      throw new SafeApiError("ACCESS_DENIED");
    });
    const request = createRequest();

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(mocks.requireSameOrigin).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.appendLeadNote).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks the feature flag before GET params, query, and repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });

    const response = await get({
      id: "not-a-uuid",
      url: `${routeUrl}/not-a-uuid/notes?unexpected=value`,
    });

    expect(response.status).toBe(403);
    expect(mocks.listLeadNotes).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks the feature flag before POST params, body, and repository work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({
      FEATURE_COMMERCIAL_ENABLED: false,
    });
    const request = createRequest({ jsonError: new Error(distinctiveNoteBody) });

    const response = await post(request, "not-a-uuid");
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(403);
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.appendLeadNote).not.toHaveBeenCalled();
    expect(serialized).not.toContain(distinctiveNoteBody);
    expectPrivateNoStore(response);
  });

  it.each(["", `${workspaceId} `, "not-a-uuid", { id: workspaceId }] as const)(
    "rejects an invalid GET workspace id before repository work",
    async (id) => {
      const response = await get({ id });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_ERROR", details: [{ field: "id" }] },
      });
      expect(mocks.listLeadNotes).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it.each(["", `${workspaceId} `, "not-a-uuid", { id: workspaceId }] as const)(
    "rejects an invalid POST workspace id before body or repository work",
    async (id) => {
      const request = createRequest({ jsonError: new Error(distinctiveNoteBody) });
      const response = await post(request, id);
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(400);
      expect(request.json).not.toHaveBeenCalled();
      expect(mocks.appendLeadNote).not.toHaveBeenCalled();
      expect(serialized).not.toContain(distinctiveNoteBody);
      expectPrivateNoStore(response);
    },
  );

  it("uses default pagination and the verified organization only for GET", async () => {
    const response = await get({ headers: { "X-Organization-Id": "header-org" } });

    expect(response.status).toBe(200);
    expect(mocks.listLeadNotes).toHaveBeenCalledExactlyOnceWith({
      actor: { organizationId },
      workspaceId,
      page: 1,
      pageSize: 20,
    });
    expect(JSON.stringify(mocks.listLeadNotes.mock.calls[0]?.[0])).not.toContain(
      "header-org",
    );
    expectPrivateNoStore(response);
  });

  it("accepts bounded page and pageSize values", async () => {
    mocks.listLeadNotes.mockResolvedValueOnce(
      listedResult({ page: 10_000, pageSize: 100, total: null }),
    );

    const response = await get({
      url: `${routeUrl}/${workspaceId}/notes?page=10000&pageSize=100`,
    });

    expect(response.status).toBe(200);
    expect(mocks.listLeadNotes).toHaveBeenCalledExactlyOnceWith({
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
    ["page above maximum", "page=10001", "page"],
    ["pageSize above maximum", "pageSize=101", "pageSize"],
  ] as const)(
    "rejects %s GET query before repository work",
    async (_label, query, field) => {
      const response = await get({
        url: `${routeUrl}/${workspaceId}/notes?${query}`,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_ERROR", details: [{ field }] },
      });
      expect(mocks.listLeadNotes).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("maps malformed JSON to validation without exposing the note body", async () => {
    const request = createRequest({ jsonError: new Error(distinctiveNoteBody) });

    const response = await post(request);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(serialized).toContain("VALIDATION_ERROR");
    expect(serialized).not.toContain(distinctiveNoteBody);
    expect(mocks.appendLeadNote).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it.each([
    ["missing body", {}],
    ["blank body", { body: "" }],
    ["unknown field", validNoteBody({ unexpected: "value" })],
    ["server organization", validNoteBody({ organizationId: "client-org" })],
    ["server subject", validNoteBody({ actorSubject: "client-subject" })],
  ] as const)(
    "rejects strict POST body input without repository work: %s",
    async (_label, jsonBody) => {
      const response = await post(createRequest({ jsonBody }));
      const serialized = JSON.stringify(await response.json());

      expect(response.status).toBe(400);
      expect(serialized).toContain("VALIDATION_ERROR");
      expect(serialized).not.toContain(distinctiveNoteBody);
      expect(mocks.appendLeadNote).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("lists paginated notes in the required success envelope", async () => {
    const notes = [note(), note({ note_id: "00000000-0000-4000-8000-000000000040", body: "Outra nota sintética" })];
    mocks.listLeadNotes.mockResolvedValueOnce(
      listedResult({ notes, page: 2, pageSize: 2, total: 5 }),
    );

    const response = await get({
      url: `${routeUrl}/${workspaceId}/notes?page=2&pageSize=2`,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: notes,
      meta: { page: 2, pageSize: 2, total: 5 },
    });
    expectPrivateNoStore(response);
  });

  it("appends with organization and subject exclusively from the verified actor", async () => {
    const request = createRequest({
      url: `${routeUrl}/${workspaceId}/notes?organizationId=query-org&actorSubject=query-subject`,
      headers: [
        ["X-Organization-Id", "header-org"],
        ["X-Actor-Subject", "header-subject"],
      ],
      jsonBody: validNoteBody(),
    });

    const response = await post(request);
    const serializedInput = JSON.stringify(mocks.appendLeadNote.mock.calls[0]?.[0]);

    expect(response.status).toBe(201);
    expect(mocks.appendLeadNote).toHaveBeenCalledExactlyOnceWith({
      actor: {
        organizationId,
        actorSubject,
        actorIssuer: authorizationContext.actor.issuer,
        requestCorrelationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        authorizationBasis: "verified_oidc",
      },
      workspaceId,
      request: { body: distinctiveNoteBody },
    });
    for (const untrustedValue of [
      "query-org",
      "query-subject",
      "header-org",
      "header-subject",
    ]) {
      expect(serializedInput).not.toContain(untrustedValue);
    }
    expect(await response.json()).toEqual({
      data: note(),
      meta: { result: "appended" },
    });
    expectPrivateNoStore(response);
  });

  it("maps missing workspaces from GET and POST to safe 404 responses", async () => {
    mocks.listLeadNotes.mockResolvedValueOnce(notFoundResult());
    const listed = await get();
    mocks.appendLeadNote.mockResolvedValueOnce(notFoundResult());
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

  it("maps repository input, unavailable, and unexpected errors safely without note text", async () => {
    mocks.listLeadNotes.mockRejectedValueOnce(
      new mocks.LeadNoteRepositoryInputError(),
    );
    const validation = await get();
    mocks.appendLeadNote.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    const unavailable = await post(createRequest());
    mocks.appendLeadNote.mockRejectedValueOnce(
      Object.assign(new Error(distinctiveNoteBody), {
        sql: "INSERT INTO prospecting_app.lead_notes",
        secret: "synthetic-secret",
      }),
    );
    const unexpected = await post(createRequest());
    const validationBody = await validation.json();
    const unavailableBody = await unavailable.json();
    const unexpectedBody = await unexpected.json();

    expect(validation.status).toBe(400);
    expect(validationBody).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(unavailable.status).toBe(503);
    expect(unexpected.status).toBe(500);
    for (const [response, body] of [
      [validation, validationBody],
      [unavailable, unavailableBody],
      [unexpected, unexpectedBody],
    ] as const) {
      const serialized = JSON.stringify(body);

      for (const fragment of [
        distinctiveNoteBody,
        "INSERT",
        "prospecting_app",
        "synthetic-secret",
      ]) {
        expect(serialized).not.toContain(fragment);
      }
      expectPrivateNoStore(response);
    }
  });

  it("keeps the route free of external calls, producer access, direct database clients, SQL, and note logging", async () => {
    const response = await get();
    const source = routeSource();

    expect(response.status).toBe(200);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(source).toContain("listLeadNotes");
    expect(source).toContain("appendLeadNote");
    expect(source).not.toMatch(/n8n|webhook|fetch\s*\(|console\.|logger/i);
    expect(source).not.toMatch(
      /PRODUCER_DATABASE_URL|APP_DATABASE_URL|producer-client|app-client|server\/db|company_validations|company_validation_runs/i,
    );
    expect(source).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i);
  });
});
