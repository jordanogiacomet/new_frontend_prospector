import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { getServerEnv } from "../env";

const pool = new Pool({
  connectionString: getServerEnv().APP_DATABASE_URL,
  application_name: "prospecta-app-write",
  min: 0,
  max: 2,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 2_000,
  lock_timeout: 500,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

pool.on("error", () => {
  // Idle connection failures are intentionally handled without sensitive output.
});

export interface SqlStatement {
  readonly text: string;
  readonly values: readonly unknown[];
}

export interface AppDatabaseTransaction {
  query<Row extends QueryResultRow>(statement: SqlStatement): Promise<Row[]>;
}

export class DatabaseUnavailableError extends Error {
  readonly code = "DATABASE_UNAVAILABLE";

  constructor() {
    super("Database temporarily unavailable.");
    this.name = "DatabaseUnavailableError";
  }
}

export async function query<Row extends QueryResultRow>(
  statement: SqlStatement,
): Promise<Row[]> {
  try {
    return await runQuery(pool, statement);
  } catch {
    throw new DatabaseUnavailableError();
  }
}

export async function transaction<Result>(
  callback: (client: AppDatabaseTransaction) => Promise<Result>,
): Promise<Result> {
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const connectedClient = client;

    const result = await callback({
      query: (statement) => runQuery(connectedClient, statement),
    });

    await client.query("COMMIT");
    return result;
  } catch {
    if (client !== undefined) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The original database failure is already being mapped to a safe error.
      }
    }

    throw new DatabaseUnavailableError();
  } finally {
    client?.release();
  }
}

async function runQuery<Row extends QueryResultRow>(
  client: Pick<Pool | PoolClient, "query">,
  statement: SqlStatement,
): Promise<Row[]> {
  const result = await client.query<Row>({
    text: statement.text,
    values: [...statement.values],
  });

  return result.rows;
}
