import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OutsideAnalysisQuery } from "../../../../lib/validators/lead-query";
import type { AuthorizedActor } from "../../../../server/auth/authorization";
import type {
  OutsideAnalysisOptions,
  OutsideAnalysisResult,
} from "../../../../server/repositories/outside-analysis-repository";
import type { OutsideAnalysisCompany } from "../../../../types/leads";

const {
  listOutsideAnalysisCompaniesMock,
  requirePermissionMock,
  resolveLeadReadVisibilityMock,
  validationObserver,
} = vi.hoisted(() => ({
  listOutsideAnalysisCompaniesMock:
    vi.fn<
      (
        query: OutsideAnalysisQuery,
        options?: OutsideAnalysisOptions,
      ) => Promise<OutsideAnalysisResult>
    >(),
  requirePermissionMock:
    vi.fn<
      () => Promise<{
        readonly status: "authorized";
        readonly actor: AuthorizedActor;
      }>
    >(),
  resolveLeadReadVisibilityMock:
    vi.fn<
      (actor: AuthorizedActor) => Promise<OutsideAnalysisOptions>
    >(),
  validationObserver: vi.fn<(input: unknown) => void>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../server/auth/require-api-session", () => ({
  requirePermission: requirePermissionMock,
}));
vi.mock("../../../../server/leads/lead-read-visibility", () => ({
  resolveLeadReadVisibility: resolveLeadReadVisibilityMock,
}));
vi.mock(
  "../../../../server/repositories/outside-analysis-repository",
  () => ({
    listOutsideAnalysisCompanies: listOutsideAnalysisCompaniesMock,
  }),
);
vi.mock(
  "../../../../lib/validators/lead-query",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../lib/validators/lead-query")
      >();

    return {
      ...actual,
      outsideAnalysisQuerySchema: {
        parse(input: unknown): OutsideAnalysisQuery {
          validationObserver(input);
          return actual.outsideAnalysisQuerySchema.parse(input);
        },
      },
    };
  },
);

import { SafeApiError } from "../../../../server/api/errors";
import * as routeModule from "./route";

const syntheticCompany: OutsideAnalysisCompany = {
  import_batch_id: "synthetic-outside-route-batch",
  source_row: 4,
  cnpj: "00000000000000",
  companyName: "Empresa Sintética CRM",
  city: "Recife",
  uf: "PE",
  sector: "Serviços sintéticos",
  decidedAction: "NAO_ABORDAR",
  decisionReason: "Motivo sintético armazenado",
  decidedAt: "2026-07-23T14:30:00.000Z",
};
const authorization = {
  status: "authorized",
  actor: {
    issuer: "https://issuer.example.test",
    subject: "synthetic-outside-route-subject",
    organizationId: "synthetic-outside-route-organization",
    permissions: ["leads:read"],
  },
} as const satisfies {
  readonly status: "authorized";
  readonly actor: AuthorizedActor;
};

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/leads/outside-analysis${query}`,
  );
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

describe("GET /api/leads/outside-analysis", () => {
  beforeEach(() => {
    listOutsideAnalysisCompaniesMock.mockReset();
    requirePermissionMock.mockReset();
    resolveLeadReadVisibilityMock.mockReset();
    validationObserver.mockReset();

    requirePermissionMock.mockResolvedValue(authorization);
    resolveLeadReadVisibilityMock.mockResolvedValue({});
    listOutsideAnalysisCompaniesMock.mockResolvedValue({
      companies: [syntheticCompany],
      total: 1,
    });
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", 401],
    ["ACCESS_DENIED", 403],
  ] as const)(
    "returns %s before validation, visibility, or repository access",
    async (code, status) => {
      requirePermissionMock.mockRejectedValue(new SafeApiError(code));

      const response = await routeModule.GET(
        createRequest("?page=invalid"),
      );

      expect(response.status).toBe(status);
      expect(validationObserver).not.toHaveBeenCalled();
      expect(resolveLeadReadVisibilityMock).not.toHaveBeenCalled();
      expect(listOutsideAnalysisCompaniesMock).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("authorizes before validation and resolves visibility from the actor", async () => {
    const callOrder: string[] = [];
    const visibility = {
      includeTestRunsFromImportBatchIds: ["synthetic-correlated-batch"],
    } as const;
    requirePermissionMock.mockImplementation(async () => {
      callOrder.push("authorize");
      return authorization;
    });
    validationObserver.mockImplementation(() => {
      callOrder.push("validate");
    });
    resolveLeadReadVisibilityMock.mockImplementation(async (actor) => {
      callOrder.push("visibility");
      expect(actor).toBe(authorization.actor);
      return visibility;
    });
    listOutsideAnalysisCompaniesMock.mockImplementation(
      async (query, options) => {
        callOrder.push("repository");
        expect(query).toEqual({ page: 1, pageSize: 20 });
        expect(options).toBe(visibility);
        return { companies: [], total: 0 };
      },
    );

    const response = await routeModule.GET(createRequest());

    expect(response.status).toBe(200);
    expect(callOrder).toEqual([
      "authorize",
      "validate",
      "visibility",
      "repository",
    ]);
    expect(requirePermissionMock).toHaveBeenCalledWith("leads:read");
  });

  it("forwards validated pagination and returns exact metadata", async () => {
    listOutsideAnalysisCompaniesMock.mockResolvedValue({
      companies: [syntheticCompany],
      total: 15,
    });

    const response = await routeModule.GET(
      createRequest("?page=2&pageSize=7"),
    );

    expect(listOutsideAnalysisCompaniesMock).toHaveBeenCalledWith(
      { page: 2, pageSize: 7 },
      {},
    );
    expect(await response.json()).toEqual({
      data: [syntheticCompany],
      meta: {
        page: 2,
        pageSize: 7,
        total: 15,
        totalPages: 3,
      },
    });
    expectPrivateNoStore(response);
  });

  it("returns zero total pages for an empty current view", async () => {
    listOutsideAnalysisCompaniesMock.mockResolvedValue({
      companies: [],
      total: 0,
    });

    const response = await routeModule.GET(createRequest());

    expect(await response.json()).toEqual({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });

  it.each([
    "?page=0",
    "?page=1&page=2",
    "?cnpj=00000000000000",
    "?sort=reason",
  ])("rejects unsupported or invalid query %s without querying", async (query) => {
    const response = await routeModule.GET(createRequest(query));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
      },
    });
    expect(resolveLeadReadVisibilityMock).not.toHaveBeenCalled();
    expect(listOutsideAnalysisCompaniesMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("maps source and unexpected failures without exposing internal details", async () => {
    listOutsideAnalysisCompaniesMock.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    const sourceResponse = await routeModule.GET(createRequest());
    listOutsideAnalysisCompaniesMock.mockRejectedValueOnce(
      new Error(
        "SELECT private FROM producer with synthetic-password",
      ),
    );
    const unexpectedResponse = await routeModule.GET(createRequest());

    expect(sourceResponse.status).toBe(503);
    expect(await sourceResponse.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expect(unexpectedResponse.status).toBe(500);
    const unexpectedBody = JSON.stringify(await unexpectedResponse.json());
    expect(unexpectedBody).not.toMatch(
      /SELECT|producer|synthetic-password|stack|sql/i,
    );
    expectPrivateNoStore(sourceResponse);
    expectPrivateNoStore(unexpectedResponse);
  });

  it("does not serialize the authenticated actor", async () => {
    const response = await routeModule.GET(createRequest());
    const serialized = JSON.stringify(await response.json());

    expect(serialized).not.toContain(authorization.actor.subject);
    expect(serialized).not.toContain(authorization.actor.organizationId);
    expect(serialized).not.toContain(authorization.actor.issuer);
  });

  it("exports only GET and contains no mutation, SQL, or direct integration", () => {
    const routeSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/leads/outside-analysis/route.ts",
      ),
      "utf8",
    );

    expect(Object.keys(routeModule)).toEqual(["GET"]);
    expect(routeSource).not.toMatch(/\b(?:POST|PUT|PATCH|DELETE)\b/);
    expect(routeSource).not.toMatch(
      /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i,
    );
    expect(routeSource).not.toMatch(
      /(?:server\/db|\bpg\b|postgres|databaseQuery|n8n|webhook|fetch\s*\()/i,
    );
    expect(routeSource).toContain(
      'from "../../../../server/repositories/outside-analysis-repository"',
    );
  });
});
