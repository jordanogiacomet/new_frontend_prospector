import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ownerDatabaseUrl = requireDisposableDatabaseUrl();
const pool = new Pool({
  connectionString: ownerDatabaseUrl,
  application_name: "prospecta-lead-approach-cache-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

type Repository = typeof import("./lead-approach-draft-repository");
let repository: Repository | null = null;

const identity = {
  organizationId: "org-synthetic-approach",
  cnpjNormalizado: "11222333000181",
  observedLeadRunId: `lr_${"a".repeat(64)}`,
  generatorVersion: "apollo-low-pressure-v1",
} as const;
const now = new Date("2026-08-17T12:00:00.000Z");

function requireDisposableDatabaseUrl(): string {
  const rawValue = process.env.PROSPECTA_APP_TEST_DATABASE_URL;
  if (!rawValue) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL is required for lead-approach cache integration tests.",
    );
  }

  const url = new URL(rawValue);
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname !== "localhost" ||
    (url.port !== "5432" && url.port !== "55432") ||
    decodeURIComponent(url.pathname.slice(1)) !== "prospecta_t009_test" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL must point to the approved disposable app target.",
    );
  }

  return rawValue;
}

function readSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/app", filename), "utf8");
}

function configureEnvironment(): void {
  process.env.DATABASE_URL = ownerDatabaseUrl;
  process.env.APP_DATABASE_URL = ownerDatabaseUrl;
  process.env.PRODUCER_DATABASE_URL = ownerDatabaseUrl;
  process.env.AUTH_SECRET = "synthetic-auth-secret-synthetic-auth-secret";
  process.env.AUTH_OIDC_ISSUER = "https://issuer.synthetic.example";
  process.env.AUTH_OIDC_CLIENT_ID = "prospecta-synthetic-client";
  process.env.AUTH_OIDC_CLIENT_SECRET =
    "synthetic-client-secret-synthetic-client-secret";
  process.env.AUTH_ALLOWED_ORG_ID = identity.organizationId;
  process.env.N8N_IMPORT_URL =
    "https://n8n.synthetic.example/webhook/empresaqui/import";
  process.env.FEATURE_IMPORTS_ENABLED = "false";
  process.env.FEATURE_BATCH_OBSERVATION_ENABLED = "false";
  process.env.FEATURE_COMMERCIAL_ENABLED = "false";
  process.env.FEATURE_SENSITIVE_CONTENT_ENABLED = "false";
}

async function loadRepository(): Promise<Repository> {
  if (repository === null) {
    configureEnvironment();
    repository = await import("./lead-approach-draft-repository");
  }
  return repository;
}

beforeEach(async () => {
  await pool.query(
    "DROP TABLE IF EXISTS prospecting_app.lead_approach_drafts",
  );
  await pool.query(readSql("001_app_schema_forward.sql"));
  await pool.query(readSql("015_lead_approach_draft_cache_forward.sql"));
});

afterAll(async () => {
  try {
    await pool.query(
      "DROP TABLE IF EXISTS prospecting_app.lead_approach_drafts",
    );
  } finally {
    await pool.end();
  }
});

describe("lead approach draft repository integration", () => {
  it("allows only one active claim and reuses the completed message", async () => {
    const cache = await loadRepository();
    const firstAttempt = "00000000-0000-4000-8000-000000000951";
    const secondAttempt = "00000000-0000-4000-8000-000000000952";
    const base = {
      ...identity,
      requestedBySubject: "oidc|synthetic-manager",
      now,
      leaseExpiresAt: new Date("2026-08-17T12:01:00.000Z"),
    };

    await expect(
      cache.claimLeadApproachDraft({
        ...base,
        approachDraftId: "00000000-0000-4000-8000-000000000950",
        generationAttemptId: firstAttempt,
      }),
    ).resolves.toEqual({
      kind: "claimed",
      generationAttemptId: firstAttempt,
    });
    await expect(
      cache.claimLeadApproachDraft({
        ...base,
        approachDraftId: "00000000-0000-4000-8000-000000000953",
        generationAttemptId: secondAttempt,
      }),
    ).resolves.toEqual({ kind: "preparing" });

    await expect(
      cache.completeLeadApproachDraft({
        ...identity,
        generationAttemptId: secondAttempt,
        message: "Tentativa sem posse.",
        now,
      }),
    ).resolves.toBe(false);
    await expect(
      cache.completeLeadApproachDraft({
        ...identity,
        generationAttemptId: firstAttempt,
        message: "Mensagem sintética pronta para revisão.",
        now,
      }),
    ).resolves.toBe(true);

    await expect(
      cache.claimLeadApproachDraft({
        ...base,
        approachDraftId: "00000000-0000-4000-8000-000000000954",
        generationAttemptId: secondAttempt,
      }),
    ).resolves.toEqual({
      kind: "ready",
      message: "Mensagem sintética pronta para revisão.",
    });
  });

  it("makes expired failure cooldowns claimable and isolates organizations", async () => {
    const cache = await loadRepository();
    const attempt = "00000000-0000-4000-8000-000000000955";
    await cache.claimLeadApproachDraft({
      ...identity,
      approachDraftId: "00000000-0000-4000-8000-000000000956",
      generationAttemptId: attempt,
      requestedBySubject: "oidc|synthetic-manager",
      now,
      leaseExpiresAt: new Date("2026-08-17T12:01:00.000Z"),
    });
    await expect(
      cache.failLeadApproachDraft({
        ...identity,
        generationAttemptId: attempt,
        now,
        retryAfter: new Date("2026-08-17T12:05:00.000Z"),
      }),
    ).resolves.toBe(true);

    await expect(
      cache.listLeadApproachDraftStates({
        organizationId: identity.organizationId,
        generatorVersion: identity.generatorVersion,
        identities: [identity],
        now: new Date("2026-08-17T12:06:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        cnpjNormalizado: identity.cnpjNormalizado,
        observedLeadRunId: identity.observedLeadRunId,
        status: "missing",
        message: null,
      },
    ]);
    await expect(
      cache.listLeadApproachDraftStates({
        organizationId: "org-synthetic-other",
        generatorVersion: identity.generatorVersion,
        identities: [identity],
        now,
      }),
    ).resolves.toEqual([]);
  });
});
