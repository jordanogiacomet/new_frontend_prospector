import { execFileSync, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  demo3ContactV2Actor,
  demo3ContactV2IngressUrl,
  deriveDemo3ContactV2Material,
} from "./lib/demo3-contact-v2-material.mjs";

const namespace = "prospecta-demo3";
const environmentFile = ".env.demo3.local";
const manifestFile = "k8s/prospecta-demo3.yaml";
const nodePortUrl = "http://192.168.0.20:30100";
const contactNodePortUrl = "https://192.168.0.20:30443";
const gatewayUsername = "prospecta";
const sourceSecretNamespace = "prospecta-demo";
const sourceSecretName = "prospecta-demo-secrets";
const appMigrationFiles = [
  "db/app/006_import_acceptance_reconciliation_forward.sql",
  "db/app/007_legacy_workflow_close_report_forward.sql",
  "db/app/008_legacy_workflow_start_report_forward.sql",
  "db/app/009_contact_enrichment_ledger_forward.sql",
  "db/app/010_contact_data_governance_forward.sql",
  "db/app/011_contact_company_resolution_forward.sql",
];
const deploymentLockFile = join(
  tmpdir(),
  "prospecta-demo3-k8s-deploy.lock",
);

function fail(message) {
  throw new Error(`Demo 3 Kubernetes deployment: ${message}`);
}

function acquireDeploymentLock() {
  try {
    const existingPid = Number(readFileSync(deploymentLockFile, "utf8"));

    if (Number.isSafeInteger(existingPid) && existingPid > 0) {
      try {
        process.kill(existingPid, 0);
        fail("another deployment process is already active");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code !== "ESRCH") {
          throw error;
        }
      }
    }

    rmSync(deploymentLockFile, { force: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  let descriptor;
  try {
    descriptor = openSync(deploymentLockFile, "wx", 0o600);
    writeFileSync(descriptor, String(process.pid));
  } catch {
    fail("another deployment process acquired the deployment lock");
  }

  let released = false;
  const release = () => {
    if (released) {
      return;
    }

    released = true;
    closeSync(descriptor);
    rmSync(deploymentLockFile, { force: true });
  };

  process.once("exit", release);
}

function required(name) {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    fail(`${name} must be set in ${environmentFile}`);
  }

  if (value.includes("replace-with")) {
    fail(`${name} still contains a placeholder`);
  }

  return value;
}

function readOptional(name) {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  if (value.includes("replace-with")) {
    fail(`${name} still contains a placeholder`);
  }

  return value;
}

function optionalBoolean(name) {
  const value = readOptional(name) ?? "false";

  if (value !== "true" && value !== "false") {
    fail(`${name} must be either true or false`);
  }

  return value === "true";
}

function command(commandName, args, options = {}) {
  const { capture = false, timeout = 15_000, ...commandOptions } = options;

  return execFileSync(commandName, args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    timeout,
    ...commandOptions,
  });
}

function readKubectl(args, description, allowNotFound = false) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = spawnSync("kubectl", args, {
      encoding: "utf8",
      timeout: 30_000,
    });

    if (result.status === 0) {
      return { found: true, value: result.stdout.trim() };
    }

    if (
      allowNotFound &&
      typeof result.stderr === "string" &&
      result.stderr.includes("NotFound")
    ) {
      return { found: false, value: "" };
    }
  }

  fail(`could not ${description} after bounded retries`);
}

function runWithRetries(commandName, args, description, timeout = 30_000) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = spawnSync(commandName, args, {
      encoding: "utf8",
      timeout,
    });

    if (result.status === 0) {
      return result.stdout.trim();
    }
  }

  fail(`could not ${description} after bounded retries`);
}

function assertReleaseId(value) {
  if (!/^demo3-[a-z0-9][a-z0-9.-]{5,80}$/.test(value)) {
    fail("DEMO3_RELEASE_ID must be an immutable demo3-* identifier");
  }
}

function loadConfiguration() {
  try {
    process.loadEnvFile(environmentFile);
  } catch {
    fail(`requires ${environmentFile}; copy .env.demo3.example first`);
  }

  const authSecret = required("AUTH_SECRET");
  const configuration = {
    context: required("DEMO3_EXPECTED_CONTEXT"),
    server: required("DEMO3_EXPECTED_SERVER"),
    clusterUid: required("DEMO3_EXPECTED_CLUSTER_UID"),
    releaseId: required("DEMO3_RELEASE_ID"),
    postgresOwnerPassword: required("DEMO3_POSTGRES_OWNER_PASSWORD"),
    appDatabasePassword: required("DEMO3_APP_DATABASE_PASSWORD"),
    authSecret,
    oidcClientSecret: required("AUTH_OIDC_CLIENT_SECRET"),
    n8nImportEventSecret: readOptional("N8N_IMPORT_EVENT_SECRET"),
    contactEnrichmentSecret: required("N8N_CONTACT_ENRICHMENT_SECRET"),
    contactCallbackSecret: required("N8N_CONTACT_CALLBACK_SECRET"),
    contactDataEnabled: optionalBoolean("FEATURE_CONTACT_DATA_ENABLED"),
    ...deriveDemo3ContactV2Material(authSecret),
    contactControllerLegalName: readOptional(
      "CONTACT_CONTROLLER_LEGAL_NAME",
    ),
    contactControllerRegistration: readOptional(
      "CONTACT_CONTROLLER_REGISTRATION",
    ),
    contactPrivacyContact: readOptional("CONTACT_PRIVACY_CONTACT"),
  };

  assertReleaseId(configuration.releaseId);
  if (Buffer.byteLength(configuration.authSecret, "utf8") < 32) {
    fail("AUTH_SECRET must contain at least 32 bytes");
  }
  if (configuration.n8nImportEventSecret !== undefined) {
    assertImportEventSecret(
      configuration.n8nImportEventSecret,
      configuration.authSecret,
    );
  }
  for (const [name, value] of [
    ["N8N_CONTACT_ENRICHMENT_SECRET", configuration.contactEnrichmentSecret],
    ["N8N_CONTACT_CALLBACK_SECRET", configuration.contactCallbackSecret],
  ]) {
    if (Buffer.byteLength(value, "utf8") < 32) {
      fail(`${name} must contain at least 32 bytes`);
    }
    if (
      value === configuration.authSecret ||
      value === configuration.n8nImportEventSecret
    ) {
      fail(`${name} must be distinct from existing application secrets`);
    }
  }
  if (
    configuration.contactEnrichmentSecret === configuration.contactCallbackSecret
  ) {
    fail("contact enrichment and callback secrets must be distinct");
  }
  assertContactV2Configuration(configuration);
  if (Buffer.byteLength(configuration.postgresOwnerPassword, "utf8") < 32) {
    fail("DEMO3_POSTGRES_OWNER_PASSWORD must contain at least 32 bytes");
  }
  if (Buffer.byteLength(configuration.appDatabasePassword, "utf8") < 32) {
    fail("DEMO3_APP_DATABASE_PASSWORD must contain at least 32 bytes");
  }
  if (
    configuration.postgresOwnerPassword ===
    configuration.appDatabasePassword
  ) {
    fail("the PostgreSQL owner and runtime passwords must be distinct");
  }

  return configuration;
}

function assertContactV2Configuration(configuration) {
  if (!configuration.contactDataEnabled) {
    return;
  }

  const requiredValues = [
    ["N8N_CONTACT_ENRICHMENT_V2_URL", configuration.contactV2Url],
    [
      "N8N_CONTACT_ENRICHMENT_V2_SECRET",
      configuration.contactV2IngressSecret,
    ],
    ["N8N_CONTACT_CALLBACK_V2_SECRET", configuration.contactV2CallbackSecret],
    [
      "CONTACT_DATA_ENCRYPTION_KEY_BASE64",
      configuration.contactDataEncryptionKey,
    ],
    ["CONTACT_DATA_ENCRYPTION_KEY_ID", configuration.contactDataEncryptionKeyId],
    ["CONTACT_SUPPRESSION_HMAC_KEY", configuration.contactSuppressionHmacKey],
    ["CONTACT_DATA_READ_SUBJECTS", configuration.contactDataReadSubjects],
    ["CONTACT_DATA_GOVERN_SUBJECTS", configuration.contactDataGovernSubjects],
    ["CONTACT_CONTROLLER_LEGAL_NAME", configuration.contactControllerLegalName],
    ["CONTACT_PRIVACY_CONTACT", configuration.contactPrivacyContact],
  ];

  for (const [name, value] of requiredValues) {
    if (value === undefined) {
      fail(`${name} must be set when contact data is enabled`);
    }
  }

  if (configuration.contactV2Url !== demo3ContactV2IngressUrl) {
    fail("N8N_CONTACT_ENRICHMENT_V2_URL must use the exact Demo 3 HTTPS edge");
  }

  const v2Secrets = [
    configuration.contactV2IngressSecret,
    configuration.contactV2CallbackSecret,
    configuration.contactSuppressionHmacKey,
  ];
  for (const [index, value] of v2Secrets.entries()) {
    if (Buffer.byteLength(value, "utf8") < 32) {
      const names = [
        "N8N_CONTACT_ENRICHMENT_V2_SECRET",
        "N8N_CONTACT_CALLBACK_V2_SECRET",
        "CONTACT_SUPPRESSION_HMAC_KEY",
      ];
      fail(`${names[index]} must contain at least 32 bytes`);
    }
  }

  const protectedSecrets = [
    configuration.authSecret,
    configuration.n8nImportEventSecret,
    configuration.contactEnrichmentSecret,
    configuration.contactCallbackSecret,
    ...v2Secrets,
  ].filter((value) => value !== undefined);
  if (new Set(protectedSecrets).size !== protectedSecrets.length) {
    fail("contact v2 secrets must be distinct from all existing secrets");
  }

  const encryptionKey = Buffer.from(
    configuration.contactDataEncryptionKey,
    "base64",
  );
  if (
    encryptionKey.byteLength !== 32 ||
    encryptionKey.toString("base64") !==
      configuration.contactDataEncryptionKey ||
    encryptionKey.equals(Buffer.alloc(32))
  ) {
    fail("CONTACT_DATA_ENCRYPTION_KEY_BASE64 must be a nonzero canonical 32-byte key");
  }
  if (
    !/^[A-Za-z0-9._-]{1,64}$/.test(
      configuration.contactDataEncryptionKeyId,
    )
  ) {
    fail("CONTACT_DATA_ENCRYPTION_KEY_ID must be an opaque key identifier");
  }

  for (const [name, value] of [
    ["CONTACT_DATA_READ_SUBJECTS", configuration.contactDataReadSubjects],
    ["CONTACT_DATA_GOVERN_SUBJECTS", configuration.contactDataGovernSubjects],
  ]) {
    const subjects = value.split(",");
    if (
      !subjects.includes(demo3ContactV2Actor) ||
      subjects.some((subject) => subject === "" || subject.trim() !== subject)
    ) {
      fail(`${name} must contain the exact Demo 3 actor without whitespace`);
    }
  }

  if (
    configuration.contactControllerLegalName.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(configuration.contactControllerLegalName)
  ) {
    fail("CONTACT_CONTROLLER_LEGAL_NAME is invalid");
  }
  if (
    configuration.contactControllerRegistration !== undefined &&
    !/^[A-Za-z0-9 .\-\/]{3,64}$/.test(
      configuration.contactControllerRegistration,
    )
  ) {
    fail("CONTACT_CONTROLLER_REGISTRATION is invalid");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.contactPrivacyContact)) {
    fail("CONTACT_PRIVACY_CONTACT must be a monitored email address in Demo 3");
  }
}

function releaseNames(configuration) {
  return {
    appImage: `localhost:5000/prospecta/app:${configuration.releaseId}`,
    postgresImage: `localhost:5000/prospecta/postgres:${configuration.releaseId}`,
    edgeImage: `localhost:5000/prospecta/request-edge:${configuration.releaseId}`,
    proxyImage: `localhost:5000/prospecta/postgres-loopback-proxy:${configuration.releaseId}`,
    configName: `prospecta-demo3-config-${configuration.releaseId}`,
    postgresSecretName: `prospecta-demo3-postgres-secrets-${configuration.releaseId}`,
    appSecretName: `prospecta-demo3-app-secrets-${configuration.releaseId}`,
    gatewaySecretName: `prospecta-demo3-gateway-secrets-${configuration.releaseId}`,
  };
}

function decodeSecretValue(data, name, source) {
  const encoded = data[name];

  if (typeof encoded !== "string" || encoded === "") {
    fail(`${source} lacks ${name}`);
  }

  const value = Buffer.from(encoded, "base64").toString("utf8");
  if (value.trim() === "") {
    fail(`${source} has an empty ${name}`);
  }

  return value;
}

function readPreproductionSource() {
  const serialized = readKubectl(
    [
      "-n",
      sourceSecretNamespace,
      "get",
      "secret",
      sourceSecretName,
      "--request-timeout=20s",
      "-o",
      "json",
    ],
    "read the identified pre-production source Secret",
  ).value;

  let secret;
  try {
    secret = JSON.parse(serialized);
  } catch {
    fail("the identified pre-production source Secret is invalid");
  }

  const data = secret?.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    fail("the identified pre-production source Secret has no data");
  }

  const source = `${sourceSecretNamespace}/${sourceSecretName}`;
  const databaseUrl = decodeSecretValue(data, "DATABASE_URL", source);
  const producerDatabaseUrl = decodeSecretValue(
    data,
    "PRODUCER_DATABASE_URL",
    source,
  );
  const organizationId = decodeSecretValue(
    data,
    "AUTH_ALLOWED_ORG_ID",
    source,
  );
  const sensitiveUrlHosts = decodeSecretValue(
    data,
    "SENSITIVE_URL_HOSTS",
    source,
  );

  for (const [name, value, expectedUser] of [
    ["DATABASE_URL", databaseUrl, "rlb_readonly"],
    [
      "PRODUCER_DATABASE_URL",
      producerDatabaseUrl,
      "prospecta_producer_read",
    ],
  ]) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      fail(`${name} in the source Secret is not a valid URL`);
    }

    if (
      parsed.protocol !== "postgresql:" ||
      parsed.hostname !== "127.0.0.1" ||
      parsed.port !== "15432" ||
      parsed.pathname !== "/prospecting" ||
      parsed.username !== expectedUser ||
      !parsed.password
    ) {
      fail(`${name} does not match the approved local read-only target`);
    }
  }

  const readyProducerEndpoint = readKubectl(
    [
      "-n",
      "prospecting",
      "get",
      "endpoints",
      "prospecting-postgres",
      "--request-timeout=20s",
      "-o",
      "jsonpath={.subsets[0].addresses[0].ip}",
    ],
    "verify the approved producer endpoint",
  ).value;
  if (readyProducerEndpoint === "") {
    fail("the approved producer Service has no ready endpoint");
  }

  return {
    databaseUrl,
    producerDatabaseUrl,
    organizationId,
    sensitiveUrlHosts,
  };
}

function assertImportEventSecret(value, authSecret) {
  if (Buffer.byteLength(value, "utf8") < 32) {
    fail("N8N_IMPORT_EVENT_SECRET must contain at least 32 bytes");
  }
  if (value === authSecret) {
    fail("N8N_IMPORT_EVENT_SECRET must be distinct from AUTH_SECRET");
  }

  return value;
}

function readExistingImportEventSecret() {
  const deploymentSerialized = readKubectl(
    [
      "-n",
      namespace,
      "get",
      "deployment",
      "prospecta-demo3",
      "--request-timeout=20s",
      "-o",
      "json",
    ],
    "read the active Demo 3 application deployment",
  ).value;

  let deployment;
  try {
    deployment = JSON.parse(deploymentSerialized);
  } catch {
    fail("the active Demo 3 application deployment is invalid");
  }

  const containers = deployment?.spec?.template?.spec?.containers;
  if (!Array.isArray(containers)) {
    fail("the active Demo 3 application deployment has no containers");
  }

  const application = containers.find(
    (container) => container?.name === "prospecta",
  );
  const secretNames = Array.isArray(application?.envFrom)
    ? application.envFrom
        .map((entry) => entry?.secretRef?.name)
        .filter((name) => typeof name === "string")
    : [];

  if (secretNames.length !== 1) {
    fail("the active Demo 3 application deployment has no unique app Secret");
  }

  const [secretName] = secretNames;
  const releaseId = secretName.slice("prospecta-demo3-app-secrets-".length);
  if (
    !secretName.startsWith("prospecta-demo3-app-secrets-") ||
    !/^demo3-[a-z0-9][a-z0-9.-]{5,80}$/.test(releaseId)
  ) {
    fail("the active Demo 3 application Secret is not an immutable release Secret");
  }

  const serialized = readKubectl(
    [
      "-n",
      namespace,
      "get",
      "secret",
      secretName,
      "--request-timeout=20s",
      "-o",
      "json",
    ],
    "read the active Demo 3 application Secret",
  ).value;

  let secret;
  try {
    secret = JSON.parse(serialized);
  } catch {
    fail("the active Demo 3 application Secret is invalid");
  }

  const data = secret?.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    fail("the active Demo 3 application Secret has no data");
  }

  return decodeSecretValue(data, "N8N_IMPORT_EVENT_SECRET", secretName);
}

function resolveImportEventSecret(configuration, namespaceExists) {
  if (configuration.n8nImportEventSecret !== undefined) {
    return configuration.n8nImportEventSecret;
  }

  if (!namespaceExists) {
    fail("N8N_IMPORT_EVENT_SECRET must be set for the first Demo 3 release");
  }

  return assertImportEventSecret(
    readExistingImportEventSecret(),
    configuration.authSecret,
  );
}

function createGatewayMaterial(configuration) {
  const password = createHmac("sha256", configuration.authSecret)
    .update(`prospecta-demo3-gateway:${configuration.releaseId}`)
    .digest("base64url");
  const htpasswd = spawnSync(
    "htpasswd",
    ["-niB", gatewayUsername],
    {
      input: `${password}\n`,
      encoding: "utf8",
      timeout: 15_000,
    },
  );

  if (htpasswd.status !== 0 || !htpasswd.stdout.trim()) {
    fail("could not create the release-scoped gateway credential");
  }

  return {
    username: gatewayUsername,
    password,
    htpasswd: htpasswd.stdout.trim(),
  };
}

function assertTarget(configuration) {
  const currentContext = command(
    "kubectl",
    ["config", "current-context"],
    { capture: true },
  ).trim();
  if (currentContext !== configuration.context) {
    fail(`current context ${currentContext} is not the approved context`);
  }

  const currentServer = command(
    "kubectl",
    ["config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}"],
    { capture: true },
  ).trim();
  if (currentServer !== configuration.server) {
    fail(`current API server ${currentServer} is not the approved server`);
  }

  const clusterUid = readKubectl(
    ["get", "namespace", "kube-system", "--request-timeout=20s", "-o", "jsonpath={.metadata.uid}"],
    "verify the kube-system UID",
  ).value;
  if (clusterUid !== configuration.clusterUid) {
    fail("kube-system UID does not match the approved disposable cluster");
  }

  const namespaceCheck = readKubectl(
    ["get", "namespace", namespace, "--request-timeout=20s", "-o", "jsonpath={.metadata.labels.prospecta\\.openai\\.local/environment}"],
    "verify the Demo 3 namespace marker",
    true,
  );
  if (namespaceCheck.found && namespaceCheck.value !== "non-production") {
    fail("existing Demo 3 namespace lacks the non-production marker");
  }

  return namespaceCheck.found;
}

function currentImage(resource, name, container) {
  const result = readKubectl(
    [
      "-n",
      namespace,
      "get",
      resource,
      name,
      "--request-timeout=20s",
      "-o",
      `jsonpath={.spec.template.spec.containers[?(@.name==\"${container}\")].image}`,
    ],
    `read the current ${resource}/${name} image`,
    true,
  );

  if (result.found) {
    return result.value || null;
  }

  return null;
}

function capturePreviousImages() {
  return {
    app: currentImage("deployment", "prospecta-demo3", "prospecta"),
    edge: currentImage("deployment", "prospecta-demo3", "request-edge"),
    proxy: currentImage(
      "deployment",
      "prospecta-demo3",
      "postgres-loopback-proxy",
    ),
    postgres: currentImage(
      "statefulset",
      "prospecta-demo3-postgres",
      "postgres",
    ),
  };
}

function assertTooling() {
  runWithRetries(
    "docker",
    ["info", "--format", "{{.ServerVersion}}"],
    "verify the Docker daemon",
  );
  runWithRetries(
    "curl",
    ["--fail", "--silent", "--show-error", "--output", "/dev/null", "--max-time", "10", "http://127.0.0.1:5000/v2/"],
    "verify the local registry",
    15_000,
  );
}

function assertReleaseTagsAbsent(names) {
  const repositories = [
    ["app", "prospecta/app"],
    ["postgres", "prospecta/postgres"],
    ["request edge", "prospecta/request-edge"],
    ["database proxy", "prospecta/postgres-loopback-proxy"],
  ];

  for (const [label, repository] of repositories) {
    const status = runWithRetries(
      "curl",
      [
        "--silent",
        "--output",
        "/dev/null",
        "--write-out",
        "%{http_code}",
        "--max-time",
        "5",
        "--header",
        "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
        `http://127.0.0.1:5000/v2/${repository}/manifests/${names.appImage.split(":").at(-1)}`,
      ],
      `verify the immutable ${label} image tag`,
      8_000,
    );

    if (status === "200") {
      fail(`release tag already exists for the ${label} image`);
    }
    if (status !== "404") {
      fail(`registry returned HTTP ${status || "unknown"} for the ${label} image tag`);
    }
  }
}

function assertReleaseTagsPresent(names) {
  const repositories = [
    ["app", "prospecta/app"],
    ["postgres", "prospecta/postgres"],
    ["request edge", "prospecta/request-edge"],
    ["database proxy", "prospecta/postgres-loopback-proxy"],
  ];

  for (const [label, repository] of repositories) {
    const status = runWithRetries(
      "curl",
      [
        "--silent",
        "--output",
        "/dev/null",
        "--write-out",
        "%{http_code}",
        "--max-time",
        "5",
        "--header",
        "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
        `http://127.0.0.1:5000/v2/${repository}/manifests/${names.appImage.split(":").at(-1)}`,
      ],
      `verify the published ${label} image tag`,
      8_000,
    );

    if (status !== "200") {
      fail(`published ${label} image tag is unavailable (HTTP ${status})`);
    }
  }
}

function assertLocalImages(names) {
  runWithRetries(
    "docker",
    [
      "image",
      "inspect",
      names.appImage,
      names.postgresImage,
      names.edgeImage,
      names.proxyImage,
      "--format",
      "{{.Id}}",
    ],
    "verify the four resumed local images",
  );
}

function pushImage(image) {
  runWithRetries(
    "docker",
    ["push", image],
    `push the immutable image ${image}`,
    300_000,
  );
}

function pushImages(names) {
  pushImage(names.appImage);
  pushImage(names.postgresImage);
  pushImage(names.edgeImage);
  pushImage(names.proxyImage);
}

function renderManifest(configuration) {
  const names = releaseNames(configuration);
  const manifest = readFileSync(manifestFile, "utf8")
    .replaceAll("__RELEASE_ID__", configuration.releaseId)
    .replaceAll("__APP_IMAGE__", names.appImage)
    .replaceAll("__POSTGRES_IMAGE__", names.postgresImage)
    .replaceAll("__EDGE_IMAGE__", names.edgeImage)
    .replaceAll("__PROXY_IMAGE__", names.proxyImage)
    .replaceAll("__CONFIG_NAME__", names.configName)
    .replaceAll("__POSTGRES_SECRET_NAME__", names.postgresSecretName)
    .replaceAll("__APP_SECRET_NAME__", names.appSecretName)
    .replaceAll("__GATEWAY_SECRET_NAME__", names.gatewaySecretName)
    .replaceAll(
      "__FEATURE_CONTACT_DATA_ENABLED__",
      String(configuration.contactDataEnabled),
    );

  if (/__[A-Z0-9_]+__/.test(manifest)) {
    fail("rendered manifest still contains placeholders");
  }

  return manifest;
}

function secretManifest(
  configuration,
  preproductionSource,
  gatewayMaterial,
) {
  const names = releaseNames(configuration);
  const appDatabaseUrl = new URL("postgresql://prospecta_app_rw@prospecta-demo3-postgres:5432/prospecta_demo3");
  appDatabaseUrl.password = configuration.appDatabasePassword;

  return JSON.stringify({
    apiVersion: "v1",
    kind: "List",
    items: [
      {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: names.postgresSecretName,
          namespace,
          labels: {
            "app.kubernetes.io/name": "prospecta-demo3-postgres",
            "app.kubernetes.io/instance": "demo3",
            "app.kubernetes.io/version": configuration.releaseId,
          },
        },
        type: "Opaque",
        stringData: {
          DEMO3_POSTGRES_OWNER_PASSWORD:
            configuration.postgresOwnerPassword,
          DEMO3_APP_DATABASE_PASSWORD: configuration.appDatabasePassword,
        },
      },
      {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: names.appSecretName,
          namespace,
          labels: {
            "app.kubernetes.io/name": "prospecta",
            "app.kubernetes.io/instance": "demo3",
            "app.kubernetes.io/version": configuration.releaseId,
          },
        },
        type: "Opaque",
        stringData: {
          DATABASE_URL: preproductionSource.databaseUrl,
          PRODUCER_DATABASE_URL:
            preproductionSource.producerDatabaseUrl,
          APP_DATABASE_URL: appDatabaseUrl.toString(),
          AUTH_SECRET: configuration.authSecret,
          AUTH_OIDC_CLIENT_SECRET: configuration.oidcClientSecret,
          AUTH_ALLOWED_ORG_ID: preproductionSource.organizationId,
          N8N_IMPORT_EVENT_SECRET:
            configuration.n8nImportEventSecret,
          N8N_CONTACT_ENRICHMENT_SECRET: configuration.contactEnrichmentSecret,
          N8N_CONTACT_CALLBACK_SECRET: configuration.contactCallbackSecret,
          N8N_CONTACT_ENRICHMENT_V2_URL: configuration.contactV2Url,
          N8N_CONTACT_ENRICHMENT_V2_SECRET:
            configuration.contactV2IngressSecret,
          N8N_CONTACT_CALLBACK_V2_SECRET:
            configuration.contactV2CallbackSecret,
          CONTACT_DATA_ENCRYPTION_KEY_BASE64:
            configuration.contactDataEncryptionKey,
          CONTACT_DATA_ENCRYPTION_KEY_ID:
            configuration.contactDataEncryptionKeyId,
          CONTACT_SUPPRESSION_HMAC_KEY:
            configuration.contactSuppressionHmacKey,
          CONTACT_DATA_READ_SUBJECTS:
            configuration.contactDataReadSubjects,
          CONTACT_DATA_GOVERN_SUBJECTS:
            configuration.contactDataGovernSubjects,
          CONTACT_CONTROLLER_LEGAL_NAME:
            configuration.contactControllerLegalName,
          CONTACT_CONTROLLER_REGISTRATION:
            configuration.contactControllerRegistration,
          CONTACT_PRIVACY_CONTACT: configuration.contactPrivacyContact,
          SENSITIVE_URL_HOSTS:
            preproductionSource.sensitiveUrlHosts,
        },
      },
      {
        apiVersion: "v1",
        kind: "Secret",
        metadata: {
          name: names.gatewaySecretName,
          namespace,
          labels: {
            "app.kubernetes.io/name": "prospecta",
            "app.kubernetes.io/instance": "demo3",
            "app.kubernetes.io/version": configuration.releaseId,
          },
        },
        type: "Opaque",
        stringData: {
          DEMO3_GATEWAY_USERNAME: gatewayMaterial.username,
          DEMO3_GATEWAY_PASSWORD: gatewayMaterial.password,
          htpasswd: gatewayMaterial.htpasswd,
        },
      },
    ],
  });
}

function applyStdin(value) {
  const result = spawnSync("kubectl", ["apply", "-f", "-"], {
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
    timeout: 60_000,
  });
  if (result.status !== 0) {
    fail("kubectl apply failed");
  }
}

function applyExistingAppMigrations(hasExistingPostgres) {
  if (!hasExistingPostgres) {
    return;
  }

  for (const migrationFile of appMigrationFiles) {
    const result = spawnSync(
      "kubectl",
      [
        "-n",
        namespace,
        "exec",
        "--stdin",
        "statefulset/prospecta-demo3-postgres",
        "--request-timeout=20s",
        "--",
        "psql",
        "-X",
        "--single-transaction",
        "--set=ON_ERROR_STOP=1",
        "-U",
        "prospecta_demo3_owner",
        "-d",
        "prospecta_demo3",
      ],
      {
        input: readFileSync(migrationFile, "utf8"),
        encoding: "utf8",
        stdio: ["pipe", "inherit", "inherit"],
        timeout: 60_000,
      },
    );

    if (result.status !== 0) {
      fail(`could not apply app-owned migration ${migrationFile}`);
    }
  }

  verifyExistingAppMigrations();
}

function verifyExistingAppMigrations() {
  const verification = spawnSync(
    "kubectl",
    [
      "-n",
      namespace,
      "exec",
      "statefulset/prospecta-demo3-postgres",
      "--request-timeout=20s",
      "--",
      "psql",
      "-X",
      "--tuples-only",
      "--no-align",
      "--set=ON_ERROR_STOP=1",
      "-U",
      "prospecta_demo3_owner",
      "-d",
      "prospecta_demo3",
      "--command",
      `SELECT
        count(*) FILTER (
          WHERE indexname = 'import_submissions_org_producer_batch_uk'
        )::text
        || '|'
        || count(*) FILTER (
          WHERE indexname = 'import_submissions_org_producer_batch_idx'
        )::text
        || '|'
        || count(*) FILTER (
          WHERE indexname = 'import_submission_events_one_workflow_close_uk'
        )::text
        || '|'
        || count(*) FILTER (
          WHERE indexname = 'import_submission_events_one_workflow_start_uk'
        )::text
        || '|'
        || count(*) FILTER (
          WHERE indexname = 'contact_enrichment_requests_org_idempotency_hash_uk'
        )::text
        || '|'
        || count(*) FILTER (
          WHERE indexname = 'contact_enrichment_v2_requests_org_idempotency_uk'
        )::text
        || '|'
        || count(*) FILTER (
          WHERE indexname = 'contact_company_search_requests_org_idempotency_uk'
        )::text
      FROM pg_indexes
      WHERE schemaname = 'prospecting_app'`,
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
    },
  );

  if (
    verification.status !== 0 ||
    verification.stdout.trim() !== "0|1|1|1|1|1|1"
  ) {
    fail("app-owned migration verification failed");
  }
}

function smokeRequest(url, gatewayMaterial, authenticated, caFile) {
  const args = [
    "--silent",
    "--show-error",
    "--output",
    "/dev/null",
    "--write-out",
    "%{http_code}",
    "--max-time",
    "5",
  ];

  if (authenticated) {
    args.push(
      "--user",
      `${gatewayMaterial.username}:${gatewayMaterial.password}`,
    );
  }
  if (caFile !== undefined) {
    args.push("--cacert", caFile);
  }

  args.push(url);

  const result = spawnSync("curl", args, {
    encoding: "utf8",
    timeout: 8_000,
  });

  return result.status === 0 ? result.stdout.trim() : "";
}

async function smoke(gatewayMaterial) {
  const caCertificate = readKubectl(
    [
      "-n",
      namespace,
      "get",
      "configmap",
      "prospecta-contact-v2-ca",
      "--request-timeout=20s",
      "-o",
      "jsonpath={.data.ca\\.crt}",
    ],
    "read the Demo 3 contact CA",
  ).value;
  if (!caCertificate.includes("BEGIN CERTIFICATE")) {
    fail("Demo 3 contact CA is invalid");
  }
  const caFile = join(
    tmpdir(),
    `prospecta-demo3-contact-ca-${process.pid}.crt`,
  );
  writeFileSync(caFile, caCertificate, { mode: 0o600 });

  try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const anonymous = smokeRequest(
      `${nodePortUrl}/api/leads`,
      gatewayMaterial,
      false,
    );
    const login = smokeRequest(
      `${nodePortUrl}/login`,
      gatewayMaterial,
      true,
    );
    const leads = smokeRequest(
      `${nodePortUrl}/api/leads`,
      gatewayMaterial,
      true,
    );
    const secureAnonymous = smokeRequest(
      `${contactNodePortUrl}/api/leads`,
      gatewayMaterial,
      false,
      caFile,
    );
    const secureLogin = smokeRequest(
      `${contactNodePortUrl}/login`,
      gatewayMaterial,
      true,
      caFile,
    );
    const secureLeads = smokeRequest(
      `${contactNodePortUrl}/api/leads`,
      gatewayMaterial,
      true,
      caFile,
    );

    if (
      anonymous === "401" &&
      (login === "200" || login === "307") &&
      leads === "200" &&
      secureAnonymous === "401" &&
      (secureLogin === "200" || secureLogin === "307") &&
      secureLeads === "200"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  fail("Demo 3 NodePort smoke check failed");
  } finally {
    rmSync(caFile, { force: true });
  }
}

async function deploy(configuration) {
  const names = releaseNames(configuration);
  const reuseLocalImages = process.argv.includes("--reuse-local-images");
  const usePublishedImages = process.argv.includes("--published-images");
  const namespaceExists = assertTarget(configuration);
  command(process.execPath, ["scripts/prepare-demo3-contact-v2-tls.mjs"]);
  const deploymentConfiguration = {
    ...configuration,
    n8nImportEventSecret: resolveImportEventSecret(
      configuration,
      namespaceExists,
    ),
  };
  const preproductionSource = readPreproductionSource();
  const gatewayMaterial = createGatewayMaterial(configuration);
  if (usePublishedImages) {
    assertReleaseTagsPresent(names);
  } else {
    if (!reuseLocalImages) {
      assertTooling();
    }
    assertReleaseTagsAbsent(names);
  }
  const observedImages = namespaceExists
    ? capturePreviousImages()
    : { app: null, edge: null, proxy: null, postgres: null };
  const resumesCurrentRelease =
    observedImages.app === names.appImage &&
    observedImages.edge === names.edgeImage &&
    observedImages.proxy === names.proxyImage &&
    observedImages.postgres === names.postgresImage;
  const previousImages = resumesCurrentRelease
    ? { app: null, edge: null, proxy: null, postgres: null }
    : observedImages;

  if (!usePublishedImages) {
    if (reuseLocalImages) {
      assertLocalImages(names);
    } else {
      command("docker", ["build", "-t", names.appImage, "."], { timeout: 1_200_000 });
      command("docker", ["build", "-f", "k8s/Dockerfile.demo3-postgres", "-t", names.postgresImage, "."], { timeout: 900_000 });
      command("docker", ["build", "-f", "k8s/Dockerfile.demo3-edge", "-t", names.edgeImage, "."], { timeout: 600_000 });
      command("docker", ["build", "-f", "k8s/Dockerfile.postgres-loopback-proxy", "-t", names.proxyImage, "."], { timeout: 600_000 });
    }
    pushImages(names);
  }

  try {
    const manifest = renderManifest(deploymentConfiguration);
    applyExistingAppMigrations(observedImages.postgres !== null);
    applyStdin(manifest);
    applyStdin(
      secretManifest(
        deploymentConfiguration,
        preproductionSource,
        gatewayMaterial,
      ),
    );
    command("kubectl", ["-n", namespace, "rollout", "status", "statefulset/prospecta-demo3-postgres", "--timeout=600s"], { timeout: 650_000 });
    command("kubectl", ["-n", namespace, "rollout", "status", "deployment/prospecta-demo3", "--timeout=600s"], { timeout: 650_000 });
    await smoke(gatewayMaterial);
  } catch (error) {
    const hasPreviousRelease = Object.values(previousImages).some(
      (image) => image !== null,
    );
    const failedImages = hasPreviousRelease
      ? capturePreviousImages()
      : { app: null, edge: null, proxy: null, postgres: null };

    if (
      previousImages.postgres !== null &&
      failedImages.postgres === names.postgresImage
    ) {
      spawnSync(
        "kubectl",
        [
          "-n",
          namespace,
          "set",
          "image",
          "statefulset/prospecta-demo3-postgres",
          `postgres=${previousImages.postgres}`,
        ],
        { stdio: "inherit", timeout: 30_000 },
      );
      spawnSync(
        "kubectl",
        [
          "-n",
          namespace,
          "rollout",
          "status",
          "statefulset/prospecta-demo3-postgres",
          "--timeout=180s",
        ],
        { stdio: "inherit", timeout: 200_000 },
      );
    }

    if (
      previousImages.app !== null &&
      previousImages.edge !== null &&
      failedImages.app === names.appImage &&
      failedImages.edge === names.edgeImage &&
      failedImages.proxy === names.proxyImage
    ) {
      spawnSync(
        "kubectl",
        ["-n", namespace, "rollout", "undo", "deployment/prospecta-demo3"],
        { stdio: "inherit", timeout: 30_000 },
      );
      spawnSync(
        "kubectl",
        [
          "-n",
          namespace,
          "rollout",
          "status",
          "deployment/prospecta-demo3",
          "--timeout=180s",
        ],
        { stdio: "inherit", timeout: 200_000 },
      );
    }

    throw error;
  }

  console.log(`Demo 3 is ready at ${nodePortUrl}`);
  console.log(`Demo 3 contact-safe HTTPS is ready at ${contactNodePortUrl}`);
  console.log(
    `Retrieve the gateway password from secret/${names.gatewaySecretName}.`,
  );
}

async function main() {
  acquireDeploymentLock();
  const configuration = loadConfiguration();
  renderManifest(configuration);
  const names = releaseNames(configuration);

  if (process.argv.includes("--validate")) {
    console.log("Demo 3 local configuration is valid; no cluster mutation was attempted.");
    return;
  }

  if (process.argv.includes("--publish-local-images")) {
    assertReleaseTagsAbsent(names);
    assertLocalImages(names);
    pushImages(names);
    console.log("Demo 3 immutable images were published; no cluster mutation was attempted.");
    return;
  }

  if (process.argv.includes("--preflight")) {
    const namespaceExists = assertTarget(configuration);
    command(process.execPath, ["scripts/prepare-demo3-contact-v2-tls.mjs"]);
    resolveImportEventSecret(configuration, namespaceExists);
    readPreproductionSource();
    const reuseLocalImages = process.argv.includes("--reuse-local-images");
    const usePublishedImages = process.argv.includes("--published-images");
    if (!reuseLocalImages && !usePublishedImages) {
      assertTooling();
    }
    if (usePublishedImages) {
      assertReleaseTagsPresent(names);
    } else {
      assertReleaseTagsAbsent(names);
    }
    if (reuseLocalImages) {
      assertLocalImages(names);
    }
    console.log("Demo 3 target preflight passed; no cluster mutation was attempted.");
    return;
  }

  await deploy(configuration);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo 3 deployment failed");
  process.exitCode = 1;
});
