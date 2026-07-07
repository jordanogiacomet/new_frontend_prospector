import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockedEnv = vi.hoisted(() => ({
  producerDatabaseUrl: "",
}));

vi.mock("../../src/server/env", () => ({
  getServerEnv: () => ({
    PRODUCER_DATABASE_URL: mockedEnv.producerDatabaseUrl,
  }),
}));

const producerReadRole = "prospecta_t022_producer_read";
const producerReadPassword = "prospecta-t022-producer-read-synthetic-password";
const forwardSql = readSql("001_batch_observation_source.sql");
const rollbackSql = readSql("002_batch_observation_source_rollback.sql");
const importBatchId = `ib_${"1".repeat(64)}`;
const rawDisposableDatabaseUrl = process.env.PROSPECTA_PRODUCER_TEST_DATABASE_URL;
const describeIfProducerDatabase =
  rawDisposableDatabaseUrl === undefined ? describe.skip : describe;

type ProducerBatchObservationRepository = typeof import("../../src/server/repositories/imports/producer-batch-observations-repository");

let ownerPool: Pool | null = null;
let repository: ProducerBatchObservationRepository | null = null;

function readSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/producer", filename), "utf8");
}

function validateDisposableDatabaseUrl(rawValue: string): string {
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(
      "PROSPECTA_PRODUCER_TEST_DATABASE_URL must be an approved local disposable PostgreSQL URL.",
    );
  }

  const usesPostgres =
    url.protocol === "postgres:" || url.protocol === "postgresql:";
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const isApprovedTarget =
    url.hostname === "localhost" &&
    (url.port === "5432" || url.port === "55432") &&
    databaseName === "prospecta_t022_producer_test";

  if (
    !usesPostgres ||
    !isApprovedTarget ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "PROSPECTA_PRODUCER_TEST_DATABASE_URL must point to localhost:5432 or localhost:55432 prospecta_t022_producer_test.",
    );
  }

  return rawValue;
}

function disposableDatabaseUrl(): string {
  if (rawDisposableDatabaseUrl === undefined) {
    throw new Error("PROSPECTA_PRODUCER_TEST_DATABASE_URL is required.");
  }

  return validateDisposableDatabaseUrl(rawDisposableDatabaseUrl);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function connectionStringForRole(roleName: string, password: string): string {
  const url = new URL(disposableDatabaseUrl());
  url.username = roleName;
  url.password = password;

  return url.toString();
}

async function pool(): Promise<Pool> {
  if (ownerPool === null) {
    ownerPool = new Pool({
      connectionString: disposableDatabaseUrl(),
      application_name: "prospecta-t022-producer-integration-test",
      max: 1,
      connectionTimeoutMillis: 1_000,
      statement_timeout: 5_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 5_000,
      allowExitOnIdle: true,
    });
  }

  return ownerPool;
}

async function execute(sql: string, values: readonly unknown[] = []): Promise<void> {
  await (await pool()).query(sql, [...values]);
}

async function queryRows<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await (await pool()).query<Row>(text, [...values]);

  return result.rows;
}

async function setupProducerSource(): Promise<void> {
  await execute(rollbackSql);
  await dropReadRole();
  await createStructuredProducerFixtures();
  await execute(forwardSql);
  await execute(`
    CREATE ROLE ${quoteIdentifier(producerReadRole)}
      LOGIN
      PASSWORD '${producerReadPassword}'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      INHERIT;

    GRANT CONNECT ON DATABASE ${quoteIdentifier(new URL(disposableDatabaseUrl()).pathname.slice(1))}
      TO ${quoteIdentifier(producerReadRole)};
    GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(producerReadRole)};
    GRANT SELECT ON public.prospecta_import_batch_observations_v1
      TO ${quoteIdentifier(producerReadRole)};
  `);
}

async function resetProducerSourceRows(): Promise<void> {
  await execute(forwardSql);
  await execute(`
    GRANT SELECT ON public.prospecta_import_batch_observations_v1
      TO ${quoteIdentifier(producerReadRole)};
  `);
  await execute(`
    TRUNCATE
      public.company_validation_runs,
      public.lead_decisions,
      public.lead_processing_state,
      public.lead_input_rows,
      public.lead_import_batches
    RESTART IDENTITY
  `);
}

async function cleanupProducerSource(): Promise<void> {
  await terminateReadRoleConnections();
  await execute(rollbackSql);
  await dropReadRole();
  await dropStructuredProducerFixtures();
}

async function terminateReadRoleConnections(): Promise<void> {
  await execute(
    `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND usename = $1
        AND pid <> pg_backend_pid()
    `,
    [producerReadRole],
  );
}

async function dropReadRole(): Promise<void> {
  await execute(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${producerReadRole}') THEN
        EXECUTE 'DROP OWNED BY ${producerReadRole}';
        EXECUTE 'DROP ROLE ${producerReadRole}';
      END IF;
    END $$;
  `);
}

async function createStructuredProducerFixtures(): Promise<void> {
  await dropStructuredProducerFixtures();
  await execute(`
    CREATE TYPE public.lead_processing_status AS ENUM (
      'RECEIVED',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'RETRYABLE',
      'DEAD_LETTER',
      'SKIPPED'
    );

    CREATE TABLE public.lead_import_batches (
      import_batch_id text PRIMARY KEY,
      import_manifest jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE public.lead_input_rows (
      input_row_id text PRIMARY KEY,
      import_batch_id text NOT NULL,
      source_row integer NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.lead_processing_state (
      idempotency_key text PRIMARY KEY,
      lead_run_id text NOT NULL,
      import_batch_id text,
      source_row integer,
      status public.lead_processing_status NOT NULL,
      last_stage text,
      completed_at timestamptz,
      failed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.lead_decisions (
      decision_id text PRIMARY KEY,
      idempotency_key text NOT NULL,
      lead_run_id text NOT NULL,
      import_batch_id text NOT NULL,
      source_row integer NOT NULL,
      decision_status text NOT NULL DEFAULT 'COMPLETED',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.company_validation_runs (
      id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      import_batch_id text,
      source_row integer,
      created_at timestamptz DEFAULT now(),
      run_created_at timestamptz NOT NULL DEFAULT now(),
      lead_run_id text
    );
  `);
}

async function dropStructuredProducerFixtures(): Promise<void> {
  await execute(`
    DROP TABLE IF EXISTS public.company_validation_runs;
    DROP TABLE IF EXISTS public.lead_decisions;
    DROP TABLE IF EXISTS public.lead_processing_state;
    DROP TABLE IF EXISTS public.lead_input_rows;
    DROP TABLE IF EXISTS public.lead_import_batches;
    DROP TYPE IF EXISTS public.lead_processing_status;
  `);
}

async function insertImportBatch(input: {
  readonly batchId?: string;
  readonly closedAt?: string | null;
} = {}): Promise<void> {
  const manifest =
    input.closedAt === undefined || input.closedAt === null
      ? {}
      : {
          prospecta_batch_closed: "true",
          prospecta_batch_closed_at: input.closedAt,
        };

  await execute(
    `
      INSERT INTO public.lead_import_batches (
        import_batch_id,
        import_manifest
      )
      VALUES ($1, $2)
      ON CONFLICT (import_batch_id) DO UPDATE
      SET import_manifest = EXCLUDED.import_manifest
    `,
    [input.batchId ?? importBatchId, manifest],
  );
}

async function insertAcceptedRow(input: {
  readonly batchId?: string;
  readonly sourceRow?: number | null;
  readonly observedAt?: string;
} = {}): Promise<void> {
  await insertImportBatch({ batchId: input.batchId });
  await execute(
    `
      INSERT INTO public.lead_input_rows (
        input_row_id,
        import_batch_id,
        source_row,
        first_seen_at
      )
      VALUES ($1, $2, $3, $4::timestamptz)
    `,
    [
      `row_${String(input.sourceRow ?? 1).padStart(64, "0")}`,
      input.batchId ?? importBatchId,
      input.sourceRow ?? 1,
      input.observedAt ?? "2026-07-07T12:02:00.000Z",
    ],
  );
}

async function insertDecision(input: {
  readonly batchId?: string;
  readonly sourceRow?: number;
  readonly leadRunId?: string;
  readonly observedAt?: string;
} = {}): Promise<void> {
  await insertImportBatch({ batchId: input.batchId });
  await execute(
    `
      INSERT INTO public.lead_decisions (
        decision_id,
        idempotency_key,
        lead_run_id,
        import_batch_id,
        source_row,
        decision_status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6::timestamptz)
    `,
    [
      `dec_${String(input.sourceRow ?? 1).padStart(64, "0")}`,
      `idem_${String(input.sourceRow ?? 1).padStart(64, "1")}`,
      input.leadRunId ?? "lead-run-1",
      input.batchId ?? importBatchId,
      input.sourceRow ?? 1,
      input.observedAt ?? "2026-07-07T12:02:00.000Z",
    ],
  );
}

async function insertLegacyObservation(input: {
  readonly batchId?: string;
  readonly sourceRow?: number;
  readonly leadRunId?: string;
  readonly observedAt?: string;
} = {}): Promise<void> {
  await execute(
    `
      INSERT INTO public.company_validation_runs (
        import_batch_id,
        source_row,
        lead_run_id,
        run_created_at
      )
      VALUES ($1, $2, $3, $4::timestamptz)
    `,
    [
      input.batchId ?? importBatchId,
      input.sourceRow ?? 9,
      input.leadRunId ?? "legacy-run-9",
      input.observedAt ?? "2026-07-07T12:02:00.000Z",
    ],
  );
}

async function loadRepository(): Promise<ProducerBatchObservationRepository> {
  if (repository === null) {
    mockedEnv.producerDatabaseUrl = connectionStringForRole(
      producerReadRole,
      producerReadPassword,
    );
    repository = await import(
      "../../src/server/repositories/imports/producer-batch-observations-repository"
    );
  }

  return repository;
}

describeIfProducerDatabase("producer batch observation repository integration", () => {
  beforeAll(async () => {
    await setupProducerSource();
    await loadRepository();
  });

  beforeEach(async () => {
    await resetProducerSourceRows();
  });

  afterAll(async () => {
    try {
      await cleanupProducerSource();
    } finally {
      await ownerPool?.end();
    }
  });

  it("reads approved observations through the producer read role", async () => {
    await insertAcceptedRow({ sourceRow: 1 });
    await insertDecision({ sourceRow: 1, leadRunId: "lead-run-1" });
    await insertImportBatch({
      closedAt: "2026-07-07T12:04:00.000Z",
    });

    const result = await (await loadRepository()).readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result).toMatchObject({
      availability: "AVAILABLE",
      acceptedRows: [{ sourceRow: 1 }],
      terminalOutcomes: [
        {
          sourceRow: 1,
          terminalClass: "MATERIALIZED",
          leadRunId: "lead-run-1",
        },
      ],
      close: {
        closedAt: new Date("2026-07-07T12:04:00.000Z"),
      },
    });
  });

  it("does not allow the producer read role to mutate the source tables", async () => {
    const readRolePool = new Pool({
      connectionString: connectionStringForRole(
        producerReadRole,
        producerReadPassword,
      ),
      application_name: "prospecta-t022-producer-read-role-check",
      max: 1,
      allowExitOnIdle: true,
    });

    try {
      await expect(
        readRolePool.query(
          `
            INSERT INTO public.lead_input_rows (
              input_row_id,
              import_batch_id,
              source_row
            )
            VALUES ('row_${"2".repeat(64)}', $1, 1)
          `,
          [importBatchId],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await readRolePool.end();
    }
  });

  it("returns unavailable when the approved source view is missing", async () => {
    await execute("DROP VIEW public.prospecta_import_batch_observations_v1");

    const result = await (await loadRepository()).readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result).toMatchObject({
      availability: "UNAVAILABLE",
      unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
      acceptedRows: [],
      terminalOutcomes: [],
      close: null,
    });
  });

  it("keeps legacy observations separate from accepted rows", async () => {
    await insertLegacyObservation({
      sourceRow: 9,
      leadRunId: "legacy-run-9",
    });

    const result = await (await loadRepository()).readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.acceptedRows).toEqual([]);
    expect(result.terminalOutcomes).toEqual([]);
    expect(result.close).toBeNull();
    expect(result.retainedLegacyObservations).toEqual([
      {
        factSource: "producer_retained_legacy_observations_v1",
        sourceRow: 9,
        leadRunId: "legacy-run-9",
        observedAt: new Date("2026-07-07T12:02:00.000Z"),
      },
    ]);
  });

  it("confirms the disposable source objects exist", async () => {
    const rows = await queryRows<{ view_exists: boolean; table_exists: boolean }>(
      `
        SELECT
          to_regclass('public.prospecta_import_batch_observations_v1') IS NOT NULL AS view_exists,
          to_regclass('public.lead_input_rows') IS NOT NULL AS table_exists
      `,
    );

    expect(rows[0]).toEqual({
      view_exists: true,
      table_exists: true,
    });
  });
});
