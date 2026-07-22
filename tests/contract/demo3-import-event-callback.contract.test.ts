import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Demo 3 legacy import close callback packaging", () => {
  it("exposes only the exact callback path without browser Basic Auth", () => {
    const nginx = readRepositoryFile("k8s/demo3-nginx.conf");
    const callbackLocation = nginx.match(
      /location = \/api\/imports\/events \{([\s\S]*?)\n    \}/,
    )?.[1];

    expect(callbackLocation).toBeDefined();
    expect(callbackLocation).not.toContain("auth_basic");
    expect(callbackLocation).toContain("proxy_pass http://127.0.0.1:3000");
    expect(callbackLocation).toContain(
      "X-Prospecta-N8N-Secret $http_x_prospecta_n8n_secret",
    );
    expect(nginx).toMatch(
      /location \/ \{[\s\S]*auth_basic "Prospecta Demo 3"/,
    );
  });

  it("keeps the callback secret in the immutable app Secret", () => {
    const deployScript = readRepositoryFile(
      "scripts/deploy-demo3-k8s.mjs",
    );
    const environmentExample = readRepositoryFile(".env.demo3.example");
    const manifest = readRepositoryFile("k8s/prospecta-demo3.yaml");

    expect(deployScript).toContain(
      'n8nImportEventSecret: required("N8N_IMPORT_EVENT_SECRET")',
    );
    expect(deployScript).toMatch(
      /N8N_IMPORT_EVENT_SECRET:\s*configuration\.n8nImportEventSecret/,
    );
    expect(environmentExample).toContain(
      'N8N_IMPORT_EVENT_SECRET="replace-with-a-random-event-secret-of-at-least-32-bytes"',
    );
    expect(manifest).not.toContain("N8N_IMPORT_EVENT_SECRET:");
  });
});
