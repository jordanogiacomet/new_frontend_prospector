import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repository = resolve(process.env.PROSPECTA_BROWSER_REPO ?? process.cwd());
const port = Number(process.env.PROSPECTA_BROWSER_PORT ?? "3100");
assert(Number.isSafeInteger(port) && port >= 1024 && port <= 65535);
assert(existsSync(resolve(repository, "package.json")));
const source = readFileSync(resolve(repository, "src/server/env.ts"), "utf8");
const names = new Set([...source.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map((match) => match[1]));
assert(names.has("AUTH_DEV_BYPASS_ENABLED") && names.has("DEMO2_FULL_ACCESS_ENABLED"));
const environment = {};
for (const name of names) {
  environment[name] = name.startsWith("FEATURE_") || name.startsWith("DEMO") ? "false" : "";
}
for (const name of ["PATH", "HOME", "TMPDIR"]) {
  if (process.env[name] !== undefined) environment[name] = process.env[name];
}
Object.assign(environment, {
  NODE_ENV: "development",
  NODE_OPTIONS: "",
  NEXT_TELEMETRY_DISABLED: "1",
  AUTH_URL: `http://127.0.0.1:${port}`,
  NEXTAUTH_URL: `http://127.0.0.1:${port}`,
  AUTH_TRUST_HOST: "true",
  DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:9/synthetic",
  PRODUCER_DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:9/synthetic_producer",
  APP_DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:9/synthetic_app",
  AUTH_SECRET: "synthetic-manager-browser-check-secret-0001",
  AUTH_OIDC_ISSUER: "https://identity.synthetic.invalid",
  AUTH_OIDC_CLIENT_ID: "synthetic-browser-client",
  AUTH_OIDC_CLIENT_SECRET: "synthetic-browser-client-secret",
  AUTH_ALLOWED_ORG_ID: "synthetic-browser-organization",
  AUTH_DEV_BYPASS_ENABLED: "true",
  DEMO2_FULL_ACCESS_ENABLED: "true",
  DEMO2_K8S_RUNTIME_ENABLED: "false",
  DEMO3_LOCAL_RUNTIME_ENABLED: "false",
  FEATURE_DEMO_DATA_ENABLED: "false",
  N8N_IMPORT_URL: "https://ingress.synthetic.invalid/webhook/empresaqui/import",
  IMPORT_MAX_BYTES: "10485760",
  IMPORT_PRODUCER_TIMEOUT_MS: "15000",
  CONTACT_ENRICHMENT_TIMEOUT_MS: "15000",
  OPENAI_APPROACH_TIMEOUT_MS: "20000",
  LEAD_LOCATION_LOOKUP_TIMEOUT_MS: "4000",
});

console.log("Starting loopback manager UAT: synthetic actor, unusable database URLs, integrations disabled; browser mocks every API.");
const child = spawn(process.execPath, [
  resolve(repository, "node_modules/next/dist/bin/next"),
  "dev", "--hostname", "127.0.0.1", "--port", String(port),
], { cwd: repository, env: environment, stdio: "inherit" });
child.on("error", () => {
  console.error("Unable to start synthetic loopback UAT server.");
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
