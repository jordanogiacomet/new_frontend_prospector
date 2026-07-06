import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LeadDetailParams,
  LeadDetailQuery,
} from "../../../../lib/validators/lead-query";
import type { LeadDetail } from "../../../../types/leads";

const {
  getLeadDetailMock,
  requireApiSessionMock,
  validationObserver,
} = vi.hoisted(() => ({
  getLeadDetailMock:
    vi.fn<
      (cnpj: string, leadRunId?: string) => Promise<LeadDetail | null>
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
vi.mock("../../../../server/auth/require-api-session", () => ({
  requireApiSession: requireApiSessionMock,
}));
vi.mock("../../../../server/repositories/lead-detail-repository", () => ({
  getLeadDetail: getLeadDetailMock,
}));
vi.mock(
  "../../../../lib/validators/lead-query",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../lib/validators/lead-query")
      >();

    return {
      ...actual,
      leadDetailParamsSchema: {
        parse(input: unknown): LeadDetailParams {
          validationObserver("params", input);
          return actual.leadDetailParamsSchema.parse(input);
        },
      },
      leadDetailQuerySchema: {
        parse(input: unknown): LeadDetailQuery {
          validationObserver("query", input);
          return actual.leadDetailQuerySchema.parse(input);
        },
      },
    };
  },
);

import { SafeApiError } from "../../../../server/api/errors";
import * as routeModule from "./route";

const syntheticCnpj = "11222333000181";
const formattedSyntheticCnpj = "11.222.333/0001-81";
const syntheticLeadRunId = `lr_${"a".repeat(64)}`;

const syntheticDetail: LeadDetail = {
  decision_id: "synthetic-decision-027",
  import_batch_id: "synthetic-batch-027",
  lead_run_id: syntheticLeadRunId,
  source_row: 27,
  source_hash: "synthetic-source-hash-027",
  agent_version: "synthetic-agent-v27",
  cnpj: syntheticCnpj,
  companyName: "Empresa Sintética",
  city: "Recife",
  uf: "PE",
  sector: "Serviços sintéticos",
  score: 82,
  priority: "B",
  recommendedAction: "PROSPECTAR",
  trustStatus: "Revisão Humana",
  confidenceIndicator: "unknown",
  lastAnalysisAt: "2026-07-02T12:00:00.000Z",
  legalName: "Empresa Sintética Ltda.",
  tradeName: "Empresa Sintética",
  primaryCnae: "6201501",
  primaryCnaeDescription: "Serviços sintéticos",
  companySize: "Médio",
  taxRegime: "Lucro presumido",
  estimatedRevenue: "Faixa sintética",
  employeeCount: "50 a 99",
  branchCount: 3,
  finalVerdict: "REVISAO_HUMANA",
  recommendedActionReason: "Ação armazenada pelo produtor",
  icpScore: 73,
  strategicAssetScore: 64,
  strategicTier: "TIER_SINTETICO",
  riskFlags: {
    status: "unavailable",
    items: null,
  },
  positiveSignals: {
    status: "unavailable",
    items: null,
  },
  evidences: {
    status: "omitted_by_policy",
    content: null,
  },
  strategicReport: {
    status: "omitted_by_policy",
    content: null,
  },
  audit: {
    decision_id: "synthetic-decision-027",
    import_batch_id: "synthetic-batch-027",
    lead_run_id: syntheticLeadRunId,
    source_row: 27,
    source_hash: "synthetic-source-hash-027",
    agent_version: "synthetic-agent-v27",
    idempotency_key: "synthetic-idempotency-key-027",
    used_cache: false,
    validated_at: "2026-07-02T12:00:00.000Z",
    created_at: "2026-07-02T11:59:00.000Z",
    updated_at: "2026-07-02T12:01:00.000Z",
    expires_at: "2026-08-01T12:00:00.000Z",
  },
  dataQuality: [
    {
      code: "CONTENT_WITHHELD",
      field: "evidences",
    },
    {
      code: "CONTENT_WITHHELD",
      field: "strategicReport",
    },
  ],
};

interface RouteContext {
  params: Promise<{ cnpj: string }>;
}

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/leads/${syntheticCnpj}${query}`,
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

describe("GET /api/leads/:cnpj", () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset();
    getLeadDetailMock.mockReset();
    validationObserver.mockReset();

    requireApiSessionMock.mockResolvedValue({
      status: "authorized",
    });
    getLeadDetailMock.mockResolvedValue(syntheticDetail);
  });

  it("returns 401 before validation or repository access when the session is missing", async () => {
    requireApiSessionMock.mockRejectedValue(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await routeModule.GET(
      createRequest("?leadRunId=invalid"),
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
    expect(getLeadDetailMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns 403 before validation or repository access for a denied organization", async () => {
    requireApiSessionMock.mockRejectedValue(
      new SafeApiError("ACCESS_DENIED"),
    );

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(validationObserver).not.toHaveBeenCalled();
    expect(getLeadDetailMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("authenticates before validating params and querying the repository", async () => {
    const callOrder: string[] = [];
    requireApiSessionMock.mockImplementation(async () => {
      callOrder.push("authenticate");
      return { status: "authorized" };
    });
    validationObserver.mockImplementation((target) => {
      callOrder.push(`validate-${target}`);
    });
    getLeadDetailMock.mockImplementation(async () => {
      callOrder.push("repository");
      return syntheticDetail;
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

  it("normalizes a formatted CNPJ and queries the default detail", async () => {
    const response = await routeModule.GET(
      createRequest(),
      createContext(formattedSyntheticCnpj),
    );

    expect(response.status).toBe(200);
    expect(getLeadDetailMock).toHaveBeenCalledOnce();
    expect(getLeadDetailMock).toHaveBeenCalledWith(
      syntheticCnpj,
      undefined,
    );
  });

  it("forwards an exact leadRunId bound to the normalized CNPJ", async () => {
    const response = await routeModule.GET(
      createRequest(`?leadRunId=${syntheticLeadRunId}`),
      createContext(formattedSyntheticCnpj),
    );

    expect(response.status).toBe(200);
    expect(getLeadDetailMock).toHaveBeenCalledWith(
      syntheticCnpj,
      syntheticLeadRunId,
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
    expect(getLeadDetailMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("returns safe 400 for an invalid leadRunId without querying", async () => {
    const response = await routeModule.GET(
      createRequest("?leadRunId=lr_invalid"),
      createContext(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
        details: [
          {
            field: "leadRunId",
            message: "Valor inválido.",
          },
        ],
      },
    });
    expect(getLeadDetailMock).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("rejects repeated and unsupported query parameters without querying", async () => {
    const invalidQueries = [
      `?leadRunId=${syntheticLeadRunId}&leadRunId=${syntheticLeadRunId}`,
      "?page=1",
      "?sort=score",
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

    expect(getLeadDetailMock).not.toHaveBeenCalled();
  });

  it("returns safe 404 when the CNPJ has no eligible lead", async () => {
    getLeadDetailMock.mockResolvedValue(null);

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "LEAD_NOT_FOUND",
        message: "Empresa não encontrada.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("returns the same safe 404 when the CNPJ and run do not match", async () => {
    getLeadDetailMock.mockResolvedValue(null);

    const response = await routeModule.GET(
      createRequest(`?leadRunId=${syntheticLeadRunId}`),
      createContext(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "LEAD_NOT_FOUND",
        message: "Empresa não encontrada.",
      },
    });
    expect(getLeadDetailMock).toHaveBeenCalledWith(
      syntheticCnpj,
      syntheticLeadRunId,
    );
    expectPrivateNoStore(response);
  });

  it("returns only the mapped LeadDetail in the success envelope", async () => {
    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: syntheticDetail,
    });
    expectPrivateNoStore(response);
  });

  it("preserves policy omission without exposing report or evidence content", async () => {
    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );
    const body = await response.json();

    expect(body.data.evidences).toEqual({
      status: "omitted_by_policy",
      content: null,
    });
    expect(body.data.strategicReport).toEqual({
      status: "omitted_by_policy",
      content: null,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /markdown|report_json|evidence_url|raw_payload/i,
    );
  });

  it("maps repository availability failures to a safe 503", async () => {
    getLeadDetailMock.mockRejectedValue(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("maps unexpected failures without exposing internal data", async () => {
    const failure = Object.assign(
      new Error(
        "SELECT report_json FROM private_table with synthetic-password",
      ),
      {
        parameters: [syntheticCnpj],
        raw_payload: "synthetic-private-payload",
        credentials: "synthetic-password",
      },
    );
    failure.stack = "internal stack at database.ts:1";
    getLeadDetailMock.mockRejectedValue(failure);

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
      /SELECT|report_json|parameters|raw_payload|credentials|stack|synthetic-password/i,
    );
    expectPrivateNoStore(response);
  });

  it("exports only GET and delegates reads without direct database or content-table access", () => {
    const routeSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/leads/[cnpj]/route.ts",
      ),
      "utf8",
    );
    const testSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/leads/[cnpj]/route.test.ts",
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
      /company_strategic_research_reports|report_json|evidence_url|raw_payload/i,
    );
    expect(routeSource).not.toMatch(
      /(?:server\/db|\bpg\b|postgres|databaseQuery)/i,
    );
    expect(routeSource).not.toMatch(
      /n8n|webhook|\bcsv\b|\/exports?\b|reprocess|fetch\s*\(/i,
    );
    expect(routeSource).toContain(
      'from "../../../../server/repositories/lead-detail-repository"',
    );
    expect(unsafeType.test(routeSource)).toBe(false);
    expect(unsafeType.test(testSource)).toBe(false);
  });
});
