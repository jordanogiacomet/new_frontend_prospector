import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = "db/app/019_import_received_companies_forward.sql";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("app-owned import received-company facts", () => {
  it("stores only a scoped row receipt with a restrictive app-owned reference", () => {
    const migration = read(migrationPath);
    const columns = migration.match(/CREATE TABLE[\s\S]*?\(\s*([\s\S]*?),\s*CONSTRAINT/);

    expect(columns?.[1]?.split(",").map((column) => column.trim().split(/\s+/)[0])).toEqual([
      "organization_id", "submission_id", "source_row", "received_at",
    ]);
    expect(migration).toMatch(/PRIMARY KEY \(organization_id, submission_id, source_row\)/);
    expect(migration).toContain("source_row > 0 AND source_row <= 9007199254740991");
    expect(migration).toMatch(/FOREIGN KEY \(organization_id, submission_id\)\s+REFERENCES prospecting_app\.import_submissions \(organization_id, submission_id\)\s+ON UPDATE RESTRICT\s+ON DELETE RESTRICT/);
    expect(migration).not.toMatch(/lead_import_batches|lead_input_rows|lead_processing_state|lead_decisions|CASCADE/);
  });

  it("requires append-only receipts and limits runtime grants to SELECT and INSERT", () => {
    const migration = read(migrationPath);
    const grants = read("db/app/003_app_schema_grants.sql");

    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON prospecting_app\.import_received_companies[\s\S]*reject_append_only_mutation\(\)/);
    expect(migration).toContain("REVOKE ALL ON TABLE prospecting_app.import_received_companies FROM PUBLIC");
    for (const source of [migration, grants]) {
      expect(source).toMatch(/REVOKE ALL ON TABLE prospecting_app\.import_received_companies\s+FROM prospecta_app_rw/);
      expect(source).toMatch(/GRANT SELECT, INSERT ON TABLE prospecting_app\.import_received_companies\s+TO prospecta_app_rw/);
    }
  });

  it("refuses populated rollback under the same lock and never erases receipt facts", () => {
    const rollback = read("db/app/019_import_received_companies_rollback.sql");
    const lock = rollback.indexOf("LOCK TABLE");
    const check = rollback.indexOf("IF EXISTS (SELECT 1 FROM prospecting_app.import_received_companies)");
    const drop = rollback.indexOf("DROP TABLE");

    expect(rollback).toContain("IN ACCESS EXCLUSIVE MODE");
    expect(rollback).toContain("Import receipt facts must be retained");
    expect(rollback).toMatch(/DO \$rollback\$[\s\S]*DROP TABLE[\s\S]*END \$rollback\$/);
    expect(lock).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(lock);
    expect(drop).toBeGreaterThan(check);
    expect(rollback).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bCASCADE\b/);
  });

  it("packages the new migration for fresh images and existing app databases", () => {
    const dockerfile = read("k8s/Dockerfile.demo3-postgres");
    const deploy = read("scripts/deploy-demo3-k8s.mjs");

    expect(read(".dockerignore")).toContain(`!${migrationPath}`);
    expect(dockerfile).toContain(`COPY ${migrationPath} /docker-entrypoint-initdb.d/055-import-received-companies.sql`);
    expect(deploy).toContain(`"${migrationPath}"`);
    expect(deploy.indexOf(migrationPath)).toBeGreaterThan(deploy.indexOf("db/app/018_contact_search_relevance_forward.sql"));
    expect(deploy).toContain("import_received_companies_submission_fk");
    expect(deploy).toContain("import_received_companies_source_row_ck");
  });

  it("checks runtime mutation denial and the active append-only trigger before startup", () => {
    const deploy = read("scripts/deploy-demo3-k8s.mjs");
    const manifest = read("k8s/prospecta-demo3.yaml");

    for (const source of [deploy, manifest]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        expect(source).toContain(`'prospecting_app.import_received_companies', '${privilege}'`);
      }
      expect(source).toContain("import_received_companies_append_only");
      expect(source).toContain("tgenabled = 'O'");
      expect(source).toContain("prospecting_app.reject_append_only_mutation()'::regprocedure");
    }
    expect(deploy).toContain("true|4|1|true");
  });
});
