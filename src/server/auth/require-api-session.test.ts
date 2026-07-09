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
import type {
  AuthorizedActor,
  ServerSessionAuthorization,
} from "./authorization";
import {
  requirePermission,
  requireSameOrigin,
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
  const authorization = await requirePermission("leads:read");
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

const syntheticActor: AuthorizedActor = {
  issuer: "https://issuer.example.test",
  subject: "synthetic-subject",
  organizationId: "synthetic-organization",
  permissions: ["leads:read"],
};

function createOriginRequest(
  origin: string | null,
  url = "https://prospecta.example.test/api/workspaces",
  extraHeaders: readonly [string, string][] = [],
): Pick<Request, "headers" | "url"> {
  const headers = new Headers();

  if (origin !== null) {
    headers.set("Origin", origin);
  }

  for (const [name, value] of extraHeaders) {
    headers.set(name, value);
  }

  return { headers, url };
}

const accessDeniedError = expect.objectContaining({
  name: "SafeApiError",
  code: "ACCESS_DENIED",
  message: "Você não tem acesso a esta área.",
});

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

  it("returns the server-side actor and continues exactly once after permission", async () => {
    const callOrder: string[] = [];
    getServerAuthorizationMock.mockImplementation(async () => {
      callOrder.push("authenticate");
      return { status: "authorized", actor: syntheticActor };
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
      authorization: {
        status: "authorized",
        actor: syntheticActor,
      },
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
    expect(validate).toHaveBeenCalledWith({
      status: "authorized",
      actor: syntheticActor,
    });
    expect(repository).toHaveBeenCalledWith({
      status: "authorized",
      actor: syntheticActor,
    });
  });

  it("returns 403 before protected callbacks when permission is absent", async () => {
    setAuthorization({
      status: "authorized",
      actor: {
        ...syntheticActor,
        permissions: ["imports:read"],
      },
    });
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
    });
    expect(validate).not.toHaveBeenCalled();
    expect(repository).not.toHaveBeenCalled();
  });

  it("denies an unknown permission by default", async () => {
    setAuthorization({
      status: "authorized",
      actor: syntheticActor,
    });

    const error = await captureError(() =>
      requirePermission("unknown:permission" as "leads:read"),
    );

    expect(mapApiError(error)).toMatchObject({
      status: 403,
      body: {
        error: {
          code: "ACCESS_DENIED",
        },
      },
    });
  });

  it("returns the authorized actor only to server-side caller code", async () => {
    setAuthorization({
      status: "authorized",
      actor: syntheticActor,
    });

    await expect(requireApiSession()).resolves.toEqual({
      status: "authorized",
      actor: syntheticActor,
    });
    await expect(requirePermission("leads:read")).resolves.toEqual({
      status: "authorized",
      actor: syntheticActor,
    });
  });

  it("does not add the actor to authorization errors or API envelopes", async () => {
    const sensitiveFragments = [
      "https://issuer.example.test",
      "synthetic-organization",
      "synthetic-subject",
      "synthetic-claim",
      "synthetic-token",
      "manager@example.test",
      "internal-provider",
    ];

    setAuthorization({
      status: "authorized",
      actor: syntheticActor,
    });
    const authorization = await requirePermission("leads:read");

    setAuthorization({
      status: "authorized",
      actor: {
        ...syntheticActor,
        permissions: ["imports:read"],
      },
    });
    const denied = mapApiError(
      await captureError(() => requirePermission("leads:read")),
    );

    setAuthorization({ status: "missing" });
    const missing = mapApiError(
      await captureError(() => requireApiSession()),
    );

    const serializedErrors = JSON.stringify({ denied, missing });

    expect(authorization.actor).toBe(syntheticActor);
    for (const fragment of sensitiveFragments) {
      expect(serializedErrors).not.toContain(fragment);
    }
    expect(serializedErrors).not.toMatch(
      /issuer|organization|subject|claims?|tokens?|email|provider/i,
    );
    expect(serializedErrors).not.toMatch(/stack|cause|configuration/i);
  });

  it("accepts a matching same-origin header", () => {
    expect(() =>
      requireSameOrigin(
        createOriginRequest("https://prospecta.example.test"),
      ),
    ).not.toThrow();
  });

  it("accepts matching localhost origins with an explicit port", () => {
    expect(() =>
      requireSameOrigin(
        createOriginRequest(
          "http://localhost:3000",
          "http://localhost:3000/api/workspaces",
        ),
      ),
    ).not.toThrow();
  });

  it("accepts the external host origin behind a local NodePort", () => {
    expect(() =>
      requireSameOrigin(
        createOriginRequest(
          "http://192.168.0.20:30097",
          "http://0.0.0.0:3000/api/imports",
          [["Host", "192.168.0.20:30097"]],
        ),
      ),
    ).not.toThrow();
  });

  it("accepts an external forwarded HTTPS origin", () => {
    expect(() =>
      requireSameOrigin(
        createOriginRequest(
          "https://prospecta.example.test",
          "http://0.0.0.0:3000/api/imports",
          [
            ["Host", "prospecta.example.test"],
            ["X-Forwarded-Proto", "https"],
          ],
        ),
      ),
    ).not.toThrow();
  });

  it("rejects a cross-origin mutation", () => {
    expect(() =>
      requireSameOrigin(createOriginRequest("https://attacker.example.test")),
    ).toThrowError(accessDeniedError);
  });

  it.each([
    "not-a-valid-origin",
    "null",
    "https://prospecta.example.test/path",
    "https://user:password@prospecta.example.test",
  ])("rejects a malformed origin header: %s", (origin) => {
    expect(() =>
      requireSameOrigin(createOriginRequest(origin)),
    ).toThrowError(accessDeniedError);
  });

  it("rejects a mutation when the origin header is absent", () => {
    expect(() =>
      requireSameOrigin(createOriginRequest(null)),
    ).toThrowError(accessDeniedError);
  });

  it("rejects a malformed request URL safely", () => {
    expect(() =>
      requireSameOrigin(
        createOriginRequest(
          "https://prospecta.example.test",
          "not-an-absolute-request-url",
        ),
      ),
    ).toThrowError(accessDeniedError);
  });

  it("never trusts an origin value supplied in a request body", () => {
    const request = {
      ...createOriginRequest(null),
      body: JSON.stringify({
        origin: "https://prospecta.example.test",
      }),
    };

    expect(() => requireSameOrigin(request)).toThrowError(accessDeniedError);
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
