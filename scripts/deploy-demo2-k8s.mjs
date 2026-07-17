import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const environmentFile = ".env.local";
const namespace = "prospecta-demo";
const secretName = "prospecta-demo-secrets";
const applicationImage = "localhost:5000/prospecta/app:demo";
const proxyImage = "localhost:5000/prospecta/postgres-loopback-proxy:demo";
const manifestFile = "k8s/prospecta-demo.yaml";

const secretEnvironmentNames = [
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
  "FEATURE_COSTS_ENABLED",
  "COSTS_READ_SUBJECTS",
];

const requiredEnvironmentNames = secretEnvironmentNames.filter(
  (name) =>
    name !== "N8N_HMAC_KEY_ID" &&
    name !== "N8N_HMAC_SECRET" &&
    name !== "SENSITIVE_URL_HOSTS",
);

function fail(message) {
  throw new Error(`Demo 2 Kubernetes deployment: ${message}`);
}

function run(command, argumentsList, options = {}) {
  execFileSync(command, argumentsList, {
    stdio: "inherit",
    ...options,
  });
}

function databaseUrlMatches(value, expectedUser, expectedDatabase) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "postgresql:" &&
      url.username === expectedUser &&
      url.hostname === "127.0.0.1" &&
      url.port === "15432" &&
      url.pathname === `/${expectedDatabase}`
    );
  } catch {
    return false;
  }
}

function createLoopbackDatabaseUrl(value, user, database) {
  try {
    const url = new URL(value);

    if (url.protocol !== "postgresql:") {
      fail("database URLs must use the PostgreSQL protocol");
    }

    url.username = user;
    url.hostname = "127.0.0.1";
    url.port = "15432";
    url.pathname = `/${database}`;
    return url.toString();
  } catch {
    fail("DATABASE_URL must be a PostgreSQL URL");
  }
}

function createDemo2RuntimeEnvironment(environment) {
  return {
    ...environment,
    DATABASE_URL: createLoopbackDatabaseUrl(
      environment.PRODUCER_DATABASE_URL,
      "rlb_readonly",
      "prospecting",
    ),
    PRODUCER_DATABASE_URL: createLoopbackDatabaseUrl(
      environment.PRODUCER_DATABASE_URL,
      "prospecta_producer_read",
      "prospecting",
    ),
    APP_DATABASE_URL: createLoopbackDatabaseUrl(
      environment.APP_DATABASE_URL,
      "prospecta_app_rw",
      "prospecta_app_prod",
    ),
  };
}

function assertExactDemo2Profile(environment) {
  for (const name of requiredEnvironmentNames) {
    if (environment[name] === undefined || environment[name] === "") {
      fail(`${name} must be set in ${environmentFile}`);
    }
  }

  const expectedDatabaseUrls = [
    ["DATABASE_URL", "rlb_readonly", "prospecting"],
    ["PRODUCER_DATABASE_URL", "prospecta_producer_read", "prospecting"],
    ["APP_DATABASE_URL", "prospecta_app_rw", "prospecta_app_prod"],
  ];

  for (const [name, user, database] of expectedDatabaseUrls) {
    if (!databaseUrlMatches(environment[name], user, database)) {
      fail(
        `${name} must use the approved Demo 2 test role and 127.0.0.1:15432 target`,
      );
    }
  }

  const n8nUrl = new URL(environment.N8N_IMPORT_URL);
  if (
    n8nUrl.protocol !== "http:" ||
    n8nUrl.hostname !== "192.168.0.20" ||
    n8nUrl.port !== "30098" ||
    n8nUrl.pathname !== "/webhook/empresaqui/import"
  ) {
    fail("N8N_IMPORT_URL must use the approved test ingress");
  }

  const requiredFlags = {
    AUTH_DEV_BYPASS_ENABLED: "true",
    DEMO2_FULL_ACCESS_ENABLED: "true",
    FEATURE_IMPORTS_ENABLED: "true",
    FEATURE_BATCH_OBSERVATION_ENABLED: "true",
    FEATURE_COMMERCIAL_ENABLED: "true",
    FEATURE_SENSITIVE_CONTENT_ENABLED: "true",
    FEATURE_DEMO_DATA_ENABLED: "false",
    FEATURE_COSTS_ENABLED: "true",
  };

  for (const [name, expected] of Object.entries(requiredFlags)) {
    if (environment[name] !== expected) {
      fail(`${name} must be ${expected} for Demo 2`);
    }
  }

  if (environment.COSTS_READ_SUBJECTS !== "local-development-user") {
    fail("COSTS_READ_SUBJECTS must allow only the Demo 2 test actor");
  }
}

function createSecretManifest(environment) {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: secretName,
      namespace,
    },
    type: "Opaque",
    stringData: Object.fromEntries(
      secretEnvironmentNames
        .filter((name) => environment[name] !== undefined)
        .map((name) => [name, environment[name]]),
    ),
  };
}

function applySecret(environment) {
  const result = spawnSync("kubectl", ["apply", "-f", "-"], {
    encoding: "utf8",
    input: JSON.stringify(createSecretManifest(environment)),
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    fail("could not apply the Demo 2 Kubernetes Secret");
  }
}

function main() {
  if (!existsSync(environmentFile)) {
    fail(`requires ${environmentFile}; copy .env.demo2.example first`);
  }

  process.loadEnvFile(environmentFile);
  const runtimeEnvironment = createDemo2RuntimeEnvironment(process.env);
  assertExactDemo2Profile(runtimeEnvironment);

  if (process.argv.includes("--validate")) {
    console.log("Demo 2 Kubernetes configuration is valid.");
    return;
  }

  run("docker", ["build", "-t", applicationImage, "."]);
  run("docker", [
    "build",
    "-f",
    "k8s/Dockerfile.postgres-loopback-proxy",
    "-t",
    proxyImage,
    ".",
  ]);
  run("docker", ["push", applicationImage]);
  run("docker", ["push", proxyImage]);
  run("kubectl", ["apply", "-f", manifestFile]);
  applySecret(runtimeEnvironment);
  run("kubectl", [
    "-n",
    namespace,
    "rollout",
    "restart",
    "deployment/prospecta-demo",
  ]);
  run("kubectl", [
    "-n",
    namespace,
    "rollout",
    "status",
    "deployment/prospecta-demo",
    "--timeout=180s",
  ]);
  run("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--output",
    "/dev/null",
    "http://192.168.0.20:30097/login",
  ]);
  run("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--output",
    "/dev/null",
    "http://192.168.0.20:30097/api/leads",
  ]);

  console.log("Demo 2 is available at http://192.168.0.20:30097/leads");
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unable to deploy Demo 2",
  );
  process.exitCode = 1;
}
