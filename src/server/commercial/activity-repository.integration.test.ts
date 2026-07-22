import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const forwardSql = readSql("001_app_schema_forward.sql");
const rollbackSql = readSql("002_app_schema_rollback.sql");
const grantsSql = readSql("003_app_schema_grants.sql");
const auditRedactionSql = readSql(
  "004_commercial_audit_redaction_forward.sql",
);
const auditRequestContextSql = readSql(
  "005_commercial_audit_request_context_forward.sql",
);
const disposableTargets = [
  {
    hostname: "localhost",
    port: "5432",
    databaseName: "prospecta_t009_test",
  },
  {
    hostname: "localhost",
    port: "55432",
    databaseName: "prospecta_t009_test",
  },
] as const;
const disposableDatabaseUrl = requireDisposableDatabaseUrl();
const disposableDatabaseTarget = parseDisposableDatabaseTarget(
  disposableDatabaseUrl,
);
const pool = new Pool({
  connectionString: disposableDatabaseUrl,
  application_name: "prospecta-t030-activity-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

type ActivityRepository = typeof import("./activity-repository");

let activityRepository: ActivityRepository | null = null;

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const actorIssuer = "https://identity.synthetic.test/tenant";
const requestCorrelationId = "00000000-0000-4000-8000-000000000830";
const otherSubject = "oidc|synthetic-seller";
const cnpj = "12345678000195";
const otherCnpj = "98765432000155";
const leadRunId = `lr_${"a".repeat(64)}`;
const otherLeadRunId = `lr_${"b".repeat(64)}`;
const workspaceId = "00000000-0000-4000-8000-000000000230";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000231";
const activityIdA = "00000000-0000-4000-8000-000000000330";
const activityIdB = "00000000-0000-4000-8000-000000000331";
const activityIdC = "00000000-0000-4000-8000-000000000332";

function auditActor(targetOrganizationId = organizationId) {
  return {
    organizationId: targetOrganizationId,
    actorSubject,
    actorIssuer,
    requestCorrelationId,
    authorizationBasis: "verified_oidc" as const,
  };
}

function readSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/app", filename), "utf8");
}

function requireDisposableDatabaseUrl(): string {
  return validateDisposableDatabaseUrl(
    process.env.PROSPECTA_APP_TEST_DATABASE_URL,
  );
}

function validateDisposableDatabaseUrl(rawValue: string | undefined): string {
  if (!rawValue) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL is required for T030 integration tests.",
    );
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL must be an approved local disposable PostgreSQL URL.",
    );
  }

  const usesPostgres =
    url.protocol === "postgres:" || url.protocol === "postgresql:";
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const isApprovedTarget = disposableTargets.some(
    (target) =>
      url.hostname === target.hostname &&
      url.port === target.port &&
      databaseName === target.databaseName,
  );

  if (
    !usesPostgres ||
    !isApprovedTarget ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL must point to an approved local disposable target.",
    );
  }

  return rawValue;
}

function parseDisposableDatabaseTarget(rawValue: string): {
  readonly hostname: string;
  readonly port: string;
  readonly databaseName: string;
} {
  const url = new URL(rawValue);

  return {
    hostname: url.hostname,
    port: url.port,
    databaseName: decodeURIComponent(url.pathname.slice(1)),
  };
}

function ownerDatabaseUrlWithCredentials(): string {
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (!user || !password) {
    throw new Error(
      "PGUSER and PGPASSWORD are required for T030 repository integration tests.",
    );
  }

  const url = new URL(disposableDatabaseUrl);
  url.username = user;
  url.password = password;

  return url.toString();
}

function configureRepositoryEnvironment(): void {
  const appDatabaseUrl = ownerDatabaseUrlWithCredentials();

  process.env.DATABASE_URL = appDatabaseUrl;
  process.env.APP_DATABASE_URL = appDatabaseUrl;
  process.env.PRODUCER_DATABASE_URL =
    `postgresql://producer_reader:producer-password@${disposableDatabaseTarget.hostname}:${disposableDatabaseTarget.port}/${disposableDatabaseTarget.databaseName}`;
  process.env.AUTH_SECRET =
    "synthetic-auth-secret-synthetic-auth-secret";
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
  process.env.FEATURE_COMMERCIAL_ENABLED = "false";
  process.env.FEATURE_SENSITIVE_CONTENT_ENABLED = "false";
}

async function loadActivityRepository(): Promise<ActivityRepository> {
  if (activityRepository === null) {
    configureRepositoryEnvironment();
    activityRepository = await import("./activity-repository");
  }

  return activityRepository;
}

async function execute(sql: string): Promise<void> {
  await pool.query(sql);
}

async function queryRows<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await pool.query<Row>(text, [...values]);

  return result.rows;
}

async function resetDisposableDatabase(): Promise<void> {
  await removeAuditFailureTrigger();
  await execute(rollbackSql);
  await execute(forwardSql);
  await execute(auditRedactionSql);
  await execute(auditRequestContextSql);
  await execute(grantsSql);
}

async function cleanupDisposableDatabase(): Promise<void> {
  await removeAuditFailureTrigger();
  await execute(rollbackSql);
}

async function insertWorkspace(input: {
  readonly workspace_id?: string;
  readonly organization_id?: string;
  readonly cnpj_normalizado?: string;
  readonly observed_lead_run_id?: string;
  readonly responsible_subject?: string | null;
  readonly commercial_stage?: string;
} = {}): Promise<void> {
  await pool.query(
    `
      INSERT INTO prospecting_app.lead_workspaces (
        workspace_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        responsible_subject,
        commercial_stage,
        created_by_subject,
        updated_by_subject
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    `,
    [
      input.workspace_id ?? workspaceId,
      input.organization_id ?? organizationId,
      input.cnpj_normalizado ?? cnpj,
      input.observed_lead_run_id ?? leadRunId,
      Object.hasOwn(input, "responsible_subject")
        ? (input.responsible_subject ?? null)
        : actorSubject,
      input.commercial_stage ?? "ASSIGNED",
      actorSubject,
    ],
  );
}

async function insertActivity(input: {
  readonly activity_id: string;
  readonly workspace_id?: string;
  readonly organization_id?: string;
  readonly observed_lead_run_id?: string;
  readonly actor_subject?: string;
  readonly occurred_at: string;
  readonly activity_type?: string;
  readonly activity_outcome?: string | null;
  readonly summary?: string | null;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO prospecting_app.lead_activities (
        activity_id,
        organization_id,
        workspace_id,
        observed_lead_run_id,
        actor_subject,
        occurred_at,
        activity_type,
        activity_outcome,
        summary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      input.activity_id,
      input.organization_id ?? organizationId,
      input.workspace_id ?? workspaceId,
      input.observed_lead_run_id ?? leadRunId,
      input.actor_subject ?? actorSubject,
      input.occurred_at,
      input.activity_type ?? "CALL",
      Object.hasOwn(input, "activity_outcome")
        ? (input.activity_outcome ?? null)
        : null,
      Object.hasOwn(input, "summary") ? (input.summary ?? null) : null,
    ],
  );
}

async function activityRows(targetWorkspaceId = workspaceId): Promise<
  readonly {
    readonly activity_id: string;
    readonly organization_id: string;
    readonly workspace_id: string;
    readonly observed_lead_run_id: string;
    readonly actor_subject: string;
    readonly activity_type: string;
    readonly activity_outcome: string | null;
    readonly summary: string | null;
  }[]
> {
  return queryRows(
    `
      SELECT
        activity_id::text AS activity_id,
        organization_id,
        workspace_id::text AS workspace_id,
        observed_lead_run_id,
        actor_subject,
        activity_type,
        activity_outcome,
        summary
      FROM prospecting_app.lead_activities
      WHERE workspace_id = $1
      ORDER BY occurred_at DESC, activity_id
    `,
    [targetWorkspaceId],
  );
}

async function auditRows(targetWorkspaceId = workspaceId): Promise<
  readonly {
    readonly action: string;
    readonly target_type: string;
    readonly target_id: string;
    readonly observed_lead_run_id: string | null;
    readonly actor_subject: string;
    readonly actor_issuer: string;
    readonly request_correlation_id: string;
    readonly authorization_basis: string;
    readonly metadata: Record<string, unknown>;
    readonly previous_metadata: Record<string, unknown>;
    readonly new_metadata: Record<string, unknown>;
  }[]
> {
  return queryRows(
    `
      SELECT
        action,
        target_type,
        target_id::text AS target_id,
        observed_lead_run_id,
        actor_subject,
        actor_issuer,
        request_correlation_id::text AS request_correlation_id,
        authorization_basis,
        metadata,
        previous_metadata,
        new_metadata
      FROM prospecting_app.commercial_audit_events
      WHERE workspace_id = $1
      ORDER BY occurred_at, audit_event_id
    `,
    [targetWorkspaceId],
  );
}

async function installAuditFailureTrigger(): Promise<void> {
  await execute(`
    CREATE OR REPLACE FUNCTION prospecting_app.t030_force_audit_failure()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'synthetic T030 audit failure' USING ERRCODE = 'P0001';
    END;
    $$;

    CREATE TRIGGER t030_force_audit_failure
      BEFORE INSERT ON prospecting_app.commercial_audit_events
      FOR EACH ROW
      EXECUTE FUNCTION prospecting_app.t030_force_audit_failure();
  `);
}

async function removeAuditFailureTrigger(): Promise<void> {
  await execute(`
    DO $$
    BEGIN
      IF to_regclass('prospecting_app.commercial_audit_events') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS t030_force_audit_failure
          ON prospecting_app.commercial_audit_events;
      END IF;

      IF to_regprocedure('prospecting_app.t030_force_audit_failure()') IS NOT NULL THEN
        DROP FUNCTION prospecting_app.t030_force_audit_failure();
      END IF;
    END;
    $$;
  `);
}

beforeEach(async () => {
  await resetDisposableDatabase();
});

afterAll(async () => {
  try {
    await cleanupDisposableDatabase();
  } finally {
    await pool.end();
  }
});

describe("activity repository integration", () => {
  it("appends an activity and audit event with context-controlled attribution", async () => {
    const repository = await loadActivityRepository();
    await insertWorkspace({ observed_lead_run_id: leadRunId });

    const result = await repository.appendLeadActivity({
      actor: auditActor(),
      workspaceId,
      request: {
        occurred_at: "2026-07-09T12:00:00Z",
        activity_type: "CALL",
        activity_outcome: "Positive outcome",
        summary: "Synthetic activity summary",
      },
    });

    expect(result).toMatchObject({
      kind: "appended",
      activity: {
        organization_id: organizationId,
        workspace_id: workspaceId,
        observed_lead_run_id: leadRunId,
        actor_subject: actorSubject,
        activity_type: "CALL",
        activity_outcome: "Positive outcome",
        summary: "Synthetic activity summary",
      },
    });
    const createdActivityId =
      result.kind === "appended" ? result.activity.activity_id : activityIdA;

    expect(await activityRows()).toMatchObject([
      {
        activity_id: createdActivityId,
        organization_id: organizationId,
        workspace_id: workspaceId,
        observed_lead_run_id: leadRunId,
        actor_subject: actorSubject,
        activity_type: "CALL",
        activity_outcome: "Positive outcome",
        summary: "Synthetic activity summary",
      },
    ]);
    expect(await auditRows()).toMatchObject([
      {
        action: "ACTIVITY_APPENDED",
        target_type: "lead_activity",
        target_id: createdActivityId,
        observed_lead_run_id: leadRunId,
        actor_subject: actorSubject,
        actor_issuer: actorIssuer,
        request_correlation_id: requestCorrelationId,
        authorization_basis: "verified_oidc",
        previous_metadata: {},
        new_metadata: {},
        metadata: {
          source: "app",
          workspace_id: workspaceId,
          activity_id: createdActivityId,
          activity_type: "CALL",
          activity_outcome: "Positive outcome",
        },
      },
    ]);
    expect(JSON.stringify(await auditRows())).not.toMatch(
      /summary|Synthetic activity summary|request_body|csv|contact|report|payload|secret|sql_params/i,
    );
  });

  it("fails closed for missing and cross-organization workspaces", async () => {
    const repository = await loadActivityRepository();
    await insertWorkspace();

    const missingResult = await repository.appendLeadActivity({
      actor: auditActor(),
      workspaceId: otherWorkspaceId,
      request: {
        occurred_at: "2026-07-09T12:00:00Z",
        activity_type: "EMAIL",
      },
    });
    const crossOrgResult = await repository.appendLeadActivity({
      actor: auditActor(otherOrganizationId),
      workspaceId,
      request: {
        occurred_at: "2026-07-09T12:00:00Z",
        activity_type: "EMAIL",
      },
    });

    expect(missingResult).toMatchObject({ kind: "not_found" });
    expect(crossOrgResult).toMatchObject({ kind: "not_found" });
    expect(await activityRows()).toEqual([]);
    expect(await auditRows()).toEqual([]);
  });

  it("stores nullable optional fields without inventing outcomes", async () => {
    const repository = await loadActivityRepository();
    await insertWorkspace();

    const result = await repository.appendLeadActivity({
      actor: auditActor(),
      workspaceId,
      request: {
        occurred_at: "2026-07-09T12:00:00Z",
        activity_type: "TASK",
        activity_outcome: null,
        summary: null,
      },
    });

    expect(result).toMatchObject({
      kind: "appended",
      activity: {
        activity_type: "TASK",
        activity_outcome: null,
        summary: null,
      },
    });
    expect(await activityRows()).toMatchObject([
      {
        activity_type: "TASK",
        activity_outcome: null,
        summary: null,
      },
    ]);
    expect(await auditRows()).toMatchObject([
      {
        metadata: {
          activity_outcome: null,
        },
      },
    ]);
  });

  it("rolls back the activity append when audit insertion fails", async () => {
    const repository = await loadActivityRepository();
    await insertWorkspace();
    await installAuditFailureTrigger();

    await expect(
      repository.appendLeadActivity({
        actor: auditActor(),
        workspaceId,
        request: {
          occurred_at: "2026-07-09T12:00:00Z",
          activity_type: "MEETING",
          summary: "Synthetic meeting",
        },
      }),
    ).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });

    expect(await activityRows()).toEqual([]);
    expect(await auditRows()).toEqual([]);
  });

  it("lists an empty page for an existing workspace", async () => {
    const repository = await loadActivityRepository();
    await insertWorkspace();

    const result = await repository.listLeadActivities({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toEqual({
      kind: "listed",
      activities: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it("lists only activities for the scoped organization and workspace", async () => {
    const repository = await loadActivityRepository();
    await insertWorkspace({ observed_lead_run_id: leadRunId });
    await insertWorkspace({
      workspace_id: otherWorkspaceId,
      organization_id: otherOrganizationId,
      cnpj_normalizado: otherCnpj,
      observed_lead_run_id: otherLeadRunId,
      responsible_subject: otherSubject,
    });
    await insertActivity({
      activity_id: activityIdA,
      workspace_id: workspaceId,
      organization_id: organizationId,
      observed_lead_run_id: leadRunId,
      occurred_at: "2026-07-09T12:00:00Z",
      activity_type: "CALL",
    });
    await insertActivity({
      activity_id: activityIdB,
      workspace_id: otherWorkspaceId,
      organization_id: otherOrganizationId,
      observed_lead_run_id: otherLeadRunId,
      actor_subject: otherSubject,
      occurred_at: "2026-07-10T12:00:00Z",
      activity_type: "EMAIL",
    });

    const result = await repository.listLeadActivities({
      actor: { organizationId },
      workspaceId,
    });
    const crossOrgResult = await repository.listLeadActivities({
      actor: { organizationId: otherOrganizationId },
      workspaceId,
    });

    expect(result).toMatchObject({
      kind: "listed",
      total: 1,
      activities: [
        {
          activity_id: activityIdA,
          organization_id: organizationId,
          workspace_id: workspaceId,
        },
      ],
    });
    expect(crossOrgResult).toMatchObject({ kind: "not_found" });
  });

  it("applies pagination and orders by occurred_at descending then activity_id", async () => {
    const repository = await loadActivityRepository();
    await insertWorkspace();
    await insertActivity({
      activity_id: activityIdB,
      occurred_at: "2026-07-10T12:00:00Z",
      activity_type: "EMAIL",
    });
    await insertActivity({
      activity_id: activityIdA,
      occurred_at: "2026-07-10T12:00:00Z",
      activity_type: "CALL",
    });
    await insertActivity({
      activity_id: activityIdC,
      occurred_at: "2026-07-09T12:00:00Z",
      activity_type: "TASK",
    });

    const firstPage = await repository.listLeadActivities({
      actor: { organizationId },
      workspaceId,
      page: 1,
      pageSize: 2,
    });
    const secondPage = await repository.listLeadActivities({
      actor: { organizationId },
      workspaceId,
      page: 2,
      pageSize: 2,
    });

    expect(firstPage).toMatchObject({
      kind: "listed",
      page: 1,
      pageSize: 2,
      total: 3,
      activities: [
        { activity_id: activityIdA },
        { activity_id: activityIdB },
      ],
    });
    expect(secondPage).toMatchObject({
      kind: "listed",
      page: 2,
      pageSize: 2,
      total: 3,
      activities: [{ activity_id: activityIdC }],
    });
  });
});
