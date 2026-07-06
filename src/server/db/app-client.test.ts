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
    ]);
    expect(database).not.toHaveProperty("pool");
    expect(database).not.toHaveProperty("connect");
    expect(database).not.toHaveProperty("transaction");
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
