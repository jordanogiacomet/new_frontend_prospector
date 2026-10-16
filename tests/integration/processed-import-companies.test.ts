import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SqlStatement } from "../../src/server/db/producer-client";

const schema = "prospecta_processed_imports_synthetic";
const database = vi.hoisted(() => ({
  client: null as PoolClient | null,
  statements: [] as SqlStatement[],
}));

vi.mock("server-only", () => ({}));
vi.mock("../../src/server/db/producer-client", () => ({
  query: async <Row extends QueryResultRow>(statement: SqlStatement): Promise<Row[]> => {
    const client = database.client;
    if (client === null) throw new Error("Synthetic database is unavailable.");
    database.statements.push(statement);
    const result = await client.query<Row>(
      statement.text.replaceAll("public.company_", "prospecta_processed_imports_synthetic.company_"),
      [...statement.values],
    );
    return result.rows;
  },
}));

import { listProcessedImportCompanies } from "../../src/server/repositories/imports/processed-import-companies-repository";

const rawDatabaseUrl = process.env.PROSPECTA_PRODUCER_TEST_DATABASE_URL;
const describeWithDatabase = rawDatabaseUrl === undefined ? describe.skip : describe;
const databaseUrl = rawDatabaseUrl === undefined ? undefined : validateDatabaseUrl(rawDatabaseUrl);
const pool = databaseUrl === undefined ? null : new Pool({
  connectionString: databaseUrl,
  application_name: "prospecta-processed-import-companies-synthetic-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  allowExitOnIdle: true,
});
const batchId = "synthetic-processed-company-batch";
const processedAt = new Date("2026-09-01T12:00:00.000Z");
const validatedAt = new Date("2026-10-01T12:00:00.000Z");

interface CurrentFields {
  readonly cnpj: string | null;
  readonly cnpj_normalizado: string | null;
  readonly agent_version: string | null;
  readonly integrity_status: string | null;
  readonly last_lead_run_id: string | null;
  readonly last_import_batch_id: string | null;
  readonly last_source_row: number | string | null;
  readonly validated_at: Date | string | null;
}

interface RunFields {
  readonly import_batch_id: string | null;
  readonly lead_run_id: string | null;
  readonly source_row: number | string | null;
  readonly integrity_status: string | null;
  readonly processing_result: string | null;
  readonly cnpj_normalizado: string | null;
  readonly final_action: string | null;
  readonly run_created_at: Date | string | null;
  readonly test_case_id: string | null;
}

function validateDatabaseUrl(rawValue: string): string {
  const url = new URL(rawValue);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "localhost" ||
    url.port !== "55432" ||
    decodeURIComponent(url.pathname.slice(1)) !== "prospecta_t022_producer_test" ||
    url.search !== "" || url.hash !== ""
  ) {
    throw new Error("Processed-company tests require the approved local disposable PostgreSQL target.");
  }
  return rawValue;
}

async function query<Row extends QueryResultRow>(sql: string, values: readonly unknown[] = []): Promise<Row[]> {
  if (database.client === null) throw new Error("Synthetic database is unavailable.");
  const result = await database.client.query<Row>(sql, [...values]);
  return result.rows;
}

async function insertCompany(input: {
  readonly id?: number;
  readonly batchId?: string;
  readonly sourceRow?: number | string | null;
  readonly current?: Partial<CurrentFields>;
  readonly run?: Partial<RunFields>;
} = {}): Promise<void> {
  const id = input.id ?? 1;
  const sourceRow = input.sourceRow === undefined ? id : input.sourceRow;
  const importBatchId = input.batchId ?? batchId;
  const cnpj = String(id).padStart(14, "0");
  const leadRunId = `lr_${id.toString(16).padStart(8, "0")}`;
  const current: CurrentFields = {
    cnpj, cnpj_normalizado: cnpj, agent_version: "synthetic-agent-v1", integrity_status: "OK",
    last_lead_run_id: leadRunId, last_import_batch_id: importBatchId,
    last_source_row: sourceRow, validated_at: validatedAt,
    ...input.current,
  };
  const run: RunFields = {
    import_batch_id: importBatchId, lead_run_id: leadRunId, source_row: sourceRow,
    integrity_status: "OK", processing_result: "INSERIDO_VALIDATION", cnpj_normalizado: cnpj,
    final_action: "PROSPECTAR", run_created_at: processedAt, test_case_id: null,
    ...input.run,
  };
  await query(`INSERT INTO ${schema}.company_validations (
    id, cnpj, cnpj_normalizado, agent_version, integrity_status,
    last_lead_run_id, last_import_batch_id, last_source_row, validated_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
    id, current.cnpj, current.cnpj_normalizado, current.agent_version, current.integrity_status,
    current.last_lead_run_id, current.last_import_batch_id, current.last_source_row, current.validated_at,
  ]);
  await query(`INSERT INTO ${schema}.company_validation_runs (
    id, import_batch_id, lead_run_id, source_row, integrity_status, processing_result,
    cnpj_normalizado, final_action, run_created_at, test_case_id
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
    id, run.import_batch_id, run.lead_run_id, run.source_row, run.integrity_status,
    run.processing_result, run.cnpj_normalizado, run.final_action, run.run_created_at, run.test_case_id,
  ]);
}

function expectedCompany(sourceRow: number) {
  return { source_row: sourceRow, processedAt: processedAt.toISOString() };
}

async function expectEmpty(): Promise<void> {
  await expect(listProcessedImportCompanies({ importBatchId: batchId })).resolves.toMatchObject({
    companies: [], total: 0,
  });
}

beforeEach(async () => {
  if (pool === null) return;
  database.statements = [];
  database.client = await pool.connect();
  await query("BEGIN");
  await query(`CREATE SCHEMA ${schema};
    CREATE TABLE ${schema}.company_validations (
      id bigint PRIMARY KEY, cnpj text, cnpj_normalizado text, agent_version text,
      integrity_status text, last_lead_run_id text, last_import_batch_id text,
      last_source_row bigint, validated_at timestamptz
    );
    CREATE TABLE ${schema}.company_validation_runs (
      id bigint PRIMARY KEY, import_batch_id text, lead_run_id text, source_row bigint,
      integrity_status text, processing_result text, cnpj_normalizado text,
      final_action text, run_created_at timestamptz, test_case_id text
    );`);
});

afterEach(async () => {
  const client = database.client;
  database.client = null;
  if (client !== null) {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
});

afterAll(async () => { await pool?.end(); });

describeWithDatabase("synthetic processed import companies", () => {
  it("returns current validation and CRM results using producer run timestamps without acceptance facts", async () => {
    await insertCompany({ id: 1 });
    await insertCompany({ id: 2, run: { processing_result: "CRM_DECIDIU_E_SALVO", final_action: "NUTRIR" } });
    const result = await listProcessedImportCompanies({ importBatchId: batchId });
    expect(result).toMatchObject({ companies: [expectedCompany(1), expectedCompany(2)], total: 2 });
    expect(database.statements.map((statement) => statement.text).join("\n"))
      .not.toMatch(/prospecta_import_acceptances|lead_import_batches|import_submissions/);
  });

  it.each([
    "RECEBIDO", "CRM_DECIDIU", "BLOQUEADO_PRE_VALIDACAO", "USOU_CACHE", "ERROR", "RUN_STARTED",
  ])("does not treat %s as a processed company", async (processingResult) => {
    await insertCompany({ run: { processing_result: processingResult } });
    await expectEmpty();
  });

  it("does not infer a processed result from a projection with no retained run", async () => {
    await insertCompany();
    await query(`DELETE FROM ${schema}.company_validation_runs`);
    await expectEmpty();
  });

  it.each([
    { label: "projection integrity", current: { integrity_status: "CORRUPT" } },
    { label: "run integrity", run: { integrity_status: "CORRUPT" } },
    { label: "formatted current CNPJ", current: { cnpj: "00.000.000/0000-01" } },
    { label: "invalid normalized CNPJ", current: { cnpj_normalizado: "invalid" } },
    { label: "different run CNPJ", run: { cnpj_normalizado: "00000000000002" } },
    { label: "blank agent version", current: { agent_version: "   " } },
    { label: "replaced current run", current: { last_lead_run_id: "lr_ffffffff" } },
    { label: "mismatched current batch", current: { last_import_batch_id: "synthetic-other-batch" } },
    { label: "mismatched current source row", current: { last_source_row: 2 } },
    { label: "invalid run ID", current: { last_lead_run_id: "invalid-run" }, run: { lead_run_id: "invalid-run" } },
    { label: "blank final action", run: { final_action: "   " } },
    { label: "null final action", run: { final_action: null } },
    { label: "future projection timestamp", current: { validated_at: "2099-01-01T00:00:00Z" } },
    { label: "future run timestamp", run: { run_created_at: "2099-01-01T00:00:00Z" } },
    { label: "null projection timestamp", current: { validated_at: null } },
    { label: "null run timestamp", run: { run_created_at: null } },
  ])("withholds $label", async ({ current, run }) => {
    await insertCompany({ current, run });
    await expectEmpty();
  });

  it.each([0, -1, "9007199254740992", null])("rejects unsafe source row %s", async (sourceRow) => {
    await insertCompany({ sourceRow });
    await expectEmpty();
  });

  it("accepts the largest safe source row without rounding its identity", async () => {
    await insertCompany({ sourceRow: Number.MAX_SAFE_INTEGER });
    await expect(listProcessedImportCompanies({ importBatchId: batchId })).resolves.toMatchObject({
      companies: [expectedCompany(Number.MAX_SAFE_INTEGER)], total: 1,
    });
  });

  it("withholds explicit test runs unless their batch is approved by visibility policy", async () => {
    await insertCompany({ run: { test_case_id: "synthetic-private-test" } });
    await expectEmpty();
    await expect(listProcessedImportCompanies({ importBatchId: batchId }, {
      includeTestRunsFromImportBatchIds: ["synthetic-other-batch"],
    })).resolves.toMatchObject({ companies: [], total: 0 });
    await expect(listProcessedImportCompanies({ importBatchId: batchId }, {
      includeTestRunsFromImportBatchIds: [batchId],
    })).resolves.toMatchObject({ companies: [expectedCompany(1)], total: 1 });
  });

  it("permits the approved source-row marker and explicit Demo 2 visibility", async () => {
    await insertCompany({ id: 1, run: { test_case_id: "SR_1" } });
    await insertCompany({ id: 2, run: { test_case_id: "synthetic-demo2-test" } });
    await expect(listProcessedImportCompanies({ importBatchId: batchId })).resolves.toMatchObject({
      companies: [expectedCompany(1)], total: 1,
    });
    await expect(listProcessedImportCompanies({ importBatchId: batchId }, { includeDemo2TestRuns: true }))
      .resolves.toMatchObject({ companies: [expectedCompany(1), expectedCompany(2)], total: 2 });
  });

  it("fails closed when a current projection has two approved terminal results", async () => {
    await insertCompany();
    await query(`INSERT INTO ${schema}.company_validation_runs
      SELECT id + 10000, import_batch_id, lead_run_id, source_row, integrity_status,
        'CRM_DECIDIU_E_SALVO', cnpj_normalizado, final_action, run_created_at, test_case_id
      FROM ${schema}.company_validation_runs`);
    await expectEmpty();
  });

  it("fails closed when two company identities claim the same batch row", async () => {
    await insertCompany({ id: 1, sourceRow: 1 });
    await insertCompany({ id: 2, sourceRow: 1 });
    await expectEmpty();
  });

  it("keeps a row ambiguous when one of its competing companies also has duplicate terminals", async () => {
    await insertCompany({ id: 1, sourceRow: 1 });
    await insertCompany({ id: 2, sourceRow: 1 });
    await query(`INSERT INTO ${schema}.company_validation_runs
      SELECT id + 10000, import_batch_id, lead_run_id, source_row, integrity_status,
        'CRM_DECIDIU_E_SALVO', cnpj_normalizado, final_action, run_created_at, test_case_id
      FROM ${schema}.company_validation_runs WHERE id = $1`, [1]);
    await expectEmpty();
  });

  it("keeps ambiguity scoped to a row and does not hide another independently processed row", async () => {
    await insertCompany({ id: 1, sourceRow: 1 });
    await insertCompany({ id: 2, sourceRow: 1 });
    await insertCompany({ id: 3, sourceRow: 2 });
    await expect(listProcessedImportCompanies({ importBatchId: batchId })).resolves.toMatchObject({
      companies: [expectedCompany(2)], total: 1,
    });
  });

  it("paginates in source-row order and does not combine another batch with the same row number", async () => {
    await insertCompany({ id: 1, sourceRow: 3 });
    await insertCompany({ id: 2, sourceRow: 1 });
    await insertCompany({ id: 3, sourceRow: 2 });
    await insertCompany({ id: 4, sourceRow: 1, batchId: "synthetic-other-batch" });
    await expect(listProcessedImportCompanies({ importBatchId: batchId, page: 1, pageSize: 2 })).resolves.toEqual({
      companies: [expectedCompany(1), expectedCompany(2)], page: 1, pageSize: 2, total: 3,
    });
    await expect(listProcessedImportCompanies({ importBatchId: batchId, page: 2, pageSize: 2 })).resolves.toEqual({
      companies: [expectedCompany(3)], page: 2, pageSize: 2, total: 3,
    });
    await expect(listProcessedImportCompanies({ importBatchId: "synthetic-other-batch", page: 1, pageSize: 2 })).resolves.toEqual({
      companies: [expectedCompany(1)], page: 1, pageSize: 2, total: 1,
    });
  });

  it("returns an honest empty page when no processed result is available", async () => {
    await expect(listProcessedImportCompanies({ importBatchId: batchId, page: 1, pageSize: 20 })).resolves.toEqual({
      companies: [], page: 1, pageSize: 20, total: 0,
    });
  });

  it("fails before count/data work when the unfiltered source contains 1001 current projections", async () => {
    await query(`INSERT INTO ${schema}.company_validations (id, cnpj)
      SELECT number, lpad(number::text, 14, '0') FROM generate_series(1, 1001) AS number`);
    await expect(listProcessedImportCompanies({ importBatchId: batchId })).rejects.toMatchObject({
      code: "DATA_SOURCE_UNAVAILABLE",
    });
    expect(database.statements).toHaveLength(1);
  });
});
