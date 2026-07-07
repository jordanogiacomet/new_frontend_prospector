import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const appSchema = "prospecting_app";
const producerLikeSchema = "prospecta_t010_producer_like";
const producerLikeTable = "approved_leads";
const appRuntimeRole = "prospecta_app_rw";
const producerReadRole = "prospecta_t010_producer_read";
const appRuntimePassword = "prospecta-app-rw-synthetic-password";
const producerReadPassword = "prospecta-producer-read-synthetic-password";
const forwardSql = readSql("001_app_schema_forward.sql");
const rollbackSql = readSql("002_app_schema_rollback.sql");
const grantsSql = readSql("003_app_schema_grants.sql");
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
  application_name: "prospecta-t009-t010-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

type ImportSubmissionRepository = typeof import("../../src/server/repositories/imports/import-submissions-repository");

let importSubmissionRepository: ImportSubmissionRepository | null = null;

function readSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/app", filename), "utf8");
}

function requireDisposableDatabaseUrl(): string {
  return validateDisposableDatabaseUrl(process.env.PROSPECTA_APP_TEST_DATABASE_URL);
}

function validateDisposableDatabaseUrl(rawValue: string | undefined): string {
  if (!rawValue) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL is required for T009/T010 integration tests.",
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

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
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
  await execute(rollbackSql);
  await execute(`DROP SCHEMA IF EXISTS ${producerLikeSchema} CASCADE`);
  await resetSyntheticRoles();
  await execute(forwardSql);
  await execute(grantsSql);
  await createProducerLikeObjects();
}

async function cleanupDisposableDatabase(): Promise<void> {
  await execute(rollbackSql);
  await execute(`DROP SCHEMA IF EXISTS ${producerLikeSchema} CASCADE`);
  await dropSyntheticRoles();
}

async function resetSyntheticRoles(): Promise<void> {
  await dropSyntheticRoles();
  await execute(`
    CREATE ROLE ${appRuntimeRole}
      LOGIN
      PASSWORD '${appRuntimePassword}'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      INHERIT;

    CREATE ROLE ${producerReadRole}
      LOGIN
      PASSWORD '${producerReadPassword}'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      INHERIT;

    GRANT CONNECT ON DATABASE ${quoteIdentifier(disposableDatabaseTarget.databaseName)}
      TO ${appRuntimeRole}, ${producerReadRole};
  `);
}

async function dropSyntheticRoles(): Promise<void> {
  await execute(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRuntimeRole}') THEN
        EXECUTE 'DROP OWNED BY ${appRuntimeRole}';
        EXECUTE 'DROP ROLE ${appRuntimeRole}';
      END IF;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${producerReadRole}') THEN
        EXECUTE 'DROP OWNED BY ${producerReadRole}';
        EXECUTE 'DROP ROLE ${producerReadRole}';
      END IF;
    END $$;
  `);
}

async function createProducerLikeObjects(): Promise<void> {
  await execute(`
    CREATE SCHEMA ${producerLikeSchema};
    REVOKE ALL ON SCHEMA ${producerLikeSchema} FROM PUBLIC;

    CREATE TABLE ${producerLikeSchema}.${producerLikeTable} (
      cnpj_normalizado char(14) PRIMARY KEY,
      lead_run_id text NOT NULL,
      "finalScore" integer NOT NULL CHECK ("finalScore" BETWEEN 0 AND 100)
    );

    INSERT INTO ${producerLikeSchema}.${producerLikeTable} (
      cnpj_normalizado,
      lead_run_id,
      "finalScore"
    )
    VALUES ('12345678000195', 'lead-run-producer-like-001', 87);

    REVOKE ALL ON TABLE ${producerLikeSchema}.${producerLikeTable} FROM PUBLIC;
    GRANT USAGE ON SCHEMA ${producerLikeSchema} TO ${producerReadRole};
    GRANT SELECT ON TABLE ${producerLikeSchema}.${producerLikeTable}
      TO ${producerReadRole};
  `);
}

function connectionStringForRole(roleName: string, password: string): string {
  const url = new URL(disposableDatabaseUrl);
  url.username = roleName;
  url.password = password;

  return url.toString();
}

function requireOwnerDatabaseUrlWithCredentials(): string {
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (!user || !password) {
    throw new Error(
      "PGUSER and PGPASSWORD are required for T014 repository integration tests.",
    );
  }

  return connectionStringForRole(user, password);
}

function configureRepositoryEnvironment(): void {
  const appDatabaseUrl = requireOwnerDatabaseUrlWithCredentials();

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
  process.env.AUTH_ALLOWED_ORG_ID = "org-synthetic-a";
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

async function loadImportSubmissionRepository(): Promise<ImportSubmissionRepository> {
  if (importSubmissionRepository === null) {
    configureRepositoryEnvironment();
    importSubmissionRepository = await import(
      "../../src/server/repositories/imports/import-submissions-repository"
    );
  }

  return importSubmissionRepository;
}

async function withRolePool<Result>(
  roleName: string,
  password: string,
  applicationName: string,
  callback: (rolePool: Pool) => Promise<Result>,
): Promise<Result> {
  const rolePool = new Pool({
    connectionString: connectionStringForRole(roleName, password),
    application_name: applicationName,
    max: 1,
    connectionTimeoutMillis: 1_000,
    statement_timeout: 5_000,
    lock_timeout: 1_000,
    idle_in_transaction_session_timeout: 5_000,
    allowExitOnIdle: true,
  });

  try {
    return await callback(rolePool);
  } finally {
    await rolePool.end();
  }
}

function syntheticUuid(suffix: number): string {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function syntheticHash(character: string): string {
  return character.repeat(64);
}

interface ImportSubmissionInput {
  readonly submissionId?: string;
  readonly organizationId?: string;
  readonly createdBySubject?: string;
  readonly fileSha256?: string;
  readonly idempotencyKey?: string;
  readonly status?: string;
  readonly producerAcknowledgedAt?: string | null;
  readonly producerImportBatchId?: string | null;
  readonly acknowledgedRowCount?: number | null;
}

async function insertImportSubmission(
  input: ImportSubmissionInput = {},
  client: Pool = pool,
): Promise<void> {
  await client.query(
    `
      INSERT INTO prospecting_app.import_submissions (
        submission_id,
        organization_id,
        created_by_subject,
        original_filename,
        file_sha256,
        file_size_bytes,
        content_type,
        idempotency_key,
        app_contract_version,
        status,
        producer_acknowledged_at,
        producer_import_batch_id,
        acknowledged_row_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'prospecta-import-v1', $9, $10, $11, $12)
    `,
    [
      input.submissionId ?? syntheticUuid(1),
      input.organizationId ?? "org-synthetic-a",
      input.createdBySubject ?? "oidc|synthetic-manager",
      "empresaqui-synthetic.csv",
      input.fileSha256 ?? syntheticHash("a"),
      128,
      "text/csv",
      input.idempotencyKey ?? "idem-synthetic-001",
      input.status ?? "SUBMISSION_RECORDED",
      input.producerAcknowledgedAt ?? null,
      input.producerImportBatchId ?? null,
      input.acknowledgedRowCount ?? null,
    ],
  );
}

async function updateImportSubmittedAt(input: {
  readonly organizationId: string;
  readonly submissionId: string;
  readonly submittedAt: string;
}): Promise<void> {
  await pool.query(
    `
      UPDATE prospecting_app.import_submissions
      SET submitted_at = $3::timestamptz
      WHERE organization_id = $1 AND submission_id = $2
    `,
    [input.organizationId, input.submissionId, input.submittedAt],
  );
}

interface WorkspaceInput {
  readonly workspaceId?: string;
  readonly organizationId?: string;
  readonly cnpj?: string;
  readonly observedLeadRunId?: string;
  readonly commercialStage?: string;
  readonly nextAction?: string | null;
}

async function insertWorkspace(
  input: WorkspaceInput = {},
  client: Pool = pool,
): Promise<void> {
  await client.query(
    `
      INSERT INTO prospecting_app.lead_workspaces (
        workspace_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        responsible_subject,
        commercial_stage,
        next_action,
        created_by_subject,
        updated_by_subject
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    `,
    [
      input.workspaceId ?? syntheticUuid(101),
      input.organizationId ?? "org-synthetic-a",
      input.cnpj ?? "98765432000198",
      input.observedLeadRunId ?? "lead-run-synthetic-001",
      "oidc|synthetic-owner",
      input.commercialStage ?? "ASSIGNED",
      input.nextAction ?? "Ligar para responsavel financeiro",
      "oidc|synthetic-manager",
    ],
  );
}

interface AppendOnlyRowIds {
  readonly importEventId: string;
  readonly activityId: string;
  readonly noteId: string;
  readonly auditEventId: string;
}

async function insertAppendOnlyRows(client: Pool = pool): Promise<AppendOnlyRowIds> {
  const submissionId = syntheticUuid(801);
  const workspaceId = syntheticUuid(802);
  const importEventId = syntheticUuid(803);
  const activityId = syntheticUuid(804);
  const noteId = syntheticUuid(805);
  const auditEventId = syntheticUuid(806);

  await insertImportSubmission(
    {
      submissionId,
      idempotencyKey: "append-only-role-idem",
      fileSha256: syntheticHash("c"),
    },
    client,
  );
  await insertWorkspace(
    {
      workspaceId,
      cnpj: "11222333000181",
      observedLeadRunId: "lead-run-append-only-001",
    },
    client,
  );

  await client.query(
    `
      INSERT INTO prospecting_app.import_submission_events (
        event_id,
        organization_id,
        submission_id,
        actor_subject,
        event_type,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      importEventId,
      "org-synthetic-a",
      submissionId,
      "oidc|synthetic-manager",
      "SUBMISSION_RECORDED",
      { source: "app", reason_code: "synthetic" },
    ],
  );

  await client.query(
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
      VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)
    `,
    [
      activityId,
      "org-synthetic-a",
      workspaceId,
      "lead-run-append-only-001",
      "oidc|synthetic-manager",
      "CALL",
      "CONNECTED",
      "Contato sintetico registrado.",
    ],
  );

  await client.query(
    `
      INSERT INTO prospecting_app.lead_notes (
        note_id,
        organization_id,
        workspace_id,
        observed_lead_run_id,
        author_subject,
        body
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      noteId,
      "org-synthetic-a",
      workspaceId,
      "lead-run-append-only-001",
      "oidc|synthetic-manager",
      "Nota comercial sintetica.",
    ],
  );

  await client.query(
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
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $3, $7, $8, $9, $10)
    `,
    [
      auditEventId,
      "org-synthetic-a",
      workspaceId,
      "oidc|synthetic-manager",
      "STAGE_CHANGED",
      "lead_workspace",
      "lead-run-append-only-001",
      { commercial_stage: "ASSIGNED" },
      { commercial_stage: "CONTACTED" },
      { field: "commercial_stage", reason_code: "synthetic" },
    ],
  );

  return {
    importEventId,
    activityId,
    noteId,
    auditEventId,
  };
}

function appendOnlyMutationStatements(ids: AppendOnlyRowIds): ReadonlyArray<{
  readonly updateText: string;
  readonly deleteText: string;
  readonly values: readonly unknown[];
}> {
  return [
    {
      updateText:
        "UPDATE prospecting_app.import_submission_events SET metadata = '{}'::jsonb WHERE event_id = $1",
      deleteText:
        "DELETE FROM prospecting_app.import_submission_events WHERE event_id = $1",
      values: [ids.importEventId],
    },
    {
      updateText:
        "UPDATE prospecting_app.lead_activities SET summary = $2 WHERE activity_id = $1",
      deleteText: "DELETE FROM prospecting_app.lead_activities WHERE activity_id = $1",
      values: [ids.activityId, "changed"],
    },
    {
      updateText: "UPDATE prospecting_app.lead_notes SET body = $2 WHERE note_id = $1",
      deleteText: "DELETE FROM prospecting_app.lead_notes WHERE note_id = $1",
      values: [ids.noteId, "changed"],
    },
    {
      updateText:
        "UPDATE prospecting_app.commercial_audit_events SET metadata = '{}'::jsonb WHERE audit_event_id = $1",
      deleteText:
        "DELETE FROM prospecting_app.commercial_audit_events WHERE audit_event_id = $1",
      values: [ids.auditEventId],
    },
  ];
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

describe("Prospecta app-owned schema migration", () => {
  it("applies the forward migration and creates the expected app-owned tables", async () => {
    const tables = await queryRows<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
      [appSchema],
    );

    expect(tables.map((row) => row.table_name)).toEqual([
      "commercial_audit_events",
      "import_submission_events",
      "import_submissions",
      "lead_activities",
      "lead_notes",
      "lead_workspaces",
    ]);
  });

  it("rolls back the app-owned schema without relying on producer objects", async () => {
    await execute(rollbackSql);

    const rows = await queryRows<{ schema_exists: boolean }>(
      "SELECT to_regnamespace($1) IS NOT NULL AS schema_exists",
      [appSchema],
    );

    expect(rows[0]?.schema_exists).toBe(false);
  });

  it("keeps every table organization-scoped", async () => {
    const missing = await queryRows<{ table_name: string }>(
      `
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = $1
          AND t.table_type = 'BASE TABLE'
          AND NOT EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = t.table_schema
              AND c.table_name = t.table_name
              AND c.column_name = 'organization_id'
          )
        ORDER BY t.table_name
      `,
      [appSchema],
    );

    expect(missing).toEqual([]);
  });

  it("does not create producer foreign keys or cascading foreign keys", async () => {
    const foreignKeys = await queryRows<{
      constraint_name: string;
      source_table: string;
      target_schema: string;
      target_table: string;
      delete_action: string;
    }>(
      `
        SELECT
          c.conname AS constraint_name,
          source.relname AS source_table,
          target_namespace.nspname AS target_schema,
          target.relname AS target_table,
          c.confdeltype AS delete_action
        FROM pg_constraint c
        JOIN pg_class source ON source.oid = c.conrelid
        JOIN pg_namespace source_namespace ON source_namespace.oid = source.relnamespace
        JOIN pg_class target ON target.oid = c.confrelid
        JOIN pg_namespace target_namespace ON target_namespace.oid = target.relnamespace
        WHERE source_namespace.nspname = $1
          AND c.contype = 'f'
        ORDER BY c.conname
      `,
      [appSchema],
    );

    expect(foreignKeys.length).toBeGreaterThan(0);
    expect(
      foreignKeys.every((foreignKey) => foreignKey.target_schema === appSchema),
    ).toBe(true);
    expect(
      foreignKeys.every((foreignKey) => foreignKey.delete_action !== "c"),
    ).toBe(true);
  });

  it("enforces organization-scoped import idempotency keys", async () => {
    await insertImportSubmission({
      submissionId: syntheticUuid(1),
      idempotencyKey: "same-key",
      fileSha256: syntheticHash("a"),
    });

    await expect(
      insertImportSubmission({
        submissionId: syntheticUuid(2),
        idempotencyKey: "same-key",
        fileSha256: syntheticHash("b"),
      }),
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      insertImportSubmission({
        submissionId: syntheticUuid(3),
        organizationId: "org-synthetic-b",
        idempotencyKey: "same-key",
        fileSha256: syntheticHash("b"),
      }),
    ).resolves.toBeUndefined();
  });

  it("requires correlated producer acknowledgement facts", async () => {
    await expect(
      insertImportSubmission({
        submissionId: syntheticUuid(4),
        status: "PRODUCER_ACKNOWLEDGED",
      }),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      insertImportSubmission({
        submissionId: syntheticUuid(5),
        idempotencyKey: "ack-key",
        status: "PRODUCER_ACKNOWLEDGED",
        producerAcknowledgedAt: "2026-07-06T12:00:00.000Z",
        producerImportBatchId: "import-batch-synthetic-001",
        acknowledgedRowCount: 2,
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps producer import batch identifiers unique only inside an organization", async () => {
    await insertImportSubmission({
      submissionId: syntheticUuid(6),
      idempotencyKey: "batch-key-a",
      status: "PRODUCER_ACKNOWLEDGED",
      producerAcknowledgedAt: "2026-07-06T12:00:00.000Z",
      producerImportBatchId: "import-batch-synthetic-002",
      acknowledgedRowCount: 2,
    });

    await expect(
      insertImportSubmission({
        submissionId: syntheticUuid(7),
        idempotencyKey: "batch-key-b",
        status: "PRODUCER_ACKNOWLEDGED",
        producerAcknowledgedAt: "2026-07-06T12:01:00.000Z",
        producerImportBatchId: "import-batch-synthetic-002",
        acknowledgedRowCount: 2,
      }),
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      insertImportSubmission({
        submissionId: syntheticUuid(8),
        organizationId: "org-synthetic-b",
        idempotencyKey: "batch-key-b",
        status: "PRODUCER_ACKNOWLEDGED",
        producerAcknowledgedAt: "2026-07-06T12:01:00.000Z",
        producerImportBatchId: "import-batch-synthetic-002",
        acknowledgedRowCount: 2,
      }),
    ).resolves.toBeUndefined();
  });

  it("enforces active workspace uniqueness inside an organization", async () => {
    await insertWorkspace({
      workspaceId: syntheticUuid(101),
      cnpj: "98765432000198",
    });

    await expect(
      insertWorkspace({
        workspaceId: syntheticUuid(102),
        cnpj: "98765432000198",
      }),
    ).rejects.toMatchObject({ code: "23505" });

    await pool.query(
      `
        UPDATE prospecting_app.lead_workspaces
        SET archived_at = now(), archived_by_subject = $1
        WHERE workspace_id = $2
      `,
      ["oidc|synthetic-manager", syntheticUuid(101)],
    );

    await expect(
      insertWorkspace({
        workspaceId: syntheticUuid(103),
        cnpj: "98765432000198",
      }),
    ).resolves.toBeUndefined();

    await expect(
      insertWorkspace({
        workspaceId: syntheticUuid(104),
        organizationId: "org-synthetic-b",
        cnpj: "98765432000198",
      }),
    ).resolves.toBeUndefined();
  });

  it("enforces workspace CNPJ, stage, and next-action checks", async () => {
    await expect(
      insertWorkspace({
        workspaceId: syntheticUuid(105),
        cnpj: "not-a-cnpj",
      }),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      insertWorkspace({
        workspaceId: syntheticUuid(106),
        cnpj: "22345678000190",
        commercialStage: "QUALIFIED_BY_PRODUCER",
      }),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      insertWorkspace({
        workspaceId: syntheticUuid(107),
        cnpj: "32345678000190",
        nextAction: "x".repeat(501),
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("creates the indexes required by the read and write model", async () => {
    const indexes = await queryRows<{ indexname: string }>(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = $1
        ORDER BY indexname
      `,
      [appSchema],
    );

    expect(indexes.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "commercial_audit_events_org_target_idx",
        "commercial_audit_events_org_workspace_occurred_idx",
        "import_submission_events_org_submission_occurred_idx",
        "import_submissions_org_created_at_idx",
        "import_submissions_org_idempotency_key_uk",
        "import_submissions_org_producer_batch_uk",
        "lead_activities_org_workspace_occurred_idx",
        "lead_notes_org_workspace_created_idx",
        "lead_workspaces_org_cnpj_active_uk",
        "lead_workspaces_org_stage_idx",
      ]),
    );
  });

  it("keeps import submission events append-only", async () => {
    await insertImportSubmission();
    await pool.query(
      `
        INSERT INTO prospecting_app.import_submission_events (
          event_id,
          organization_id,
          submission_id,
          actor_subject,
          event_type,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        syntheticUuid(201),
        "org-synthetic-a",
        syntheticUuid(1),
        "oidc|synthetic-manager",
        "SUBMISSION_RECORDED",
        { source: "app", reason_code: "synthetic" },
      ],
    );

    await expect(
      pool.query(
        `
          UPDATE prospecting_app.import_submission_events
          SET metadata = '{}'::jsonb
          WHERE event_id = $1
        `,
        [syntheticUuid(201)],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      pool.query(
        "DELETE FROM prospecting_app.import_submission_events WHERE event_id = $1",
        [syntheticUuid(201)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps activities append-only and bounded", async () => {
    await insertWorkspace();
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
        VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8)
      `,
      [
        syntheticUuid(301),
        "org-synthetic-a",
        syntheticUuid(101),
        "lead-run-synthetic-001",
        "oidc|synthetic-manager",
        "CALL",
        "CONNECTED",
        "Contato sintetico registrado.",
      ],
    );

    await expect(
      pool.query(
        `
          INSERT INTO prospecting_app.lead_activities (
            activity_id,
            organization_id,
            workspace_id,
            observed_lead_run_id,
            actor_subject,
            occurred_at,
            activity_type,
            summary
          )
          VALUES ($1, $2, $3, $4, $5, now(), $6, $7)
        `,
        [
          syntheticUuid(302),
          "org-synthetic-a",
          syntheticUuid(101),
          "lead-run-synthetic-001",
          "oidc|synthetic-manager",
          "CALL",
          "x".repeat(1_001),
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      pool.query(
        "UPDATE prospecting_app.lead_activities SET summary = $1 WHERE activity_id = $2",
        ["changed", syntheticUuid(301)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps notes append-only and bounded", async () => {
    await insertWorkspace();
    await pool.query(
      `
        INSERT INTO prospecting_app.lead_notes (
          note_id,
          organization_id,
          workspace_id,
          observed_lead_run_id,
          author_subject,
          body
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        syntheticUuid(401),
        "org-synthetic-a",
        syntheticUuid(101),
        "lead-run-synthetic-001",
        "oidc|synthetic-manager",
        "Nota comercial sintetica.",
      ],
    );

    await expect(
      pool.query(
        `
          INSERT INTO prospecting_app.lead_notes (
            note_id,
            organization_id,
            workspace_id,
            observed_lead_run_id,
            author_subject,
            body
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          syntheticUuid(402),
          "org-synthetic-a",
          syntheticUuid(101),
          "lead-run-synthetic-001",
          "oidc|synthetic-manager",
          "x".repeat(4_001),
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      pool.query(
        "DELETE FROM prospecting_app.lead_notes WHERE note_id = $1",
        [syntheticUuid(401)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps commercial audit append-only with allowlisted metadata", async () => {
    await insertWorkspace();
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
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $3, $7, $8, $9, $10)
      `,
      [
        syntheticUuid(501),
        "org-synthetic-a",
        syntheticUuid(101),
        "oidc|synthetic-manager",
        "STAGE_CHANGED",
        "lead_workspace",
        "lead-run-synthetic-001",
        { commercial_stage: "ASSIGNED" },
        { commercial_stage: "CONTACTED" },
        { field: "commercial_stage", reason_code: "synthetic" },
      ],
    );

    await expect(
      pool.query(
        `
          INSERT INTO prospecting_app.commercial_audit_events (
            audit_event_id,
            organization_id,
            workspace_id,
            actor_subject,
            action,
            target_type,
            target_id,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $3, $7)
        `,
        [
          syntheticUuid(502),
          "org-synthetic-a",
          syntheticUuid(101),
          "oidc|synthetic-manager",
          "NOTE_APPENDED",
          "lead_note",
          { note_body: "conteudo proibido" },
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      pool.query(
        "UPDATE prospecting_app.commercial_audit_events SET metadata = '{}'::jsonb WHERE audit_event_id = $1",
        [syntheticUuid(501)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("does not add raw CSV or raw producer payload columns", async () => {
    const columns = await queryRows<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
        ORDER BY table_name, ordinal_position
      `,
      [appSchema],
    );

    expect(columns.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining([
        "csv_bytes",
        "raw_csv",
        "raw_row",
        "producer_payload",
        "strategic_research_report",
      ]),
    );
  });

  it("keeps grants scoped to app-owned objects and append-only tables", () => {
    expect(grantsSql).not.toMatch(
      /company_validations|company_validation_runs|company_strategic_research_reports|PRODUCER_DATABASE_URL|producer-client|n8n|webhook/i,
    );
    expect(grantsSql).toMatch(
      /GRANT SELECT, INSERT ON TABLE\s+prospecting_app\.import_submission_events/i,
    );
    expect(grantsSql).toMatch(
      /GRANT SELECT, INSERT ON TABLE\s+prospecting_app\.lead_activities/i,
    );
    expect(grantsSql).toMatch(
      /GRANT SELECT, INSERT ON TABLE\s+prospecting_app\.lead_notes/i,
    );
    expect(grantsSql).toMatch(
      /GRANT SELECT, INSERT ON TABLE\s+prospecting_app\.commercial_audit_events/i,
    );
    expect(grantsSql).toMatch(
      /GRANT EXECUTE ON FUNCTION\s+prospecting_app\.text_is_present\(text, integer\),\s+prospecting_app\.jsonb_has_only_keys\(jsonb, text\[\]\)\s+TO prospecta_app_rw/i,
    );
    expect(grantsSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION\s+[^;]*prospecting_app\.reject_append_only_mutation/i,
    );
    expect(grantsSql).not.toMatch(
      /GRANT\s+[^;]*(UPDATE|DELETE)[^;]*prospecting_app\.(import_submission_events|lead_activities|lead_notes|commercial_audit_events)/i,
    );
  });
});

describe("Prospecta import submission repository integration", () => {
  it("creates a durable app submission intent and append-only event through the app-owned client", async () => {
    const repository = await loadImportSubmissionRepository();

    const result = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-create-idem",
      file: {
        filename: "empresaqui-repo-create.csv",
        sha256: syntheticHash("f"),
        sizeBytes: 256,
        mediaType: "text/csv",
      },
    });

    expect(result).toMatchObject({
      kind: "created",
      submission: {
        organizationId: "org-synthetic-a",
        idempotencyKey: "repo-create-idem",
        fileSha256: syntheticHash("f"),
        originalFilename: "empresaqui-repo-create.csv",
        sizeBytes: 256,
        mediaType: "text/csv",
        status: "SUBMISSION_RECORDED",
        producerAcknowledgement: null,
      },
    });

    const submissionId =
      result.kind === "created" ? result.submission.submissionId : "";
    const rows = await queryRows<{
      original_filename: string;
      file_sha256: string;
      content_type: string;
      status: string;
      producer_import_batch_id: string | null;
    }>(
      `
        SELECT
          original_filename,
          file_sha256,
          content_type,
          status,
          producer_import_batch_id
        FROM prospecting_app.import_submissions
        WHERE organization_id = $1 AND submission_id = $2
      `,
      ["org-synthetic-a", submissionId],
    );
    const events = await queryRows<{
      event_type: string;
      metadata: { source?: string; status?: string };
    }>(
      `
        SELECT event_type, metadata
        FROM prospecting_app.import_submission_events
        WHERE organization_id = $1 AND submission_id = $2
        ORDER BY occurred_at, event_id
      `,
      ["org-synthetic-a", submissionId],
    );

    expect(rows).toEqual([
      {
        original_filename: "empresaqui-repo-create.csv",
        file_sha256: syntheticHash("f"),
        content_type: "text/csv",
        status: "SUBMISSION_RECORDED",
        producer_import_batch_id: null,
      },
    ]);
    expect(events).toEqual([
      {
        event_type: "SUBMISSION_RECORDED",
        metadata: {
          source: "app",
          status: "SUBMISSION_RECORDED",
        },
      },
    ]);
  });

  it("enforces organization-scoped idempotency and safe conflicts", async () => {
    const repository = await loadImportSubmissionRepository();
    const first = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-idem-key",
      file: {
        filename: "empresaqui-repo-a.csv",
        sha256: syntheticHash("a"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });
    const duplicate = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-idem-key",
      file: {
        filename: "empresaqui-repo-a.csv",
        sha256: syntheticHash("a"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });
    const conflict = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-idem-key",
      file: {
        filename: "empresaqui-repo-b.csv",
        sha256: syntheticHash("b"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });
    const otherOrganization = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-b",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-idem-key",
      file: {
        filename: "empresaqui-repo-b.csv",
        sha256: syntheticHash("b"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });

    expect(first.kind).toBe("created");
    expect(duplicate).toMatchObject({
      kind: "duplicate",
      submission: {
        submissionId:
          first.kind === "created" ? first.submission.submissionId : "",
      },
    });
    expect(conflict).toEqual({
      kind: "conflict",
      error: {
        code: "IMPORT_IDEMPOTENCY_CONFLICT",
        httpStatus: 409,
        message: "Submission conflicts with an earlier file.",
      },
    });
    expect(otherOrganization).toMatchObject({
      kind: "created",
      submission: {
        organizationId: "org-synthetic-b",
        fileSha256: syntheticHash("b"),
      },
    });

    const rows = await queryRows<{ organization_id: string; total: number }>(
      `
        SELECT organization_id, count(*)::integer AS total
        FROM prospecting_app.import_submissions
        WHERE idempotency_key = $1
        GROUP BY organization_id
        ORDER BY organization_id
      `,
      ["repo-idem-key"],
    );

    expect(rows).toEqual([
      { organization_id: "org-synthetic-a", total: 1 },
      { organization_id: "org-synthetic-b", total: 1 },
    ]);
  });

  it("persists acknowledgement facts without durable producer acceptance", async () => {
    const repository = await loadImportSubmissionRepository();
    const created = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-ack-idem",
      file: {
        filename: "empresaqui-repo-ack.csv",
        sha256: syntheticHash("c"),
        sizeBytes: 512,
        mediaType: "application/csv",
      },
    });
    const submissionId =
      created.kind === "created" ? created.submission.submissionId : "";

    const acknowledged = await repository.recordProducerAcknowledgement({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      submissionId,
      acknowledgement: {
        accepted: true,
        message: "Arquivo recebido para processamento.",
        import_batch_id: "empresaqui_2026-07-07T12:00:00.000Z",
        row_count: 3,
        source: "EmpresaAqui",
      },
    });

    expect(acknowledged).toMatchObject({
      kind: "recorded",
      submission: {
        status: "PRODUCER_ACKNOWLEDGED",
        statusFactSource: "workflow_acknowledgement",
        producerAcknowledgement: {
          import_batch_id: "empresaqui_2026-07-07T12:00:00.000Z",
          row_count: 3,
        },
      },
    });
    expect(JSON.stringify(acknowledged)).not.toMatch(
      /acceptedAt|producerBatchId|rowCountAccepted|DURABLE_ACCEPTED/,
    );

    const rows = await queryRows<{
      status: string;
      producer_import_batch_id: string | null;
      acknowledged_row_count: number | null;
      durable_accepted_at: Date | null;
      durable_accepted_row_count: number | null;
    }>(
      `
        SELECT
          status,
          producer_import_batch_id,
          acknowledged_row_count,
          durable_accepted_at,
          durable_accepted_row_count
        FROM prospecting_app.import_submissions
        WHERE organization_id = $1 AND submission_id = $2
      `,
      ["org-synthetic-a", submissionId],
    );
    const events = await queryRows<{
      event_type: string;
      metadata: {
        source?: string;
        import_batch_id?: string;
        row_count?: number;
        status?: string;
      };
    }>(
      `
        SELECT event_type, metadata
        FROM prospecting_app.import_submission_events
        WHERE organization_id = $1 AND submission_id = $2
        ORDER BY occurred_at, event_id
      `,
      ["org-synthetic-a", submissionId],
    );

    expect(rows).toEqual([
      {
        status: "PRODUCER_ACKNOWLEDGED",
        producer_import_batch_id: "empresaqui_2026-07-07T12:00:00.000Z",
        acknowledged_row_count: 3,
        durable_accepted_at: null,
        durable_accepted_row_count: null,
      },
    ]);
    expect(events).toEqual([
      {
        event_type: "SUBMISSION_RECORDED",
        metadata: {
          source: "app",
          status: "SUBMISSION_RECORDED",
        },
      },
      {
        event_type: "PRODUCER_ACKNOWLEDGED",
        metadata: {
          source: "EmpresaAqui",
          import_batch_id: "empresaqui_2026-07-07T12:00:00.000Z",
          row_count: 3,
          status: "PRODUCER_ACKNOWLEDGED",
        },
      },
    ]);
  });

  it("fails closed for acknowledgement attempts outside the organization scope", async () => {
    const repository = await loadImportSubmissionRepository();
    const created = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-cross-org-ack",
      file: {
        filename: "empresaqui-cross-org.csv",
        sha256: syntheticHash("d"),
        sizeBytes: 512,
        mediaType: "text/csv",
      },
    });
    const submissionId =
      created.kind === "created" ? created.submission.submissionId : "";

    const result = await repository.recordProducerAcknowledgement({
      organizationId: "org-synthetic-b",
      actorSubject: "oidc|synthetic-manager",
      submissionId,
      acknowledgement: {
        accepted: true,
        message: "Arquivo recebido para processamento.",
        import_batch_id: "empresaqui_2026-07-07T12:05:00.000Z",
        row_count: 1,
        source: "EmpresaAqui",
      },
    });

    expect(result).toEqual({
      kind: "not_found",
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        httpStatus: 404,
        message: "Import submission was not found.",
      },
    });

    const events = await queryRows<{ event_type: string }>(
      `
        SELECT event_type
        FROM prospecting_app.import_submission_events
        WHERE organization_id = $1 AND submission_id = $2
      `,
      ["org-synthetic-a", submissionId],
    );

    expect(events).toEqual([{ event_type: "SUBMISSION_RECORDED" }]);
  });

  it("lists app-owned submissions with empty state, total, bounded pagination, and stable organization-scoped ordering", async () => {
    const repository = await loadImportSubmissionRepository();

    await expect(
      repository.listImportSubmissions({ organizationId: "org-synthetic-a" }),
    ).resolves.toEqual({
      submissions: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    const older = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-list-older",
      file: {
        filename: "empresaqui-list-older.csv",
        sha256: syntheticHash("1"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });
    const tiedA = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-list-tie-a",
      file: {
        filename: "empresaqui-list-tie-a.csv",
        sha256: syntheticHash("2"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });
    const tiedB = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-list-tie-b",
      file: {
        filename: "empresaqui-list-tie-b.csv",
        sha256: syntheticHash("3"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });
    await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-b",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-list-other-org",
      file: {
        filename: "empresaqui-list-other.csv",
        sha256: syntheticHash("4"),
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    });

    const olderId =
      older.kind === "created" ? older.submission.submissionId : "";
    const tiedAId =
      tiedA.kind === "created" ? tiedA.submission.submissionId : "";
    const tiedBId =
      tiedB.kind === "created" ? tiedB.submission.submissionId : "";

    await updateImportSubmittedAt({
      organizationId: "org-synthetic-a",
      submissionId: olderId,
      submittedAt: "2030-07-07T10:00:00.000Z",
    });
    await updateImportSubmittedAt({
      organizationId: "org-synthetic-a",
      submissionId: tiedAId,
      submittedAt: "2030-07-07T11:00:00.000Z",
    });
    await updateImportSubmittedAt({
      organizationId: "org-synthetic-a",
      submissionId: tiedBId,
      submittedAt: "2030-07-07T11:00:00.000Z",
    });

    const firstPage = await repository.listImportSubmissions({
      organizationId: "org-synthetic-a",
      page: 1,
      pageSize: 500,
    });
    const secondPage = await repository.listImportSubmissions({
      organizationId: "org-synthetic-a",
      page: 2,
      pageSize: 2,
    });
    const expectedTieOrder = [tiedAId, tiedBId].sort().reverse();

    expect(firstPage).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 3,
    });
    expect(firstPage.submissions.map((submission) => submission.submissionId)).toEqual([
      expectedTieOrder[0],
      expectedTieOrder[1],
      olderId,
    ]);
    expect(secondPage).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3,
    });
    expect(secondPage.submissions.map((submission) => submission.submissionId)).toEqual([
      olderId,
    ]);
    expect(JSON.stringify(firstPage)).not.toContain("repo-list-other-org");
  });

  it("reads submission detail with acknowledgement nullable and without promoting it to acceptance", async () => {
    const repository = await loadImportSubmissionRepository();
    const created = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-detail-ack",
      file: {
        filename: "empresaqui-detail-ack.csv",
        sha256: syntheticHash("5"),
        sizeBytes: 1024,
        mediaType: "text/csv",
      },
    });
    const submissionId =
      created.kind === "created" ? created.submission.submissionId : "";

    await repository.recordProducerAcknowledgement({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      submissionId,
      acknowledgement: {
        accepted: true,
        message: "Arquivo recebido para processamento.",
        import_batch_id: "empresaqui_detail_ack_001",
        row_count: 8,
        source: "EmpresaAqui",
      },
    });

    const detail = await repository.getImportSubmissionDetail({
      organizationId: "org-synthetic-a",
      submissionId,
    });

    expect(detail).toMatchObject({
      kind: "found",
      submission: {
        submissionId,
        originalFilename: "empresaqui-detail-ack.csv",
        appStatus: "PRODUCER_ACKNOWLEDGED",
        statusFactSource: "workflow_acknowledgement",
        workflowAcknowledgement: {
          import_batch_id: "empresaqui_detail_ack_001",
          row_count: 8,
        },
        durableAcceptance: null,
      },
    });
    expect(JSON.stringify(detail)).not.toContain("repo-detail-ack");
    expect(JSON.stringify(detail)).not.toContain(syntheticHash("5"));
    expect(JSON.stringify(detail)).not.toMatch(
      /rowCountAccepted|COMPLETED|PROCESSING/i,
    );
  });

  it("returns safe not_found for missing and cross-organization detail reads", async () => {
    const repository = await loadImportSubmissionRepository();
    const created = await repository.recordImportSubmissionIntent({
      organizationId: "org-synthetic-a",
      actorSubject: "oidc|synthetic-manager",
      idempotencyKey: "repo-detail-cross-org",
      file: {
        filename: "empresaqui-detail-cross-org.csv",
        sha256: syntheticHash("6"),
        sizeBytes: 256,
        mediaType: "text/csv",
      },
    });
    const submissionId =
      created.kind === "created" ? created.submission.submissionId : "";

    await expect(
      repository.getImportSubmissionDetail({
        organizationId: "org-synthetic-b",
        submissionId,
      }),
    ).resolves.toMatchObject({
      kind: "not_found",
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        httpStatus: 404,
      },
    });
    await expect(
      repository.getImportSubmissionDetail({
        organizationId: "org-synthetic-a",
        submissionId: syntheticUuid(999),
      }),
    ).resolves.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("Prospecta disposable database URL guard", () => {
  it("accepts the authorized local X2 target", () => {
    expect(
      validateDisposableDatabaseUrl(
        "postgresql://localhost:5432/prospecta_t009_test",
      ),
    ).toBe("postgresql://localhost:5432/prospecta_t009_test");
  });

  it("rejects every tested DSN outside the authorized local X2 target", () => {
    const invalidUrls = [
      undefined,
      "http://localhost:5432/prospecta_t009_test",
      "postgresql://127.0.0.1:5432/prospecta_t009_test",
      "postgresql://localhost/prospecta_t009_test",
      "postgresql://localhost:5433/prospecta_t009_test",
      "postgresql://localhost:5432/postgres",
      "postgresql://127.0.0.1:15434/prospecta_test",
      "postgresql://localhost:5432/prospecta_t009_test?sslmode=require",
      "postgresql://localhost:5432/prospecta_t009_test#fragment",
    ] as const;

    for (const invalidUrl of invalidUrls) {
      expect(() => validateDisposableDatabaseUrl(invalidUrl)).toThrow(
        /PROSPECTA_APP_TEST_DATABASE_URL/,
      );
    }
  });
});

describe("Prospecta database role isolation", () => {
  it("provisions only disposable synthetic roles and producer-like objects", async () => {
    const roles = await queryRows<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
    }>(
      `
        SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication
        FROM pg_roles
        WHERE rolname = ANY ($1::text[])
        ORDER BY rolname
      `,
      [[appRuntimeRole, producerReadRole]],
    );

    expect(roles).toEqual([
      {
        rolname: appRuntimeRole,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      },
      {
        rolname: producerReadRole,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      },
    ]);

    const producerLikeObjects = await queryRows<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
        ORDER BY table_name
      `,
      [producerLikeSchema],
    );

    expect(producerLikeObjects).toEqual([{ table_name: producerLikeTable }]);
  });

  it("keeps role grants scoped to the app schema and synthetic producer allowlist", async () => {
    const grants = await queryRows<{
      grantee: string;
      table_schema: string;
      table_name: string;
      privilege_type: string;
    }>(
      `
        SELECT grantee, table_schema, table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE grantee = ANY ($1::text[])
        ORDER BY grantee, table_schema, table_name, privilege_type
      `,
      [[appRuntimeRole, producerReadRole]],
    );

    const producerGrantKeys = grants
      .filter((grant) => grant.grantee === producerReadRole)
      .map(
        (grant) =>
          `${grant.table_schema}.${grant.table_name}:${grant.privilege_type}`,
      );

    expect(producerGrantKeys).toEqual([
      `${producerLikeSchema}.${producerLikeTable}:SELECT`,
    ]);

    const appGrants = grants.filter((grant) => grant.grantee === appRuntimeRole);
    const appGrantKeys = appGrants.map(
      (grant) =>
        `${grant.table_schema}.${grant.table_name}:${grant.privilege_type}`,
    );

    expect(appGrants.length).toBeGreaterThan(0);
    expect(appGrants.every((grant) => grant.table_schema === appSchema)).toBe(
      true,
    );
    expect(appGrantKeys).toEqual(
      expect.arrayContaining([
        "prospecting_app.import_submissions:INSERT",
        "prospecting_app.import_submissions:SELECT",
        "prospecting_app.import_submissions:UPDATE",
        "prospecting_app.lead_workspaces:INSERT",
        "prospecting_app.lead_workspaces:SELECT",
        "prospecting_app.lead_workspaces:UPDATE",
        "prospecting_app.import_submission_events:INSERT",
        "prospecting_app.import_submission_events:SELECT",
        "prospecting_app.lead_activities:INSERT",
        "prospecting_app.lead_activities:SELECT",
        "prospecting_app.lead_notes:INSERT",
        "prospecting_app.lead_notes:SELECT",
        "prospecting_app.commercial_audit_events:INSERT",
        "prospecting_app.commercial_audit_events:SELECT",
      ]),
    );
    expect(appGrantKeys.some((key) => key.endsWith(":DELETE"))).toBe(false);
    expect(
      appGrantKeys.some((key) =>
        key.startsWith(`${producerLikeSchema}.${producerLikeTable}:`),
      ),
    ).toBe(false);

    const routineGrants = await queryRows<{
      grantee: string;
      routine_schema: string;
      routine_name: string;
      privilege_type: string;
    }>(
      `
        SELECT grantee, routine_schema, routine_name, privilege_type
        FROM information_schema.routine_privileges
        WHERE grantee = ANY ($1::text[])
        ORDER BY grantee, routine_schema, routine_name, privilege_type
      `,
      [[appRuntimeRole, producerReadRole]],
    );

    const appRoutineGrantKeys = routineGrants
      .filter((grant) => grant.grantee === appRuntimeRole)
      .map(
        (grant) =>
          `${grant.routine_schema}.${grant.routine_name}:${grant.privilege_type}`,
      );

    expect(appRoutineGrantKeys).toEqual([
      "prospecting_app.jsonb_has_only_keys:EXECUTE",
      "prospecting_app.text_is_present:EXECUTE",
    ]);
    expect(
      routineGrants.some((grant) => grant.grantee === producerReadRole),
    ).toBe(false);
  });

  it("allows the app role to select, insert, and update only mutable app-owned tables", async () => {
    await withRolePool(
      appRuntimeRole,
      appRuntimePassword,
      "prospecta-t010-app-rw",
      async (appPool) => {
        const submissionId = syntheticUuid(901);
        const workspaceId = syntheticUuid(902);

        await insertImportSubmission(
          {
            submissionId,
            idempotencyKey: "app-role-idem-001",
            fileSha256: syntheticHash("d"),
          },
          appPool,
        );
        await insertWorkspace(
          {
            workspaceId,
            cnpj: "22111333000181",
            observedLeadRunId: "lead-run-app-role-001",
          },
          appPool,
        );

        await appPool.query(
          `
            UPDATE prospecting_app.import_submissions
            SET status = 'ACCEPTANCE_UNKNOWN', updated_at = now()
            WHERE submission_id = $1
          `,
          [submissionId],
        );
        await appPool.query(
          `
            UPDATE prospecting_app.lead_workspaces
            SET next_action = $1, version = version + 1, updated_at = now()
            WHERE workspace_id = $2
          `,
          ["Retomar contato sintetico", workspaceId],
        );

        const rows = await appPool.query<{
          status: string;
          next_action: string | null;
        }>(
          `
            SELECT i.status, w.next_action
            FROM prospecting_app.import_submissions i
            CROSS JOIN prospecting_app.lead_workspaces w
            WHERE i.submission_id = $1 AND w.workspace_id = $2
          `,
          [submissionId, workspaceId],
        );

        expect(rows.rows).toEqual([
          {
            status: "ACCEPTANCE_UNKNOWN",
            next_action: "Retomar contato sintetico",
          },
        ]);

        await expect(
          appPool.query(
            "DELETE FROM prospecting_app.import_submissions WHERE submission_id = $1",
            [submissionId],
          ),
        ).rejects.toMatchObject({
          code: "42501",
          message: expect.stringContaining("permission denied"),
        });
      },
    );
  });

  it("denies app-role update and delete on append-only tables by privilege", async () => {
    await withRolePool(
      appRuntimeRole,
      appRuntimePassword,
      "prospecta-t010-app-append-only",
      async (appPool) => {
        const ids = await insertAppendOnlyRows(appPool);

        for (const statement of appendOnlyMutationStatements(ids)) {
          await expect(
            appPool.query(statement.updateText, [...statement.values]),
          ).rejects.toMatchObject({
            code: "42501",
            message: expect.stringContaining("permission denied"),
          });
          await expect(
            appPool.query(statement.deleteText, [statement.values[0]]),
          ).rejects.toMatchObject({
            code: "42501",
            message: expect.stringContaining("permission denied"),
          });
        }
      },
    );
  });

  it("keeps append-only triggers active against elevated owner mutations", async () => {
    const ids = await insertAppendOnlyRows();

    for (const statement of appendOnlyMutationStatements(ids)) {
      await expect(
        pool.query(statement.updateText, [...statement.values]),
      ).rejects.toMatchObject({
        code: "42501",
        message: expect.stringContaining("append-only relation"),
      });
      await expect(
        pool.query(statement.deleteText, [statement.values[0]]),
      ).rejects.toMatchObject({
        code: "42501",
        message: expect.stringContaining("append-only relation"),
      });
    }
  });

  it("allows the producer-read role to select only the synthetic producer allowlist", async () => {
    await withRolePool(
      producerReadRole,
      producerReadPassword,
      "prospecta-t010-producer-read",
      async (producerPool) => {
        const rows = await producerPool.query<{
          lead_run_id: string;
          finalScore: number;
        }>(
          `
            SELECT lead_run_id, "finalScore"
            FROM prospecta_t010_producer_like.approved_leads
            WHERE cnpj_normalizado = $1
          `,
          ["12345678000195"],
        );

        expect(rows.rows).toEqual([
          {
            lead_run_id: "lead-run-producer-like-001",
            finalScore: 87,
          },
        ]);

        await expect(
          producerPool.query("SELECT count(*) FROM prospecting_app.import_submissions"),
        ).rejects.toMatchObject({ code: "42501" });
      },
    );
  });

  it("denies producer-read writes to synthetic producer-like objects", async () => {
    await withRolePool(
      producerReadRole,
      producerReadPassword,
      "prospecta-t010-producer-write-denial",
      async (producerPool) => {
        await expect(
          producerPool.query(
            `
              INSERT INTO prospecta_t010_producer_like.approved_leads (
                cnpj_normalizado,
                lead_run_id,
                "finalScore"
              )
              VALUES ($1, $2, $3)
            `,
            ["99888777000166", "lead-run-denied", 1],
          ),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          producerPool.query(
            `
              UPDATE prospecta_t010_producer_like.approved_leads
              SET "finalScore" = 1
              WHERE cnpj_normalizado = $1
            `,
            ["12345678000195"],
          ),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          producerPool.query(
            `
              DELETE FROM prospecta_t010_producer_like.approved_leads
              WHERE cnpj_normalizado = $1
            `,
            ["12345678000195"],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      },
    );
  });

  it("denies producer-read access and writes to app-owned objects", async () => {
    await withRolePool(
      producerReadRole,
      producerReadPassword,
      "prospecta-t010-producer-app-denial",
      async (producerPool) => {
        await expect(
          producerPool.query("SELECT count(*) FROM prospecting_app.lead_workspaces"),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          insertImportSubmission(
            {
              submissionId: syntheticUuid(911),
              idempotencyKey: "producer-role-denied",
              fileSha256: syntheticHash("e"),
            },
            producerPool,
          ),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          producerPool.query(
            `
              UPDATE prospecting_app.lead_workspaces
              SET next_action = $1
              WHERE workspace_id = $2
            `,
            ["denied", syntheticUuid(101)],
          ),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          producerPool.query(
            "DELETE FROM prospecting_app.import_submissions WHERE submission_id = $1",
            [syntheticUuid(1)],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      },
    );
  });

  it("denies app-role access and mutations to synthetic producer-like objects", async () => {
    await withRolePool(
      appRuntimeRole,
      appRuntimePassword,
      "prospecta-t010-app-producer-denial",
      async (appPool) => {
        await expect(
          appPool.query("SELECT count(*) FROM prospecta_t010_producer_like.approved_leads"),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          appPool.query(
            `
              INSERT INTO prospecta_t010_producer_like.approved_leads (
                cnpj_normalizado,
                lead_run_id,
                "finalScore"
              )
              VALUES ($1, $2, $3)
            `,
            ["88777666000155", "lead-run-app-denied", 1],
          ),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          appPool.query(
            `
              UPDATE prospecta_t010_producer_like.approved_leads
              SET "finalScore" = 1
              WHERE cnpj_normalizado = $1
            `,
            ["12345678000195"],
          ),
        ).rejects.toMatchObject({ code: "42501" });

        await expect(
          appPool.query(
            `
              DELETE FROM prospecta_t010_producer_like.approved_leads
              WHERE cnpj_normalizado = $1
            `,
            ["12345678000195"],
          ),
        ).rejects.toMatchObject({ code: "42501" });
      },
    );
  });
});
