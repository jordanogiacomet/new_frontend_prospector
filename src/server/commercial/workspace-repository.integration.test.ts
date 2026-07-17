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
  application_name: "prospecta-t029-workspace-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

type WorkspaceRepository = typeof import("./workspace-repository");

let workspaceRepository: WorkspaceRepository | null = null;

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const actorIssuer = "https://identity.synthetic.test/tenant";
const requestCorrelationId = "00000000-0000-4000-8000-000000000829";
const otherSubject = "oidc|synthetic-seller";
const cnpj = "12345678000195";
const leadRunId = `lr_${"a".repeat(64)}`;
const workspaceId = "00000000-0000-4000-8000-000000000129";

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
      "PROSPECTA_APP_TEST_DATABASE_URL is required for T029 integration tests.",
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
      "PGUSER and PGPASSWORD are required for T029 repository integration tests.",
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

async function loadWorkspaceRepository(): Promise<WorkspaceRepository> {
  if (workspaceRepository === null) {
    configureRepositoryEnvironment();
    workspaceRepository = await import("./workspace-repository");
  }

  return workspaceRepository;
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
  readonly next_action?: string | null;
  readonly version?: number;
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
        next_action,
        version,
        created_by_subject,
        updated_by_subject
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
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
      Object.hasOwn(input, "next_action")
        ? (input.next_action ?? null)
        : "Ligar para financeiro",
      input.version ?? 1,
      actorSubject,
    ],
  );
}

async function workspaceRows(targetWorkspaceId = workspaceId): Promise<
  readonly {
    readonly organization_id: string;
    readonly responsible_subject: string | null;
    readonly commercial_stage: string;
    readonly next_action: string | null;
    readonly commercial_outcome: string | null;
    readonly version: number;
    readonly updated_by_subject: string;
  }[]
> {
  return queryRows(
    `
      SELECT
        organization_id,
        responsible_subject,
        commercial_stage,
        next_action,
        commercial_outcome,
        version,
        updated_by_subject
      FROM prospecting_app.lead_workspaces
      WHERE workspace_id = $1
      ORDER BY organization_id
    `,
    [targetWorkspaceId],
  );
}

async function auditRows(targetWorkspaceId = workspaceId): Promise<
  readonly {
    readonly action: string;
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
    CREATE OR REPLACE FUNCTION prospecting_app.t029_force_audit_failure()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'synthetic T029 audit failure' USING ERRCODE = 'P0001';
    END;
    $$;

    CREATE TRIGGER t029_force_audit_failure
      BEFORE INSERT ON prospecting_app.commercial_audit_events
      FOR EACH ROW
      EXECUTE FUNCTION prospecting_app.t029_force_audit_failure();
  `);
}

async function removeAuditFailureTrigger(): Promise<void> {
  await execute(`
    DO $$
    BEGIN
      IF to_regclass('prospecting_app.commercial_audit_events') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS t029_force_audit_failure
          ON prospecting_app.commercial_audit_events;
      END IF;

      IF to_regprocedure('prospecting_app.t029_force_audit_failure()') IS NOT NULL THEN
        DROP FUNCTION prospecting_app.t029_force_audit_failure();
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

describe("workspace repository integration", () => {
  it("creates a workspace and audit event with context-controlled organization and actor", async () => {
    const repository = await loadWorkspaceRepository();

    const result = await repository.createLeadWorkspace({
      actor: auditActor(),
      request: {
        cnpj_normalizado: cnpj,
        observed_lead_run_id: leadRunId,
        responsible_subject: otherSubject,
      },
    });

    expect(result).toMatchObject({
      kind: "created",
      workspace: {
        organization_id: organizationId,
        responsible_subject: otherSubject,
        commercial_stage: "ASSIGNED",
        version: 1,
        created_by_subject: actorSubject,
      },
    });
    const createdWorkspaceId =
      result.kind === "created" ? result.workspace.workspace_id : workspaceId;

    expect(await workspaceRows(createdWorkspaceId)).toMatchObject([
      {
        organization_id: organizationId,
        responsible_subject: otherSubject,
        commercial_stage: "ASSIGNED",
        version: 1,
        updated_by_subject: actorSubject,
      },
    ]);
    expect(await auditRows(createdWorkspaceId)).toMatchObject([
      {
        action: "WORKSPACE_CREATED",
        actor_subject: actorSubject,
        actor_issuer: actorIssuer,
        request_correlation_id: requestCorrelationId,
        authorization_basis: "verified_oidc",
        metadata: {
          source: "app",
          workspace_id: createdWorkspaceId,
        },
      },
    ]);
  });

  it("fails closed for cross-organization read and update", async () => {
    const repository = await loadWorkspaceRepository();
    await insertWorkspace();

    const readResult = await repository.getLeadWorkspace({
      actor: { organizationId: otherOrganizationId },
      workspaceId,
    });
    const updateResult = await repository.updateLeadWorkspace({
      actor: auditActor(otherOrganizationId),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: "Enviar proposta",
      },
    });

    expect(readResult).toMatchObject({ kind: "not_found" });
    expect(updateResult).toMatchObject({ kind: "not_found" });
    expect(await workspaceRows()).toMatchObject([
      {
        organization_id: organizationId,
        next_action: "Ligar para financeiro",
        version: 1,
      },
    ]);
    expect(await auditRows()).toEqual([]);
  });

  it("updates a workspace version and audit event in one successful transaction", async () => {
    const repository = await loadWorkspaceRepository();
    await insertWorkspace({
      commercial_stage: "ASSIGNED",
      next_action: "Ligar para financeiro",
    });

    const result = await repository.updateLeadWorkspace({
      actor: auditActor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "CONTACTED",
        next_action: "Enviar proposta",
        commercial_outcome: "NO_RESPONSE",
      },
    });

    expect(result).toMatchObject({
      kind: "updated",
      workspace: {
        commercial_stage: "CONTACTED",
        next_action: "Enviar proposta",
        commercial_outcome: "NO_RESPONSE",
        version: 2,
      },
    });
    expect(await workspaceRows()).toMatchObject([
      {
        commercial_stage: "CONTACTED",
        next_action: "Enviar proposta",
        commercial_outcome: "NO_RESPONSE",
        version: 2,
        updated_by_subject: actorSubject,
      },
    ]);
    expect(await auditRows()).toMatchObject([
      {
        action: "STAGE_CHANGED",
        actor_subject: actorSubject,
        previous_metadata: {
          commercial_stage: "ASSIGNED",
          version: 1,
        },
        new_metadata: {
          commercial_stage: "CONTACTED",
          version: 2,
        },
      },
    ]);
  });

  it("rejects stale expected_version without mutating workspace or audit", async () => {
    const repository = await loadWorkspaceRepository();
    await insertWorkspace({ version: 2 });

    const result = await repository.updateLeadWorkspace({
      actor: auditActor(),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: "Enviar proposta",
      },
    });

    expect(result).toMatchObject({ kind: "stale_version" });
    expect(await workspaceRows()).toMatchObject([
      {
        next_action: "Ligar para financeiro",
        version: 2,
      },
    ]);
    expect(await auditRows()).toEqual([]);
  });

  it("rejects invalid stage transitions without mutating workspace or audit", async () => {
    const repository = await loadWorkspaceRepository();
    await insertWorkspace({ commercial_stage: "ASSIGNED" });

    const result = await repository.updateLeadWorkspace({
      actor: auditActor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "FOLLOW_UP",
      },
    });

    expect(result).toMatchObject({
      kind: "invalid_transition",
      error: { reason: "UNLISTED_TRANSITION" },
    });
    expect(await workspaceRows()).toMatchObject([
      {
        commercial_stage: "ASSIGNED",
        version: 1,
      },
    ]);
    expect(await auditRows()).toEqual([]);
  });

  it("rolls back the workspace update when audit insertion fails", async () => {
    const repository = await loadWorkspaceRepository();
    await insertWorkspace({ next_action: "Ligar para financeiro" });
    await installAuditFailureTrigger();

    await expect(
      repository.updateLeadWorkspace({
        actor: auditActor(),
        workspaceId,
        request: {
          expected_version: 1,
          next_action: "Enviar proposta",
        },
      }),
    ).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE" });

    expect(await workspaceRows()).toMatchObject([
      {
        next_action: "Ligar para financeiro",
        version: 1,
      },
    ]);
    expect(await auditRows()).toEqual([]);
  });
});
