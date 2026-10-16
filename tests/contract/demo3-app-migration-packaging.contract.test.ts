import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const migrationPath = "db/app/006_import_acceptance_reconciliation_forward.sql";
const workflowCloseMigrationPath =
  "db/app/007_legacy_workflow_close_report_forward.sql";
const workflowStartMigrationPath =
  "db/app/008_legacy_workflow_start_report_forward.sql";
const leadApproachDraftMigrationPath =
  "db/app/015_lead_approach_draft_cache_forward.sql";
const qualificationCadenceMigrationPath =
  "db/app/016_qualification_cadence_forward.sql";
const contactSearchFeedbackMigrationPath =
  "db/app/017_contact_search_feedback_forward.sql";
const contactSearchRelevanceMigrationPath =
  "db/app/018_contact_search_relevance_forward.sql";

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
    expect(dockerIgnore).toContain(`!${workflowStartMigrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/008_legacy_workflow_start_report_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-legacy-workflow-start-report\.sql/,
    );
    expect(dockerIgnore).toContain(`!${leadApproachDraftMigrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/015_lead_approach_draft_cache_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-lead-approach-draft-cache\.sql/,
    );
    expect(dockerIgnore).toContain(`!${qualificationCadenceMigrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/016_qualification_cadence_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-qualification-cadence\.sql/,
    );
    expect(dockerIgnore).toContain(`!${contactSearchFeedbackMigrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/017_contact_search_feedback_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-contact-search-feedback\.sql/,
    );
    expect(dockerIgnore).toContain(`!${contactSearchRelevanceMigrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/018_contact_search_relevance_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-contact-search-relevance\.sql/,
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
    expect(deployScript).toContain(workflowStartMigrationPath);
    expect(deployScript).toContain(leadApproachDraftMigrationPath);
    expect(deployScript).toContain(qualificationCadenceMigrationPath);
    expect(deployScript).toContain(contactSearchFeedbackMigrationPath);
    expect(deployScript).toContain(contactSearchRelevanceMigrationPath);
    expect(deployScript.indexOf(contactSearchRelevanceMigrationPath)).toBeGreaterThan(
      deployScript.indexOf(contactSearchFeedbackMigrationPath),
    );
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
    expect(deployScript).toContain(
      "import_submission_events_one_workflow_start_uk",
    );
    expect(deployScript).toContain("contact_enrichment_v2_requests_diagnostics_ck");
    expect(deployScript).toContain("contact_company_search_requests_diagnostics_ck");
    expect(deployScript).toContain("contact_search_diagnostics_are_valid");
  });

  it("verifies contact relevance support and stage restrictions before readiness", () => {
    const deployScript = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");

    for (const source of [deployScript, manifest]) {
      expect(source).toContain(
        "'provider', 'LUSHA', 'stage', 'CONTACT_PREVIEW', 'code', 'NO_RELEVANT_MATCHES'",
      );
      expect(source).toContain(
        "'provider', 'APOLLO', 'stage', 'CONTACT_PREVIEW', 'code', 'NO_RELEVANT_MATCHES'",
      );
      expect(source).toMatch(/(?:AND|and) (?:NOT|not) prospecting_app\.contact_search_diagnostics_are_valid\(\s*jsonb_build_array\(jsonb_build_object\('provider', 'APOLLO', 'stage', 'COMPANY_MATCH', 'code', 'NO_RELEVANT_MATCHES'\)\),\s*false\)/);
      expect(source).toMatch(/(?:AND|and) (?:NOT|not) prospecting_app\.contact_search_diagnostics_are_valid\(\s*jsonb_build_array\(jsonb_build_object\('provider', 'LUSHA', 'stage', 'COMPANY_SEARCH', 'code', 'NO_RELEVANT_MATCHES'\)\),\s*true\)/);
    }
  });

  it("executes streamed app migrations as an explicit stdin file with transactional error handling", () => {
    const deployScript = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");
    const migrationFunction = deployScript.slice(
      deployScript.indexOf("function applyExistingAppMigrations("),
      deployScript.indexOf("function verifyExistingAppMigrations("),
    );
    const invocation = migrationFunction.match(/const result = spawnSync\([\s\S]*?\);/)?.[0];

    expect(invocation).toBeDefined();
    expect(invocation).toMatch(/"exec",\s*"--stdin"/);
    expect(invocation).toMatch(
      /"psql",\s*"-X",\s*"--file=-",\s*"--single-transaction",\s*"--set=ON_ERROR_STOP=1"/,
    );
    expect(invocation).toContain("input: migrationInput");
    expect(invocation).toMatch(/stdio: \["pipe", "inherit", "inherit"\]/);
  });

  it("skips the historical validator when a later release already records relevance facts", () => {
    const deployScript = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");

    expect(deployScript).toContain(
      'migrationFile === "db/app/017_contact_search_feedback_forward.sql"',
    );
    expect(deployScript).toContain("pg_get_functiondef(oid) LIKE '%NO_RELEVANT_MATCHES%'");
    expect(deployScript).toContain("\\\\gset");
    expect(deployScript).toContain("\\\\if :contact_search_relevance_present");
    expect(deployScript).toMatch(/\\\\else\s*\$\{migrationSql\}\s*\\\\endif/);
    expect(deployScript).toContain("input: migrationInput");
  });

  it("retains relevance facts and audit history during rollback", () => {
    const forward = readRepositoryFile(contactSearchRelevanceMigrationPath);
    const rollback = readRepositoryFile(
      "db/app/018_contact_search_relevance_rollback.sql",
    );

    expect(forward).toContain("CREATE OR REPLACE FUNCTION prospecting_app.contact_search_diagnostics_are_valid");
    expect(forward).toContain("item->>'code' <> 'NO_RELEVANT_MATCHES'");
    expect(forward).toContain("OR item->>'stage' = 'CONTACT_PREVIEW'");
    expect(rollback).toContain("IN SHARE ROW EXCLUSIVE MODE");
    expect(rollback).toContain("Recorded contact-search relevance facts must be retained");
    expect(rollback).toContain("keep migration 018");
    expect(rollback).toContain("CREATE OR REPLACE FUNCTION prospecting_app.contact_search_diagnostics_are_valid");
    for (const source of [forward, rollback]) {
      expect(source).not.toMatch(/\b(?:DELETE|TRUNCATE|UPDATE|DROP)\b|lead_import_batches|lead_input_rows|lead_processing_state|lead_decisions/);
    }
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

    const workflowStartMigration = readRepositoryFile(
      workflowStartMigrationPath,
    );
    expect(workflowStartMigration).toContain(
      "prospecting_app.import_submission_events",
    );
    expect(workflowStartMigration).not.toMatch(
      /lead_import_batches|lead_input_rows|lead_processing_state|lead_decisions|prospecta_import_acceptances/,
    );
  });
});
