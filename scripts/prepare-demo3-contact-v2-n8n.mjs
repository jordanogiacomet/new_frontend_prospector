import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { deriveDemo3ContactV2Material } from "./lib/demo3-contact-v2-material.mjs";
import {
  demo3ContactV2N8n,
  expectedDemo3ContactV2Bindings,
  renderDemo3ContactV2Credentials,
  renderDemo3ContactV2Workflow,
} from "./lib/demo3-contact-v2-n8n.mjs";

const environmentFile = ".env.demo3.local";
const appNamespace = "prospecta-demo3";
const appNamespaceMarker = "non-production";
const operatorLockFile = join(
  tmpdir(),
  "prospecta-demo3-contact-v2-n8n.lock",
);


function fail(message) {
  throw new Error(`Demo 3 contact v2 n8n preparation: ${message}`);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    fail(`${name} must be set in ${environmentFile}`);
  }
  if (value.includes("replace-with")) {
    fail(`${name} still contains a placeholder`);
  }
  return value;
}

function parseMode() {
  const allowed = new Set(["--preflight", "--import-inactive"]);
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !allowed.has(flag)) || flags.length > 1) {
    fail("use no flag, --preflight, or --import-inactive");
  }
  return flags[0] === "--import-inactive" ? "import" : "preflight";
}

function run(command, args, description, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: options.input,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: options.timeout ?? 30_000,
  });
  if (result.status !== 0) {
    fail(description);
  }
  return result.stdout.trim();
}

function kubectl(args, description, options) {
  return run("kubectl", args, description, options);
}

function sqlIdentifier(value, description) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    fail(`${description} metadata is not a safe SQL identifier`);
  }
  return `"${value}"`;
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildMetadataQuery(database) {
  const relation = (name) =>
    `${sqlIdentifier(database.schema, "database schema")}.${sqlIdentifier(
      `${database.tablePrefix}${name}`,
      "n8n relation",
    )}`;
  const workflow = relation("workflow_entity");
  const sharedWorkflow = relation("shared_workflow");
  const credentials = relation("credentials_entity");
  const sharedCredentials = relation("shared_credentials");
  const executions = relation("execution_entity");
  const webhooks = relation("webhook_entity");
  const bindingNodes = [
    "Webhook Contact Enrichment v2",
    "Lusha Prospecting Companies v2",
    "Lusha Decision Makers v2",
    "Lusha Enrich Selected Contact v2",
    "Callback Prospecta Preview v2",
    "Callback Prospecta Company Search v2",
    "Callback Prospecta Reveal v2",
  ]
    .map(sqlLiteral)
    .join(", ");

  return `
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH v1_rows AS (
  SELECT w.id,
         w.name,
         w.active,
         w."activeVersionId" AS "activeVersionId",
         sw."projectId" AS "projectId",
         sw.role
    FROM ${workflow} w
    LEFT JOIN ${sharedWorkflow} sw ON sw."workflowId" = w.id
   WHERE w.id = ${sqlLiteral(demo3ContactV2N8n.v1WorkflowId)}
      OR w.name = ${sqlLiteral(demo3ContactV2N8n.v1WorkflowName)}
),
v2_source AS (
  SELECT w.id,
         w.name,
         w.active,
         w."activeVersionId" AS "activeVersionId",
         w.settings,
         w.nodes,
         sw."projectId" AS "projectId",
         sw.role
    FROM ${workflow} w
    LEFT JOIN ${sharedWorkflow} sw ON sw."workflowId" = w.id
   WHERE w.id = ${sqlLiteral(demo3ContactV2N8n.workflowId)}
      OR w.name = ${sqlLiteral(demo3ContactV2N8n.workflowName)}
),
v2_rows AS (
  SELECT v.id,
         v.name,
         v.active,
         v."activeVersionId",
         v."projectId",
         v.role,
         COALESCE(v.settings, '{}'::json) AS settings,
         COALESCE((
           SELECT json_agg(binding.item ORDER BY binding.item::text)
             FROM (
               SELECT json_build_array(
                        node->>'name',
                        credential.key,
                        credential.value->>'id',
                        credential.value->>'name'
                      ) AS item
                 FROM json_array_elements(COALESCE(v.nodes, '[]'::json)) node
                 CROSS JOIN LATERAL json_each(
                   COALESCE(node->'credentials', '{}'::json)
                 ) credential
                WHERE node->>'name' IN (${bindingNodes})
             ) binding
         ), '[]'::json) AS bindings,
         (
           SELECT node->'parameters'->>'url'
             FROM json_array_elements(COALESCE(v.nodes, '[]'::json)) node
            WHERE node->>'name' = 'Callback Prospecta Preview v2'
            LIMIT 1
         ) AS "previewCallbackUrl",
         (
           SELECT node->'parameters'->>'url'
             FROM json_array_elements(COALESCE(v.nodes, '[]'::json)) node
            WHERE node->>'name' = 'Callback Prospecta Company Search v2'
            LIMIT 1
         ) AS "companySearchCallbackUrl",
         (
           SELECT node->'parameters'->>'url'
             FROM json_array_elements(COALESCE(v.nodes, '[]'::json)) node
            WHERE node->>'name' = 'Callback Prospecta Reveal v2'
            LIMIT 1
         ) AS "revealCallbackUrl",
         (
           SELECT node->'parameters'->>'path'
             FROM json_array_elements(COALESCE(v.nodes, '[]'::json)) node
            WHERE node->>'name' = 'Webhook Contact Enrichment v2'
            LIMIT 1
         ) AS "webhookPath",
         (
           SELECT node->'parameters'->>'authentication'
             FROM json_array_elements(COALESCE(v.nodes, '[]'::json)) node
            WHERE node->>'name' = 'Webhook Contact Enrichment v2'
            LIMIT 1
         ) AS "webhookAuthentication"
    FROM v2_source v
),
credential_rows AS (
  SELECT c.id,
         c.name,
         c.type,
         sc."projectId" AS "projectId",
         sc.role
    FROM ${credentials} c
    LEFT JOIN ${sharedCredentials} sc ON sc."credentialsId" = c.id
   WHERE c.id IN (
           ${sqlLiteral(demo3ContactV2N8n.ingressCredentialId)},
           ${sqlLiteral(demo3ContactV2N8n.callbackCredentialId)}
         )
      OR c.name IN (
           ${sqlLiteral(demo3ContactV2N8n.ingressCredentialName)},
           ${sqlLiteral(demo3ContactV2N8n.callbackCredentialName)},
           ${sqlLiteral(demo3ContactV2N8n.lushaCredentialName)}
         )
)
SELECT json_build_object(
  'v1Rows', COALESCE(
    (SELECT json_agg(row_to_json(v1_row)) FROM v1_rows v1_row),
    '[]'::json
  ),
  'v2Rows', COALESCE(
    (SELECT json_agg(row_to_json(v2_row)) FROM v2_rows v2_row),
    '[]'::json
  ),
  'credentialRows', COALESCE(
    (SELECT json_agg(row_to_json(credential_row))
       FROM credential_rows credential_row),
    '[]'::json
  ),
  'activeExecutionCount', (
    SELECT COUNT(*)::integer
      FROM ${executions}
     WHERE "stoppedAt" IS NULL AND "deletedAt" IS NULL
  ),
  'v2WebhookRegistrationCount', (
    SELECT COUNT(*)::integer
      FROM ${webhooks}
     WHERE "workflowId" = ${sqlLiteral(demo3ContactV2N8n.workflowId)}
  )
)::text;
ROLLBACK;
`;
}

function deploymentHealth(name) {
  const raw = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "get",
      "deployment",
      name,
      "--request-timeout=20s",
      "-o",
      "jsonpath={.metadata.namespace}|{.metadata.name}|{.metadata.generation}|{.spec.replicas}|{.status.observedGeneration}|{.status.updatedReplicas}|{.status.readyReplicas}|{.status.availableReplicas}|{.status.unavailableReplicas}",
    ],
    `could not inspect deployment/${name}`,
  );
  const [namespace, observedName, generation, replicas, observed, updated, ready, available, unavailable] =
    raw.split("|");
  if (
    namespace !== demo3ContactV2N8n.namespace ||
    observedName !== name ||
    replicas !== "1" ||
    observed !== generation ||
    updated !== "1" ||
    ready !== "1" ||
    available !== "1" ||
    (unavailable !== "" && unavailable !== "0")
  ) {
    fail(`deployment/${name} is not a healthy single-replica Demo 3 target`);
  }
}

function deploymentSecretReferences(name) {
  const raw = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "get",
      "deployment",
      name,
      "--request-timeout=20s",
      "-o",
      "jsonpath={range .spec.template.spec.containers[*].env[*]}{.valueFrom.secretKeyRef.name}{\"\\n\"}{end}{range .spec.template.spec.containers[*].envFrom[*]}{.secretRef.name}{\"\\n\"}{end}",
    ],
    `could not inspect deployment/${name} Secret references`,
  );
  return new Set(raw.split(/\s+/).filter(Boolean));
}

function readPodEnvironment(deployment, names) {
  const reader = `const names=${JSON.stringify(names)};const result={};for(const name of names){result[name]=process.env[name]??null;}process.stdout.write(JSON.stringify(result));`;
  const raw = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "exec",
      `deployment/${deployment}`,
      "--request-timeout=20s",
      "--",
      "node",
      "-e",
      reader,
    ],
    `could not read approved deployment/${deployment} environment metadata`,
  );
  try {
    return JSON.parse(raw);
  } catch {
    fail(`deployment/${deployment} environment metadata is invalid`);
  }
}

function loadConfiguration() {
  if (!existsSync(environmentFile)) {
    fail(`requires ${environmentFile}; copy .env.demo3.example first`);
  }
  process.loadEnvFile(environmentFile);

  const configuration = {
    context: requiredEnvironment("DEMO3_EXPECTED_CONTEXT"),
    server: requiredEnvironment("DEMO3_EXPECTED_SERVER"),
    clusterUid: requiredEnvironment("DEMO3_EXPECTED_CLUSTER_UID"),
    n8nNamespaceUid: requiredEnvironment(
      "DEMO3_EXPECTED_N8N_NAMESPACE_UID",
    ),
    authSecret: requiredEnvironment("AUTH_SECRET"),
  };
  const server = new URL(configuration.server);
  if (
    server.protocol !== "https:" ||
    server.hostname !== "192.168.0.20" ||
    server.port !== "6443" ||
    server.pathname !== "/"
  ) {
    fail("DEMO3_EXPECTED_SERVER must identify the exact local HTTPS API server");
  }
  if (Buffer.byteLength(configuration.authSecret, "utf8") < 32) {
    fail("AUTH_SECRET must contain at least 32 bytes");
  }

  return configuration;
}

function assertClusterTarget(configuration) {
  const context = kubectl(
    ["config", "current-context"],
    "could not read the current Kubernetes context",
  );
  if (context !== configuration.context) {
    fail("current Kubernetes context does not match Demo 3");
  }

  const server = kubectl(
    ["config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}"],
    "could not read the Kubernetes API server",
  );
  if (server !== configuration.server) {
    fail("Kubernetes API server does not match Demo 3");
  }

  const clusterUid = kubectl(
    [
      "get",
      "namespace",
      "kube-system",
      "--request-timeout=20s",
      "-o",
      "jsonpath={.metadata.uid}",
    ],
    "could not verify the kube-system UID",
  );
  if (clusterUid !== configuration.clusterUid) {
    fail("kube-system UID does not match Demo 3");
  }

  const marker = kubectl(
    [
      "get",
      "namespace",
      appNamespace,
      "--request-timeout=20s",
      "-o",
      "jsonpath={.metadata.labels.prospecta\\.openai\\.local/environment}",
    ],
    "could not verify the Demo 3 namespace marker",
  );
  if (marker !== appNamespaceMarker) {
    fail("Prospecta namespace lacks the non-production marker");
  }

  const n8nNamespace = kubectl(
    [
      "get",
      "namespace",
      demo3ContactV2N8n.namespace,
      "--request-timeout=20s",
      "-o",
      "jsonpath={.metadata.name}|{.metadata.labels.kubernetes\\.io/metadata\\.name}|{.metadata.uid}",
    ],
    "could not verify the n8n namespace",
  );
  if (n8nNamespace !== `n8n|n8n|${configuration.n8nNamespaceUid}`) {
    fail("n8n namespace identity does not match Demo 3");
  }
}

function inspectN8nRuntime() {
  deploymentHealth(demo3ContactV2N8n.deployment);
  deploymentHealth(demo3ContactV2N8n.postgresDeployment);

  const secretMetadata = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "get",
      "secret",
      demo3ContactV2N8n.secretName,
      "--request-timeout=20s",
      "-o",
      "jsonpath={.metadata.namespace}|{.metadata.name}|{.metadata.uid}",
    ],
    "could not verify the n8n Secret metadata",
  );
  const [secretNamespace, secretName, secretUid] = secretMetadata.split("|");
  if (
    secretNamespace !== demo3ContactV2N8n.namespace ||
    secretName !== demo3ContactV2N8n.secretName ||
    !/^[0-9a-f-]{36}$/i.test(secretUid)
  ) {
    fail("n8n Secret metadata does not match the approved namespace");
  }

  for (const deployment of [
    demo3ContactV2N8n.deployment,
    demo3ContactV2N8n.postgresDeployment,
  ]) {
    if (
      !deploymentSecretReferences(deployment).has(
        demo3ContactV2N8n.secretName,
      )
    ) {
      fail(`deployment/${deployment} does not reference the exact n8n Secret`);
    }
  }

  const version = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "exec",
      `deployment/${demo3ContactV2N8n.deployment}`,
      "--request-timeout=20s",
      "--",
      "n8n",
      "--version",
    ],
    "could not read the n8n version",
  );
  if (version !== demo3ContactV2N8n.n8nVersion) {
    fail(`n8n must be exactly ${demo3ContactV2N8n.n8nVersion}`);
  }

  const n8nDatabase = readPodEnvironment(demo3ContactV2N8n.deployment, [
    "DB_TYPE",
    "DB_POSTGRESDB_HOST",
    "DB_POSTGRESDB_DATABASE",
    "DB_POSTGRESDB_USER",
    "DB_POSTGRESDB_SCHEMA",
    "DB_TABLE_PREFIX",
  ]);
  if (
    n8nDatabase.DB_TYPE !== "postgresdb" ||
    n8nDatabase.DB_POSTGRESDB_HOST !== demo3ContactV2N8n.postgresDeployment
  ) {
    fail("n8n does not use the exact Demo 3 PostgreSQL deployment");
  }

  const database = n8nDatabase.DB_POSTGRESDB_DATABASE;
  const user = n8nDatabase.DB_POSTGRESDB_USER;
  const schema = n8nDatabase.DB_POSTGRESDB_SCHEMA || "public";
  const tablePrefix = n8nDatabase.DB_TABLE_PREFIX || "";
  for (const [value, description] of [
    [database, "n8n database"],
    [user, "n8n database user"],
    [schema, "n8n database schema"],
  ]) {
    if (typeof value !== "string") {
      fail(`${description} metadata is missing`);
    }
    sqlIdentifier(value, description);
  }
  if (
    typeof tablePrefix !== "string" ||
    (tablePrefix !== "" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tablePrefix))
  ) {
    fail("n8n table prefix metadata is invalid");
  }

  const postgresDatabase = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "exec",
      `deployment/${demo3ContactV2N8n.postgresDeployment}`,
      "--request-timeout=20s",
      "--",
      "printenv",
      "POSTGRES_DB",
    ],
    "could not verify the PostgreSQL database metadata",
  );
  const postgresUser = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "exec",
      `deployment/${demo3ContactV2N8n.postgresDeployment}`,
      "--request-timeout=20s",
      "--",
      "printenv",
      "POSTGRES_USER",
    ],
    "could not verify the PostgreSQL user metadata",
  );
  if (postgresDatabase !== database || postgresUser !== user) {
    fail("n8n and PostgreSQL deployment metadata do not match");
  }

  return { database, user, schema, tablePrefix };
}

function readN8nMetadata(database) {
  const query = buildMetadataQuery(database);
  const raw = kubectl(
    [
      "-n",
      demo3ContactV2N8n.namespace,
      "exec",
      "--stdin",
      `deployment/${demo3ContactV2N8n.postgresDeployment}`,
      "--request-timeout=30s",
      "--",
      "sh",
      "-c",
      'PGPASSWORD="${POSTGRES_PASSWORD:?}" exec psql -X --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}"',
    ],
    "could not read approved n8n PostgreSQL metadata",
    { input: query, timeout: 30_000 },
  );

  try {
    return JSON.parse(raw);
  } catch {
    fail("n8n PostgreSQL metadata response is invalid");
  }
}

function exactOwner(rows, expected, description) {
  const matches = rows.filter(
    (row) =>
      row.id === expected.id &&
      row.name === expected.name &&
      row.projectId === expected.projectId &&
      row.role === expected.role &&
      (expected.type === undefined || row.type === expected.type),
  );
  if (rows.length !== 1 || matches.length !== 1) {
    fail(`${description} metadata is not exact`);
  }
  return matches[0];
}

function assertNoRuntimeActivity(metadata) {
  if (metadata.activeExecutionCount !== 0) {
    fail("n8n has active executions; no import is allowed");
  }
  if (metadata.v2WebhookRegistrationCount !== 0) {
    fail("the v2 workflow has a webhook registration while inactive");
  }
}

function inspectApprovedMetadata(metadata) {
  if (
    !Array.isArray(metadata?.v1Rows) ||
    !Array.isArray(metadata?.v2Rows) ||
    !Array.isArray(metadata?.credentialRows)
  ) {
    fail("n8n metadata shape is invalid");
  }
  assertNoRuntimeActivity(metadata);

  const v1 = exactOwner(
    metadata.v1Rows,
    {
      id: demo3ContactV2N8n.v1WorkflowId,
      name: demo3ContactV2N8n.v1WorkflowName,
      projectId: metadata.v1Rows[0]?.projectId,
      role: "workflow:owner",
    },
    "v1 workflow",
  );
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(v1.projectId)) {
    fail("v1 project ID metadata is invalid");
  }

  const lushaRows = metadata.credentialRows.filter(
    (row) => row.name === demo3ContactV2N8n.lushaCredentialName,
  );
  const lusha = exactOwner(
    lushaRows,
    {
      id: lushaRows[0]?.id,
      name: demo3ContactV2N8n.lushaCredentialName,
      type: demo3ContactV2N8n.credentialType,
      projectId: v1.projectId,
      role: "credential:owner",
    },
    "Lusha credential",
  );
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(lusha.id)) {
    fail("Lusha credential ID metadata is invalid");
  }

  const existingV2CredentialRows = metadata.credentialRows.filter(
    (row) => row.name !== demo3ContactV2N8n.lushaCredentialName,
  );
  for (const expected of [
    {
      id: demo3ContactV2N8n.ingressCredentialId,
      name: demo3ContactV2N8n.ingressCredentialName,
    },
    {
      id: demo3ContactV2N8n.callbackCredentialId,
      name: demo3ContactV2N8n.callbackCredentialName,
    },
  ]) {
    const candidates = existingV2CredentialRows.filter(
      (row) => row.id === expected.id || row.name === expected.name,
    );
    if (candidates.length > 0) {
      exactOwner(
        candidates,
        {
          ...expected,
          type: demo3ContactV2N8n.credentialType,
          projectId: v1.projectId,
          role: "credential:owner",
        },
        expected.name,
      );
    }
  }

  if (metadata.v2Rows.length > 0) {
    assertImportedWorkflow(metadata, v1.projectId, lusha);
  }

  return { projectId: v1.projectId, lusha };
}

function normalizedBindings(bindings) {
  return [...bindings].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function assertImportedWorkflow(metadata, projectId, lusha) {
  const workflow = exactOwner(
    metadata.v2Rows,
    {
      id: demo3ContactV2N8n.workflowId,
      name: demo3ContactV2N8n.workflowName,
      projectId,
      role: "workflow:owner",
    },
    "v2 workflow",
  );
  if (workflow.active !== false || workflow.activeVersionId !== null) {
    fail("v2 workflow is not fully inactive");
  }
  if (
    workflow.settings?.saveDataSuccessExecution !== "none" ||
    workflow.settings?.saveDataErrorExecution !== "none" ||
    workflow.settings?.saveManualExecutions !== false
  ) {
    fail("v2 workflow execution-data settings are unsafe");
  }
  const expectedBindings = expectedDemo3ContactV2Bindings(lusha);
  if (
    JSON.stringify(normalizedBindings(workflow.bindings)) !==
    JSON.stringify(normalizedBindings(expectedBindings))
  ) {
    fail("v2 workflow credential bindings are not exact");
  }
  if (
    workflow.previewCallbackUrl !== demo3ContactV2N8n.previewCallbackUrl ||
    workflow.companySearchCallbackUrl !==
      demo3ContactV2N8n.companySearchCallbackUrl ||
    workflow.revealCallbackUrl !== demo3ContactV2N8n.revealCallbackUrl ||
    workflow.webhookPath !== "prospecta/lusha/contact-enrichment-v2" ||
    workflow.webhookAuthentication !== "headerAuth"
  ) {
    fail("v2 workflow endpoint metadata is not exact");
  }
  assertNoRuntimeActivity(metadata);
}

function assertImportedCredentials(metadata, projectId) {
  for (const expected of [
    {
      id: demo3ContactV2N8n.ingressCredentialId,
      name: demo3ContactV2N8n.ingressCredentialName,
    },
    {
      id: demo3ContactV2N8n.callbackCredentialId,
      name: demo3ContactV2N8n.callbackCredentialName,
    },
  ]) {
    exactOwner(
      metadata.credentialRows.filter(
        (row) => row.id === expected.id || row.name === expected.name,
      ),
      {
        ...expected,
        type: demo3ContactV2N8n.credentialType,
        projectId,
        role: "credential:owner",
      },
      expected.name,
    );
  }
}

function importJson(kind, value, projectId) {
  const command = kind === "credentials" ? "import:credentials" : "import:workflow";
  const args = [
    "-n",
    demo3ContactV2N8n.namespace,
    "exec",
    "--stdin",
    `deployment/${demo3ContactV2N8n.deployment}`,
    "--request-timeout=60s",
    "--",
    "n8n",
    command,
    "--input=/dev/stdin",
    `--projectId=${projectId}`,
  ];
  if (kind === "workflow") {
    args.push("--activeState=false");
  }

  kubectl(args, `n8n ${kind} import failed`, {
    input: JSON.stringify(value),
    timeout: 120_000,
  });
}

function acquireOperatorLock() {
  let descriptor;
  try {
    descriptor = openSync(operatorLockFile, "wx", 0o600);
    writeFileSync(descriptor, String(process.pid));
  } catch {
    fail("another contact v2 n8n preparation is already active");
  }

  return () => {
    closeSync(descriptor);
    rmSync(operatorLockFile, { force: true });
  };
}

function main() {
  const mode = parseMode();
  const configuration = loadConfiguration();
  const referenceWorkflow = JSON.parse(
    readFileSync(resolve(demo3ContactV2N8n.referenceWorkflowPath), "utf8"),
  );
  const material = deriveDemo3ContactV2Material(configuration.authSecret);
  const credentials = renderDemo3ContactV2Credentials(material);

  assertClusterTarget(configuration);
  const n8nDatabase = inspectN8nRuntime();
  const before = readN8nMetadata(n8nDatabase);
  const approved = inspectApprovedMetadata(before);
  const workflow = renderDemo3ContactV2Workflow(
    referenceWorkflow,
    approved.lusha,
  );

  if (mode === "preflight") {
    console.log(
      "Demo 3 contact v2 n8n preflight passed; no cluster or n8n mutation was attempted.",
    );
    return;
  }

  const releaseLock = acquireOperatorLock();
  try {
    const immediatelyBefore = readN8nMetadata(n8nDatabase);
    const current = inspectApprovedMetadata(immediatelyBefore);
    if (
      current.projectId !== approved.projectId ||
      current.lusha.id !== approved.lusha.id
    ) {
      fail("approved n8n metadata changed after preflight");
    }

    importJson("credentials", credentials, approved.projectId);
    const afterCredentials = readN8nMetadata(n8nDatabase);
    assertNoRuntimeActivity(afterCredentials);
    assertImportedCredentials(afterCredentials, approved.projectId);

    importJson("workflow", workflow, approved.projectId);
    const afterWorkflow = readN8nMetadata(n8nDatabase);
    assertImportedCredentials(afterWorkflow, approved.projectId);
    assertImportedWorkflow(afterWorkflow, approved.projectId, approved.lusha);
  } finally {
    releaseLock();
  }

  console.log(
    "Demo 3 contact v2 credentials and workflow were prepared inactive; no workflow was published or executed.",
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Demo 3 contact v2 n8n preparation failed",
  );
  process.exitCode = 1;
}
