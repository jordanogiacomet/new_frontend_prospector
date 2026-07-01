import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as environment from "./env";

const validEnvironment = {
  DATABASE_URL:
    "postgresql://readonly_user:replace-password@localhost:5432/read_only_leads",
  AUTH_SECRET: "replace-with-a-random-secret-at-least-32-characters",
  AUTH_OIDC_ISSUER: "https://identity.example.com/replace-tenant",
  AUTH_OIDC_CLIENT_ID: "replace-with-oidc-client-id",
  AUTH_OIDC_CLIENT_SECRET: "replace-with-oidc-client-secret",
  AUTH_ALLOWED_ORG_ID: "replace-with-organization-id",
};

describe("server environment", () => {
  it("rejects missing required variables", () => {
    expect(() => environment.parseServerEnv({})).toThrow(
      /DATABASE_URL[\s\S]*AUTH_SECRET[\s\S]*AUTH_OIDC_ISSUER/,
    );
  });

  it("rejects a malformed database URL", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        DATABASE_URL: "mysql://readonly_user:password@localhost/database",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a malformed OIDC issuer", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        AUTH_OIDC_ISSUER: "not-an-absolute-https-url",
      }),
    ).toThrow(/AUTH_OIDC_ISSUER/);
  });

  it("returns only validated server variables for valid input", () => {
    expect(environment.parseServerEnv(validEnvironment)).toEqual(
      validEnvironment,
    );
  });

  it("keeps secrets out of client environment exports", () => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      NEXT_PUBLIC_DATABASE_URL: "https://client.example.com/database",
      NEXT_PUBLIC_AUTH_SECRET: "client-visible-secret",
    });
    const source = readFileSync(
      resolve(process.cwd(), "src/server/env.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
    expect(parsed).not.toHaveProperty("NEXT_PUBLIC_DATABASE_URL");
    expect(parsed).not.toHaveProperty("NEXT_PUBLIC_AUTH_SECRET");
    expect(environment).not.toHaveProperty("clientEnv");
  });

  it("documents placeholders without n8n or client-exposed secrets", () => {
    const example = readFileSync(
      resolve(process.cwd(), ".env.example"),
      "utf8",
    );
    const entries = example
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=", 2));

    expect(entries.map(([key]) => key)).toEqual(Object.keys(validEnvironment));
    expect(entries.every(([, value]) => value.includes("replace-"))).toBe(true);
    expect(example).not.toMatch(/n8n/i);
    expect(example).not.toContain("NEXT_PUBLIC_");
  });
});
