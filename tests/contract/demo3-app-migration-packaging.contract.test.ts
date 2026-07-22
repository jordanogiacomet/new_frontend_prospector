import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const migrationPath = "db/app/006_import_acceptance_reconciliation_forward.sql";
const workflowCloseMigrationPath =
  "db/app/007_legacy_workflow_close_report_forward.sql";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

describe("Demo 3 app-owned migration packaging", () => {
  it("includes the reconciliation migration in fresh PostgreSQL images", () => {
    const dockerIgnore = readRepositoryFile(".dockerignore");
    const dockerfile = readRepositoryFile("k8s/Dockerfile.demo3-postgres");

    expect(dockerIgnore).toContain(`!${migrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/006_import_acceptance_reconciliation_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-import-acceptance-reconciliation\.sql/,
    );
    expect(dockerIgnore).toContain(`!${workflowCloseMigrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/007_legacy_workflow_close_report_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-legacy-workflow-close-report\.sql/,
    );
  });

  it("applies the idempotent app migration before replacing an existing app release", () => {
    const deployScript = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");
    const migrationDeclaration = deployScript.indexOf(migrationPath);
    const migrationCall = deployScript.indexOf(
      "applyExistingAppMigrations(observedImages.postgres !== null);",
    );
    const manifestApply = deployScript.indexOf("applyStdin(manifest);");

    expect(migrationDeclaration).toBeGreaterThanOrEqual(0);
    expect(deployScript).toContain(workflowCloseMigrationPath);
    expect(migrationCall).toBeGreaterThan(migrationDeclaration);
    expect(manifestApply).toBeGreaterThan(migrationCall);
    expect(deployScript).toMatch(
      /"exec",\s*"--stdin",\s*"statefulset\/prospecta-demo3-postgres"/,
    );
    expect(deployScript).toContain("verifyExistingAppMigrations();");
    expect(deployScript).toContain(
      "import_submissions_org_producer_batch_idx",
    );
    expect(deployScript).toContain(
      "import_submission_events_one_workflow_close_uk",
    );
  });

  it("keeps the app migration scoped away from producer relations", () => {
    const migration = readRepositoryFile(migrationPath);

    expect(migration).toContain("prospecting_app.import_submissions");
    expect(migration).not.toMatch(
      /lead_import_batches|lead_input_rows|lead_processing_state|lead_decisions|prospecta_import_acceptances/,
    );

    const workflowCloseMigration = readRepositoryFile(
      workflowCloseMigrationPath,
    );
    expect(workflowCloseMigration).toContain(
      "prospecting_app.import_submission_events",
    );
    expect(workflowCloseMigration).not.toMatch(
      /lead_import_batches|lead_input_rows|lead_processing_state|lead_decisions|prospecta_import_acceptances/,
    );
  });
});
