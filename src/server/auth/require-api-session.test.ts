import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerAuthorizationMock } = vi.hoisted(() => ({
  getServerAuthorizationMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./index", () => ({
  getServerAuthorization: getServerAuthorizationMock,
}));

import { mapApiError } from "../api/errors";
import type { ServerSessionAuthorization } from "./authorization";
import {
  requireApiSession,
  type ApiAuthorizationContext,
} from "./require-api-session";

type ProtectedCallback = (
  authorization: ApiAuthorizationContext,
) => string | Promise<string>;

async function executeProtectedPipeline(
  validate: ProtectedCallback,
  repository: ProtectedCallback,
) {
  const authorization = await requireApiSession();
  const validated = await validate(authorization);
  const result = await repository(authorization);

  return { authorization, validated, result };
}

async function captureError(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected the protected operation to fail.");
}

function setAuthorization(
  authorization: ServerSessionAuthorization,
): void {
  getServerAuthorizationMock.mockResolvedValue(authorization);
}

describe("API authorization guard", () => {
  beforeEach(() => {
    getServerAuthorizationMock.mockReset();
  });

  it("maps a missing session to safe 401 before protected callbacks", async () => {
    setAuthorization({ status: "missing" });
    const validate = vi.fn<ProtectedCallback>(() => "validated");
    const repository = vi.fn<ProtectedCallback>(() => "result");

    const error = await captureError(() =>
      executeProtectedPipeline(validate, repository),
    );

    expect(mapApiError(error)).toMatchObject({
      status: 401,
      body: {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Entre para acessar os dados.",
        },
      },
      logContext: { category: "AUTHENTICATION_REQUIRED" },
    });
    expect(getServerAuthorizationMock).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
    expect(repository).not.toHaveBeenCalled();
  });

  it("maps an expired session to safe 401 before protected callbacks", async () => {
    setAuthorization({ status: "expired" });
    const validate = vi.fn<ProtectedCallback>(() => "validated");
    const repository = vi.fn<ProtectedCallback>(() => "result");

    const error = await captureError(() =>
      executeProtectedPipeline(validate, repository),
    );

    expect(mapApiError(error)).toMatchObject({
      status: 401,
      body: {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Entre para acessar os dados.",
        },
      },
    });
    expect(getServerAuthorizationMock).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
    expect(repository).not.toHaveBeenCalled();
  });

  it("maps an unauthorized session to safe 403 before protected callbacks", async () => {
    setAuthorization({ status: "unauthorized" });
    const validate = vi.fn<ProtectedCallback>(() => "validated");
    const repository = vi.fn<ProtectedCallback>(() => "result");

    const error = await captureError(() =>
      executeProtectedPipeline(validate, repository),
    );

    expect(mapApiError(error)).toMatchObject({
      status: 403,
      body: {
        error: {
          code: "ACCESS_DENIED",
          message: "Você não tem acesso a esta área.",
        },
      },
      logContext: { category: "ACCESS_DENIED" },
    });
    expect(getServerAuthorizationMock).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
    expect(repository).not.toHaveBeenCalled();
  });

  it("returns minimal authorization and continues exactly once after auth", async () => {
    const callOrder: string[] = [];
    getServerAuthorizationMock.mockImplementation(async () => {
      callOrder.push("authenticate");
      return { status: "authorized" };
    });
    const validate = vi.fn<ProtectedCallback>(() => {
      callOrder.push("validate");
      return "validated";
    });
    const repository = vi.fn<ProtectedCallback>(async () => {
      callOrder.push("repository");
      return "result";
    });

    const result = await executeProtectedPipeline(validate, repository);

    expect(result).toEqual({
      authorization: { status: "authorized" },
      validated: "validated",
      result: "result",
    });
    expect(callOrder).toEqual([
      "authenticate",
      "validate",
      "repository",
    ]);
    expect(getServerAuthorizationMock).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledOnce();
    expect(repository).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledWith({ status: "authorized" });
    expect(repository).toHaveBeenCalledWith({ status: "authorized" });
  });

  it("exposes no identity, claim, token, email, or provider details", async () => {
    const sensitiveFragments = [
      "https://issuer.example.test",
      "synthetic-organization",
      "synthetic-subject",
      "synthetic-claim",
      "synthetic-token",
      "manager@example.test",
      "internal-provider",
    ];

    setAuthorization({ status: "authorized" });
    const authorization = await requireApiSession();

    setAuthorization({ status: "unauthorized" });
    const denied = mapApiError(
      await captureError(() => requireApiSession()),
    );

    setAuthorization({ status: "missing" });
    const missing = mapApiError(
      await captureError(() => requireApiSession()),
    );

    const serialized = JSON.stringify({
      authorization,
      denied,
      missing,
    });

    expect(authorization).toEqual({ status: "authorized" });
    expect(Object.keys(authorization)).toEqual(["status"]);
    for (const fragment of sensitiveFragments) {
      expect(serialized).not.toContain(fragment);
    }
    expect(serialized).not.toMatch(
      /issuer|organization|subject|claims?|tokens?|email|provider/i,
    );
    expect(serialized).not.toMatch(/stack|cause|configuration/i);
  });

  it("keeps the module server-only and independent from data or external services", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/server/auth/require-api-session.ts",
      ),
      "utf8",
    );

    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(/\bany\b/);
    expect(source).not.toMatch(/\bpostgres(?:ql)?\b/i);
    expect(source).not.toMatch(/\bleads?\b/i);
    expect(source).not.toMatch(/\bn8n\b/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+["'](?:pg|node:net|node:http|node:https)/);
  });
});
