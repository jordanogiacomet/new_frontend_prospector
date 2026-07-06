import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LeadDetailParams,
  LeadHistoryQuery,
} from "../../../../../lib/validators/lead-query";
import type { LeadHistoryResult } from "../../../../../server/repositories/lead-history-repository";

const {
  listLeadHistoryMock,
  requireApiSessionMock,
  validationObserver,
} = vi.hoisted(() => ({
  listLeadHistoryMock:
    vi.fn<
      (
        cnpj: string,
        query: LeadHistoryQuery,
      ) => Promise<LeadHistoryResult>
    >(),
  requireApiSessionMock:
    vi.fn<
      () => Promise<{ readonly status: "authorized" }>
    >(),
  validationObserver: vi.fn<
    (target: "params" | "query", input: unknown) => void
  >(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../server/auth/require-api-session", () => ({
  requireApiSession: requireApiSessionMock,
}));
vi.mock(
  "../../../../../server/repositories/lead-history-repository",
  () => ({
    listLeadHistory: listLeadHistoryMock,
  }),
);
vi.mock(
  "../../../../../lib/validators/lead-query",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../../lib/validators/lead-query")
      >();

    return {
      ...actual,
      leadDetailParamsSchema: {
        parse(input: unknown): LeadDetailParams {
          validationObserver("params", input);
          return actual.leadDetailParamsSchema.parse(input);
        },
      },
      leadHistoryQuerySchema: {
        parse(input: unknown): LeadHistoryQuery {
          validationObserver("query", input);
          return actual.leadHistoryQuerySchema.parse(input);
        },
      },
    };
  },
);

import { SafeApiError } from "../../../../../server/api/errors";
import * as routeModule from "./route";

const syntheticCnpj = "11222333000181";
const formattedSyntheticCnpj = "11.222.333/0001-81";
const syntheticHistoryItem = {
  decision_id: "synthetic-decision-034",
  import_batch_id: "synthetic-batch-034",
  lead_run_id: `lr_${"a".repeat(64)}`,
  source_row: 34,
  analyzedAt: "2026-07-03T10:00:00.000Z",
  recommendedAction: "PROSPECTAR",
  recommendedActionReason: "Decisão sintética armazenada",
  isCurrent: true,
} as const;
const retainedMetadata = {
  total: 1,
  completeness: "retained_only",
  label: "Análises retidas encontradas",
  caveat: "Análises mais antigas podem não estar presentes.",
} as const;

interface RouteContext {
  params: Promise<{ cnpj: string }>;
}

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/leads/${syntheticCnpj}/history${query}`,
  );
}

function createContext(cnpj = syntheticCnpj): RouteContext {
  return {
    params: Promise.resolve({ cnpj }),
  };
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe(
    "private, no-store",
  );
}

describe("GET /api/leads/:cnpj/history", () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset();
    listLeadHistoryMock.mockReset();
    validationObserver.mockReset();

    requireApiSessionMock.mockResolvedValue({
      status: "authorized",
    });
    listLeadHistoryMock.mockResolvedValue({
      history: [syntheticHistoryItem],
      ...retainedMetadata,
    });
  });

  it("returns 401 before validation or repository access when the session is missing", async () => {
    requireApiSessionMock.mockRejectedValue(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await routeModule.GET(
      createRequest("?page=invalid"),
      createContext("invalid"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Entre para acessar os dados.",
      },
    });
    expect(validationObserver).not.toHaveBeenCalled();
    expect(listLeadHistoryMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns 403 before validation or repository access for a denied organization", async () => {
    requireApiSessionMock.mockRejectedValue(
      new SafeApiError("ACCESS_DENIED"),
    );

    const response = await routeModule.GET(
      createRequest("?page=invalid"),
      createContext("invalid"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(validationObserver).not.toHaveBeenCalled();
    expect(listLeadHistoryMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("authenticates before validating params, query, and accessing the repository", async () => {
    const callOrder: string[] = [];
    requireApiSessionMock.mockImplementation(async () => {
      callOrder.push("authenticate");
      return { status: "authorized" };
    });
    validationObserver.mockImplementation((target) => {
      callOrder.push(`validate-${target}`);
    });
    listLeadHistoryMock.mockImplementation(async () => {
      callOrder.push("repository");
      return {
        history: [syntheticHistoryItem],
        ...retainedMetadata,
      };
    });

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(callOrder).toEqual([
      "authenticate",
      "validate-params",
      "validate-query",
      "repository",
    ]);
    expect(requireApiSessionMock).toHaveBeenCalledOnce();
  });

  it("normalizes the CNPJ exactly and applies default pagination", async () => {
    const response = await routeModule.GET(
      createRequest(),
      createContext(formattedSyntheticCnpj),
    );

    expect(response.status).toBe(200);
    expect(listLeadHistoryMock).toHaveBeenCalledOnce();
    expect(listLeadHistoryMock).toHaveBeenCalledWith(
      syntheticCnpj,
      {
        page: 1,
        pageSize: 20,
      },
    );
  });

  it("forwards explicit pagination including the approved page-size limit", async () => {
    const response = await routeModule.GET(
      createRequest("?page=3&pageSize=20"),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(listLeadHistoryMock).toHaveBeenCalledWith(
      syntheticCnpj,
      {
        page: 3,
        pageSize: 20,
      },
    );
  });

  it("returns safe 400 for an invalid CNPJ without querying", async () => {
    const response = await routeModule.GET(
      createRequest(),
      createContext("1122233300018"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
        details: [
          {
            field: "cnpj",
            message: "Valor inválido.",
          },
        ],
      },
    });
    expect(listLeadHistoryMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("rejects invalid pagination without querying", async () => {
    const invalidQueries = [
      "?page=0",
      "?page=1.5",
      "?pageSize=0",
      "?pageSize=21",
      "?page=synthetic",
    ];

    for (const query of invalidQueries) {
      const response = await routeModule.GET(
        createRequest(query),
        createContext(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Revise os filtros informados.",
        },
      });
      expectPrivateNoStore(response);
    }

    expect(listLeadHistoryMock).not.toHaveBeenCalled();
  });

  it("rejects repeated and unknown query parameters without querying", async () => {
    const invalidQueries = [
      "?page=1&page=2",
      "?pageSize=10&pageSize=20",
      "?sort=createdAt",
      "?cnpj=11222333000181",
    ];

    for (const query of invalidQueries) {
      const response = await routeModule.GET(
        createRequest(query),
        createContext(),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Revise os filtros informados.",
        },
      });
      expectPrivateNoStore(response);
    }

    expect(listLeadHistoryMock).not.toHaveBeenCalled();
  });

  it("returns history with the repository metadata preserved exactly", async () => {
    const response = await routeModule.GET(
      createRequest("?page=2&pageSize=10"),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [syntheticHistoryItem],
      meta: {
        page: 2,
        pageSize: 10,
        ...retainedMetadata,
      },
    });
    expectPrivateNoStore(response);
  });

  it("returns 200 and exact retained-only metadata for an empty page", async () => {
    listLeadHistoryMock.mockResolvedValue({
      history: [],
      total: 0,
      completeness: "retained_only",
      label: "Análises retidas encontradas",
      caveat: "Análises mais antigas podem não estar presentes.",
    });

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: [],
      meta: {
        page: 1,
        pageSize: 20,
        total: 0,
        completeness: "retained_only",
        label: "Análises retidas encontradas",
        caveat: "Análises mais antigas podem não estar presentes.",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /proven_complete|histórico completo|todas as análises/i,
    );
    expectPrivateNoStore(response);
  });

  it("maps HISTORY_UNAVAILABLE to a safe 503", async () => {
    listLeadHistoryMock.mockRejectedValue(
      new SafeApiError("HISTORY_UNAVAILABLE"),
    );

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "HISTORY_UNAVAILABLE",
        message: "O histórico não está disponível no momento.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("maps database unavailability to DATA_SOURCE_UNAVAILABLE safely", async () => {
    const failure = Object.assign(
      new Error(
        "SELECT private_history WHERE cnpj = synthetic-sensitive-value",
      ),
      {
        name: "DatabaseUnavailableError",
        code: "DATABASE_UNAVAILABLE",
        parameters: [syntheticCnpj],
        events: ["synthetic-internal-event"],
        retention: "synthetic-internal-policy",
      },
    );
    failure.stack = "internal stack at database.ts:1";
    listLeadHistoryMock.mockRejectedValue(failure);

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expect(serialized).not.toMatch(
      /SELECT|cnpj|parameters|events|retention|stack|synthetic-sensitive-value/i,
    );
    expectPrivateNoStore(response);
  });

  it("maps unexpected failures without exposing internal data", async () => {
    const failure = Object.assign(
      new Error(
        "private SQL with synthetic-sensitive-cnpj and internal event",
      ),
      {
        parameters: [syntheticCnpj],
        raw_payload: "synthetic-private-payload",
        retention: "synthetic-internal-policy",
      },
    );
    failure.stack = "internal stack at repository.ts:1";
    listLeadHistoryMock.mockRejectedValue(failure);

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "UNEXPECTED_ERROR",
        message: "Ocorreu um erro inesperado. Tente novamente.",
      },
    });
    expect(serialized).not.toMatch(
      /SQL|cnpj|parameters|raw_payload|retention|event|stack|synthetic-private-payload/i,
    );
    expectPrivateNoStore(response);
  });

  it("uses private no-store caching for success and every error class", async () => {
    const responses: Response[] = [];

    responses.push(
      await routeModule.GET(createRequest(), createContext()),
    );
    responses.push(
      await routeModule.GET(
        createRequest("?page=invalid"),
        createContext(),
      ),
    );

    requireApiSessionMock.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    responses.push(
      await routeModule.GET(createRequest(), createContext()),
    );

    requireApiSessionMock.mockRejectedValueOnce(
      new SafeApiError("ACCESS_DENIED"),
    );
    responses.push(
      await routeModule.GET(createRequest(), createContext()),
    );

    listLeadHistoryMock.mockRejectedValueOnce(
      new SafeApiError("HISTORY_UNAVAILABLE"),
    );
    responses.push(
      await routeModule.GET(createRequest(), createContext()),
    );

    listLeadHistoryMock.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    responses.push(
      await routeModule.GET(createRequest(), createContext()),
    );

    listLeadHistoryMock.mockRejectedValueOnce(
      new Error("synthetic failure"),
    );
    responses.push(
      await routeModule.GET(createRequest(), createContext()),
    );

    expect(responses.map((response) => response.status)).toEqual([
      200,
      400,
      401,
      403,
      503,
      503,
      500,
    ]);
    for (const response of responses) {
      expectPrivateNoStore(response);
    }
  });

  it("exports only GET and has no mutation, direct database, or forbidden integration", () => {
    const routeSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/leads/[cnpj]/history/route.ts",
      ),
      "utf8",
    );
    const testSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/leads/[cnpj]/history/route.test.ts",
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
      'from "../../../../../server/repositories/lead-history-repository"',
    );
    expect(unsafeType.test(routeSource)).toBe(false);
    expect(unsafeType.test(testSource)).toBe(false);
  });
});
