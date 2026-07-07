import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(),
    on: vi.fn(),
    query: vi.fn(),
  };

  return {
    client,
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
      "postgresql://legacy_user:legacy-password@legacy.example.test/legacy",
    PRODUCER_DATABASE_URL:
      "postgresql://producer_reader:producer-password@producer.example.test/leads",
    APP_DATABASE_URL:
      "postgresql://prospecta_app:sensitive-password@app.example.test/prospecta",
  }),
}));

import * as database from "./app-client";

describe("app-owned PostgreSQL client", () => {
  beforeEach(() => {
    mocks.client.query.mockReset();
    mocks.client.release.mockReset();
    mocks.pool.connect.mockReset();
    mocks.pool.query.mockReset();
  });

  it("configures the app-write pool with its own URL, name, and limits", () => {
    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString:
        "postgresql://prospecta_app:sensitive-password@app.example.test/prospecta",
      application_name: "prospecta-app-write",
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
      text: "SELECT id FROM prospecting_app.workspaces WHERE id = $1",
      values: ["workspace-synthetic-001"],
    });

    expect(mocks.pool.query).toHaveBeenCalledWith({
      text: "SELECT id FROM prospecting_app.workspaces WHERE id = $1",
      values: ["workspace-synthetic-001"],
    });
  });

  it("runs app-owned work inside an explicit transaction", async () => {
    mocks.pool.connect.mockResolvedValueOnce(mocks.client);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "submission-synthetic-001" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await database.transaction(async (client) => {
      const [row] = await client.query<{ id: string }>({
        text: "INSERT INTO prospecting_app.import_submissions (submission_id) VALUES ($1) RETURNING submission_id AS id",
        values: ["submission-synthetic-001"],
      });

      return row?.id;
    });

    expect(result).toBe("submission-synthetic-001");
    expect(mocks.client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.client.query).toHaveBeenNthCalledWith(2, {
      text: "INSERT INTO prospecting_app.import_submissions (submission_id) VALUES ($1) RETURNING submission_id AS id",
      values: ["submission-synthetic-001"],
    });
    expect(mocks.client.query).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(mocks.client.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed transaction and maps details to a safe error", async () => {
    mocks.pool.connect.mockResolvedValueOnce(mocks.client);
    mocks.client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(
        new Error("violates constraint with private-sql-param"),
      )
      .mockResolvedValueOnce({ rows: [] });

    const error = await database
      .transaction(async (client) => {
        await client.query({
          text: "INSERT INTO prospecting_app.import_submission_events (metadata) VALUES ($1)",
          values: [{ rawProducerBody: "must-not-leak" }],
        });
      })
      .catch((caught: unknown) => caught);

    expect(mocks.client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(mocks.client.query).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(mocks.client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(mocks.client.release).toHaveBeenCalledTimes(1);
    expect(error).toEqual(
      expect.objectContaining({
        name: "DatabaseUnavailableError",
        code: "DATABASE_UNAVAILABLE",
        message: "Database temporarily unavailable.",
      }),
    );
    expect(String(error)).not.toMatch(
      /private-sql-param|rawProducerBody|must-not-leak/,
    );
  });

  it("maps connection failures to a safe error without a rollback attempt", async () => {
    mocks.pool.connect.mockRejectedValueOnce(
      new Error("connect failed with sensitive-password"),
    );

    const error = await database
      .transaction(async () => "unreachable")
      .catch((caught: unknown) => caught);

    expect(error).toEqual(
      expect.objectContaining({
        name: "DatabaseUnavailableError",
        code: "DATABASE_UNAVAILABLE",
        message: "Database temporarily unavailable.",
      }),
    );
    expect(mocks.client.query).not.toHaveBeenCalled();
    expect(mocks.client.release).not.toHaveBeenCalled();
    expect(String(error)).not.toMatch(/sensitive-password|connect failed/);
  });

  it("returns typed rows without exposing the driver result", async () => {
    interface TestRow {
      id: string;
      organization_id: string;
    }

    const rows: TestRow[] = [
      {
        id: "workspace-synthetic-001",
        organization_id: "organization-synthetic",
      },
    ];
    mocks.pool.query.mockResolvedValueOnce({ rows });

    await expect(
      database.query<TestRow>({
        text: "SELECT id, organization_id FROM prospecting_app.workspaces",
        values: [],
      }),
    ).resolves.toEqual(rows);
  });

  it("maps driver failures to a safe error without credentials or causes", async () => {
    mocks.pool.query.mockRejectedValueOnce(
      new Error(
        "connect ECONNREFUSED app.example.test with sensitive-password",
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
      /app\.example\.test|sensitive-password|ECONNREFUSED/,
    );
    expect(error).not.toHaveProperty("cause");
  });

  it("is guarded as server-only and exposes no pool or migration helper", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/db/app-client.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
    expect(Object.keys(database).sort()).toEqual([
      "DatabaseUnavailableError",
      "query",
      "transaction",
    ]);
    expect(database).not.toHaveProperty("pool");
    expect(database).not.toHaveProperty("connect");
    expect(database).not.toHaveProperty("migrate");
    expect(database).not.toHaveProperty("writeProducer");
  });

  it("does not use producer ownership, browser APIs, n8n, fetch, or generic credentials", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/db/app-client.ts"),
      "utf8",
    );

    expect(source).toContain("APP_DATABASE_URL");
    expect(source).not.toMatch(/\bPRODUCER_DATABASE_URL\b|\bDATABASE_URL\b/);
    expect(source).not.toMatch(
      /from\s+["']\.\/producer-client["']|fetch\(|XMLHttpRequest|window\.|document\.|localStorage|navigator\.|n8n|N8N|webhook/i,
    );
    expect(source).not.toContain("prospecta-producer-read");
  });
});
