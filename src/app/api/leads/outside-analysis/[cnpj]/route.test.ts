import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorizedActor } from "../../../../../server/auth/authorization";
import type { OutsideAnalysisOptions } from "../../../../../server/repositories/outside-analysis-repository";
import type { OutsideAnalysisCompany } from "../../../../../types/leads";

const {
  getOutsideAnalysisCompanyMock,
  requirePermissionMock,
  resolveLeadReadVisibilityMock,
  validationObserver,
} = vi.hoisted(() => ({
  getOutsideAnalysisCompanyMock:
    vi.fn<
      (
        cnpj: string,
        options?: OutsideAnalysisOptions,
      ) => Promise<OutsideAnalysisCompany | null>
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
vi.mock("../../../../../server/auth/require-api-session", () => ({
  requirePermission: requirePermissionMock,
}));
vi.mock("../../../../../server/leads/lead-read-visibility", () => ({
  resolveLeadReadVisibility: resolveLeadReadVisibilityMock,
}));
vi.mock(
  "../../../../../server/repositories/outside-analysis-repository",
  () => ({
    getOutsideAnalysisCompany: getOutsideAnalysisCompanyMock,
  }),
);
vi.mock("../../../../../lib/validators/lead-query", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../../lib/validators/lead-query")
    >();

  return {
    ...actual,
    leadDetailParamsSchema: {
      parse(input: unknown) {
        validationObserver(input);
        return actual.leadDetailParamsSchema.parse(input);
      },
    },
  };
});

import { SafeApiError } from "../../../../../server/api/errors";
import * as routeModule from "./route";

const syntheticCompany: OutsideAnalysisCompany = {
  import_batch_id: "synthetic-detail-batch",
  source_row: 4,
  cnpj: "11222333000181",
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
    subject: "synthetic-outside-detail-subject",
    organizationId: "synthetic-outside-detail-organization",
    permissions: ["leads:read"],
  },
} as const satisfies {
  readonly status: "authorized";
  readonly actor: AuthorizedActor;
};

function createRequest(query = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/leads/outside-analysis/11222333000181${query}`,
  );
}

function createContext(cnpj = "11222333000181") {
  return { params: Promise.resolve({ cnpj }) };
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

describe("GET /api/leads/outside-analysis/:cnpj", () => {
  beforeEach(() => {
    getOutsideAnalysisCompanyMock.mockReset();
    requirePermissionMock.mockReset();
    resolveLeadReadVisibilityMock.mockReset();
    validationObserver.mockReset();

    requirePermissionMock.mockResolvedValue(authorization);
    resolveLeadReadVisibilityMock.mockResolvedValue({});
    getOutsideAnalysisCompanyMock.mockResolvedValue(syntheticCompany);
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", 401],
    ["ACCESS_DENIED", 403],
  ] as const)(
    "returns %s before validation, visibility, or repository access",
    async (code, status) => {
      requirePermissionMock.mockRejectedValue(new SafeApiError(code));

      const response = await routeModule.GET(
        createRequest(),
        createContext("invalid"),
      );

      expect(response.status).toBe(status);
      expect(validationObserver).not.toHaveBeenCalled();
      expect(resolveLeadReadVisibilityMock).not.toHaveBeenCalled();
      expect(getOutsideAnalysisCompanyMock).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("validates and resolves visibility before reading the detail", async () => {
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
    getOutsideAnalysisCompanyMock.mockImplementation(
      async (cnpj, options) => {
        callOrder.push("repository");
        expect(cnpj).toBe("11222333000181");
        expect(options).toBe(visibility);
        return syntheticCompany;
      },
    );

    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(callOrder).toEqual([
      "authorize",
      "validate",
      "visibility",
      "repository",
    ]);
    expect(requirePermissionMock).toHaveBeenCalledWith("leads:read");
  });

  it("returns the approved DTO in a private no-store envelope", async () => {
    const response = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(await response.json()).toEqual({ data: syntheticCompany });
    expectPrivateNoStore(response);
  });

  it("returns a safe 404 when the current CRM decision is not eligible", async () => {
    getOutsideAnalysisCompanyMock.mockResolvedValue(null);

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

  it("rejects invalid CNPJ and unsupported query parameters", async () => {
    const invalidCnpjResponse = await routeModule.GET(
      createRequest(),
      createContext("1122233300018"),
    );
    const invalidQueryResponse = await routeModule.GET(
      createRequest("?leadRunId=lr_12345678"),
      createContext(),
    );

    expect(invalidCnpjResponse.status).toBe(400);
    expect(invalidQueryResponse.status).toBe(400);
    expect(getOutsideAnalysisCompanyMock).not.toHaveBeenCalled();
  });

  it("maps source and unexpected failures without leaking details", async () => {
    getOutsideAnalysisCompanyMock.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );
    const sourceResponse = await routeModule.GET(
      createRequest(),
      createContext(),
    );
    getOutsideAnalysisCompanyMock.mockRejectedValueOnce(
      new Error("SELECT private FROM producer with synthetic-password"),
    );
    const unexpectedResponse = await routeModule.GET(
      createRequest(),
      createContext(),
    );

    expect(sourceResponse.status).toBe(503);
    expect(unexpectedResponse.status).toBe(500);
    expect(JSON.stringify(await unexpectedResponse.json())).not.toMatch(
      /SELECT|producer|synthetic-password|stack|sql/i,
    );
    expectPrivateNoStore(sourceResponse);
    expectPrivateNoStore(unexpectedResponse);
  });

  it("exports only GET and contains no mutation, SQL, or integration call", () => {
    const routeSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/leads/outside-analysis/[cnpj]/route.ts",
      ),
      "utf8",
    );

    expect(Object.keys(routeModule)).toEqual(["GET"]);
    expect(routeSource).not.toMatch(/\b(?:POST|PUT|PATCH|DELETE)\b/);
    expect(routeSource).not.toMatch(
      /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i,
    );
    expect(routeSource).not.toMatch(/fetch\(|axios|n8n|webhook/i);
  });
});
