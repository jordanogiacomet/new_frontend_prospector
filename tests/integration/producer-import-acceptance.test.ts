import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type QueryResultRow } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const producerReadRole = "prospecta_acceptance_read";
const producerReadPassword = "prospecta-acceptance-read-synthetic-password";
const rawDisposableDatabaseUrl = process.env.PROSPECTA_PRODUCER_TEST_DATABASE_URL;
const describeIfProducerDatabase =
  rawDisposableDatabaseUrl === undefined ? describe.skip : describe;
const forwardSql = readSql("003_import_acceptance.sql");
const rollbackSql = readSql("004_import_acceptance_rollback.sql");
const closeForwardSql = readSql("005_import_batch_close.sql");
const closeRollbackSql = readSql("006_import_batch_close_rollback.sql");
const firstSubmissionId = "00000000-0000-4000-8000-000000000301";
const secondSubmissionId = "00000000-0000-4000-8000-000000000302";

interface AcceptanceResultRow {
  readonly result: {
    readonly accepted: boolean;
    readonly accepted_at: string;
    readonly import_batch_id: string;
    readonly replayed: boolean;
    readonly row_count: number;
  };
}

interface CountRow {
  readonly total: number;
}

interface AcceptanceViewRow {
  readonly submission_id: string;
  readonly import_batch_id: string;
  readonly uploaded_file_sha256: string;
  readonly accepted_row_count: number;
  readonly accepted_at: Date;
}

interface CloseResultRow {
  readonly result: {
    readonly closed: boolean;
    readonly import_batch_id: string;
    readonly close_reason: string;
    readonly contract_version: string;
    readonly closed_at: string;
    readonly replayed: boolean;
  };
}

interface ExplainPlanRow {
  readonly "QUERY PLAN": readonly [
    {
      readonly Plan: {
        readonly "Actual Rows": number;
        readonly "Total Cost": number;
      };
    },
  ];
}

let ownerPool: Pool | null = null;

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

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const isApprovedTarget =
    (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
    url.hostname === "localhost" &&
    (url.port === "5432" || url.port === "55432") &&
    databaseName === "prospecta_t022_producer_test" &&
    url.search === "" &&
    url.hash === "";

  if (!isApprovedTarget) {
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
      application_name: "prospecta-import-acceptance-integration-test",
      max: 4,
      connectionTimeoutMillis: 1_000,
      statement_timeout: 5_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 5_000,
      allowExitOnIdle: true,
    });
  }

  return ownerPool;
}

async function execute(
  sql: string,
  values: readonly unknown[] = [],
): Promise<void> {
  await (await pool()).query(sql, [...values]);
}

async function queryRows<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await (await pool()).query<Row>(text, [...values]);
  return result.rows;
}

function acceptancePayload(input: {
  readonly submissionId?: string;
  readonly fileSha256?: string;
  readonly idempotencyKey?: string;
  readonly rows?: readonly Record<string, unknown>[];
} = {}): Record<string, unknown> {
  const rows = input.rows ?? [
    syntheticRow(2, "1"),
    syntheticRow(3, "2"),
  ];

  return {
    submission_id: input.submissionId ?? firstSubmissionId,
    idempotency_key: input.idempotencyKey ?? "synthetic-upload-key-301",
    file_sha256: input.fileSha256 ?? "a".repeat(64),
    contract_version: "prospecta-import-v1",
    workflow_version: "prospecta-import-v1",
    ruleset_version: "empresaqui-normalization-v1",
    prompt_model_version: "producer-worker-v1",
    execution_mode: "SYNTHETIC_TEST",
    raw_rows_sha256: "b".repeat(64),
    header_sha256: "c".repeat(64),
    import_manifest: {
      original_filename: "synthetic-companies.csv",
      file_size_bytes: 256,
      file_mime_type: "text/csv",
      delimiter: ";",
      encoding: "utf8",
      row_count: rows.length,
    },
    rows,
  };
}

function syntheticRow(
  sourceRow: number,
  hashDigit: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source_row: sourceRow,
    raw_row_sha256: hashDigit.repeat(64),
    normalized_row_sha256: hashDigit.repeat(64),
    cnpj_normalizado: `${sourceRow}`.padStart(14, "0"),
    raw_row: {
      CNPJ: `${sourceRow}`.padStart(14, "0"),
      Razão: `Empresa Sintética ${sourceRow}`,
    },
    normalized_payload: {
      company: {
        cnpj: `${sourceRow}`.padStart(14, "0"),
        razaoSocial: `Empresa Sintética ${sourceRow}`,
      },
    },
    ...overrides,
  };
}

async function accept(
  payload: Record<string, unknown>,
): Promise<AcceptanceResultRow["result"]> {
  const [row] = await queryRows<AcceptanceResultRow>(
    `
      SELECT public.prospecta_accept_empresaqui_batch_v1($1::jsonb) AS result
    `,
    [payload],
  );

  if (row === undefined) {
    throw new Error("Acceptance function returned no row.");
  }

  return row.result;
}

async function closeBatch(
  payload: Record<string, unknown>,
): Promise<CloseResultRow["result"]> {
  const [row] = await queryRows<CloseResultRow>(
    `
      SELECT public.prospecta_close_empresaqui_batch_v1($1::jsonb) AS result
    `,
    [payload],
  );

  if (row === undefined) {
    throw new Error("Close function returned no row.");
  }

  return row.result;
}

async function setupProducerAcceptance(): Promise<void> {
  await dropAcceptanceObjectsForTest();
  await dropReadRole();
  await createProducerFixtures();
  await execute(forwardSql);
  await execute(closeForwardSql);
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
    GRANT SELECT ON public.prospecta_import_acceptances_v1
      TO ${quoteIdentifier(producerReadRole)};
  `);
}

async function resetProducerAcceptance(): Promise<void> {
  await execute(`
    TRUNCATE
      public.prospecta_import_acceptances,
      public.lead_processing_state,
      public.lead_input_rows,
      public.lead_import_batches
  `);
}

async function cleanupProducerAcceptance(): Promise<void> {
  await terminateReadRoleConnections();
  await execute(closeRollbackSql);
  await execute("TRUNCATE public.prospecta_import_acceptances");
  await execute(rollbackSql);
  await dropReadRole();
  await dropProducerFixtures();
}

async function dropAcceptanceObjectsForTest(): Promise<void> {
  await execute(`
    DROP FUNCTION IF EXISTS public.prospecta_close_empresaqui_batch_v1(jsonb);
    DROP VIEW IF EXISTS public.prospecta_import_acceptances_v1;
    DROP FUNCTION IF EXISTS public.prospecta_accept_empresaqui_batch_v1(jsonb);
    DROP TABLE IF EXISTS public.prospecta_import_acceptances;
  `);
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

async function createProducerFixtures(): Promise<void> {
  await dropProducerFixtures();
  await execute(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE FUNCTION public.lead_sha256_text(p_value text)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT encode(digest(COALESCE(p_value, ''), 'sha256'), 'hex');
    $$;

    CREATE TABLE public.lead_import_batches (
      import_batch_id text PRIMARY KEY,
      uploaded_file_sha256 text NOT NULL,
      workflow_version text NOT NULL,
      ruleset_version text NOT NULL,
      prompt_model_version text NOT NULL,
      execution_mode text NOT NULL,
      force_reprocess_token text,
      import_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
      row_count_expected integer,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX lead_import_batches_natural_uq
      ON public.lead_import_batches (
        uploaded_file_sha256,
        workflow_version,
        ruleset_version,
        prompt_model_version,
        execution_mode,
        COALESCE(force_reprocess_token, '')
      );

    CREATE TABLE public.lead_input_rows (
      input_row_id text PRIMARY KEY,
      import_batch_id text NOT NULL
        REFERENCES public.lead_import_batches(import_batch_id) ON DELETE RESTRICT,
      source_row integer NOT NULL,
      raw_row_sha256 text NOT NULL,
      normalized_payload jsonb NOT NULL,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (import_batch_id, source_row)
    );

    CREATE TABLE public.lead_processing_state (
      idempotency_key text PRIMARY KEY,
      lead_run_id text NOT NULL,
      import_batch_id text NOT NULL
        REFERENCES public.lead_import_batches(import_batch_id) ON DELETE RESTRICT,
      source_row integer NOT NULL
    );

    CREATE FUNCTION public.lead_claim_processing_empresaaqui_import(
      p_input_payload jsonb,
      p_locked_by text DEFAULT NULL,
      p_force boolean DEFAULT false,
      p_lock_ttl interval DEFAULT interval '30 minutes'
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_import_batch_id text := p_input_payload->>'import_batch_id';
      v_canonical_batch_id text;
      v_input_row_id text := p_input_payload->>'input_row_id';
      v_source_row integer := (p_input_payload->>'source_row')::integer;
    BEGIN
      IF p_input_payload #>> '{normalized_payload,force_acceptance_failure}' = 'true' THEN
        RAISE EXCEPTION 'synthetic row failure' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.lead_import_batches (
        import_batch_id,
        uploaded_file_sha256,
        workflow_version,
        ruleset_version,
        prompt_model_version,
        execution_mode,
        import_manifest,
        row_count_expected
      )
      VALUES (
        v_import_batch_id,
        p_input_payload->>'uploaded_file_sha256',
        p_input_payload->>'workflow_version',
        p_input_payload->>'ruleset_version',
        p_input_payload->>'prompt_model_version',
        p_input_payload->>'execution_mode',
        p_input_payload->'import_manifest',
        (p_input_payload #>> '{import_manifest,row_count}')::integer
      )
      ON CONFLICT (
        uploaded_file_sha256,
        workflow_version,
        ruleset_version,
        prompt_model_version,
        execution_mode,
        (COALESCE(force_reprocess_token, ''))
      )
      DO UPDATE SET last_seen_at = now()
      RETURNING import_batch_id INTO v_canonical_batch_id;

      INSERT INTO public.lead_input_rows (
        input_row_id,
        import_batch_id,
        source_row,
        raw_row_sha256,
        normalized_payload
      )
      VALUES (
        v_input_row_id,
        v_canonical_batch_id,
        v_source_row,
        p_input_payload->>'raw_row_sha256',
        p_input_payload->'normalized_payload'
      )
      ON CONFLICT (import_batch_id, source_row) DO UPDATE
      SET first_seen_at = public.lead_input_rows.first_seen_at
      WHERE public.lead_input_rows.raw_row_sha256 = EXCLUDED.raw_row_sha256
      RETURNING input_row_id INTO v_input_row_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'synthetic source row conflict' USING ERRCODE = '23505';
      END IF;

      INSERT INTO public.lead_processing_state (
        idempotency_key,
        lead_run_id,
        import_batch_id,
        source_row
      )
      VALUES (
        p_input_payload->>'idempotency_key',
        p_input_payload->>'lead_run_id',
        v_canonical_batch_id,
        v_source_row
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      RETURN jsonb_build_object(
        'import_batch_id', v_canonical_batch_id,
        'input_row_id', v_input_row_id
      );
    END;
    $$;
  `);
}

async function dropProducerFixtures(): Promise<void> {
  await execute(`
    DROP FUNCTION IF EXISTS public.lead_claim_processing_empresaaqui_import(
      jsonb,
      text,
      boolean,
      interval
    );
    DROP TABLE IF EXISTS public.lead_processing_state;
    DROP TABLE IF EXISTS public.lead_input_rows;
    DROP TABLE IF EXISTS public.lead_import_batches;
    DROP FUNCTION IF EXISTS public.lead_sha256_text(text);
  `);
}

describeIfProducerDatabase("producer import acceptance integration", () => {
  beforeAll(async () => {
    await setupProducerAcceptance();
  });

  beforeEach(async () => {
    await resetProducerAcceptance();
  });

  afterAll(async () => {
    try {
      await cleanupProducerAcceptance();
    } finally {
      await ownerPool?.end();
    }
  });

  it("accepts every row atomically and exposes the allowlisted read view", async () => {
    const result = await accept(acceptancePayload());

    expect(result).toMatchObject({
      accepted: true,
      import_batch_id: expect.stringMatching(/^ib_[0-9a-f]{64}$/),
      replayed: false,
      row_count: 2,
    });

    const rows = await queryRows<AcceptanceViewRow>(`
      SELECT *
      FROM public.prospecta_import_acceptances_v1
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      submission_id: firstSubmissionId,
      import_batch_id: result.import_batch_id,
      uploaded_file_sha256: "a".repeat(64),
      accepted_row_count: 2,
      accepted_at: expect.any(Date),
    });

    const acceptedRows = await queryRows<{ source_row: number }>(`
      SELECT source_row
      FROM public.lead_input_rows
      ORDER BY source_row
    `);
    expect(acceptedRows).toEqual([{ source_row: 2 }, { source_row: 3 }]);
  });

  it("returns the original acceptance for an identical replay", async () => {
    const first = await accept(acceptancePayload());
    const replay = await accept(acceptancePayload());

    expect(replay).toEqual({
      ...first,
      replayed: true,
    });
    expect(
      await queryRows<CountRow>(
        "SELECT count(*)::integer AS total FROM public.prospecta_import_acceptances",
      ),
    ).toEqual([{ total: 1 }]);
  });

  it("maps a second submission of the same file to the canonical batch", async () => {
    const first = await accept(acceptancePayload());
    const second = await accept(
      acceptancePayload({
        submissionId: secondSubmissionId,
        idempotencyKey: "synthetic-upload-key-302",
      }),
    );

    expect(second.import_batch_id).toBe(first.import_batch_id);
    expect(second.replayed).toBe(false);
    expect(
      await queryRows<CountRow>(
        "SELECT count(*)::integer AS total FROM public.prospecta_import_acceptances",
      ),
    ).toEqual([{ total: 2 }]);
  });

  it("rejects a submission replay with conflicting correlation data", async () => {
    await accept(acceptancePayload());

    await expect(
      accept(
        acceptancePayload({
          fileSha256: "d".repeat(64),
        }),
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects empty, duplicate, and structurally invalid row sets", async () => {
    await expect(
      accept(acceptancePayload({ rows: [] })),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      accept(
        acceptancePayload({
          rows: [
            syntheticRow(2, "1"),
            syntheticRow(2, "2"),
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      accept(
        acceptancePayload({
          rows: [syntheticRow(1, "1")],
        }),
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });

  it("rolls back the entire acceptance when one row fails", async () => {
    await expect(
      accept(
        acceptancePayload({
          rows: [
            syntheticRow(2, "1"),
            syntheticRow(3, "2", {
              normalized_payload: {
                force_acceptance_failure: true,
              },
            }),
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "22023" });

    const [acceptances, batches, rows] = await Promise.all([
      queryRows<CountRow>(
        "SELECT count(*)::integer AS total FROM public.prospecta_import_acceptances",
      ),
      queryRows<CountRow>(
        "SELECT count(*)::integer AS total FROM public.lead_import_batches",
      ),
      queryRows<CountRow>(
        "SELECT count(*)::integer AS total FROM public.lead_input_rows",
      ),
    ]);
    expect(acceptances).toEqual([{ total: 0 }]);
    expect(batches).toEqual([{ total: 0 }]);
    expect(rows).toEqual([{ total: 0 }]);
  });

  it("converges concurrent identical calls to one acceptance", async () => {
    const [first, second] = await Promise.all([
      accept(acceptancePayload()),
      accept(acceptancePayload()),
    ]);

    expect(first.import_batch_id).toBe(second.import_batch_id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(
      await queryRows<CountRow>(
        "SELECT count(*)::integer AS total FROM public.prospecta_import_acceptances",
      ),
    ).toEqual([{ total: 1 }]);
  });

  it("allows only SELECT through the producer read role", async () => {
    await accept(acceptancePayload());
    const readPool = new Pool({
      connectionString: connectionStringForRole(
        producerReadRole,
        producerReadPassword,
      ),
      application_name: "prospecta-import-acceptance-read-check",
      max: 1,
      allowExitOnIdle: true,
    });

    try {
      const selected = await readPool.query<AcceptanceViewRow>(
        "SELECT * FROM public.prospecta_import_acceptances_v1",
      );
      expect(selected.rows).toHaveLength(1);
      expect(Object.keys(selected.rows[0] ?? {}).sort()).toEqual([
        "accepted_at",
        "accepted_row_count",
        "import_batch_id",
        "submission_id",
        "uploaded_file_sha256",
      ]);

      await expect(
        readPool.query(
          `
            INSERT INTO public.prospecta_import_acceptances (
              submission_id,
              import_batch_id,
              uploaded_file_sha256,
              idempotency_key_hash,
              contract_version,
              accepted_row_count
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            secondSubmissionId,
            `ib_${"e".repeat(64)}`,
            "e".repeat(64),
            "f".repeat(64),
            "prospecta-import-v1",
            1,
          ],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await readPool.end();
    }
  });

  it("keeps the allowlisted acceptance lookup inside the synthetic query budget", async () => {
    await accept(acceptancePayload());
    const plans = await queryRows<ExplainPlanRow>(
      `
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT
          submission_id,
          import_batch_id,
          uploaded_file_sha256,
          accepted_row_count,
          accepted_at
        FROM public.prospecta_import_acceptances_v1
        WHERE submission_id = $1
      `,
      [firstSubmissionId],
    );
    const plan = plans[0]?.["QUERY PLAN"][0]?.Plan;

    expect(plan?.["Actual Rows"]).toBe(1);
    expect(plan?.["Total Cost"]).toBeLessThan(100);
  });

  it("records an explicit idempotent close without creating row terminals", async () => {
    const acceptance = await accept(acceptancePayload());
    const closePayload = {
      import_batch_id: acceptance.import_batch_id,
      contract_version: "prospecta-import-v1",
      close_reason: "WORKER_ORCHESTRATION_FINISHED",
    };
    const beforeState = await queryRows<CountRow>(
      "SELECT count(*)::integer AS total FROM public.lead_processing_state",
    );
    const first = await closeBatch(closePayload);
    const replay = await closeBatch(closePayload);

    expect(first).toMatchObject({
      closed: true,
      import_batch_id: acceptance.import_batch_id,
      close_reason: "WORKER_ORCHESTRATION_FINISHED",
      contract_version: "prospecta-import-v1",
      replayed: false,
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(
      await queryRows<CountRow>(
        "SELECT count(*)::integer AS total FROM public.lead_processing_state",
      ),
    ).toEqual(beforeState);

    const manifests = await queryRows<{
      readonly import_manifest: Record<string, unknown>;
    }>(
      `
        SELECT import_manifest
        FROM public.lead_import_batches
        WHERE import_batch_id = $1
      `,
      [acceptance.import_batch_id],
    );
    expect(manifests[0]?.import_manifest).toMatchObject({
      prospecta_batch_closed: true,
      prospecta_batch_close_reason:
        "WORKER_ORCHESTRATION_FINISHED",
      prospecta_batch_close_contract_version:
        "prospecta-import-v1",
      prospecta_batch_closed_at: first.closed_at,
    });
  });

  it("fails closed for missing batches and conflicting close metadata", async () => {
    await expect(
      closeBatch({
        import_batch_id: `ib_${"f".repeat(64)}`,
        contract_version: "prospecta-import-v1",
        close_reason: "WORKER_ORCHESTRATION_FINISHED",
      }),
    ).rejects.toMatchObject({ code: "P0002" });

    const acceptance = await accept(acceptancePayload());
    await closeBatch({
      import_batch_id: acceptance.import_batch_id,
      contract_version: "prospecta-import-v1",
      close_reason: "WORKER_ORCHESTRATION_FINISHED",
    });
    await expect(
      execute(
        `
          UPDATE public.lead_import_batches
          SET import_manifest =
            import_manifest ||
            '{"prospecta_batch_close_reason":"CONFLICT"}'::jsonb
          WHERE import_batch_id = $1
        `,
        [acceptance.import_batch_id],
      ).then(() =>
        closeBatch({
          import_batch_id: acceptance.import_batch_id,
          contract_version: "prospecta-import-v1",
          close_reason: "WORKER_ORCHESTRATION_FINISHED",
        }),
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("refuses rollback while durable acceptance history exists", async () => {
    await accept(acceptancePayload());
    await expect(execute(rollbackSql)).rejects.toMatchObject({ code: "P0001" });

    await execute("TRUNCATE public.prospecta_import_acceptances");
    await execute(closeRollbackSql);
    await execute(rollbackSql);
    const objects = await queryRows<{
      readonly table_exists: boolean;
      readonly view_exists: boolean;
    }>(`
      SELECT
        to_regclass('public.prospecta_import_acceptances') IS NOT NULL AS table_exists,
        to_regclass('public.prospecta_import_acceptances_v1') IS NOT NULL AS view_exists
    `);
    expect(objects).toEqual([{ table_exists: false, view_exists: false }]);

    await execute(forwardSql);
    await execute(closeForwardSql);
    await execute(`
      GRANT SELECT ON public.prospecta_import_acceptances_v1
        TO ${quoteIdentifier(producerReadRole)}
    `);
  });
});
