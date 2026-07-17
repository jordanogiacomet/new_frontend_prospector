import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const forwardSql = readSql("001_app_schema_forward.sql");
const rollbackSql = readSql("002_app_schema_rollback.sql");
const grantsSql = readSql("003_app_schema_grants.sql");
const auditRedactionSql = readSql(
  "004_commercial_audit_redaction_forward.sql",
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
  application_name: "prospecta-t032-audit-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

type AuditRepository = typeof import("./audit-repository");

let auditRepository: AuditRepository | null = null;

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const otherSubject = "oidc|synthetic-seller";
const cnpj = "12345678000195";
const otherCnpj = "98765432000155";
const thirdCnpj = "11122233000181";
const leadRunId = `lr_${"a".repeat(64)}`;
const otherLeadRunId = `lr_${"b".repeat(64)}`;
const workspaceId = "00000000-0000-4000-8000-000000000232";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000233";
const thirdWorkspaceId = "00000000-0000-4000-8000-000000000234";
const auditEventIdA = "00000000-0000-4000-8000-000000000332";
const auditEventIdB = "00000000-0000-4000-8000-000000000333";
const auditEventIdC = "00000000-0000-4000-8000-000000000334";
const auditEventIdD = "00000000-0000-4000-8000-000000000335";
const targetIdA = "00000000-0000-4000-8000-000000000432";
const targetIdB = "00000000-0000-4000-8000-000000000433";
const noteId = "00000000-0000-4000-8000-000000000532";

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
      "PROSPECTA_APP_TEST_DATABASE_URL is required for T032 integration tests.",
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
      "PGUSER and PGPASSWORD are required for T032 repository integration tests.",
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

async function loadAuditRepository(): Promise<AuditRepository> {
  if (auditRepository === null) {
    configureRepositoryEnvironment();
    auditRepository = await import("./audit-repository");
  }

  return auditRepository;
}

async function execute(sql: string): Promise<void> {
  await pool.query(sql);
}

async function resetDisposableDatabase(): Promise<void> {
  await execute(rollbackSql);
  await execute(forwardSql);
  await execute(auditRedactionSql);
  await execute(grantsSql);
}

async function cleanupDisposableDatabase(): Promise<void> {
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

async function insertAuditEvent(input: {
  readonly audit_event_id: string;
  readonly organization_id?: string;
  readonly workspace_id?: string;
  readonly actor_subject?: string;
  readonly action?: string;
  readonly target_type?: string;
  readonly target_id?: string;
  readonly observed_lead_run_id?: string | null;
  readonly previous_metadata?: Record<string, unknown>;
  readonly new_metadata?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly occurred_at: string;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO prospecting_app.commercial_audit_events (
        audit_event_id,
        organization_id,
        workspace_id,
        actor_subject,
        action,
        target_type,
        target_id,
        observed_lead_run_id,
        previous_metadata,
        new_metadata,
        metadata,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12)
    `,
    [
      input.audit_event_id,
      input.organization_id ?? organizationId,
      input.workspace_id ?? workspaceId,
      input.actor_subject ?? actorSubject,
      input.action ?? "STAGE_CHANGED",
      input.target_type ?? "lead_workspace",
      input.target_id ?? targetIdA,
      Object.hasOwn(input, "observed_lead_run_id")
        ? (input.observed_lead_run_id ?? null)
        : leadRunId,
      JSON.stringify(
        input.previous_metadata ?? {
          commercial_stage: "ASSIGNED",
          responsible_subject: actorSubject,
          version: 1,
          archived_at: null,
        },
      ),
      JSON.stringify(
        input.new_metadata ?? {
          commercial_stage: "CONTACTED",
          responsible_subject: actorSubject,
          version: 2,
          archived_at: null,
        },
      ),
      JSON.stringify(
        input.metadata ?? {
          source: "app",
          field: "commercial_stage",
          from: "ASSIGNED",
          to: "CONTACTED",
          workspace_id: input.workspace_id ?? workspaceId,
        },
      ),
      input.occurred_at,
    ],
  );
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

describe("commercial audit repository integration", () => {
  it("lists an empty page for an existing workspace", async () => {
    const repository = await loadAuditRepository();
    await insertWorkspace();

    const result = await repository.listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toEqual({
      kind: "listed",
      auditEvents: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it("fails closed for missing and cross-organization workspaces", async () => {
    const repository = await loadAuditRepository();
    await insertWorkspace();
    await insertAuditEvent({
      audit_event_id: auditEventIdA,
      occurred_at: "2026-07-09T12:00:00Z",
    });

    const missingResult = await repository.listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId: otherWorkspaceId,
    });
    const crossOrgResult = await repository.listCommercialAuditEvents({
      actor: { organizationId: otherOrganizationId },
      workspaceId,
    });

    expect(missingResult).toMatchObject({ kind: "not_found" });
    expect(crossOrgResult).toMatchObject({ kind: "not_found" });
  });

  it("lists only audit events for the scoped organization and workspace", async () => {
    const repository = await loadAuditRepository();
    await insertWorkspace({ observed_lead_run_id: leadRunId });
    await insertWorkspace({
      workspace_id: otherWorkspaceId,
      cnpj_normalizado: otherCnpj,
      observed_lead_run_id: otherLeadRunId,
    });
    await insertWorkspace({
      workspace_id: thirdWorkspaceId,
      organization_id: otherOrganizationId,
      cnpj_normalizado: thirdCnpj,
      observed_lead_run_id: otherLeadRunId,
      responsible_subject: otherSubject,
    });
    await insertAuditEvent({
      audit_event_id: auditEventIdA,
      workspace_id: workspaceId,
      organization_id: organizationId,
      target_id: targetIdA,
      observed_lead_run_id: leadRunId,
      occurred_at: "2026-07-09T12:00:00Z",
    });
    await insertAuditEvent({
      audit_event_id: auditEventIdB,
      workspace_id: otherWorkspaceId,
      organization_id: organizationId,
      target_id: targetIdB,
      observed_lead_run_id: otherLeadRunId,
      occurred_at: "2026-07-10T12:00:00Z",
    });
    await insertAuditEvent({
      audit_event_id: auditEventIdC,
      workspace_id: thirdWorkspaceId,
      organization_id: otherOrganizationId,
      actor_subject: otherSubject,
      observed_lead_run_id: otherLeadRunId,
      occurred_at: "2026-07-11T12:00:00Z",
    });

    const result = await repository.listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toMatchObject({
      kind: "listed",
      total: 1,
      auditEvents: [
        {
          audit_event_id: auditEventIdA,
          organization_id: organizationId,
          workspace_id: workspaceId,
          observed_lead_run_id: leadRunId,
        },
      ],
    });
  });

  it("applies pagination and orders by occurred_at descending then audit_event_id", async () => {
    const repository = await loadAuditRepository();
    await insertWorkspace();
    await insertAuditEvent({
      audit_event_id: auditEventIdB,
      target_id: targetIdB,
      occurred_at: "2026-07-10T12:00:00Z",
    });
    await insertAuditEvent({
      audit_event_id: auditEventIdA,
      target_id: targetIdA,
      occurred_at: "2026-07-10T12:00:00Z",
    });
    await insertAuditEvent({
      audit_event_id: auditEventIdC,
      target_id: targetIdA,
      occurred_at: "2026-07-09T12:00:00Z",
    });

    const firstPage = await repository.listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
      page: 1,
      pageSize: 2,
    });
    const secondPage = await repository.listCommercialAuditEvents({
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
      auditEvents: [
        { audit_event_id: auditEventIdA },
        { audit_event_id: auditEventIdB },
      ],
    });
    expect(secondPage).toMatchObject({
      kind: "listed",
      page: 2,
      pageSize: 2,
      total: 3,
      auditEvents: [{ audit_event_id: auditEventIdC }],
    });
  });

  it("sanitizes audit metadata before returning DTOs", async () => {
    const repository = await loadAuditRepository();
    await insertWorkspace();
    await insertAuditEvent({
      audit_event_id: auditEventIdD,
      action: "NOTE_APPENDED",
      target_type: "lead_note",
      target_id: noteId,
      previous_metadata: {
        commercial_stage: "ASSIGNED",
        status: "request_body",
      },
      new_metadata: {
        commercial_stage: "CONTACTED",
        responsible_subject: actorSubject,
      },
      metadata: {
        source: "request_body",
        field: "body",
        from: "Synthetic confidential note body",
        to: "Synthetic raw request body",
        workspace_id: workspaceId,
        note_id: noteId,
      },
      occurred_at: "2026-07-09T12:00:00Z",
    });

    const result = await repository.listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });
    const event = result.kind === "listed" ? result.auditEvents[0] : undefined;

    expect(event).toMatchObject({
      action: "NOTE_APPENDED",
      target_type: "lead_note",
      previous_metadata: {
        commercial_stage: "ASSIGNED",
      },
      new_metadata: {
        commercial_stage: "CONTACTED",
        responsible_subject: actorSubject,
      },
      metadata: {
        workspace_id: workspaceId,
        note_id: noteId,
      },
    });
    expect(JSON.stringify(event?.metadata)).not.toMatch(
      /body|request_body|raw_csv|csv|contact|report|payload|secret|sql_params/i,
    );
  });
});
