import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Demo 3 contact v2 n8n inactive preparation", () => {
  it("shares the exact domain-separated Demo 3 derivation with deployment", () => {
    const material = readRepositoryFile(
      "scripts/lib/demo3-contact-v2-material.mjs",
    );
    const deploy = readRepositoryFile("scripts/deploy-demo3-k8s.mjs");

    expect(material).toContain('"https://192.168.0.20:30443"');
    expect(material).toContain("prospecta-demo3-contact-v2:${purpose}");
    expect(material).toContain('derive("ingress")');
    expect(material).toContain('derive("callback")');
    expect(material).toContain('derive("encryption", "base64")');
    expect(material).toContain('derive("suppression")');
    expect(material).not.toContain("32600");

    expect(deploy).toContain(
      'from "./lib/demo3-contact-v2-material.mjs"',
    );
    expect(deploy).toContain("deriveDemo3ContactV2Material(authSecret)");
    expect(deploy).not.toContain("function deriveContactV2Material");
    expect(deploy).not.toContain("32600");
  });

  it("renders only the fixed inactive workflow and synthetic credential bindings", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
          import assert from "node:assert/strict";
          import { createHmac } from "node:crypto";
          import { readFileSync } from "node:fs";
          import { pathToFileURL } from "node:url";
          import { resolve } from "node:path";

          const materialModule = await import(
            pathToFileURL(resolve("scripts/lib/demo3-contact-v2-material.mjs")).href
          );
          const n8nModule = await import(
            pathToFileURL(resolve("scripts/lib/demo3-contact-v2-n8n.mjs")).href
          );
          const syntheticSecret = "synthetic-auth-secret-000000000000000000000000";
          const derived = materialModule.deriveDemo3ContactV2Material(syntheticSecret);
          const expected = (purpose, encoding = "base64url") =>
            createHmac("sha256", syntheticSecret)
              .update("prospecta-demo3-contact-v2:" + purpose)
              .digest(encoding);
          assert.equal(derived.contactV2IngressSecret, expected("ingress"));
          assert.equal(derived.contactV2CallbackSecret, expected("callback"));
          assert.equal(derived.contactDataEncryptionKey, expected("encryption", "base64"));
          assert.equal(Buffer.from(derived.contactDataEncryptionKey, "base64").byteLength, 32);
          assert.notEqual(derived.contactV2IngressSecret, derived.contactV2CallbackSecret);

          const reference = JSON.parse(
            readFileSync(n8nModule.demo3ContactV2N8n.referenceWorkflowPath, "utf8"),
          );
          const lusha = {
            id: "SyntheticLushaCredential",
            name: "Lusha API V3 Demo3",
            type: "httpHeaderAuth",
          };
          const workflow = n8nModule.renderDemo3ContactV2Workflow(reference, lusha);
          const credentials = n8nModule.renderDemo3ContactV2Credentials(derived);
          const node = (name) => workflow.nodes.find((candidate) => candidate.name === name);

          assert.equal(workflow.id, "PCEv2Demo3b8L3nR");
          assert.equal(workflow.active, false);
          assert.equal(workflow.settings.saveDataSuccessExecution, "none");
          assert.equal(workflow.settings.saveDataErrorExecution, "none");
          assert.equal(workflow.settings.saveManualExecutions, false);
          assert.deepEqual(workflow.pinData, {});
          assert.equal(
            node("Callback Prospecta Company Search v2").parameters.url,
            "https://192.168.0.20:30443/api/contact-enrichment/v2/company-search-callback",
          );
          assert.equal(
            node("Callback Prospecta Preview v2").parameters.url,
            "https://192.168.0.20:30443/api/contact-enrichment/v2/callback",
          );
          assert.equal(
            node("Lusha Prospecting Companies v2").credentials.httpHeaderAuth.id,
            lusha.id,
          );
          assert.equal(
            node("Callback Prospecta Reveal v2").parameters.url,
            "https://192.168.0.20:30443/api/contact-enrichment/v2/reveal-callback",
          );
          assert.equal(
            node("Callback Prospecta Company Search v2").credentials.httpHeaderAuth.id,
            "PCEv2CallbackD3",
          );
          assert.equal(
            node("Webhook Contact Enrichment v2").credentials.httpHeaderAuth.id,
            "PCEv2IngressD3",
          );
          assert.equal(
            node("Lusha Decision Makers v2").credentials.httpHeaderAuth.id,
            lusha.id,
          );
          assert.equal(
            node("Lusha Enrich Selected Contact v2").credentials.httpHeaderAuth.id,
            lusha.id,
          );
          assert.equal(
            node("Callback Prospecta Preview v2").credentials.httpHeaderAuth.id,
            "PCEv2CallbackD3",
          );
          assert.equal(credentials.length, 2);
          assert.deepEqual(
            credentials.map((credential) => credential.type),
            ["httpHeaderAuth", "httpHeaderAuth"],
          );
          assert.equal(reference.nodes.every((candidate) => candidate.credentials === undefined), true);
          process.stdout.write("ok");
        `,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(output).toBe("ok");
  });

  it("defaults to a read-only preflight and exposes no activation path", () => {
    const operator = readRepositoryFile(
      "scripts/prepare-demo3-contact-v2-n8n.mjs",
    );
    const n8nLibrary = readRepositoryFile(
      "scripts/lib/demo3-contact-v2-n8n.mjs",
    );
    const packageJson = readRepositoryFile("package.json");

    expect(packageJson).toContain(
      '"demo3:contact-v2:n8n": "node scripts/prepare-demo3-contact-v2-n8n.mjs"',
    );
    expect(operator).toContain('["--preflight", "--import-inactive"]');
    expect(operator).toContain(
      'flags[0] === "--import-inactive" ? "import" : "preflight"',
    );
    expect(operator).toContain("BEGIN TRANSACTION READ ONLY");
    expect(operator).toContain('n8nDatabase.DB_TYPE !== "postgresdb"');
    expect(n8nLibrary).toContain('postgresDeployment: "postgres"');
    expect(n8nLibrary).toContain('secretName: "n8n-secrets"');
    expect(operator).toContain("DEMO3_EXPECTED_N8N_NAMESPACE_UID");
    expect(operator).toContain(
      "metadata.labels.prospecta\\\\.openai\\\\.local/environment",
    );
    expect(operator).not.toContain("metadata.labels.prospecta\\\\.io/environment");
    expect(operator).toContain("activeExecutionCount");
    expect(operator).toContain("v2WebhookRegistrationCount");
    expect(n8nLibrary).toContain('n8nVersion: "2.30.6"');
    expect(operator).toContain('"workflow:owner"');
    expect(operator).toContain('"credential:owner"');
    expect(operator).toContain('"--input=/dev/stdin"');
    expect(operator).toContain('args.push("--activeState=false")');
    expect(operator).toContain('openSync(operatorLockFile, "wx", 0o600)');
    expect(operator).toMatch(/try \{[\s\S]*importJson\("credentials"[\s\S]*importJson\("workflow"[\s\S]*finally \{[\s\S]*releaseLock\(\)/);

    expect(`${operator}\n${n8nLibrary}`).not.toMatch(
      /publish:workflow|unpublish:workflow|activate:workflow|update:workflow|api\.lusha\.com|32600/,
    );
    expect(operator).not.toContain("execution_data");
    expect(operator).not.toMatch(/SELECT[\s\S]*?c\.data/i);
  });

  it("verifies exact metadata without printing credential or workflow payloads", () => {
    const operator = readRepositoryFile(
      "scripts/prepare-demo3-contact-v2-n8n.mjs",
    );
    const n8nLibrary = readRepositoryFile(
      "scripts/lib/demo3-contact-v2-n8n.mjs",
    );

    expect(n8nLibrary).toContain(
      'lushaCredentialName: "Lusha API V3 Demo3"',
    );
    expect(operator).toMatch(/SELECT c\.id,\s+c\.name,\s+c\.type/);
    expect(operator).toContain(
      'WHERE "stoppedAt" IS NULL AND "deletedAt" IS NULL',
    );
    expect(operator).toContain(
      'WHERE "workflowId" = ${sqlLiteral(demo3ContactV2N8n.workflowId)}',
    );
    expect(operator).toContain("workflow.settings?.saveDataSuccessExecution");
    expect(operator).toContain("normalizedBindings(workflow.bindings)");
    expect(operator).toContain('"Lusha Prospecting Companies v2"');
    expect(operator).toContain(
      '"Callback Prospecta Company Search v2"',
    );
    expect(operator).not.toContain('"Lusha Search Companies v1"');
    expect(operator).toContain(
      "no cluster or n8n mutation was attempted",
    );
    expect(operator).not.toMatch(/console\.(?:log|error)\([^)]*(?:credential|workflow)\s*(?:data|payload|value)/i);
  });
});
