import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ServerEnv } from "../env";
import {
  authorizeIdentityClaims,
  classifyServerSession,
} from "./authorization";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createAuthConfig,
} from "./config";

const environment: ServerEnv = {
  DATABASE_URL:
    "postgresql://readonly_user:synthetic-password@localhost:5432/synthetic",
  AUTH_SECRET: "synthetic-session-secret-with-more-than-32-characters",
  AUTH_OIDC_ISSUER: "https://identity.example.test/tenant",
  AUTH_OIDC_CLIENT_ID: "synthetic-client-id",
  AUTH_OIDC_CLIENT_SECRET: "synthetic-client-secret",
  AUTH_ALLOWED_ORG_ID: "synthetic-organization",
};

const policy = {
  issuer: environment.AUTH_OIDC_ISSUER,
  organizationId: environment.AUTH_ALLOWED_ORG_ID,
};

const validClaims = {
  iss: environment.AUTH_OIDC_ISSUER,
  sub: "synthetic-subject",
  org_id: environment.AUTH_ALLOWED_ORG_ID,
};

describe("server authentication and authorization", () => {
  it("authorizes exact issuer, non-empty subject, and exact organization", () => {
    expect(authorizeIdentityClaims(validClaims, policy)).toEqual({
      status: "authorized",
      identity: {
        issuer: environment.AUTH_OIDC_ISSUER,
        subject: "synthetic-subject",
        organizationId: environment.AUTH_ALLOWED_ORG_ID,
      },
    });
  });

  it("distinguishes an absent session", () => {
    expect(classifyServerSession(null)).toEqual({ status: "missing" });
  });

  it("distinguishes an expired session", () => {
    expect(
      classifyServerSession(
        {
          expires: "2026-06-30T23:59:59.000Z",
          authorization: "authorized",
        },
        new Date("2026-07-01T00:00:00.000Z"),
      ),
    ).toEqual({ status: "expired" });
  });

  it("rejects a different organization", () => {
    expect(
      authorizeIdentityClaims(
        { ...validClaims, org_id: "another-organization" },
        policy,
      ),
    ).toEqual({ status: "unauthorized", reason: "organization" });
  });

  it("rejects a missing organization claim", () => {
    const { org_id: _orgId, ...claims } = validClaims;

    expect(authorizeIdentityClaims(claims, policy)).toEqual({
      status: "unauthorized",
      reason: "organization",
    });
  });

  it("rejects an empty organization claim", () => {
    expect(
      authorizeIdentityClaims({ ...validClaims, org_id: "" }, policy),
    ).toEqual({ status: "unauthorized", reason: "organization" });
  });

  it("rejects a multi-valued organization claim", () => {
    expect(
      authorizeIdentityClaims(
        {
          ...validClaims,
          org_id: [
            environment.AUTH_ALLOWED_ORG_ID,
            environment.AUTH_ALLOWED_ORG_ID,
          ],
        },
        policy,
      ),
    ).toEqual({ status: "unauthorized", reason: "organization" });
  });

  it("rejects subtle issuer string differences", () => {
    expect(
      authorizeIdentityClaims(
        { ...validClaims, iss: `${environment.AUTH_OIDC_ISSUER}/` },
        policy,
      ),
    ).toEqual({ status: "unauthorized", reason: "issuer" });
    expect(
      authorizeIdentityClaims(
        { ...validClaims, iss: "https://IDENTITY.example.test/tenant" },
        policy,
      ),
    ).toEqual({ status: "unauthorized", reason: "issuer" });
  });

  it("rejects a missing subject", () => {
    const { sub: _subject, ...claims } = validClaims;

    expect(authorizeIdentityClaims(claims, policy)).toEqual({
      status: "unauthorized",
      reason: "subject",
    });
  });

  it("rejects an empty or whitespace-only subject", () => {
    expect(
      authorizeIdentityClaims({ ...validClaims, sub: "" }, policy),
    ).toEqual({ status: "unauthorized", reason: "subject" });
    expect(
      authorizeIdentityClaims({ ...validClaims, sub: "   " }, policy),
    ).toEqual({ status: "unauthorized", reason: "subject" });
  });

  it("does not authorize matching email or domain claims", () => {
    expect(
      authorizeIdentityClaims(
        {
          iss: validClaims.iss,
          sub: validClaims.sub,
          email: "manager@synthetic-organization.example",
          domain: environment.AUTH_ALLOWED_ORG_ID,
          name: environment.AUTH_ALLOWED_ORG_ID,
        },
        policy,
      ),
    ).toEqual({ status: "unauthorized", reason: "organization" });
  });

  it("configures only the managed OIDC provider and a bounded JWT session", () => {
    const config = createAuthConfig(environment, true);
    const provider = config.providers[0];

    expect(typeof provider).toBe("object");
    expect(provider).toMatchObject({
      id: "organization-oidc",
      type: "oidc",
      issuer: environment.AUTH_OIDC_ISSUER,
      clientId: environment.AUTH_OIDC_CLIENT_ID,
      clientSecret: environment.AUTH_OIDC_CLIENT_SECRET,
    });
    expect(config.providers).toHaveLength(1);
    expect(config).not.toHaveProperty("adapter");
    expect(config.session).toEqual({
      strategy: "jwt",
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    });
    expect(config.pages).toEqual({
      signIn: "/login",
      error: "/login",
    });
  });

  it("accepts sign-in only for verified exact identity claims", async () => {
    const callback = createAuthConfig(environment, true).callbacks?.signIn;

    expect(callback).toBeTypeOf("function");
    await expect(
      callback?.({
        account: {
          provider: "organization-oidc",
          type: "oidc",
        },
        profile: validClaims,
        user: { id: validClaims.sub },
      } as never),
    ).resolves.toBe(true);
    await expect(
      callback?.({
        account: {
          provider: "organization-oidc",
          type: "oidc",
        },
        profile: {
          ...validClaims,
          org_id: "client-supplied-organization",
          email: "manager@synthetic-organization.example",
        },
        user: { id: validClaims.sub },
      } as never),
    ).resolves.toBe(false);
  });

  it("keeps only approved identity values in the encrypted session token", async () => {
    const callback = createAuthConfig(environment, true).callbacks?.jwt;

    expect(callback).toBeTypeOf("function");
    const token = await callback?.({
      account: {
        provider: "organization-oidc",
        type: "oidc",
        access_token: "synthetic-access-token",
        id_token: "synthetic-id-token",
      },
      profile: {
        ...validClaims,
        email: "manager@example.test",
        name: "Synthetic Manager",
      },
      session: {
        issuer: "client-supplied-issuer",
        organizationId: "client-supplied-organization",
      },
      token: {
        email: "manager@example.test",
        accessToken: "synthetic-access-token",
      },
      trigger: "signIn",
      user: { id: validClaims.sub },
    } as never);

    expect(token).toEqual({
      verifiedIssuer: environment.AUTH_OIDC_ISSUER,
      subject: validClaims.sub,
      organizationId: environment.AUTH_ALLOWED_ORG_ID,
    });
  });

  it("uses secure session cookies with production-safe defaults", () => {
    const production = createAuthConfig(environment, true);
    const development = createAuthConfig(environment, false);

    expect(production.useSecureCookies).toBe(true);
    expect(production.cookies?.sessionToken).toEqual({
      name: "__Secure-authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    });
    expect(development.cookies?.sessionToken.options.secure).toBe(false);
  });

  it("exposes no issuer, claims, tokens, or secrets in the public session", async () => {
    const callback = createAuthConfig(environment, true).callbacks?.session;

    expect(callback).toBeTypeOf("function");
    const session = await callback?.({
      session: {
        expires: "2026-07-01T08:00:00.000Z",
        user: {
          email: "manager@example.test",
          name: "Synthetic Manager",
        },
      },
      token: {
        verifiedIssuer: environment.AUTH_OIDC_ISSUER,
        subject: validClaims.sub,
        organizationId: environment.AUTH_ALLOWED_ORG_ID,
        accessToken: "synthetic-access-token",
        idToken: "synthetic-id-token",
      },
    } as never);
    const serialized = JSON.stringify(session);

    expect(session).toEqual({
      expires: "2026-07-01T08:00:00.000Z",
      authorization: "authorized",
    });
    expect(serialized).not.toContain(environment.AUTH_OIDC_ISSUER);
    expect(serialized).not.toContain(environment.AUTH_ALLOWED_ORG_ID);
    expect(serialized).not.toContain(environment.AUTH_OIDC_CLIENT_SECRET);
    expect(serialized).not.toContain("manager@example.test");
    expect(serialized).not.toContain("synthetic-access-token");
    expect(serialized).not.toContain("synthetic-id-token");
  });

  it("exposes the official Auth.js GET and POST route handlers", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/auth/[...nextauth]/route.ts",
      ),
      "utf8",
    );

    expect(source).toContain('import { handlers } from "@/server/auth";');
    expect(source).toContain("export const { GET, POST } = handlers;");
  });
});
