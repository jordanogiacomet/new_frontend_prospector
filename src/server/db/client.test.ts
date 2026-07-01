import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const pool = {
    on: vi.fn(),
    query: vi.fn(),
  };

  return {
    pool,
    Pool: vi.fn(function Pool() {
      return pool;
    }),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Pool: mocks.Pool }));
vi.mock("../env", () => ({
  getServerEnv: () => ({
    DATABASE_URL:
      "postgresql://readonly_user:sensitive-password@db.example.test/leads",
  }),
}));

import * as database from "./client";

describe("server-only PostgreSQL client", () => {
  beforeEach(() => {
    mocks.pool.query.mockReset();
  });

  it("configures the approved bounded pool and statement timeouts", () => {
    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString:
        "postgresql://readonly_user:sensitive-password@db.example.test/leads",
      application_name: "read-only-lead-browser",
      min: 0,
      max: 2,
      connectionTimeoutMillis: 1_000,
      statement_timeout: 2_000,
      lock_timeout: 500,
      idle_in_transaction_session_timeout: 5_000,
      allowExitOnIdle: true,
    });
    expect(mocks.pool.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("keeps SQL text and parameter values separate", async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });

    await database.query({
      text: "SELECT id FROM leads WHERE cnpj = $1",
      values: ["00000000000000"],
    });

    expect(mocks.pool.query).toHaveBeenCalledWith({
      text: "SELECT id FROM leads WHERE cnpj = $1",
      values: ["00000000000000"],
    });
  });

  it("returns typed rows without exposing the driver result", async () => {
    interface TestRow {
      id: string;
      score: number | null;
    }

    const rows: TestRow[] = [{ id: "synthetic-run", score: null }];
    mocks.pool.query.mockResolvedValueOnce({ rows });

    await expect(
      database.query<TestRow>({
        text: "SELECT id, score FROM leads",
        values: [],
      }),
    ).resolves.toEqual(rows);
  });

  it("maps driver failures to a safe error", async () => {
    mocks.pool.query.mockRejectedValueOnce(
      new Error(
        "connect ECONNREFUSED db.example.test with sensitive-password",
      ),
    );

    const error = await database
      .query({ text: "SELECT 1", values: [] })
      .catch((caught: unknown) => caught);

    expect(error).toEqual(
      expect.objectContaining({
        name: "DatabaseUnavailableError",
        code: "DATABASE_UNAVAILABLE",
        message: "Database temporarily unavailable.",
      }),
    );
    expect(String(error)).not.toMatch(
      /db\.example\.test|sensitive-password|ECONNREFUSED/,
    );
    expect(error).not.toHaveProperty("cause");
  });

  it("is guarded as server-only and exposes no pool or mutation helper", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/db/client.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
    expect(Object.keys(database).sort()).toEqual([
      "DatabaseUnavailableError",
      "query",
    ]);
    expect(database).not.toHaveProperty("pool");
    expect(database).not.toHaveProperty("connect");
    expect(database).not.toHaveProperty("transaction");
    expect(database).not.toHaveProperty("migrate");
    expect(database).not.toHaveProperty("write");
  });
});
