import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppDatabaseTransaction, SqlStatement } from "../../src/server/db/app-client";

const schema = "prospecta_import_receipts_t019";
const database = vi.hoisted(() => ({ client: null as PoolClient | null }));

vi.mock("server-only", () => ({}));
vi.mock("../../src/server/db/app-client", () => ({
  query: async <Row extends QueryResultRow>(statement: SqlStatement): Promise<Row[]> => {
    const client = database.client;
    if (client === null) throw new Error("Synthetic database is unavailable.");
    const result = await client.query<Row>(
      statement.text.replaceAll("prospecting_app.", "prospecta_import_receipts_t019."),
      [...statement.values],
    );
    return result.rows;
  },
  transaction: async <Result,>(callback: (client: AppDatabaseTransaction) => Promise<Result>): Promise<Result> => {
    const client = database.client;
    if (client === null) throw new Error("Synthetic database is unavailable.");
    await client.query("SAVEPOINT writer_call");
    try {
      const result = await callback({
        query: async <Row extends QueryResultRow>(statement: SqlStatement): Promise<Row[]> => {
          const result = await client.query<Row>(
            statement.text.replaceAll("prospecting_app.", "prospecta_import_receipts_t019."),
            [...statement.values],
          );
          return result.rows;
        },
      });
      await client.query("RELEASE SAVEPOINT writer_call");
      return result;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT writer_call");
      await client.query("RELEASE SAVEPOINT writer_call");
      throw error;
    }
  },
}));

import { recordLegacyWorkflowStart } from "../../src/server/repositories/imports/legacy-workflow-start-repository";
import { listImportReceivedCompanies } from "../../src/server/repositories/imports/import-received-companies-repository";

const rawDatabaseUrl = process.env.PROSPECTA_APP_TEST_DATABASE_URL;
const describeWithDatabase = rawDatabaseUrl === undefined ? describe.skip : describe;
const databaseUrl = rawDatabaseUrl === undefined ? undefined : validateDatabaseUrl(rawDatabaseUrl);
const pool = databaseUrl === undefined ? null : new Pool({
  connectionString: databaseUrl,
  application_name: "prospecta-import-receipts-synthetic-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  allowExitOnIdle: true,
});
const organizationId = "org-receipt-synthetic-a";
const submissionId = "00000000-0000-4000-8000-000000001901";
const importBatchId = "synthetic-receipt-batch-019";
const receivedAt = new Date("2026-10-14T12:00:00.000Z");

function validateDatabaseUrl(rawValue: string): string {
  const url = new URL(rawValue);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "localhost" ||
    !["5432", "55432"].includes(url.port) ||
    decodeURIComponent(url.pathname.slice(1)) !== "prospecta_t009_test" ||
    url.search !== "" || url.hash !== ""
  ) {
    throw new Error("Receipt tests require the approved local disposable PostgreSQL target.");
  }
  return rawValue;
}

function readSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/app", filename), "utf8")
    .replaceAll("prospecting_app", schema);
}

async function query<Row extends QueryResultRow>(sql: string, values: readonly unknown[] = []): Promise<Row[]> {
  if (database.client === null) throw new Error("Synthetic database is unavailable.");
  const result = await database.client.query<Row>(sql, [...values]);
  return result.rows;
}

async function expectDatabaseFailure(sql: string, values: readonly unknown[], code: string): Promise<void> {
  await query("SAVEPOINT expected_failure");
  try {
    await expect(query(sql, values)).rejects.toMatchObject({ code });
  } finally {
    await query("ROLLBACK TO SAVEPOINT expected_failure");
    await query("RELEASE SAVEPOINT expected_failure");
  }
}

beforeEach(async () => {
  if (pool === null) return;
  database.client = await pool.connect();
  await query("BEGIN");
  await query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN CREATE ROLE prospecta_app_rw NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; END IF; END $$");
  await query(readSql("001_app_schema_forward.sql"));
  await query(readSql("008_legacy_workflow_start_report_forward.sql"));
  await query(readSql("019_import_received_companies_forward.sql"));
  await query(readSql("003_app_schema_grants.sql"));
  await query(`INSERT INTO ${schema}.import_submissions (
    submission_id, organization_id, created_by_subject, original_filename,
    file_sha256, file_size_bytes, content_type, idempotency_key, app_contract_version,
    status, producer_acknowledged_at, producer_import_batch_id, acknowledged_row_count
  ) VALUES ($1, $2, 'synthetic-actor', 'synthetic.csv', $3, 64, 'text/csv',
    'synthetic-receipt-key', 'prospecta-import-v1', 'PRODUCER_ACKNOWLEDGED', $4, $5, 2)`,
  [submissionId, organizationId, "a".repeat(64), receivedAt, importBatchId]);
});

afterEach(async () => {
  const client = database.client;
  database.client = null;
  if (client !== null) {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
});

afterAll(async () => { await pool?.end(); });

describeWithDatabase("synthetic app-owned import receipts", () => {
  it("records each source row once and retains its first timestamp across callback replay", async () => {
    await query("SET LOCAL ROLE prospecta_app_rw");
    const input = { organizationId, importBatchId, occurredAt: receivedAt, sourceRow: 1 };
    await expect(recordLegacyWorkflowStart(input)).resolves.toEqual({ kind: "recorded", submissionCount: 1 });
    await expect(recordLegacyWorkflowStart({ ...input, occurredAt: new Date("2026-10-14T12:01:00.000Z") }))
      .resolves.toEqual({ kind: "replayed", submissionCount: 1 });
    await expect(recordLegacyWorkflowStart({ ...input, sourceRow: 2 }))
      .resolves.toEqual({ kind: "recorded", submissionCount: 1 });
    expect(await query(`SELECT source_row, received_at FROM ${schema}.import_received_companies ORDER BY source_row`))
      .toEqual([{ source_row: "1", received_at: receivedAt }, { source_row: "2", received_at: receivedAt }]);
    expect(await query(`SELECT count(*)::integer AS count FROM ${schema}.import_submission_events`))
      .toEqual([{ count: 1 }]);
  });

  it("retains the legacy start-only behavior when no source row is supplied", async () => {
    await expect(recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: null }))
      .resolves.toEqual({ kind: "recorded", submissionCount: 1 });
    expect(await query(`SELECT count(*)::integer AS count FROM ${schema}.import_received_companies`))
      .toEqual([{ count: 0 }]);
  });

  it("reads only the scoped submission and paginates factual receipts in source-row order", async () => {
    await recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: 2 });
    await recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: 1 });
    await query("SET LOCAL ROLE prospecta_app_rw");
    const input = { organizationId, submissionId, page: 1, pageSize: 1 };
    await expect(listImportReceivedCompanies(input)).resolves.toEqual({
      companies: [{ source_row: 1, receivedAt: receivedAt.toISOString() }],
      page: 1, pageSize: 1, total: 2,
    });
    await expect(listImportReceivedCompanies({ ...input, page: 2 })).resolves.toEqual({
      companies: [{ source_row: 2, receivedAt: receivedAt.toISOString() }],
      page: 2, pageSize: 1, total: 2,
    });
    for (const scope of [
      { organizationId: "org-receipt-synthetic-b", submissionId },
      { organizationId, submissionId: "00000000-0000-4000-8000-000000001902" },
    ]) {
      await expect(listImportReceivedCompanies({ ...input, ...scope })).resolves.toEqual({
        companies: [], page: 1, pageSize: 1, total: 0,
      });
    }
  });

  it("denies another organization in both the writer and composite foreign key", async () => {
    await expect(recordLegacyWorkflowStart({ organizationId: "org-receipt-synthetic-b", importBatchId, occurredAt: receivedAt, sourceRow: 1 }))
      .resolves.toMatchObject({ kind: "not_found" });
    await expectDatabaseFailure(`INSERT INTO ${schema}.import_received_companies (organization_id, submission_id, source_row) VALUES ($1, $2, 1)`,
      ["org-receipt-synthetic-b", submissionId], "23503");
    expect(await query(`SELECT count(*)::integer AS count FROM ${schema}.import_received_companies`))
      .toEqual([{ count: 0 }]);
  });

  it("rolls back the start event if storing its received-row fact fails", async () => {
    await query(`REVOKE INSERT ON TABLE ${schema}.import_received_companies FROM prospecta_app_rw`);
    await query("SET LOCAL ROLE prospecta_app_rw");
    await expect(recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: 1 }))
      .rejects.toMatchObject({ code: "42501" });
    expect(await query(`SELECT count(*)::integer AS count FROM ${schema}.import_submission_events`))
      .toEqual([{ count: 0 }]);
  });

  it("enforces positive safe source rows and prevents removing their parent submission", async () => {
    for (const sourceRow of ["0", "-1", "9007199254740992"]) {
      await expectDatabaseFailure(`INSERT INTO ${schema}.import_received_companies (organization_id, submission_id, source_row) VALUES ($1, $2, $3)`,
        [organizationId, submissionId, sourceRow], "23514");
    }
    await recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: Number.MAX_SAFE_INTEGER });
    await expectDatabaseFailure(`DELETE FROM ${schema}.import_submissions WHERE submission_id = $1`, [submissionId], "23503");
  });

  it("denies runtime UPDATE, DELETE and TRUNCATE and blocks owner edits through the trigger", async () => {
    await recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: 1 });
    await query("SET LOCAL ROLE prospecta_app_rw");
    for (const sql of [
      `UPDATE ${schema}.import_received_companies SET source_row = 2`,
      `DELETE FROM ${schema}.import_received_companies`,
      `TRUNCATE ${schema}.import_received_companies`,
    ]) await expectDatabaseFailure(sql, [], "42501");
    await query("RESET ROLE");
    await expectDatabaseFailure(`UPDATE ${schema}.import_received_companies SET source_row = 2`, [], "42501");
    await expectDatabaseFailure(`DELETE FROM ${schema}.import_received_companies`, [], "42501");
  });

  it("reapplies migrations and grants without changing retained receipts or expanding runtime access", async () => {
    await recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: 1 });
    await query(readSql("019_import_received_companies_forward.sql"));
    await query(`GRANT UPDATE, DELETE, TRUNCATE ON TABLE ${schema}.import_received_companies TO prospecta_app_rw`);
    await query(readSql("003_app_schema_grants.sql"));
    expect(await query(`SELECT
      has_table_privilege('prospecta_app_rw', '${schema}.import_received_companies', 'SELECT') AS can_select,
      has_table_privilege('prospecta_app_rw', '${schema}.import_received_companies', 'INSERT') AS can_insert,
      has_table_privilege('prospecta_app_rw', '${schema}.import_received_companies', 'UPDATE') AS can_update,
      has_table_privilege('prospecta_app_rw', '${schema}.import_received_companies', 'DELETE') AS can_delete,
      has_table_privilege('prospecta_app_rw', '${schema}.import_received_companies', 'TRUNCATE') AS can_truncate`))
      .toEqual([{ can_select: true, can_insert: true, can_update: false, can_delete: false, can_truncate: false }]);
    expect(await query(`SELECT source_row FROM ${schema}.import_received_companies`)).toEqual([{ source_row: "1" }]);
  });

  it("refuses populated rollback and permits rollback only before any receipt exists", async () => {
    await query("SAVEPOINT receipt");
    await recordLegacyWorkflowStart({ organizationId, importBatchId, occurredAt: receivedAt, sourceRow: 1 });
    await expectDatabaseFailure(readSql("019_import_received_companies_rollback.sql"), [], "P0001");
    expect(await query(`SELECT count(*)::integer AS count FROM ${schema}.import_received_companies`)).toEqual([{ count: 1 }]);
    await query("ROLLBACK TO SAVEPOINT receipt");
    await query(readSql("019_import_received_companies_rollback.sql"));
    expect(await query("SELECT to_regclass($1) AS receipt_table", [`${schema}.import_received_companies`])).toEqual([{ receipt_table: null }]);
  });
});
