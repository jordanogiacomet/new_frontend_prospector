import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const forwardSql = readSql("001_app_schema_forward.sql");
const rollbackSql = readSql("002_app_schema_rollback.sql");
const grantsSql = readSql("003_app_schema_grants.sql");
const auditRedactionSql = readSql("004_commercial_audit_redaction_forward.sql");
const auditRequestContextSql = readSql(
  "005_commercial_audit_request_context_forward.sql",
);
const cadenceForwardSql = readSql("016_qualification_cadence_forward.sql");
const cadenceRollbackSql = readSql("016_qualification_cadence_rollback.sql");
const disposableDatabaseUrl = requireDisposableDatabaseUrl();
const databaseTarget = new URL(disposableDatabaseUrl);
const pool = new Pool({
  connectionString: disposableDatabaseUrl,
  application_name: "prospecta-qualification-cadence-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

type Repository = typeof import("./qualification-cadence-repository");

let repository: Repository | null = null;

const organizationId = "org-synthetic-cadence-a";
const otherOrganizationId = "org-synthetic-cadence-b";
const workspaceId = "00000000-0000-4000-8000-000000000761";
const leadRunId = `lr_${"d".repeat(64)}`;
const actorSubject = "oidc|synthetic-cadence-manager";
const actorIssuer = "https://identity.synthetic.test/tenant";
const requestCorrelationId = "00000000-0000-4000-8000-000000000762";

function readSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/app", filename), "utf8");
}

function requireDisposableDatabaseUrl(): string {
  const rawValue = process.env.PROSPECTA_APP_TEST_DATABASE_URL;
  if (!rawValue) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL is required for qualification cadence integration tests.",
    );
  }

  const url = new URL(rawValue);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const approved =
    (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
    url.hostname === "localhost" &&
    (url.port === "5432" || url.port === "55432") &&
    databaseName === "prospecta_t009_test" &&
    url.search === "" &&
    url.hash === "";
  if (!approved) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL must point to the approved local disposable target.",
    );
  }

  return rawValue;
}

function ownerDatabaseUrl(): string {
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  if (!user || !password) {
    throw new Error("PGUSER and PGPASSWORD are required for integration tests.");
  }

  const url = new URL(disposableDatabaseUrl);
  url.username = user;
  url.password = password;
  return url.toString();
}

function configureRepositoryEnvironment(): void {
  const appDatabaseUrl = ownerDatabaseUrl();
  const databaseName = decodeURIComponent(databaseTarget.pathname.slice(1));
  const producerUrl = `postgresql://producer_reader:producer-password@${databaseTarget.hostname}:${databaseTarget.port}/${databaseName}`;

  process.env.DATABASE_URL = appDatabaseUrl;
  process.env.APP_DATABASE_URL = appDatabaseUrl;
  process.env.PRODUCER_DATABASE_URL = producerUrl;
  process.env.AUTH_SECRET = "synthetic-auth-secret-synthetic-auth-secret";
  process.env.AUTH_OIDC_ISSUER = "https://issuer.synthetic.example";
  process.env.AUTH_OIDC_CLIENT_ID = "prospecta-synthetic-client";
  process.env.AUTH_OIDC_CLIENT_SECRET =
    "synthetic-client-secret-synthetic-client-secret";
  process.env.AUTH_ALLOWED_ORG_ID = organizationId;
  process.env.N8N_IMPORT_URL =
    "https://n8n.synthetic.example/webhook/empresaqui/import";
  process.env.IMPORT_MAX_BYTES = "10485760";
  process.env.IMPORT_PRODUCER_TIMEOUT_MS = "15000";
  process.env.SENSITIVE_URL_HOSTS = "example.com";
  process.env.FEATURE_IMPORTS_ENABLED = "false";
  process.env.FEATURE_BATCH_OBSERVATION_ENABLED = "false";
  process.env.FEATURE_COMMERCIAL_ENABLED = "true";
  process.env.FEATURE_SENSITIVE_CONTENT_ENABLED = "false";
}

async function loadRepository(): Promise<Repository> {
  if (repository === null) {
    configureRepositoryEnvironment();
    repository = await import("./qualification-cadence-repository");
  }
  return repository;
}

function actor(targetOrganizationId = organizationId) {
  return {
    organizationId: targetOrganizationId,
    actorSubject,
    actorIssuer,
    requestCorrelationId,
    authorizationBasis: "verified_oidc" as const,
  };
}

async function execute(sql: string): Promise<void> {
  await pool.query(sql);
}

async function rows<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await pool.query<Row>(text, [...values]);
  return result.rows;
}

async function resetDatabase(): Promise<void> {
  await removeAuditFailureTrigger();
  await execute(cadenceRollbackSql);
  await execute(rollbackSql);
  await execute(forwardSql);
  await execute(auditRedactionSql);
  await execute(auditRequestContextSql);
  await execute(cadenceForwardSql);
  await execute(grantsSql);
}

async function insertWorkspace(): Promise<void> {
  await pool.query(
    `
      INSERT INTO prospecting_app.lead_workspaces (
        workspace_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        commercial_stage,
        created_by_subject,
        updated_by_subject
      )
      VALUES ($1, $2, '12345678000195', $3, 'ASSIGNED', $4, $4)
    `,
    [workspaceId, organizationId, leadRunId, actorSubject],
  );
}

async function contactRows() {
  return rows<{
    readonly contact_number: number;
    readonly scheduled_at: Date;
    readonly state: string;
    readonly outcome: string | null;
    readonly completed_activity_id: string | null;
  }>(
    `
      SELECT
        contact_number,
        scheduled_at,
        state,
        outcome,
        completed_activity_id::text
      FROM prospecting_app.lead_qualification_contacts
      WHERE organization_id = $1 AND workspace_id = $2
      ORDER BY contact_number
    `,
    [organizationId, workspaceId],
  );
}

async function counts() {
  const [result] = await rows<{
    readonly activities: string;
    readonly audits: string;
  }>(
    `
      SELECT
        (SELECT count(*)::text FROM prospecting_app.lead_activities
          WHERE workspace_id = $1) AS activities,
        (SELECT count(*)::text FROM prospecting_app.commercial_audit_events
          WHERE workspace_id = $1) AS audits
    `,
    [workspaceId],
  );
  return result;
}

async function workspaceState() {
  const [result] = await rows<{
    readonly commercial_stage: string;
    readonly next_action: string | null;
    readonly next_action_due_at: Date | null;
    readonly commercial_outcome: string | null;
    readonly version: number;
  }>(
    `
      SELECT
        commercial_stage,
        next_action,
        next_action_due_at,
        commercial_outcome,
        version
      FROM prospecting_app.lead_workspaces
      WHERE organization_id = $1 AND workspace_id = $2
    `,
    [organizationId, workspaceId],
  );
  return result;
}

async function installAuditFailureTrigger(): Promise<void> {
  await execute(`
    CREATE OR REPLACE FUNCTION prospecting_app.cadence_force_audit_failure()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'synthetic cadence audit failure' USING ERRCODE = 'P0001';
    END;
    $$;

    CREATE TRIGGER cadence_force_audit_failure
      BEFORE INSERT ON prospecting_app.commercial_audit_events
      FOR EACH ROW
      EXECUTE FUNCTION prospecting_app.cadence_force_audit_failure();
  `);
}

async function removeAuditFailureTrigger(): Promise<void> {
  await execute(`
    DO $$
    BEGIN
      IF to_regclass('prospecting_app.commercial_audit_events') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS cadence_force_audit_failure
          ON prospecting_app.commercial_audit_events;
      END IF;
      IF to_regprocedure('prospecting_app.cadence_force_audit_failure()') IS NOT NULL THEN
        DROP FUNCTION prospecting_app.cadence_force_audit_failure();
      END IF;
    END;
    $$;
  `);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  try {
    await removeAuditFailureTrigger();
    await execute(cadenceRollbackSql);
    await execute(rollbackSql);
  } finally {
    await pool.end();
  }
});

describe("qualification cadence repository integration", () => {
  it("creates exactly four scheduled contacts with app-owned activity and audit", async () => {
    const target = await loadRepository();
    await insertWorkspace();

    const result = await target.startQualificationCadence({
      actor: actor(),
      workspaceId,
      request: {
        action: "start",
        start_at: "2026-08-11T12:00:00Z",
        interval_days: 3,
      },
    });

    expect(result).toMatchObject({
      kind: "started",
      cadence: { status: "ACTIVE", current_contact_number: 1 },
    });
    expect(
      (await contactRows()).map((contact) => ({
        number: contact.contact_number,
        scheduled: contact.scheduled_at.toISOString(),
        state: contact.state,
      })),
    ).toEqual([
      { number: 1, scheduled: "2026-08-11T12:00:00.000Z", state: "PENDING" },
      { number: 2, scheduled: "2026-08-14T12:00:00.000Z", state: "PENDING" },
      { number: 3, scheduled: "2026-08-17T12:00:00.000Z", state: "PENDING" },
      { number: 4, scheduled: "2026-08-20T12:00:00.000Z", state: "PENDING" },
    ]);
    expect(await counts()).toEqual({ activities: "1", audits: "1" });
  });

  it("advances, reschedules and terminates according to recorded lead behavior", async () => {
    const target = await loadRepository();
    await insertWorkspace();
    await target.startQualificationCadence({
      actor: actor(),
      workspaceId,
      request: {
        action: "start",
        start_at: "2026-08-11T12:00:00Z",
        interval_days: 3,
      },
    });

    const first = await target.recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 1,
        occurred_at: "2026-08-11T15:00:00Z",
        channel: "WHATSAPP",
        outcome: "NO_RESPONSE",
      },
    });
    expect(first).toMatchObject({
      kind: "recorded",
      cadence: { current_contact_number: 2 },
      pipelineAction: {
        kind: "automatic",
        reasonCode: "QUALIFICATION_NO_RESPONSE_FOLLOW_UP",
      },
    });

    const second = await target.recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 2,
        occurred_at: "2026-08-14T15:00:00Z",
        channel: "CALL",
        outcome: "FOLLOW_UP_LATER",
        next_contact_at: "2026-08-28T12:00:00Z",
      },
    });
    expect(second).toMatchObject({
      kind: "recorded",
      cadence: { current_contact_number: 3 },
      pipelineAction: {
        kind: "automatic",
        reasonCode: "QUALIFICATION_FOLLOW_UP_LATER",
      },
    });

    const third = await target.recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 3,
        occurred_at: "2026-08-28T15:00:00Z",
        channel: "EMAIL",
        outcome: "QUALIFIED",
        summary: "Lead sintético qualificado.",
      },
    });
    expect(third).toMatchObject({
      kind: "recorded",
      cadence: { status: "QUALIFIED", current_contact_number: null },
      pipelineAction: {
        kind: "automatic",
        reasonCode: "QUALIFICATION_CONFIRMED",
      },
    });

    const stored = await contactRows();
    expect(stored[2]).toMatchObject({
      scheduled_at: new Date("2026-08-28T12:00:00Z"),
      state: "COMPLETED",
      outcome: "QUALIFIED",
    });
    expect(stored[3]).toMatchObject({ state: "CANCELLED", outcome: null });
    expect(await workspaceState()).toMatchObject({
      commercial_stage: "MEETING",
      next_action: "Agendar reunião de diagnóstico",
      next_action_due_at: null,
      commercial_outcome: null,
      version: 4,
    });
    expect(await counts()).toEqual({ activities: "4", audits: "7" });
  });

  it("denies cross-organization reads and rolls back when audit insertion fails", async () => {
    const target = await loadRepository();
    await insertWorkspace();

    const crossOrganization = await target.getQualificationCadence({
      actor: { organizationId: otherOrganizationId },
      workspaceId,
    });
    expect(crossOrganization).toMatchObject({ kind: "not_found" });

    await installAuditFailureTrigger();
    await expect(
      target.startQualificationCadence({
        actor: actor(),
        workspaceId,
        request: {
          action: "start",
          start_at: "2026-08-11T12:00:00Z",
          interval_days: 3,
        },
      }),
    ).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });
    expect(await contactRows()).toEqual([]);
    expect(await counts()).toEqual({ activities: "0", audits: "0" });
  });
});
