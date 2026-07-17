import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const environmentFile = ".env.local";
const controlledEnvironmentNames = [
  "DATABASE_URL",
  "PRODUCER_DATABASE_URL",
  "APP_DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_OIDC_ISSUER",
  "AUTH_OIDC_CLIENT_ID",
  "AUTH_OIDC_CLIENT_SECRET",
  "AUTH_ALLOWED_ORG_ID",
  "AUTH_DEV_BYPASS_ENABLED",
  "DEMO2_FULL_ACCESS_ENABLED",
  "N8N_IMPORT_URL",
  "N8N_HMAC_KEY_ID",
  "N8N_HMAC_SECRET",
  "IMPORT_MAX_BYTES",
  "IMPORT_PRODUCER_TIMEOUT_MS",
  "SENSITIVE_URL_HOSTS",
  "FEATURE_IMPORTS_ENABLED",
  "FEATURE_BATCH_OBSERVATION_ENABLED",
  "FEATURE_COMMERCIAL_ENABLED",
  "FEATURE_SENSITIVE_CONTENT_ENABLED",
  "FEATURE_DEMO_DATA_ENABLED",
];

if (!existsSync(environmentFile)) {
  console.error(
    `Demo 2 requires ${environmentFile}. Copy .env.demo2.example into it and replace its database placeholders.`,
  );
  process.exitCode = 1;
} else {
  for (const name of controlledEnvironmentNames) {
    delete process.env[name];
  }

  delete process.env.NODE_OPTIONS;
  process.loadEnvFile(environmentFile);
  delete process.env.NODE_OPTIONS;
  process.env.NODE_ENV = "development";

  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
    ],
    {
      env: process.env,
      stdio: "inherit",
    },
  );

  child.on("error", (error) => {
    console.error(`Unable to start Demo 2: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === null ? 0 : 1);
  });
}
