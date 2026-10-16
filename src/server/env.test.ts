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
  N8N_IMPORT_URL:
    "https://automation.example.com/webhook/empresaqui/import",
  N8N_HMAC_KEY_ID: "replace-with-active-key-id",
  N8N_HMAC_SECRET: "replace-with-a-random-hmac-secret-of-at-least-32-bytes",
  N8N_IMPORT_EVENT_SECRET:
    "replace-with-a-random-event-secret-of-at-least-32-bytes",
  N8N_CONTACT_ENRICHMENT_URL:
    "https://automation.example.com/webhook/prospecta/lusha/decision-makers",
  N8N_CONTACT_ENRICHMENT_SECRET:
    "replace-with-a-contact-ingress-secret-of-at-least-32-bytes",
  N8N_CONTACT_CALLBACK_SECRET:
    "replace-with-a-contact-callback-secret-of-at-least-32-bytes",
  N8N_CONTACT_ENRICHMENT_V2_URL:
    "https://automation.example.com/webhook/prospecta/lusha/contact-enrichment-v2",
  N8N_CONTACT_ENRICHMENT_V2_SECRET:
    "synthetic-v2-ingress-secret-value-at-least-32-bytes",
  N8N_CONTACT_CALLBACK_V2_SECRET:
    "synthetic-v2-callback-secret-value-at-least-32-bytes",
  CONTACT_DATA_ENCRYPTION_KEY_BASE64:
    "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  CONTACT_DATA_ENCRYPTION_KEY_ID: "synthetic-contact-key-v1",
  CONTACT_SUPPRESSION_HMAC_KEY:
    "synthetic-suppression-secret-value-at-least-32-bytes",
  CONTACT_DATA_READ_SUBJECTS: "",
  CONTACT_DATA_GOVERN_SUBJECTS: "",
  CONTACT_CONTROLLER_LEGAL_NAME: "Controlador Sintético Ltda.",
  CONTACT_CONTROLLER_REGISTRATION: "00.000.000/0001-00",
  CONTACT_PRIVACY_CONTACT: "privacidade@example.test",
  IMPORT_MAX_BYTES: "10485760",
  IMPORT_PRODUCER_TIMEOUT_MS: "15000",
  CONTACT_ENRICHMENT_TIMEOUT_MS: "15000",
  OPENAI_API_KEY: "",
  OPENAI_APPROACH_MODEL: "",
  OPENAI_APPROACH_TIMEOUT_MS: "20000",
  COMPANY_REGISTRY_API_BASE_URL:
    "https://registry.example.test/api/cnpj/v1",
  LEAD_GEOCODING_API_URL: "https://geocoder.example.test/search",
  LEAD_POSTAL_CODE_API_BASE_URL:
    "https://registry.example.test/api/cep/v2",
  LEAD_GEOCODING_USER_AGENT:
    "Prospecta-Test/1.0 (contact: privacy@example.test)",
  LEAD_LOCATION_LOOKUP_TIMEOUT_MS: "4000",
  SENSITIVE_URL_HOSTS: "evidence.example.com, reports.example.com",
  FEATURE_IMPORTS_ENABLED: "false",
  FEATURE_BATCH_OBSERVATION_ENABLED: "false",
  FEATURE_COMMERCIAL_ENABLED: "false",
  FEATURE_SENSITIVE_CONTENT_ENABLED: "false",
  FEATURE_DEMO_DATA_ENABLED: "false",
  FEATURE_COSTS_ENABLED: "false",
  FEATURE_CONTACT_ENRICHMENT_ENABLED: "false",
  FEATURE_CONTACT_DATA_ENABLED: "false",
  FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: "false",
  FEATURE_AI_APPROACH_ENABLED: "false",
  FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: "false",
  COSTS_READ_SUBJECTS: "",
  DEMO2_FULL_ACCESS_ENABLED: "false",
  DEMO2_K8S_RUNTIME_ENABLED: "false",
  DEMO3_LOCAL_RUNTIME_ENABLED: "false",
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

  it("requires the n8n import URL", () => {
    const withoutImportUrl: Record<string, string | undefined> = {
      ...validEnvironment,
    };
    delete withoutImportUrl.N8N_IMPORT_URL;

    expect(() => environment.parseServerEnv(withoutImportUrl)).toThrow(
      /N8N_IMPORT_URL is required/,
    );
  });

  it.each([
    "ftp://automation.example.com/webhook/empresaqui/import",
    "https://user:password@automation.example.com/webhook/empresaqui/import",
    "https://automation.example.com/webhook/empresaqui/import?token=secret",
    "https://automation.example.com/webhook/empresaqui/import#fragment",
    "https://automation.example.com/webhook/prospecta/imports/v1",
    "https://automation.example.com/another-webhook",
    "http://automation.internal/webhook/empresaqui/import",
    "http://192.168.0.20/webhook/empresaqui/import",
    "http://192.168.0.20:30099/webhook/empresaqui/import",
    "http://192.168.0.20:30098/webhook-test/empresaqui/import",
    "http://192.168.0.20:30098/webhook/empresaqui/import/",
  ])("rejects an unsafe or unofficial ingress URL: %s", (N8N_IMPORT_URL) => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_IMPORT_URL,
      }),
    ).toThrow(/N8N_IMPORT_URL/);
  });

  it.each([
    "https://automation.example.com/webhook/empresaqui/import",
    "https://automation.example.com/webhook-test/empresaqui/import",
    "https://automation.example.com/webhook/prospecta/empresaqui/import/v1",
    "https://automation.example.com/webhook-test/prospecta/empresaqui/import/v1",
    "http://192.168.0.20:30098/webhook/empresaqui/import",
  ])("accepts an official n8n webhook URL form: %s", (N8N_IMPORT_URL) => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_IMPORT_URL,
      }).N8N_IMPORT_URL,
    ).toBe(N8N_IMPORT_URL);
  });

  it("accepts absent deferred HMAC settings", () => {
    const withoutHmac: Record<string, string | undefined> = {
      ...validEnvironment,
    };
    delete withoutHmac.N8N_HMAC_KEY_ID;
    delete withoutHmac.N8N_HMAC_SECRET;

    expect(environment.parseServerEnv(withoutHmac)).toMatchObject({
      N8N_IMPORT_URL:
        "https://automation.example.com/webhook/empresaqui/import",
      N8N_HMAC_KEY_ID: undefined,
      N8N_HMAC_SECRET: undefined,
    });
  });

  it("rejects an HMAC secret shorter than 32 bytes", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_HMAC_SECRET: "too-short",
      }),
    ).toThrow(/N8N_HMAC_SECRET/);
  });

  it("accepts an absent import event secret with the receiver disabled", () => {
    const withoutEventSecret: Record<string, string | undefined> = {
      ...validEnvironment,
    };
    delete withoutEventSecret.N8N_IMPORT_EVENT_SECRET;

    expect(
      environment.parseServerEnv(withoutEventSecret)
        .N8N_IMPORT_EVENT_SECRET,
    ).toBeUndefined();
  });

  it("rejects an import event secret shorter than 32 bytes", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_IMPORT_EVENT_SECRET: "too-short",
      }),
    ).toThrow(/N8N_IMPORT_EVENT_SECRET/);
  });

  it("requires complete, distinct contact integration settings when enabled", () => {
    const enabled = {
      ...validEnvironment,
      FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
    };

    expect(environment.parseServerEnv(enabled)).toMatchObject({
      FEATURE_CONTACT_ENRICHMENT_ENABLED: true,
      N8N_CONTACT_ENRICHMENT_URL:
        "https://automation.example.com/webhook/prospecta/lusha/decision-makers",
      CONTACT_ENRICHMENT_TIMEOUT_MS: 15_000,
    });

    for (const key of [
      "N8N_CONTACT_ENRICHMENT_URL",
      "N8N_CONTACT_ENRICHMENT_SECRET",
      "N8N_CONTACT_CALLBACK_SECRET",
    ] as const) {
      const incomplete: Record<string, string | undefined> = { ...enabled };
      delete incomplete[key];

      expect(() => environment.parseServerEnv(incomplete)).toThrow(
        new RegExp(key),
      );
    }
  });

  it.each([
    "http://automation.example.com/webhook/prospecta/lusha/decision-makers",
    "http://192.168.0.20:30098/webhook/prospecta/lusha/decision-makers/",
    "http://192.168.0.20:30099/webhook/prospecta/lusha/decision-makers",
    "http://192.168.0.20:30098/webhook/prospecta/lusha/other",
    "https://user:password@automation.example.com/webhook/prospecta/lusha/decision-makers",
    "https://automation.example.com/webhook/prospecta/lusha/decision-makers?secret=value",
  ])("rejects an unsafe contact-enrichment URL: %s", (url) => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
        N8N_CONTACT_ENRICHMENT_URL: url,
      }),
    ).toThrow(/N8N_CONTACT_ENRICHMENT_URL/);
  });

  it("accepts the exact internal contact URL only in the Demo 3 profile", () => {
    const exactUrl =
      "http://192.168.0.20:30098/webhook/prospecta/lusha/decision-makers";

    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_DEV_BYPASS_ENABLED: "true",
        FEATURE_COMMERCIAL_ENABLED: "true",
        FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
        DEMO3_LOCAL_RUNTIME_ENABLED: "true",
        N8N_CONTACT_ENRICHMENT_URL: exactUrl,
      }).N8N_CONTACT_ENRICHMENT_URL,
    ).toBe(exactUrl);

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
        N8N_CONTACT_ENRICHMENT_URL: exactUrl,
      }),
    ).toThrow(/N8N_CONTACT_ENRICHMENT_URL/);
  });

  it("rejects short, reused, or publicly exposed contact secrets", () => {
    for (const input of [
      { N8N_CONTACT_ENRICHMENT_SECRET: "too-short" },
      { N8N_CONTACT_CALLBACK_SECRET: "too-short" },
      {
        N8N_CONTACT_CALLBACK_SECRET:
          validEnvironment.N8N_CONTACT_ENRICHMENT_SECRET,
      },
      {
        N8N_CONTACT_ENRICHMENT_SECRET: validEnvironment.AUTH_SECRET,
      },
      {
        NEXT_PUBLIC_N8N_CONTACT_CALLBACK_SECRET:
          "public-value-that-must-never-be-echoed",
      },
    ]) {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
          ...input,
        }),
      ).toThrow();
    }
  });

  it("starts without deferred role settings", () => {
    const parsed = environment.parseServerEnv(validEnvironment);

    expect(parsed).not.toHaveProperty("AUTH_ROLE_CLAIM");
    expect(parsed).not.toHaveProperty("AUTH_ROLE_MAPPING");
  });

  it("starts without AUTH_ROLE_CLAIM when AUTH_ROLE_MAPPING is present", () => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      AUTH_ROLE_MAPPING: "not-json",
    });

    expect(parsed).not.toHaveProperty("AUTH_ROLE_CLAIM");
    expect(parsed).not.toHaveProperty("AUTH_ROLE_MAPPING");
  });

  it("starts without AUTH_ROLE_MAPPING when AUTH_ROLE_CLAIM is present", () => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      AUTH_ROLE_CLAIM: " invalid role claim ",
    });

    expect(parsed).not.toHaveProperty("AUTH_ROLE_CLAIM");
    expect(parsed).not.toHaveProperty("AUTH_ROLE_MAPPING");
  });

  it.each([
    "not-json",
    "[]",
    '{"provider-reader":[]}',
    '{"provider-reader":["reader"]}',
  ])("ignores deferred role settings: %s", (AUTH_ROLE_MAPPING) => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      AUTH_ROLE_CLAIM: "https://prospecta.example.com/roles",
      AUTH_ROLE_MAPPING,
    });

    expect(parsed).not.toHaveProperty("AUTH_ROLE_CLAIM");
    expect(parsed).not.toHaveProperty("AUTH_ROLE_MAPPING");
  });

  it("does not require deferred role settings to be well formed", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        AUTH_ROLE_CLAIM: " invalid role claim ",
        AUTH_ROLE_MAPPING: "not-json",
      }),
    ).not.toThrow();
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

  it("allows an empty sensitive URL host allowlist", () => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        SENSITIVE_URL_HOSTS: "",
      }).SENSITIVE_URL_HOSTS,
    ).toEqual([]);
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

  it("defaults the demo data flag to false when absent", () => {
    const withoutDemoFlag: Record<string, string | undefined> = {
      ...validEnvironment,
    };
    delete withoutDemoFlag.FEATURE_DEMO_DATA_ENABLED;

    expect(
      environment.parseServerEnv(withoutDemoFlag)
        .FEATURE_DEMO_DATA_ENABLED,
    ).toBe(false);
  });

  it("defaults cost access controls to denied when they are absent", () => {
    const withoutCostControls: Record<string, string | undefined> = {
      ...validEnvironment,
    };
    delete withoutCostControls.FEATURE_COSTS_ENABLED;
    delete withoutCostControls.COSTS_READ_SUBJECTS;

    expect(environment.parseServerEnv(withoutCostControls)).toMatchObject({
      FEATURE_COSTS_ENABLED: false,
      FEATURE_CONTACT_ENRICHMENT_ENABLED: false,
      FEATURE_CONTACT_DATA_ENABLED: false,
      FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: false,
      COSTS_READ_SUBJECTS: [],
      CONTACT_DATA_READ_SUBJECTS: [],
      CONTACT_DATA_GOVERN_SUBJECTS: [],
    });
  });

  it("parses a server-only exact subject allowlist for cost access", () => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_COSTS_ENABLED: "true",
        COSTS_READ_SUBJECTS: "synthetic-subject,finance-subject",
      }),
    ).toMatchObject({
      FEATURE_COSTS_ENABLED: true,
      COSTS_READ_SUBJECTS: ["synthetic-subject", "finance-subject"],
    });
  });

  it.each(["synthetic-subject,,finance-subject", " synthetic-subject"]) (
    "rejects a malformed cost subject allowlist: %s",
    (COSTS_READ_SUBJECTS) => {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          COSTS_READ_SUBJECTS,
        }),
      ).toThrow(/COSTS_READ_SUBJECTS/);
    },
  );

  it("rejects a malformed optional cost feature flag", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_COSTS_ENABLED: "yes",
      }),
    ).toThrow(/FEATURE_COSTS_ENABLED/);
  });

  it("keeps the development auth bypass disabled by default", () => {
    expect(
      environment.parseServerEnv(validEnvironment)
        .AUTH_DEV_BYPASS_ENABLED,
    ).toBe(false);
  });

  it("restricts full Demo 2 access to a local development test profile", () => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "development",
        AUTH_DEV_BYPASS_ENABLED: "true",
        DEMO2_FULL_ACCESS_ENABLED: "true",
      }),
    ).toMatchObject({
      AUTH_DEV_BYPASS_ENABLED: true,
      DEMO2_FULL_ACCESS_ENABLED: true,
    });

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_DEV_BYPASS_ENABLED: "true",
        DEMO2_FULL_ACCESS_ENABLED: "true",
      }),
    ).toThrow(/DEMO2_FULL_ACCESS_ENABLED/);
  });

  it("allows full Demo 2 access only with the explicit Kubernetes test runtime gate", () => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_DEV_BYPASS_ENABLED: "true",
        DEMO2_FULL_ACCESS_ENABLED: "true",
        DEMO2_K8S_RUNTIME_ENABLED: "true",
      }),
    ).toMatchObject({
      AUTH_DEV_BYPASS_ENABLED: true,
      DEMO2_FULL_ACCESS_ENABLED: true,
      DEMO2_K8S_RUNTIME_ENABLED: true,
    });

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_DEV_BYPASS_ENABLED: "true",
        DEMO2_K8S_RUNTIME_ENABLED: "true",
      }),
    ).toThrow(/DEMO2_K8S_RUNTIME_ENABLED/);
  });

  it("accepts the development auth bypass only outside production", () => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "development",
        AUTH_DEV_BYPASS_ENABLED: "true",
      }).AUTH_DEV_BYPASS_ENABLED,
    ).toBe(true);

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_DEV_BYPASS_ENABLED: "true",
      }),
    ).toThrow(/AUTH_DEV_BYPASS_ENABLED/);
  });

  it("allows the development auth bypass for the explicit demo profile", () => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_DEV_BYPASS_ENABLED: "true",
        FEATURE_DEMO_DATA_ENABLED: "true",
      }),
    ).toMatchObject({
      AUTH_DEV_BYPASS_ENABLED: true,
      FEATURE_DEMO_DATA_ENABLED: true,
    });
  });

  it("rejects a malformed development auth bypass flag", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "development",
        AUTH_DEV_BYPASS_ENABLED: "yes",
      }),
    ).toThrow(/AUTH_DEV_BYPASS_ENABLED/);
  });

  it("rejects server-only settings exposed with public names", () => {
    const leakedValue = "do-not-echo-this-public-secret";

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED: "true",
        NEXT_PUBLIC_FEATURE_IMPORTS_ENABLED: "true",
        NEXT_PUBLIC_FEATURE_COSTS_ENABLED: "true",
        NEXT_PUBLIC_COSTS_READ_SUBJECTS: "synthetic-subject",
        NEXT_PUBLIC_N8N_HMAC_SECRET: leakedValue,
        NEXT_PUBLIC_N8N_IMPORT_EVENT_SECRET: leakedValue,
        NEXT_PUBLIC_OPENAI_API_KEY: leakedValue,
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(leakedValue),
      }),
    );
  });

  it("does not echo invalid values in validation errors", () => {
    const invalidSecret = "plain-text-secret-that-must-not-be-echoed";
    const invalidUrl =
      "https://url-value-must-not-be-echoed.example.com/unapproved";

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_IMPORT_URL: invalidUrl,
        N8N_HMAC_SECRET: invalidSecret,
        SENSITIVE_URL_HOSTS: "https://unsafe.example.com/private",
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(invalidSecret),
      }),
    );

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        N8N_IMPORT_URL: invalidUrl,
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(invalidUrl),
      }),
    );
  });

  it("returns normalized validated server variables for valid input", () => {
    expect(environment.parseServerEnv(validEnvironment)).toEqual({
      ...validEnvironment,
      IMPORT_MAX_BYTES: 10_485_760,
      IMPORT_PRODUCER_TIMEOUT_MS: 15_000,
      OPENAI_API_KEY: undefined,
      OPENAI_APPROACH_MODEL: undefined,
      OPENAI_APPROACH_TIMEOUT_MS: 20_000,
      SENSITIVE_URL_HOSTS: [
        "evidence.example.com",
        "reports.example.com",
      ],
      FEATURE_IMPORTS_ENABLED: false,
      FEATURE_BATCH_OBSERVATION_ENABLED: false,
      FEATURE_COMMERCIAL_ENABLED: false,
      FEATURE_SENSITIVE_CONTENT_ENABLED: false,
      FEATURE_DEMO_DATA_ENABLED: false,
      FEATURE_COSTS_ENABLED: false,
      FEATURE_CONTACT_ENRICHMENT_ENABLED: false,
      FEATURE_CONTACT_DATA_ENABLED: false,
      FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: false,
      FEATURE_AI_APPROACH_ENABLED: false,
      FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: false,
      COSTS_READ_SUBJECTS: [],
      CONTACT_DATA_READ_SUBJECTS: [],
      CONTACT_DATA_GOVERN_SUBJECTS: [],
      AUTH_DEV_BYPASS_ENABLED: false,
      DEMO2_FULL_ACCESS_ENABLED: false,
      DEMO2_K8S_RUNTIME_ENABLED: false,
      DEMO3_LOCAL_RUNTIME_ENABLED: false,
      CONTACT_ENRICHMENT_TIMEOUT_MS: 15_000,
      LEAD_LOCATION_LOOKUP_TIMEOUT_MS: 4_000,
    });
  });

  it("enables AI approach generation only with a server-only key and model", () => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      FEATURE_AI_APPROACH_ENABLED: "true",
      FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: "true",
      OPENAI_API_KEY: "sk-synthetic-openai-key-not-for-production",
      OPENAI_APPROACH_MODEL: "configured-model-id",
      OPENAI_APPROACH_TIMEOUT_MS: "25000",
    });

    expect(parsed).toMatchObject({
      FEATURE_AI_APPROACH_ENABLED: true,
      FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: true,
      OPENAI_API_KEY: "sk-synthetic-openai-key-not-for-production",
      OPENAI_APPROACH_MODEL: "configured-model-id",
      OPENAI_APPROACH_TIMEOUT_MS: 25_000,
    });

    for (const incomplete of [
      { OPENAI_API_KEY: "" },
      { OPENAI_APPROACH_MODEL: "" },
      { OPENAI_APPROACH_MODEL: "model id with spaces" },
      { OPENAI_APPROACH_TIMEOUT_MS: "60001" },
    ]) {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          FEATURE_AI_APPROACH_ENABLED: "true",
          OPENAI_API_KEY: "sk-synthetic-openai-key-not-for-production",
          OPENAI_APPROACH_MODEL: "configured-model-id",
          ...incomplete,
        }),
      ).toThrow(/OPENAI_/);
    }
  });

  it("rejects automatic queue generation unless the base AI feature is enabled", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: "true",
      }),
    ).toThrow(/FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED/);
  });

  it("does not echo an invalid OpenAI key in environment errors", () => {
    const invalidKey = "too-short";

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_AI_APPROACH_ENABLED: "true",
        OPENAI_API_KEY: invalidKey,
        OPENAI_APPROACH_MODEL: "configured-model-id",
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(invalidKey),
      }),
    );
  });

  it("enables registered-address mapping only with complete HTTPS providers", () => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: "true",
    });

    expect(parsed).toMatchObject({
      FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: true,
      COMPANY_REGISTRY_API_BASE_URL:
        validEnvironment.COMPANY_REGISTRY_API_BASE_URL,
      LEAD_GEOCODING_API_URL: validEnvironment.LEAD_GEOCODING_API_URL,
      LEAD_POSTAL_CODE_API_BASE_URL:
        validEnvironment.LEAD_POSTAL_CODE_API_BASE_URL,
      LEAD_LOCATION_LOOKUP_TIMEOUT_MS: 4_000,
    });

    for (const invalid of [
      { COMPANY_REGISTRY_API_BASE_URL: "http://registry.example.test/cnpj" },
      { LEAD_GEOCODING_API_URL: "https://user:secret@geocoder.example.test/search" },
      { LEAD_GEOCODING_API_URL: "https://geocoder.example.test/search?key=secret" },
      { LEAD_POSTAL_CODE_API_BASE_URL: "http://registry.example.test/cep" },
      { LEAD_GEOCODING_USER_AGENT: "node" },
      { LEAD_LOCATION_LOOKUP_TIMEOUT_MS: "10001" },
    ]) {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: "true",
          ...invalid,
        }),
      ).toThrow(/registered-address|HTTPS|LEAD_GEOCODING|approved/);
    }
  });

  it("allows Demo 3 full access only in the real-data pre-production runtime", () => {
    expect(
      environment.parseServerEnv({
        ...validEnvironment,
        NODE_ENV: "production",
        AUTH_DEV_BYPASS_ENABLED: "true",
        FEATURE_DEMO_DATA_ENABLED: "false",
        FEATURE_COMMERCIAL_ENABLED: "true",
        DEMO3_LOCAL_RUNTIME_ENABLED: "true",
      }).DEMO3_LOCAL_RUNTIME_ENABLED,
    ).toBe(true);

    for (const invalid of [
      { NODE_ENV: "development" },
      { AUTH_DEV_BYPASS_ENABLED: "false" },
      { FEATURE_DEMO_DATA_ENABLED: "true" },
      { FEATURE_COMMERCIAL_ENABLED: "false" },
      { DEMO2_FULL_ACCESS_ENABLED: "true" },
    ]) {
      expect(() =>
        environment.parseServerEnv({
          ...validEnvironment,
          NODE_ENV: "production",
          AUTH_DEV_BYPASS_ENABLED: "true",
          FEATURE_DEMO_DATA_ENABLED: "false",
          FEATURE_COMMERCIAL_ENABLED: "true",
          DEMO3_LOCAL_RUNTIME_ENABLED: "true",
          ...invalid,
        }),
      ).toThrow(/DEMO3_LOCAL_RUNTIME_ENABLED/);
    }
  });

  it("enables contact data only with the complete HTTPS governance profile", () => {
    const parsed = environment.parseServerEnv({
      ...validEnvironment,
      FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
      FEATURE_CONTACT_DATA_ENABLED: "true",
      CONTACT_DATA_READ_SUBJECTS: "demo3-preproduction-user",
      CONTACT_DATA_GOVERN_SUBJECTS: "demo3-preproduction-user",
    });

    expect(parsed.FEATURE_CONTACT_DATA_ENABLED).toBe(true);
    expect(parsed.N8N_CONTACT_ENRICHMENT_V2_URL).toBe(
      validEnvironment.N8N_CONTACT_ENRICHMENT_V2_URL,
    );
    expect(parsed.CONTACT_DATA_READ_SUBJECTS).toEqual([
      "demo3-preproduction-user",
    ]);
  });

  it("rejects plain HTTP and missing transparency for contact data", () => {
    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
        FEATURE_CONTACT_DATA_ENABLED: "true",
        N8N_CONTACT_ENRICHMENT_V2_URL:
          "http://192.168.0.20:30098/webhook/prospecta/lusha/contact-enrichment-v2",
      }),
    ).toThrow(/N8N_CONTACT_ENRICHMENT_V2_URL/);

    expect(() =>
      environment.parseServerEnv({
        ...validEnvironment,
        FEATURE_CONTACT_ENRICHMENT_ENABLED: "true",
        FEATURE_CONTACT_DATA_ENABLED: "true",
        CONTACT_CONTROLLER_LEGAL_NAME: "",
        CONTACT_PRIVACY_CONTACT: "",
      }),
    ).toThrow(/CONTACT_CONTROLLER_LEGAL_NAME[\s\S]*CONTACT_PRIVACY_CONTACT/);
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
    expect(parsed.N8N_HMAC_KEY_ID).toBe(
      validEnvironment.N8N_HMAC_KEY_ID,
    );
    expect(parsed.N8N_HMAC_SECRET).toBe(
      validEnvironment.N8N_HMAC_SECRET,
    );
    expect(parsed.N8N_IMPORT_EVENT_SECRET).toBe(
      validEnvironment.N8N_IMPORT_EVENT_SECRET,
    );
    expect(parsed.N8N_CONTACT_ENRICHMENT_SECRET).toBe(
      validEnvironment.N8N_CONTACT_ENRICHMENT_SECRET,
    );
    expect(parsed.N8N_CONTACT_CALLBACK_SECRET).toBe(
      validEnvironment.N8N_CONTACT_CALLBACK_SECRET,
    );
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
    expect(valuesByKey.get("COSTS_READ_SUBJECTS")).toBe('""');
    expect(example).toContain(
      "# Deferred external gate; not read by the application in this phase.",
    );
    expect(example).toContain("# AUTH_ROLE_CLAIM=");
    expect(example).toContain("# AUTH_ROLE_MAPPING=");
    expect(valuesByKey.has("AUTH_ROLE_CLAIM")).toBe(false);
    expect(valuesByKey.has("AUTH_ROLE_MAPPING")).toBe(false);
    expect(valuesByKey.get("N8N_IMPORT_URL")).toBe(
      '"https://replace-n8n.example.com/webhook/empresaqui/import"',
    );
    expect(valuesByKey.get("N8N_HMAC_SECRET")).toContain("replace-");
    expect(valuesByKey.get("N8N_IMPORT_EVENT_SECRET")).toContain(
      "replace-",
    );
    expect(valuesByKey.get("N8N_CONTACT_ENRICHMENT_URL")).toBe(
      '"https://replace-n8n.example.com/webhook/prospecta/lusha/decision-makers"',
    );
    expect(valuesByKey.get("N8N_CONTACT_ENRICHMENT_SECRET")).toContain(
      "replace-",
    );
    expect(valuesByKey.get("N8N_CONTACT_CALLBACK_SECRET")).toContain(
      "replace-",
    );
    expect(example).toContain(
      "# Deferred: optional and unused until T019 approves and tests authentication.",
    );
    expect(example).not.toContain("/webhook/prospecta/imports/v1");
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
