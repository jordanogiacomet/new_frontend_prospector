import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as environment from "./env";

const validEnvironment = {
  DATABASE_URL:
    "postgresql://readonly_user:replace-password@localhost:5432/read_only_leads",
  PRODUCER_DATABASE_URL:
    "postgresql://producer_reader:replace-password@localhost:5432/producer",
  APP_DATABASE_URL:
    "postgresql://prospecta_app:replace-password@localhost:5432/prospecta",
  AUTH_SECRET: "replace-with-a-random-secret-at-least-32-characters",
  AUTH_OIDC_ISSUER: "https://identity.example.com/replace-tenant",
  AUTH_OIDC_CLIENT_ID: "replace-with-oidc-client-id",
  AUTH_OIDC_CLIENT_SECRET: "replace-with-oidc-client-secret",
  AUTH_ALLOWED_ORG_ID: "replace-with-organization-id",
  AUTH_ROLE_CLAIM: "https://prospecta.example.com/roles",
  AUTH_ROLE_MAPPING:
    '{"provider-reader":["reader"],"provider-manager":["manager","sensitive"]}',
  N8N_IMPORT_URL:
    "https://automation.example.com/webhook/prospecta/imports/v1",
  N8N_HMAC_KEY_ID: "replace-with-active-key-id",
  N8N_HMAC_SECRET: "replace-with-a-random-hmac-secret-of-at-least-32-bytes",
  IMPORT_MAX_BYTES: "10485760",
  IMPORT_PRODUCER_TIMEOUT_MS: "15000",
  SENSITIVE_URL_HOSTS: "evidence.example.com, reports.example.com",
  FEATURE_IMPORTS_ENABLED: "false",
  FEATURE_BATCH_OBSERVATION_ENABLED: "false",
  FEATURE_COMMERCIAL_ENABLED: "false",
  FEATURE_SENSITIVE_CONTENT_ENABLED: "false",
};

const expectedEnvironmentKeys = Object.keys(validEnvironment);

describe("server environment", () => {
  it("rejects missing required variables", () => {
    expect(() => environment.parseServerEnv({})).toThrow(
      /DATABASE_URL[\s\S]*PRODUCER_DATABASE_URL[\s\S]*APP_DATABASE_URL[\s\S]*AUTH_SECRET/,
    );
  });

  it("rejects a malformed legacy database URL", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        DATABASE_URL: "mysql://readonly_user:password@localhost/database",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it.each(["PRODUCER_DATABASE_URL", "APP_DATABASE_URL"] as const)(
    "rejects a malformed %s",
    (name) => {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          [name]: "postgresql://missing-credentials.example.com/database",
        }),
      ).toThrow(new RegExp(name));
    },
  );

  it("rejects a malformed OIDC issuer", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        AUTH_OIDC_ISSUER: "not-an-absolute-https-url",
      }),
    ).toThrow(/AUTH_OIDC_ISSUER/);
  });

  it.each([
    "http://automation.example.com/webhook/prospecta/imports/v1",
    "https://automation.example.com/webhook/prospecta/imports/v1?token=secret",
    "https://automation.example.com/another-webhook",
  ])("rejects an unsafe ingress URL: %s", (N8N_IMPORT_URL) => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_IMPORT_URL,
      }),
    ).toThrow(/N8N_IMPORT_URL/);
  });

  it("rejects an HMAC secret shorter than 32 bytes", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_HMAC_SECRET: "too-short",
      }),
    ).toThrow(/N8N_HMAC_SECRET/);
  });

  it.each([
    "not-json",
    "[]",
    '{"provider-reader":[]}',
    '{"provider-reader":["reader","reader"]}',
    '{" ":["reader"]}',
  ])("rejects a malformed role map: %s", (AUTH_ROLE_MAPPING) => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        AUTH_ROLE_MAPPING,
      }),
    ).toThrow(/AUTH_ROLE_MAPPING/);
  });

  it.each([
    "https://evidence.example.com",
    "*.example.com",
    "example.com/path",
    "localhost",
    "127.0.0.1",
  ])("rejects an unsafe sensitive URL host: %s", (SENSITIVE_URL_HOSTS) => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        SENSITIVE_URL_HOSTS,
      }),
    ).toThrow(/SENSITIVE_URL_HOSTS/);
  });

  it("normalizes and deduplicates approved URL hosts", () => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      SENSITIVE_URL_HOSTS:
        "Evidence.Example.com, reports.example.com, evidence.example.com",
    });

    expect(parsed.SENSITIVE_URL_HOSTS).toEqual([
      "evidence.example.com",
      "reports.example.com",
    ]);
  });

  it.each(["0", "-1", "1.5", "10485761", "not-a-number"])(
    "rejects an unsafe upload byte limit: %s",
    (IMPORT_MAX_BYTES) => {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          IMPORT_MAX_BYTES,
        }),
      ).toThrow(/IMPORT_MAX_BYTES/);
    },
  );

  it.each(["0", "-1", "1.5", "not-a-number"])(
    "rejects a malformed producer timeout: %s",
    (IMPORT_PRODUCER_TIMEOUT_MS) => {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          IMPORT_PRODUCER_TIMEOUT_MS,
        }),
      ).toThrow(/IMPORT_PRODUCER_TIMEOUT_MS/);
    },
  );

  it("rejects malformed feature flags", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_IMPORTS_ENABLED: "yes",
      }),
    ).toThrow(/FEATURE_IMPORTS_ENABLED/);
  });

  it("rejects server-only settings exposed with public names", () => {
    const leakedValue = "do-not-echo-this-public-secret";

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        NEXT_PUBLIC_N8N_HMAC_SECRET: leakedValue,
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(leakedValue),
      }),
    );
  });

  it("does not echo invalid values in validation errors", () => {
    const invalidSecret = "plain-text-secret-that-must-not-be-echoed";

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_HMAC_SECRET: invalidSecret,
        SENSITIVE_URL_HOSTS: "https://unsafe.example.com/private",
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(invalidSecret),
      }),
    );
  });

  it("returns normalized validated server variables for valid input", () => {
    expect(environment.parseServerEnv(validEnvironment)).toEqual({
      ...validEnvironment,
      AUTH_ROLE_MAPPING: {
        "provider-reader": ["reader"],
        "provider-manager": ["manager", "sensitive"],
      },
      IMPORT_MAX_BYTES: 10_485_760,
      IMPORT_PRODUCER_TIMEOUT_MS: 15_000,
      SENSITIVE_URL_HOSTS: [
        "evidence.example.com",
        "reports.example.com",
      ],
      FEATURE_IMPORTS_ENABLED: false,
      FEATURE_BATCH_OBSERVATION_ENABLED: false,
      FEATURE_COMMERCIAL_ENABLED: false,
      FEATURE_SENSITIVE_CONTENT_ENABLED: false,
    });
  });

  it("keeps integration settings out of client environment exports", () => {
    const parsed = environment.parseServerEnv(validEnvironment);
    const source = readFileSync(
      resolve(process.cwd(), "src/server/env.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
    expect(parsed).not.toHaveProperty("NEXT_PUBLIC_DATABASE_URL");
    expect(parsed).not.toHaveProperty("NEXT_PUBLIC_N8N_HMAC_SECRET");
    expect(environment).not.toHaveProperty("clientEnv");
  });

  it("documents server-only placeholders with disabled feature flags", () => {
    const example = readFileSync(
      resolve(process.cwd(), ".env.example"),
      "utf8",
    );
    const entries = example
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line): [string, string] => {
        const [key, value = ""] = line.split("=", 2);
        return [key, value];
      });
    const valuesByKey = new Map(entries);

    expect(entries.map(([key]) => key)).toEqual(expectedEnvironmentKeys);
    expect(example).not.toContain("NEXT_PUBLIC_");
    expect(valuesByKey.get("N8N_IMPORT_URL")).toContain("replace-");
    expect(valuesByKey.get("N8N_HMAC_SECRET")).toContain("replace-");
    expect(valuesByKey.get("SENSITIVE_URL_HOSTS")).toBe(
      '"evidence.example.com,reports.example.com"',
    );
    expect(
      expectedEnvironmentKeys
        .filter((key) => key.startsWith("FEATURE_"))
        .every((key) => valuesByKey.get(key) === '"false"'),
    ).toBe(true);
  });
});
