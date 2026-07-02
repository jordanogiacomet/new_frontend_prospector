import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  paginatedSuccessResponse,
  successResponse,
} from "./errors";

const sensitiveFragments = [
  "SELECT * FROM company_validations",
  "postgresql://readonly_user:secret-password@database.internal/leads",
  "secret-password",
  "00000000000000",
  "private strategic report",
];

function expectNoSensitiveData(value: unknown): void {
  const serialized = JSON.stringify(value);

  for (const fragment of sensitiveFragments) {
    expect(serialized).not.toContain(fragment);
  }
}

describe("API response envelopes", () => {
  it("builds the approved success envelope", () => {
    expect(successResponse({ id: "synthetic-lead" })).toEqual({
      data: { id: "synthetic-lead" },
    });
  });

  it("includes optional success metadata without changing its shape", () => {
    expect(
      successResponse([{ id: "synthetic-lead" }], {
        completeness: "retained_only",
      }),
    ).toEqual({
      data: [{ id: "synthetic-lead" }],
      meta: { completeness: "retained_only" },
    });
  });

  it("builds the approved paginated success envelope", () => {
    expect(
      paginatedSuccessResponse([{ id: "synthetic-lead" }], {
        page: 2,
        pageSize: 20,
        total: 21,
      }),
    ).toEqual({
      data: [{ id: "synthetic-lead" }],
      meta: {
        page: 2,
        pageSize: 20,
        total: 21,
      },
    });
  });
});

describe("safe API error mapping", () => {
  it("maps Zod failures to field-only validation details", () => {
    const result = z
      .strictObject({
        page: z.number().int().min(1),
        cnpj: z.string().length(14),
      })
      .safeParse({
        page: 0,
        cnpj: sensitiveFragments[3],
        payload: sensitiveFragments[4],
      });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected synthetic validation to fail.");
    }

    const mapped = mapApiError(result.error);

    expect(mapped.status).toBe(400);
    expect(mapped.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
        details: [
          { field: "page", message: "Valor inválido." },
          { field: "payload", message: "Valor inválido." },
        ],
      },
    });
    expect(mapped.logContext).toEqual({
      correlationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      category: "VALIDATION_ERROR",
    });
    expectNoSensitiveData(mapped);
  });

  it("does not expose validator messages or rejected values", () => {
    const mapped = mapApiError(
      new ApiValidationError([
        {
          path: ["cnpj"],
          message: `Rejected ${sensitiveFragments[3]} from ${sensitiveFragments[1]}`,
        },
      ]),
    );

    expect(mapped.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
        details: [{ field: "cnpj", message: "Valor inválido." }],
      },
    });
    expectNoSensitiveData(mapped);
  });

  it("replaces unsafe validation paths with a neutral field", () => {
    const mapped = mapApiError(
      new ApiValidationError([
        {
          path: [sensitiveFragments[1]],
          message: sensitiveFragments[4],
        },
      ]),
    );

    expect(mapped.body.error).toHaveProperty("details", [
      { field: "request", message: "Valor inválido." },
    ]);
    expectNoSensitiveData(mapped);
  });

  it("maps missing authentication to the approved 401 response", () => {
    const mapped = mapApiError(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    expect(mapped).toMatchObject({
      status: 401,
      body: {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Entre para acessar os dados.",
        },
      },
      logContext: { category: "AUTHENTICATION_REQUIRED" },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
  });

  it("maps organization denial to the approved 403 response", () => {
    const mapped = mapApiError(new SafeApiError("ACCESS_DENIED"));

    expect(mapped).toMatchObject({
      status: 403,
      body: {
        error: {
          code: "ACCESS_DENIED",
          message: "Você não tem acesso a esta área.",
        },
      },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
  });

  it("maps an absent lead to the approved 404 response", () => {
    const mapped = mapApiError(new SafeApiError("LEAD_NOT_FOUND"));

    expect(mapped).toMatchObject({
      status: 404,
      body: {
        error: {
          code: "LEAD_NOT_FOUND",
          message: "Empresa não encontrada.",
        },
      },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
  });

  it("maps unavailable history to the approved 503 response", () => {
    const mapped = mapApiError(new SafeApiError("HISTORY_UNAVAILABLE"));

    expect(mapped).toMatchObject({
      status: 503,
      body: {
        error: {
          code: "HISTORY_UNAVAILABLE",
          message: "O histórico não está disponível no momento.",
        },
      },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
  });

  it("maps an explicit data-source failure to the approved 503 response", () => {
    const mapped = mapApiError(
      new SafeApiError("DATA_SOURCE_UNAVAILABLE"),
    );

    expect(mapped).toMatchObject({
      status: 503,
      body: {
        error: {
          code: "DATA_SOURCE_UNAVAILABLE",
          message: "Não foi possível consultar os dados agora.",
        },
      },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
  });

  it("maps a database connection failure without leaking driver details", () => {
    const databaseError = Object.assign(
      new Error(
        `connect ECONNREFUSED ${sensitiveFragments[1]} while running ${sensitiveFragments[0]}`,
        {
          cause: {
            password: "secret-password",
            payload: sensitiveFragments[4],
          },
        },
      ),
      {
        name: "DatabaseUnavailableError",
        code: "DATABASE_UNAVAILABLE",
        query: sensitiveFragments[0],
        connectionString: sensitiveFragments[1],
      },
    );
    databaseError.stack = `Error: ${databaseError.message}\n at database.ts:1`;

    const mapped = mapApiError(databaseError);

    expect(mapped).toMatchObject({
      status: 503,
      body: {
        error: {
          code: "DATA_SOURCE_UNAVAILABLE",
          message: "Não foi possível consultar os dados agora.",
        },
      },
      logContext: { category: "DATA_SOURCE_UNAVAILABLE" },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
    expectNoSensitiveData(mapped);
  });

  it("maps unknown Error instances to a neutral 500 response", () => {
    const unknownError = Object.assign(
      new Error(
        `${sensitiveFragments[0]} failed for ${sensitiveFragments[1]}`,
        {
          cause: {
            cnpj: sensitiveFragments[3],
            report: sensitiveFragments[4],
          },
        },
      ),
      {
        payload: {
          cnpj: sensitiveFragments[3],
          report: sensitiveFragments[4],
        },
      },
    );

    const mapped = mapApiError(unknownError);

    expect(mapped).toMatchObject({
      status: 500,
      body: {
        error: {
          code: "UNEXPECTED_ERROR",
          message: "Ocorreu um erro inesperado. Tente novamente.",
        },
      },
      logContext: { category: "UNEXPECTED_ERROR" },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
    expectNoSensitiveData(mapped);
  });

  it("maps raw thrown payloads to a neutral 500 response", () => {
    const mapped = mapApiError({
      sql: sensitiveFragments[0],
      connectionString: sensitiveFragments[1],
      credentials: "secret-password",
      cnpj: sensitiveFragments[3],
      payload: sensitiveFragments[4],
    });

    expect(mapped).toMatchObject({
      status: 500,
      body: {
        error: {
          code: "UNEXPECTED_ERROR",
          message: "Ocorreu um erro inesperado. Tente novamente.",
        },
      },
    });
    expect(mapped.body.error).not.toHaveProperty("details");
    expectNoSensitiveData(mapped);
  });

  it("does not trust a matching code on an arbitrary object", () => {
    const mapped = mapApiError({
      code: "ACCESS_DENIED",
      message: sensitiveFragments[4],
      cause: sensitiveFragments[1],
    });

    expect(mapped).toMatchObject({
      status: 500,
      body: {
        error: {
          code: "UNEXPECTED_ERROR",
          message: "Ocorreu um erro inesperado. Tente novamente.",
        },
      },
    });
    expectNoSensitiveData(mapped);
  });

  it("does not copy mutated properties from a recognized safe error", () => {
    const error = Object.assign(new SafeApiError("LEAD_NOT_FOUND"), {
      cause: sensitiveFragments[1],
      payload: sensitiveFragments[4],
      query: sensitiveFragments[0],
    });
    error.stack = `Error: ${sensitiveFragments[1]}`;

    const mapped = mapApiError(error);

    expect(mapped).toMatchObject({
      status: 404,
      body: {
        error: {
          code: "LEAD_NOT_FOUND",
          message: "Empresa não encontrada.",
        },
      },
    });
    expectNoSensitiveData(mapped);
  });

  it("keeps correlation log context limited to an ID and category", () => {
    const mapped = mapApiError(
      new Error(
        `${sensitiveFragments[0]} ${sensitiveFragments[1]} ${sensitiveFragments[4]}`,
      ),
    );

    expect(Object.keys(mapped.logContext).sort()).toEqual([
      "category",
      "correlationId",
    ]);
    expectNoSensitiveData(mapped.logContext);
  });
});
