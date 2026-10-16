import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("lead location map v2 repository contract", () => {
  it("packages map migrations for fresh and existing Demo 3 databases", () => {
    const path = "db/app/013_lead_registered_geocode_cache_forward.sql";
    const postalPath =
      "db/app/014_lead_postal_geocode_fallback_forward.sql";
    const dockerIgnore = readRepositoryFile(".dockerignore");
    const dockerfile = readRepositoryFile("k8s/Dockerfile.demo3-postgres");
    const deployment = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");

    expect(dockerIgnore).toContain(`!${path}`);
    expect(dockerIgnore).toContain(`!${postalPath}`);
    expect(dockerfile).toMatch(
      /COPY db\/app\/013_lead_registered_geocode_cache_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-lead-registered-geocode-cache\.sql/,
    );
    expect(deployment).toContain(path);
    expect(deployment).toContain(postalPath);
    expect(dockerfile).toMatch(
      /COPY db\/app\/014_lead_postal_geocode_fallback_forward\.sql \/docker-entrypoint-initdb\.d\/[0-9]+-lead-postal-geocode-fallback\.sql/,
    );
    expect(deployment).toContain(
      "lead_registered_geocode_cache_expiry_idx",
    );
    expect(deployment.indexOf(path)).toBeLessThan(
      deployment.indexOf(
        "applyExistingAppMigrations(observedImages.postgres !== null);",
      ),
    );
  });

  it("has no storage shape for registered addresses or provider payloads", () => {
    const migration = readRepositoryFile(
      "db/app/013_lead_registered_geocode_cache_forward.sql",
    );
    const table = migration.slice(
      migration.indexOf("CREATE TABLE"),
      migration.indexOf("CREATE INDEX"),
    );

    expect(table).toMatch(/PRIMARY KEY \(organization_id, cnpj_normalizado\)/i);
    expect(table).toMatch(/source text NOT NULL/i);
    expect(table).not.toMatch(
      /logradouro|street|numero|number|complemento|bairro|district|cidade|city|uf\b|cep|postal|query|payload|company_name/i,
    );
    expect(migration).toMatch(/REVOKE DELETE/i);
  });

  it("keeps both providers server-only and the browser on Prospecta", () => {
    const environment = readRepositoryFile("src/server/env.ts");
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");
    const browser = readRepositoryFile(
      "src/components/leads/lead-location-map.tsx",
    );

    expect(environment).toContain('import "server-only";');
    expect(environment).toContain('"COMPANY_REGISTRY_API_BASE_URL"');
    expect(environment).toContain('"LEAD_GEOCODING_API_URL"');
    expect(environment).toContain('"LEAD_POSTAL_CODE_API_BASE_URL"');
    expect(environment).not.toContain(
      '"NEXT_PUBLIC_COMPANY_REGISTRY_API_BASE_URL"',
    );
    expect(environment).not.toContain('"NEXT_PUBLIC_LEAD_GEOCODING_API_URL"');
    expect(environment).not.toContain(
      '"NEXT_PUBLIC_LEAD_POSTAL_CODE_API_BASE_URL"',
    );
    expect(manifest).toContain(
      "COMPANY_REGISTRY_API_BASE_URL: https://brasilapi.com.br/api/cnpj/v1",
    );
    expect(manifest).toContain(
      "LEAD_GEOCODING_API_URL: https://nominatim.openstreetmap.org/search",
    );
    expect(manifest).toContain(
      "LEAD_POSTAL_CODE_API_BASE_URL: https://brasilapi.com.br/api/cep/v2",
    );
    expect(browser).toContain("/api/leads/${encodeURIComponent(cnpj)}/location-map");
    expect(browser).not.toContain("brasilapi.com.br");
    expect(browser).not.toContain("nominatim.openstreetmap.org");
  });

  it("records the public-provider rate, cache and Demo 3 egress boundaries", () => {
    const limiter = readRepositoryFile(
      "src/server/maps/nominatim-rate-limiter.ts",
    );
    const service = readRepositoryFile(
      "src/server/maps/lead-registered-location-service.ts",
    );
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");

    expect(limiter).toContain("const minimumStartIntervalMs = 1_000");
    expect(service).toContain("availableCacheMilliseconds = 90 * 24");
    expect(service).toContain("unavailableCacheMilliseconds = 24 * 60");
    expect(service).not.toMatch(/console\.(?:log|error|warn|info)/);
    expect(manifest).toContain('FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: "true"');
    expect(manifest).toMatch(/cidr: 0\.0\.0\.0\/0[\s\S]*port: 443/);
    for (const privateRange of [
      "10.0.0.0/8",
      "127.0.0.0/8",
      "169.254.0.0/16",
      "172.16.0.0/12",
      "192.168.0.0/16",
    ]) {
      expect(manifest).toContain(`- ${privateRange}`);
    }
  });
});
