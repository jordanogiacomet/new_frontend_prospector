import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const environmentFile = ".env.demo3.local";
const appNamespace = "prospecta-demo3";
const n8nNamespace = "n8n";
const n8nDeployment = "n8n";
const postgresDeployment = "postgres";
const tlsSecretName = "prospecta-contact-v2-tls";
const caConfigMapName = "prospecta-contact-v2-ca";
const n8nCaPath = "/home/node/contact-v2-ca.crt";
const n8nRuntimeEnvironment = [
  { name: "NODE_EXTRA_CA_CERTS", value: n8nCaPath },
  { name: "EXECUTIONS_DATA_PRUNE", value: "true" },
  { name: "EXECUTIONS_DATA_HARD_DELETE_BUFFER", value: "0" },
  { name: "EXECUTIONS_DATA_PRUNE_HARD_DELETE_INTERVAL", value: "1" },
];
const contactNodePort = 30443;
const contactHost = "192.168.0.20";
const expectedN8nVersion = "2.30.6";

function fail(message) {
  throw new Error(`Demo 3 contact TLS: ${message}`);
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    ...options,
  });
  if (result.status !== 0) {
    fail(options.description ?? `${command} failed`);
  }
  return result.stdout.trim();
}

function kubectl(args, description, options = {}) {
  return run("kubectl", args, { description, ...options });
}

function readJson(args, description) {
  const serialized = kubectl([...args, "-o", "json"], description);
  try {
    return JSON.parse(serialized);
  } catch {
    fail(`${description} returned invalid JSON`);
  }
}

function decodeSecretValue(secret, key) {
  const encoded = secret?.data?.[key];
  if (typeof encoded !== "string" || encoded === "") {
    fail(`n8n-secrets lacks ${key}`);
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}

function assertTarget(configuration) {
  const context = kubectl(
    ["config", "current-context"],
    "could not read the current Kubernetes context",
  );
  if (context !== configuration.context) {
    fail(`current context ${context} is not the approved context`);
  }

  const server = kubectl(
    [
      "config",
      "view",
      "--minify",
      "-o",
      "jsonpath={.clusters[0].cluster.server}",
    ],
    "could not read the current Kubernetes API server",
  );
  if (server !== configuration.server || !server.startsWith("https://")) {
    fail("the Kubernetes API server does not match the approved HTTPS target");
  }

  const clusterUid = kubectl(
    ["get", "namespace", "kube-system", "-o", "jsonpath={.metadata.uid}"],
    "could not verify the kube-system UID",
  );
  if (clusterUid !== configuration.clusterUid) {
    fail("kube-system UID does not match the approved local cluster");
  }

  const appMarker = kubectl(
    [
      "get",
      "namespace",
      appNamespace,
      "-o",
      "jsonpath={.metadata.labels.prospecta\\.openai\\.local/environment}",
    ],
    "could not verify the Demo 3 namespace marker",
  );
  if (appMarker !== "non-production") {
    fail("the Demo 3 namespace lacks the non-production marker");
  }

  const n8nUid = kubectl(
    ["get", "namespace", n8nNamespace, "-o", "jsonpath={.metadata.uid}"],
    "could not verify the n8n namespace UID",
  );
  if (n8nUid !== configuration.n8nNamespaceUid) {
    fail("n8n namespace UID does not match the identified Demo 3 target");
  }

  const n8nVersion = kubectl(
    ["-n", n8nNamespace, "exec", `deployment/${n8nDeployment}`, "--", "n8n", "--version"],
    "could not verify the live n8n version",
  );
  if (n8nVersion !== expectedN8nVersion) {
    fail(`n8n ${n8nVersion || "unknown"} is not the approved ${expectedN8nVersion} target`);
  }

  const services = readJson(
    ["get", "service", "--all-namespaces"],
    "could not inspect allocated NodePorts",
  );
  const owner = services.items.find((service) =>
    service.spec?.ports?.some((port) => port.nodePort === contactNodePort),
  );
  if (
    owner !== undefined &&
    (owner.metadata?.namespace !== appNamespace ||
      owner.metadata?.name !== "prospecta-demo3")
  ) {
    fail(`NodePort ${contactNodePort} is already owned by another Service`);
  }
}

function assertNoActiveN8nExecutions() {
  const secret = readJson(
    ["-n", n8nNamespace, "get", "secret", "n8n-secrets"],
    "could not read n8n database metadata",
  );
  const database = decodeSecretValue(secret, "POSTGRES_DB");
  const user = decodeSecretValue(secret, "POSTGRES_USER");
  const count = kubectl(
    [
      "-n",
      n8nNamespace,
      "exec",
      `deployment/${postgresDeployment}`,
      "--",
      "psql",
      "-X",
      "-U",
      user,
      "-d",
      database,
      "-Atqc",
      "SELECT count(*) FROM execution_entity WHERE \"deletedAt\" IS NULL AND status NOT IN ('success', 'error', 'canceled', 'crashed')",
    ],
    "could not verify active n8n executions",
  );
  if (count !== "0") {
    fail("n8n has an active or waiting execution; no restart was attempted");
  }
}

function existingResource(kind, namespace, name) {
  const result = spawnSync(
    "kubectl",
    ["-n", namespace, "get", kind, name, "-o", "json"],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (result.status === 0) return JSON.parse(result.stdout);
  if (result.stderr.includes("NotFound")) return null;
  fail(`could not inspect ${namespace}/${kind}/${name}`);
}

function inspectExistingMaterial() {
  const tls = existingResource("secret", appNamespace, tlsSecretName);
  const appCa = existingResource("configmap", appNamespace, caConfigMapName);
  const n8nCa = existingResource("configmap", n8nNamespace, caConfigMapName);
  const present = [tls, appCa, n8nCa].filter((value) => value !== null).length;
  if (present !== 0 && present !== 3) {
    fail("contact TLS material is incomplete; refusing a partial overwrite");
  }
  if (present === 0) return null;

  const ca = appCa.data?.["ca.crt"];
  if (
    typeof ca !== "string" ||
    ca === "" ||
    n8nCa.data?.["ca.crt"] !== ca ||
    typeof tls.data?.["tls.crt"] !== "string" ||
    typeof tls.data?.["tls.key"] !== "string"
  ) {
    fail("existing contact TLS material is invalid or inconsistent");
  }
  return { ca, certificate: Buffer.from(tls.data["tls.crt"], "base64") };
}

function certificateMetadata(certificate, ca) {
  const directory = mkdtempSync(join(tmpdir(), "prospecta-contact-v2-cert-check-"));
  try {
    const certificateFile = join(directory, "tls.crt");
    const caFile = join(directory, "ca.crt");
    writeFileSync(certificateFile, certificate, { mode: 0o600 });
    writeFileSync(caFile, ca, { mode: 0o600 });
    run("openssl", ["verify", "-CAfile", caFile, certificateFile], {
      description: "the existing TLS certificate is not signed by the configured CA",
    });
    const metadata = run(
      "openssl",
      ["x509", "-in", certificateFile, "-noout", "-checkend", "86400", "-ext", "subjectAltName"],
      { description: "the existing TLS certificate is expired or unreadable" },
    );
    if (!metadata.includes(`IP Address:${contactHost}`)) {
      fail(`the TLS certificate is not valid for ${contactHost}`);
    }
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function createCertificates() {
  const directory = mkdtempSync(join(tmpdir(), "prospecta-contact-v2-tls-"));
  const paths = {
    caKey: join(directory, "ca.key"),
    caCertificate: join(directory, "ca.crt"),
    serverKey: join(directory, "tls.key"),
    request: join(directory, "tls.csr"),
    certificate: join(directory, "tls.crt"),
    extensions: join(directory, "tls.ext"),
  };
  try {
    run("openssl", ["genrsa", "-out", paths.caKey, "3072"], {
      description: "could not generate the local Demo 3 CA key",
    });
    run(
      "openssl",
      [
        "req",
        "-x509",
        "-new",
        "-sha256",
        "-key",
        paths.caKey,
        "-out",
        paths.caCertificate,
        "-days",
        "3650",
        "-subj",
        "/CN=Prospecta Demo 3 Contact v2 Local CA",
        "-addext",
        "basicConstraints=critical,CA:TRUE",
        "-addext",
        "keyUsage=critical,keyCertSign,cRLSign",
      ],
      { description: "could not generate the local Demo 3 CA certificate" },
    );
    run("openssl", ["genrsa", "-out", paths.serverKey, "3072"], {
      description: "could not generate the Demo 3 TLS key",
    });
    run(
      "openssl",
      [
        "req",
        "-new",
        "-key",
        paths.serverKey,
        "-out",
        paths.request,
        "-subj",
        `/CN=${contactHost}`,
      ],
      { description: "could not generate the Demo 3 TLS request" },
    );
    writeFileSync(
      paths.extensions,
      [
        "basicConstraints=critical,CA:FALSE",
        "keyUsage=critical,digitalSignature,keyEncipherment",
        "extendedKeyUsage=serverAuth",
        `subjectAltName=IP:${contactHost}`,
        "subjectKeyIdentifier=hash",
        "authorityKeyIdentifier=keyid,issuer",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    run(
      "openssl",
      [
        "x509",
        "-req",
        "-sha256",
        "-in",
        paths.request,
        "-CA",
        paths.caCertificate,
        "-CAkey",
        paths.caKey,
        "-CAcreateserial",
        "-out",
        paths.certificate,
        "-days",
        "825",
        "-extfile",
        paths.extensions,
      ],
      { description: "could not sign the Demo 3 TLS certificate" },
    );

    const ca = readFileSync(paths.caCertificate, "utf8");
    const certificate = readFileSync(paths.certificate, "utf8");
    const privateKey = readFileSync(paths.serverKey, "utf8");
    certificateMetadata(certificate, ca);
    return { ca, certificate, privateKey };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function applyResource(resource) {
  run("kubectl", ["apply", "-f", "-"], {
    input: JSON.stringify(resource),
    stdio: ["pipe", "pipe", "pipe"],
    description: `could not apply ${resource.metadata.namespace}/${resource.kind}/${resource.metadata.name}`,
  });
}

function provisionMaterial(material) {
  const labels = {
    "app.kubernetes.io/name": "prospecta",
    "app.kubernetes.io/instance": "demo3",
    "app.kubernetes.io/component": "contact-v2-tls",
  };
  applyResource({
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: tlsSecretName, namespace: appNamespace, labels },
    type: "kubernetes.io/tls",
    stringData: { "tls.crt": material.certificate, "tls.key": material.privateKey },
  });
  for (const namespace of [appNamespace, n8nNamespace]) {
    applyResource({
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: caConfigMapName, namespace, labels },
      data: { "ca.crt": material.ca },
    });
  }
}

function configureN8nTrust() {
  const deployment = readJson(
    ["-n", n8nNamespace, "get", "deployment", n8nDeployment],
    "could not read the n8n deployment",
  );
  const container = deployment.spec?.template?.spec?.containers?.find(
    (candidate) => candidate.name === "n8n",
  );
  if (container === undefined) fail("the n8n deployment has no n8n container");

  const alreadyConfigured =
    n8nRuntimeEnvironment.every((expected) =>
      container.env?.some(
        (entry) =>
          entry.name === expected.name && entry.value === expected.value,
      ),
    ) &&
    container.volumeMounts?.some(
      (mount) =>
        mount.name === "prospecta-contact-v2-ca" &&
        mount.mountPath === n8nCaPath,
    );
  if (alreadyConfigured) return false;

  const patch = {
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: "n8n",
              env: n8nRuntimeEnvironment,
              volumeMounts: [
                {
                  name: "prospecta-contact-v2-ca",
                  mountPath: n8nCaPath,
                  subPath: "ca.crt",
                  readOnly: true,
                },
              ],
            },
          ],
          volumes: [
            {
              name: "prospecta-contact-v2-ca",
              configMap: {
                name: caConfigMapName,
                items: [{ key: "ca.crt", path: "ca.crt" }],
              },
            },
          ],
        },
      },
    },
  };
  kubectl(
    [
      "-n",
      n8nNamespace,
      "patch",
      "deployment",
      n8nDeployment,
      "--type=strategic",
      "-p",
      JSON.stringify(patch),
    ],
    "could not configure n8n with the Demo 3 contact CA",
  );
  return true;
}

function verifyN8nTrust() {
  const deployment = readJson(
    ["-n", n8nNamespace, "get", "deployment", n8nDeployment],
    "could not verify the n8n deployment",
  );
  const container = deployment.spec?.template?.spec?.containers?.find(
    (candidate) => candidate.name === "n8n",
  );
  if (
    !n8nRuntimeEnvironment.every((expected) =>
      container?.env?.some(
        (entry) =>
          entry.name === expected.name && entry.value === expected.value,
      ),
    ) ||
    !container.volumeMounts?.some(
      (mount) => mount.name === "prospecta-contact-v2-ca",
    )
  ) {
    fail("n8n does not trust the contact v2 CA");
  }
}

function loadConfiguration() {
  try {
    process.loadEnvFile(environmentFile);
  } catch {
    fail(`requires ${environmentFile}`);
  }
  return {
    context: required("DEMO3_EXPECTED_CONTEXT"),
    server: required("DEMO3_EXPECTED_SERVER"),
    clusterUid: required("DEMO3_EXPECTED_CLUSTER_UID"),
    n8nNamespaceUid: required("DEMO3_EXPECTED_N8N_NAMESPACE_UID"),
  };
}

function main() {
  const configuration = loadConfiguration();
  assertTarget(configuration);
  assertNoActiveN8nExecutions();
  const provisioning = process.argv.includes("--provision");
  const existing = inspectExistingMaterial();
  if (existing !== null) {
    certificateMetadata(existing.certificate, existing.ca);
    if (!provisioning) verifyN8nTrust();
  }

  if (!provisioning) {
    console.log(
      existing === null
        ? "Demo 3 contact TLS preflight passed; material is not provisioned and no mutation was attempted."
        : "Demo 3 contact TLS preflight passed; existing material is valid and no mutation was attempted.",
    );
    return;
  }

  if (existing === null) provisionMaterial(createCertificates());
  const restarted = configureN8nTrust();
  if (restarted) {
    kubectl(
      ["-n", n8nNamespace, "rollout", "status", `deployment/${n8nDeployment}`, "--timeout=180s"],
      "n8n did not become ready after installing the contact CA",
      { timeout: 210_000 },
    );
  }
  verifyN8nTrust();
  console.log(
    `Demo 3 contact TLS material is ready for https://${contactHost}:${contactNodePort}; the app release was not deployed.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo 3 contact TLS failed");
  process.exitCode = 1;
}
