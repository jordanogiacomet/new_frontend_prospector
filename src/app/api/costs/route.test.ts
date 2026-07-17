import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../server/auth/require-api-session";
import type { ListCostOverviewInput } from "../../../server/costs/cost-read-service";
import type { CostOverview } from "../../../types/costs";

type CostFeatureEnvironment = {
  readonly FEATURE_COSTS_ENABLED: boolean;
};

const mocks = vi.hoisted(() => ({
  requirePermission:
    vi.fn<(permission: "costs:read") => Promise<ApiAuthorizationContext>>(),
  getServerEnv: vi.fn<() => CostFeatureEnvironment>(),
  listCostOverview:
    vi.fn<(input: ListCostOverviewInput) => Promise<CostOverview>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../server/costs/cost-read-service", () => ({
  listCostOverview: mocks.listCostOverview,
}));

import { SafeApiError } from "../../../server/api/errors";
import * as routeModule from "./route";

const organizationId = "org-synthetic-cost-reader";
const routeUrl = "http://localhost/api/costs";

const authorizationContext = {
  status: "authorized",
  actor: {
    issuer: "https://issuer.example.test",
    subject: "oidc|synthetic-cost-reader",
    organizationId,
    permissions: ["costs:read"],
  },
} as const satisfies ApiAuthorizationContext;

function overview(
  overrides: Partial<CostOverview> = {},
): CostOverview {
  return {
    runs: overrides.runs ?? [
      {
        leadRunId: `lr_${"a".repeat(64)}`,
        availability: "AVAILABLE",
        estimatedCostUsd: "0.01234567",
      },
    ],
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
    total: overrides.total ?? 1,
    subtotalEstimatedUsd:
      overrides.subtotalEstimatedUsd === undefined
        ? "0.01234567"
        : overrides.subtotalEstimatedUsd,
    coverage: overrides.coverage ?? "COMPLETE",
  };
}

function get(query = ""): Promise<Response> {
  return routeModule.GET(new NextRequest(`${routeUrl}${query}`));
}

function expectPrivateNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/app/api/costs/route.ts"),
    "utf8",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(authorizationContext);
  mocks.getServerEnv.mockReturnValue({ FEATURE_COSTS_ENABLED: true });
  mocks.listCostOverview.mockResolvedValue(overview());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/costs", () => {
  it("exports only GET so mutation methods are not implemented here", () => {
    expect(Object.keys(routeModule).sort()).toEqual(["GET"]);
    expect(routeSource()).not.toMatch(
      /\bexport\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/,
    );
  });

  it("requires costs read permission before feature, validation, or service work", async () => {
    mocks.requirePermission.mockRejectedValueOnce(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await get("?page=invalid&page=2");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Entre para acessar os dados.",
      },
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith("costs:read");
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.listCostOverview).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("requires the costs feature flag before validation or service work", async () => {
    mocks.getServerEnv.mockReturnValueOnce({ FEATURE_COSTS_ENABLED: false });

    const response = await get("?page=invalid");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Você não tem acesso a esta área.",
      },
    });
    expect(mocks.listCostOverview).not.toHaveBeenCalled();
    expectPrivateNoStore(response);
  });

  it("checks permission, feature, and service access in order", async () => {
    const events: string[] = [];
    mocks.requirePermission.mockImplementationOnce(async () => {
      events.push("permission");
      return authorizationContext;
    });
    mocks.getServerEnv.mockImplementationOnce(() => {
      events.push("feature");
      return { FEATURE_COSTS_ENABLED: true };
    });
    mocks.listCostOverview.mockImplementationOnce(async () => {
      events.push("service");
      return overview();
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect(events).toEqual(["permission", "feature", "service"]);
  });

  it("uses default pagination and the verified actor organization only", async () => {
    const response = await get("?organizationId=org-from-query");

    expect(response.status).toBe(400);
    expect(mocks.listCostOverview).not.toHaveBeenCalled();

    const successfulResponse = await get();

    expect(successfulResponse.status).toBe(200);
    expect(mocks.listCostOverview).toHaveBeenLastCalledWith({
      organizationId,
      page: 1,
      pageSize: 20,
    });
  });

  it("forwards valid page and pageSize query parameters", async () => {
    const response = await get("?page=3&pageSize=50");

    expect(response.status).toBe(200);
    expect(mocks.listCostOverview).toHaveBeenCalledWith({
      organizationId,
      page: 3,
      pageSize: 50,
    });
  });

  it.each([
    ["unknown parameter", "?organizationId=org-from-query", "organizationId"],
    ["repeated page", "?page=1&page=2", "page"],
    ["repeated page size", "?pageSize=10&pageSize=20", "pageSize"],
    ["non-numeric page", "?page=one", "page"],
    ["zero page", "?page=0", "page"],
    ["oversized page", "?page=10001", "page"],
    ["fractional page size", "?pageSize=1.5", "pageSize"],
    ["zero page size", "?pageSize=0", "pageSize"],
    ["oversized page size", "?pageSize=101", "pageSize"],
  ] as const)(
    "rejects invalid query before service work: %s",
    async (_label, query, field) => {
      const response = await get(query);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          details: [{ field, message: "Valor inválido." }],
        },
      });
      expect(mocks.listCostOverview).not.toHaveBeenCalled();
      expectPrivateNoStore(response);
    },
  );

  it("returns the approved safe cost envelope", async () => {
    const result = overview({
      page: 2,
      pageSize: 10,
      total: 3,
      subtotalEstimatedUsd: "12.34567890",
      coverage: "PARTIAL",
      runs: [
        {
          leadRunId: `lr_${"b".repeat(64)}`,
          availability: "AVAILABLE",
          estimatedCostUsd: "12.34567890",
        },
        {
          leadRunId: `lr_${"c".repeat(64)}`,
          availability: "UNKNOWN",
          estimatedCostUsd: null,
        },
      ],
    });
    mocks.listCostOverview.mockResolvedValueOnce(result);

    const response = await get("?page=2&pageSize=10");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: result.runs,
      meta: {
        page: 2,
        pageSize: 10,
        total: 3,
        currency: "USD",
        coverage: "PARTIAL",
        subtotalEstimatedUsd: "12.34567890",
      },
    });
    expectPrivateNoStore(response);
  });

  it.each([
    ["complete", "COMPLETE", "1.00000000", 1],
    ["partial", "PARTIAL", "1.00000000", 2],
    ["unknown", "UNKNOWN", null, 2],
    ["empty", "EMPTY", null, 0],
  ] as const)(
    "preserves the %s coverage state without inventing a value",
    async (_label, coverage, subtotalEstimatedUsd, total) => {
      mocks.listCostOverview.mockResolvedValueOnce(
        overview({
          runs: [],
          coverage,
          subtotalEstimatedUsd,
          total,
        }),
      );

      const response = await get();
      const body = (await response.json()) as {
        readonly meta: {
          readonly coverage: string;
          readonly subtotalEstimatedUsd: string | null;
          readonly total: number;
        };
      };

      expect(response.status).toBe(200);
      expect(body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total,
        currency: "USD",
        coverage,
        subtotalEstimatedUsd,
      });
      expectPrivateNoStore(response);
    },
  );

  it("maps data-source failures to a safe no-store envelope", async () => {
    mocks.listCostOverview.mockRejectedValueOnce(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );

    const response = await get();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expectPrivateNoStore(response);
  });

  it("does not expose technical failure details", async () => {
    const failure = Object.assign(
      new Error("sensitive internal field and secret-token"),
      { secret: "secret-token", organizationId },
    );
    failure.stack = "internal stack at route.ts:1";
    mocks.listCostOverview.mockRejectedValueOnce(failure);

    const response = await get();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).toContain("UNEXPECTED_ERROR");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("internal stack");
    expect(serialized).not.toContain(organizationId);
    expectPrivateNoStore(response);
  });

  it("contains no direct database, producer, ingress, or network access", () => {
    const source = routeSource();

    expect(source).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i);
    expect(source).not.toMatch(/DATABASE_URL|producer|n8n|webhook|fetch\s*\(/i);
    expect(source).not.toMatch(/isDemoDataEnabled|listDemo/i);
  });
});
