import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function localPort(value, fallback = 3000) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error("PROSPECTA_PORT must be an integer between 1024 and 65535.");
  }
  return port;
}

export function serverSettingNames(repository) {
  const source = readFileSync(resolve(repository, "src/server/env.ts"), "utf8");
  return [...new Set([...source.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map((match) => match[1]))];
}

export function syntheticEnvironment(repository, input = process.env) {
  const port = localPort(input.PROSPECTA_PORT, 3012);
  const environment = Object.fromEntries(serverSettingNames(repository).map((name) => [
    name, name.startsWith("FEATURE_") || name.startsWith("DEMO") ? "false" : "",
  ]));
  for (const name of ["PATH", "HOME", "TMPDIR"]) {
    if (input[name] !== undefined) environment[name] = input[name];
  }
  return {
    ...environment,
    NODE_ENV: "development",
    NODE_OPTIONS: "",
    NEXT_TELEMETRY_DISABLED: "1",
    AUTH_URL: `http://127.0.0.1:${port}`,
    NEXTAUTH_URL: `http://127.0.0.1:${port}`,
    DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:9/synthetic",
    PRODUCER_DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:9/synthetic_producer",
    APP_DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:9/synthetic_app",
    AUTH_SECRET: "synthetic-local-preview-secret-at-least-32-bytes",
    AUTH_OIDC_ISSUER: "https://identity.synthetic.invalid",
    AUTH_OIDC_CLIENT_ID: "synthetic-preview-client",
    AUTH_OIDC_CLIENT_SECRET: "synthetic-preview-client-secret",
    AUTH_ALLOWED_ORG_ID: "synthetic-preview-organization",
    AUTH_DEV_BYPASS_ENABLED: "true",
    FEATURE_DEMO_DATA_ENABLED: "true",
    FEATURE_COMMERCIAL_ENABLED: "true",
    N8N_IMPORT_URL: "https://ingress.synthetic.invalid/webhook/empresaqui/import",
    IMPORT_MAX_BYTES: "10485760",
    IMPORT_PRODUCER_TIMEOUT_MS: "15000",
    CONTACT_ENRICHMENT_TIMEOUT_MS: "15000",
    OPENAI_APPROACH_TIMEOUT_MS: "20000",
    LEAD_LOCATION_LOOKUP_TIMEOUT_MS: "4000",
  };
}

export function runLocalChild({ args, cwd, environment, label, spawnProcess = spawn, hostProcess = process }) {
  const child = spawnProcess(hostProcess.execPath, args, {
    cwd, env: environment, stdio: "inherit",
  });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  const cleanup = () => {
    hostProcess.removeListener("SIGINT", interrupt);
    hostProcess.removeListener("SIGTERM", terminate);
  };
  hostProcess.once("SIGINT", interrupt);
  hostProcess.once("SIGTERM", terminate);
  child.once("error", () => {
    cleanup();
    console.error(`Não foi possível iniciar ${label}. Confira as dependências locais.`);
    hostProcess.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    cleanup();
    hostProcess.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
  return child;
}
