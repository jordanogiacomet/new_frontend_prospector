import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const appSchema = "prospecting_app";
const forwardSql = readSql("001_app_schema_forward.sql");
const rollbackSql = readSql("002_app_schema_rollback.sql");
const grantsSql = readSql("003_app_schema_grants.sql");

const pool = new Pool({
  connectionString: requireDisposableDatabaseUrl(),
  application_name: "prospecta-t009-migration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

function readSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/app", filename), "utf8");
}

function requireDisposableDatabaseUrl(): string {
  const rawValue = process.env.PROSPECTA_APP_TEST_DATABASE_URL;

  if (!rawValue) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL is required for T009 integration tests.",
    );
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL must be a PostgreSQL URL for localhost:5432/prospecta_t009_test.",
    );
  }

  const usesPostgres =
    url.protocol === "postgres:" || url.protocol === "postgresql:";

  if (
    !usesPostgres ||
    url.hostname !== "localhost" ||
    url.port !== "5432" ||
    url.pathname !== "/prospecta_t009_test" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL must point to localhost:5432/prospecta_t009_test.",
    );
  }

  return rawValue;
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

async function resetSchema(): Promise<void> {
  await execute(rollbackSql);
  await execute(forwardSql);
  await execute(grantsSql);
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
): Promise<void> {
  await pool.query(
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

interface WorkspaceInput {
  readonly workspaceId?: string;
  readonly organizationId?: string;
  readonly cnpj?: string;
  readonly observedLeadRunId?: string;
  readonly commercialStage?: string;
  readonly nextAction?: string | null;
}

async function insertWorkspace(input: WorkspaceInput = {}): Promise<void> {
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

beforeEach(async () => {
  await resetSchema();
});

afterAll(async () => {
  try {
    await execute(rollbackSql);
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
    expect(grantsSql).not.toMatch(
      /GRANT\s+[^;]*(UPDATE|DELETE)[^;]*prospecting_app\.(import_submission_events|lead_activities|lead_notes|commercial_audit_events)/i,
    );
  });
});
