import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadListQuery } from "../../../lib/validators/lead-query";
import type { LeadListResult } from "../../../server/repositories/lead-list-repository";
import type { LeadSummary } from "../../../types/leads";

const {
  listLeadsMock,
  requireApiSessionMock,
  validationObserver,
} = vi.hoisted(() => ({
  listLeadsMock:
    vi.fn<(query: LeadListQuery) => Promise<LeadListResult>>(),
  requireApiSessionMock:
    vi.fn<
      () => Promise<{ readonly status: "authorized" }>
    >(),
  validationObserver: vi.fn<(input: unknown) => void>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth/require-api-session", () => ({
  requireApiSession: requireApiSessionMock,
}));
vi.mock("../../../server/repositories/lead-list-repository", () => ({
  listLeads: listLeadsMock,
}));
vi.mock(
  "../../../lib/validators/lead-query",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../lib/validators/lead-query")
      >();

    return {
      ...actual,
      leadListQuerySchema: {
        parse(input: unknown): LeadListQuery {
          validationObserver(input);
          return actual.leadListQuerySchema.parse(input);
        },
      },
    };
  },
);

import { SafeApiError } from "../../../server/api/errors";
import * as routeModule from "./route";

const syntheticLead: LeadSummary = {
  decision_id: "synthetic-decision-001",
  import_batch_id: "synthetic-batch-001",
  lead_run_id: "synthetic-run-001",
  source_row: 1,
  source_hash: "synthetic-hash-001",
  agent_version: "synthetic-agent-v1",
  cnpj: "00000000000000",
  companyName: "Empresa Sintética",
  city: "Cidade Sintética",
  uf: "SP",
  sector: "Setor Sintético",
  score: 80,
  priority: "B",
  recommendedAction: "PROSPECTAR",
  trustStatus: "Sintético",
  confidenceIndicator: "unknown",
  lastAnalysisAt: "2026-01-02T03:04:05.000Z",
};

function createRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/leads${query}`);
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
}

describe("GET /api/leads", () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset();
    listLeadsMock.mockReset();
    validationObserver.mockReset();

    requireApiSessionMock.mockResolvedValue({
      status: "authorized",
    });
    listLeadsMock.mockResolvedValue({
      leads: [syntheticLead],
      total: 1,
    });
  });

  it("returns 401 for a missing session without validating or querying", async () => {
    requireApiSessionMock.mockRejectedValue(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await routeModule.GET(createRequest("?page=invalid"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Entre para acessar os dados.",
      },
    });
    expect(validationObserver).not.toHaveBeenCalled();
    expect(listLeadsMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns 403 for a denied organization without querying", async () => {
    requireApiSessionMock.mockRejectedValue(
      new SafeApiError("ACCESS_DENIED"),
    );

    const response = await routeModule.GET(createRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(validationObserver).not.toHaveBeenCalled();
    expect(listLeadsMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("authenticates before validation and repository access", async () => {
    const callOrder: string[] = [];
    requireApiSessionMock.mockImplementation(async () => {
      callOrder.push("authenticate");
      return { status: "authorized" };
    });
    validationObserver.mockImplementation(() => {
      callOrder.push("validate");
    });
    listLeadsMock.mockImplementation(async () => {
      callOrder.push("repository");
      return { leads: [], total: 0 };
    });

    const response = await routeModule.GET(createRequest());

    expect(response.status).toBe(200);
    expect(callOrder).toEqual([
      "authenticate",
      "validate",
      "repository",
    ]);
  });

  it("sends default pagination to the repository", async () => {
    const response = await routeModule.GET(createRequest());

    expect(response.status).toBe(200);
    expect(listLeadsMock).toHaveBeenCalledOnce();
    expect(listLeadsMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
  });

  it("normalizes and forwards valid CNPJ, UF, and priority filters", async () => {
    const response = await routeModule.GET(
      createRequest(
        "?page=2&pageSize=10&cnpj=00.000.000%2F0000-00&uf=SP&priority=B",
      ),
    );

    expect(response.status).toBe(200);
    expect(listLeadsMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      cnpj: "00000000000000",
      uf: "SP",
      priority: "B",
    });
  });

  it("returns 400 for an invalid parameter without querying", async () => {
    const response = await routeModule.GET(createRequest("?page=0"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
      },
    });
    expect(listLeadsMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns 400 for repeated parameters without querying", async () => {
    const response = await routeModule.GET(
      createRequest("?uf=SP&uf=RJ"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(listLeadsMock).not.toHaveBeenCalled();
  });

  it("rejects deferred parameters, sort, and direction", async () => {
    const deferredQueries = [
      "?q=empresa",
      "?city=Recife",
      "?action=PROSPECTAR",
      "?trustStatus=trusted",
      "?scoreMin=1",
      "?dateFrom=2026-01-01",
      "?batch=synthetic-batch",
      "?sort=score",
      "?direction=asc",
    ];

    for (const query of deferredQueries) {
      const response = await routeModule.GET(createRequest(query));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
    }

    expect(listLeadsMock).not.toHaveBeenCalled();
  });

  it("returns data and exact pagination metadata", async () => {
    listLeadsMock.mockResolvedValue({
      leads: [syntheticLead],
      total: 15,
    });

    const response = await routeModule.GET(
      createRequest("?page=2&pageSize=7"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [syntheticLead],
      meta: {
        page: 2,
        pageSize: 7,
        total: 15,
        totalPages: 3,
      },
    });
    expectPrivateNoStore(response);
  });

  it("returns zero total pages when the total is zero", async () => {
    listLeadsMock.mockResolvedValue({ leads: [], total: 0 });

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

  it("allows a page beyond the total with an empty list and exact metadata", async () => {
    listLeadsMock.mockResolvedValue({ leads: [], total: 2 });

    const response = await routeModule.GET(
      createRequest("?page=3&pageSize=10"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      meta: {
        page: 3,
        pageSize: 10,
        total: 2,
        totalPages: 1,
      },
    });
  });

  it("maps data-source failures to a safe 503 response", async () => {
    listLeadsMock.mockRejectedValue(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );

    const response = await routeModule.GET(createRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("maps unexpected failures to a safe 500 response", async () => {
    const failure = Object.assign(
      new Error(
        "SELECT secret FROM internal_table with synthetic-password",
      ),
      {
        parameters: ["00000000000000"],
        credentials: "synthetic-password",
        claims: { org_id: "synthetic-private-org" },
      },
    );
    failure.stack = "internal stack at database.ts:1";
    listLeadsMock.mockRejectedValue(failure);

    const response = await routeModule.GET(createRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "UNEXPECTED_ERROR",
        message: "Ocorreu um erro inesperado. Tente novamente.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("uses private no-store caching for success and every safe error class", async () => {
    const responses: Response[] = [];

    responses.push(await routeModule.GET(createRequest()));
    responses.push(
      await routeModule.GET(createRequest("?page=invalid")),
    );

    requireApiSessionMock.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    responses.push(await routeModule.GET(createRequest()));

    requireApiSessionMock.mockRejectedValueOnce(
      new SafeApiError("ACCESS_DENIED"),
    );
    responses.push(await routeModule.GET(createRequest()));

    listLeadsMock.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    responses.push(await routeModule.GET(createRequest()));

    listLeadsMock.mockRejectedValueOnce(new Error("synthetic failure"));
    responses.push(await routeModule.GET(createRequest()));

    expect(responses.map((response) => response.status)).toEqual([
      200,
      400,
      401,
      403,
      503,
      500,
    ]);
    for (const response of responses) {
      expectPrivateNoStore(response);
    }
  });

  it("never exposes stack, SQL, parameters, credentials, claims, or correlation IDs", async () => {
    const sensitiveFragments = [
      "SELECT private_value",
      "synthetic-parameter",
      "synthetic-credential",
      "synthetic-claim",
      "internal stack",
    ];
    const failure = Object.assign(
      new Error(sensitiveFragments.join(" ")),
      {
        sql: sensitiveFragments[0],
        parameters: sensitiveFragments[1],
        credentials: sensitiveFragments[2],
        claims: sensitiveFragments[3],
      },
    );
    failure.stack = sensitiveFragments[4];
    listLeadsMock.mockRejectedValue(failure);

    const response = await routeModule.GET(createRequest());
    const serialized = JSON.stringify(await response.json());

    for (const fragment of sensitiveFragments) {
      expect(serialized).not.toContain(fragment);
    }
    expect(serialized).not.toMatch(
      /stack|sql|parameters|credentials|claims|correlation/i,
    );
  });

  it("exports only GET and contains no mutation, direct database, SQL, or external integration", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/app/api/leads/route.ts"),
      "utf8",
    );
    const testSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/leads/route.test.ts",
      ),
      "utf8",
    );
    const unsafeType = new RegExp(
      `\\b${["a", "n", "y"].join("")}\\b`,
    );

    expect(Object.keys(routeModule)).toEqual(["GET"]);
    expect(routeSource).not.toMatch(
      /\b(?:POST|PUT|PATCH|DELETE)\b/,
    );
    expect(routeSource).not.toMatch(
      /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i,
    );
    expect(routeSource).not.toMatch(
      /(?:server\/db|\bpg\b|postgres|databaseQuery)/i,
    );
    expect(routeSource).not.toMatch(
      /n8n|webhook|\bcsv\b|\/exports?\b|reprocess|fetch\s*\(/i,
    );
    expect(routeSource).toContain(
      'from "../../../server/repositories/lead-list-repository"',
    );
    expect(unsafeType.test(routeSource)).toBe(false);
    expect(unsafeType.test(testSource)).toBe(false);
  });
});
