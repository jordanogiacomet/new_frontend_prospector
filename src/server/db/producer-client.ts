import "server-only";

import { Pool, type QueryResultRow } from "pg";

import { getServerEnv } from "../env";

const pool = new Pool({
  connectionString: getServerEnv().PRODUCER_DATABASE_URL,
  application_name: "prospecta-producer-read",
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
    const result = await pool.query<Row>({
      text: statement.text,
      values: [...statement.values],
    });

    return result.rows;
  } catch {
    throw new DatabaseUnavailableError();
  }
}
