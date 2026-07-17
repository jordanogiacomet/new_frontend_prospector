import { execFileSync, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const namespace = "prospecta-demo3";
const environmentFile = ".env.demo3.local";
const manifestFile = "k8s/prospecta-demo3.yaml";
const nodePortUrl = "https://192.168.0.20:30100";
const gatewayUsername = "prospecta";
const sourceSecretNamespace = "prospecta-demo";
const sourceSecretName = "prospecta-demo-secrets";
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

  const configuration = {
    context: required("DEMO3_EXPECTED_CONTEXT"),
    server: required("DEMO3_EXPECTED_SERVER"),
    clusterUid: required("DEMO3_EXPECTED_CLUSTER_UID"),
    releaseId: required("DEMO3_RELEASE_ID"),
    postgresOwnerPassword: required("DEMO3_POSTGRES_OWNER_PASSWORD"),
    appDatabasePassword: required("DEMO3_APP_DATABASE_PASSWORD"),
    authSecret: required("AUTH_SECRET"),
    oidcClientSecret: required("AUTH_OIDC_CLIENT_SECRET"),
  };

  assertReleaseId(configuration.releaseId);
  if (Buffer.byteLength(configuration.authSecret, "utf8") < 32) {
    fail("AUTH_SECRET must contain at least 32 bytes");
  }
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

function decodeSecretValue(data, name) {
  const encoded = data[name];

  if (typeof encoded !== "string" || encoded === "") {
    fail(`${sourceSecretNamespace}/${sourceSecretName} lacks ${name}`);
  }

  const value = Buffer.from(encoded, "base64").toString("utf8");
  if (value.trim() === "") {
    fail(`${sourceSecretNamespace}/${sourceSecretName} has an empty ${name}`);
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

  const databaseUrl = decodeSecretValue(data, "DATABASE_URL");
  const producerDatabaseUrl = decodeSecretValue(
    data,
    "PRODUCER_DATABASE_URL",
  );
  const organizationId = decodeSecretValue(data, "AUTH_ALLOWED_ORG_ID");
  const sensitiveUrlHosts = decodeSecretValue(data, "SENSITIVE_URL_HOSTS");

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

  const directory = mkdtempSync(join(tmpdir(), "prospecta-demo3-tls-"));
  const keyPath = join(directory, "tls.key");
  const certificatePath = join(directory, "tls.crt");

  try {
    const certificate = spawnSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-nodes",
        "-days",
        "30",
        "-subj",
        "/CN=192.168.0.20",
        "-addext",
        "subjectAltName=IP:192.168.0.20",
        "-keyout",
        keyPath,
        "-out",
        certificatePath,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "ignore", "ignore"],
        timeout: 30_000,
      },
    );

    if (certificate.status !== 0) {
      fail("could not create the release-scoped TLS certificate");
    }

    return {
      username: gatewayUsername,
      password,
      htpasswd: htpasswd.stdout.trim(),
      certificate: readFileSync(certificatePath, "utf8"),
      privateKey: readFileSync(keyPath, "utf8"),
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
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
    .replaceAll("__GATEWAY_SECRET_NAME__", names.gatewaySecretName);

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
          "tls.crt": gatewayMaterial.certificate,
          "tls.key": gatewayMaterial.privateKey,
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

function smokeRequest(url, gatewayMaterial, authenticated) {
  const args = [
    "--insecure",
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

  args.push(url);

  const result = spawnSync("curl", args, {
    encoding: "utf8",
    timeout: 8_000,
  });

  return result.status === 0 ? result.stdout.trim() : "";
}

async function smoke(gatewayMaterial) {
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

    if (
      anonymous === "401" &&
      (login === "200" || login === "307") &&
      leads === "200"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  fail("Demo 3 NodePort smoke check failed");
}

async function deploy(configuration) {
  const names = releaseNames(configuration);
  const reuseLocalImages = process.argv.includes("--reuse-local-images");
  const usePublishedImages = process.argv.includes("--published-images");
  const namespaceExists = assertTarget(configuration);
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
    const manifest = renderManifest(configuration);
    applyStdin(manifest);
    applyStdin(
      secretManifest(
        configuration,
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
    assertTarget(configuration);
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
