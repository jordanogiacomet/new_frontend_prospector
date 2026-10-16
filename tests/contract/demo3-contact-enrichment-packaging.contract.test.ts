import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "db/app/009_contact_enrichment_ledger_forward.sql";
const contactDataMigrationPath =
  "db/app/010_contact_data_governance_forward.sql";
const companyResolutionMigrationPath =
  "db/app/011_contact_company_resolution_forward.sql";
const companyPhoneFallbackMigrationPath =
  "db/app/012_contact_company_phone_fallback_forward.sql";
const appGrantsPath = "db/app/003_app_schema_grants.sql";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Demo 3 contact enrichment packaging", () => {
  it("packages migration 009 for fresh and existing app-owned databases", () => {
    const dockerIgnore = readRepositoryFile(".dockerignore");
    const dockerfile = readRepositoryFile("k8s/Dockerfile.demo3-postgres");
    const deployScript = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");

    expect(dockerIgnore).toContain(`!${migrationPath}`);
    expect(dockerIgnore).toContain(`!${contactDataMigrationPath}`);
    expect(dockerIgnore).toContain(`!${companyResolutionMigrationPath}`);
    expect(dockerIgnore).toContain(`!${companyPhoneFallbackMigrationPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/009_contact_enrichment_ledger_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-contact-enrichment-ledger\.sql/,
    );
    expect(dockerfile).toMatch(
      /COPY db\/app\/010_contact_data_governance_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-contact-data-governance\.sql/,
    );
    expect(dockerfile).toMatch(
      /COPY db\/app\/011_contact_company_resolution_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-contact-company-resolution\.sql/,
    );
    expect(dockerfile).toMatch(
      /COPY db\/app\/012_contact_company_phone_fallback_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-contact-company-phone-fallback\.sql/,
    );
    expect(deployScript).toContain(migrationPath);
    expect(deployScript).toContain(contactDataMigrationPath);
    expect(deployScript).toContain(companyResolutionMigrationPath);
    expect(deployScript).toContain(companyPhoneFallbackMigrationPath);
    expect(deployScript).toContain(
      "contact_enrichment_requests_org_idempotency_hash_uk",
    );
    expect(deployScript).toContain(
      "contact_enrichment_v2_requests_org_idempotency_uk",
    );
    expect(deployScript).toContain(
      "contact_company_search_requests_org_idempotency_uk",
    );
    expect(deployScript).toContain(
      "contact_company_phone_fallbacks_expiry_idx",
    );
    expect(deployScript.indexOf(migrationPath)).toBeLessThan(
      deployScript.indexOf(
        "applyExistingAppMigrations(observedImages.postgres !== null);",
      ),
    );
  });

  it("preserves only the suppression purge grant after the fresh-image grant sweep", () => {
    const dockerfile = readRepositoryFile("k8s/Dockerfile.demo3-postgres");
    const grants = readRepositoryFile(appGrantsPath);

    expect(dockerfile).toContain(
      `COPY ${appGrantsPath} /docker-entrypoint-initdb.d/050-app-grants.sql`,
    );
    expect(dockerfile.indexOf(contactDataMigrationPath)).toBeLessThan(
      dockerfile.indexOf(appGrantsPath),
    );
    expect(dockerfile.indexOf(companyPhoneFallbackMigrationPath)).toBeLessThan(
      dockerfile.indexOf(appGrantsPath),
    );
    expect(grants).toMatch(
      /REVOKE DELETE ON ALL TABLES IN SCHEMA prospecting_app FROM prospecta_app_rw;[\s\S]*GRANT DELETE ON TABLE prospecting_app\.contact_suppressions\s+TO prospecta_app_rw;/,
    );
    expect(
      [...grants.matchAll(/GRANT DELETE ON TABLE\s+([^\s;]+)/g)].map(
        (match) => match[1],
      ),
    ).toEqual(["prospecting_app.contact_suppressions"]);
  });

  it("configures only the exact server-side Demo 3 target", () => {
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");

    expect(manifest).toContain(
      "N8N_CONTACT_ENRICHMENT_URL: http://192.168.0.20:30098/webhook/prospecta/lusha/decision-makers",
    );
    expect(manifest).toContain(
      'FEATURE_CONTACT_ENRICHMENT_ENABLED: "true"',
    );
    expect(manifest).toContain(
      'FEATURE_CONTACT_DATA_ENABLED: "__FEATURE_CONTACT_DATA_ENABLED__"',
    );
    expect(manifest).not.toContain("N8N_CONTACT_ENRICHMENT_V2_URL:");
    expect(manifest).toContain('CONTACT_ENRICHMENT_TIMEOUT_MS: "15000"');
    expect(manifest).not.toContain("N8N_CONTACT_ENRICHMENT_SECRET:");
    expect(manifest).not.toContain("N8N_CONTACT_CALLBACK_SECRET:");
    expect(manifest).not.toContain("NEXT_PUBLIC_N8N_CONTACT");
    expect(manifest).toContain("nodePort: 30443");
  });

  it("keeps both contact secrets outside Git and distinct in deployment validation", () => {
    const deployScript = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");
    const environmentExample = readRepositoryFile(".env.demo3.example");

    expect(deployScript).toContain(
      'contactEnrichmentSecret: required("N8N_CONTACT_ENRICHMENT_SECRET")',
    );
    expect(deployScript).toContain(
      'contactCallbackSecret: required("N8N_CONTACT_CALLBACK_SECRET")',
    );
    expect(deployScript).toContain(
      "N8N_CONTACT_ENRICHMENT_SECRET: configuration.contactEnrichmentSecret",
    );
    expect(deployScript).toContain(
      "N8N_CONTACT_CALLBACK_SECRET: configuration.contactCallbackSecret",
    );
    expect(deployScript).toMatch(
      /contactEnrichmentSecret === configuration\.contactCallbackSecret/,
    );
    expect(environmentExample).toContain(
      'N8N_CONTACT_ENRICHMENT_SECRET="replace-with-a-contact-ingress-secret-of-at-least-32-bytes"',
    );
    expect(environmentExample).toContain(
      'N8N_CONTACT_CALLBACK_SECRET="replace-with-a-contact-callback-secret-of-at-least-32-bytes"',
    );
  });

  it("exposes only the exact machine callback without gateway Basic Auth", () => {
    const nginx = readRepositoryFile("k8s/demo3-nginx.conf");
    const callbackLocation = nginx.match(
      /location = \/api\/contact-enrichment\/callback \{([\s\S]*?)\n    \}/,
    )?.[1];

    expect(callbackLocation).toBeDefined();
    expect(callbackLocation).not.toContain("auth_basic");
    expect(callbackLocation).toContain("proxy_pass http://127.0.0.1:3000");
    expect(callbackLocation).toContain(
      "X-Prospecta-Contact-Callback-Secret $http_x_prospecta_contact_callback_secret",
    );
    expect(nginx).toMatch(
      /location \/ \{[\s\S]*auth_basic "Prospecta Demo 3"/,
    );
  });
});
