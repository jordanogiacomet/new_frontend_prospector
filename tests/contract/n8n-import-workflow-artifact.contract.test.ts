import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ARTIFACT_DIRECTORY = resolve(
  process.cwd(),
  "integrations/n8n/prospecting-import-v1",
);
const WORKFLOW_PATH = resolve(ARTIFACT_DIRECTORY, "workflow.json");
const CONTRACT_PATH = resolve(ARTIFACT_DIRECTORY, "workflow-contract.json");
const README_PATH = resolve(ARTIFACT_DIRECTORY, "README.md");

const WEBHOOK_NODE = "Webhook Prospecta Import v1";
const ACCEPTANCE_NODE = "Accept Batch Atomically";
const RESPONSE_NODE = "Respond Durable Acceptance";
const WORKER_GATE_NODE = "Validate Worker Completion Contract v1";
const CLOSE_NODE = "Close Batch Explicitly";

type WorkflowConnection = {
  readonly node: string;
  readonly type: string;
  readonly index: number;
};

type WorkflowNode = {
  readonly name: string;
  readonly type: string;
  readonly parameters: Readonly<Record<string, unknown>>;
};

type WorkflowExport = {
  readonly name: string;
  readonly active: boolean;
  readonly nodes: readonly WorkflowNode[];
  readonly connections: Readonly<
    Record<
      string,
      {
        readonly main: readonly (readonly WorkflowConnection[])[];
      }
    >
  >;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly pinData?: Readonly<Record<string, unknown>>;
};

type WorkflowContract = {
  readonly contractVersion: string;
  readonly workflowName: string;
  readonly webhookPath: string;
  readonly request: {
    readonly contentType: string;
    readonly binaryField: string;
    readonly fields: readonly string[];
  };
  readonly successResponse: {
    readonly statusCode: number;
    readonly exactFields: readonly string[];
    readonly importBatchIdPattern: string;
    readonly minimumAcceptedRows: number;
  };
  readonly acceptanceNodeName: string;
  readonly responseNodeName: string;
  readonly workerCompletion: {
    readonly contractVersion: string;
    readonly exactFields: readonly string[];
    readonly terminalClasses: readonly string[];
    readonly gateNodeName: string;
  };
  readonly close: {
    readonly contractVersion: string;
    readonly reason: string;
    readonly nodeName: string;
  };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function mainTargets(workflow: WorkflowExport, nodeName: string): string[] {
  return (
    workflow.connections[nodeName]?.main.flatMap((output) =>
      output.map((connection) => connection.node),
    ) ?? []
  );
}

function pathsBetween(
  workflow: WorkflowExport,
  start: string,
  finish: string,
): string[][] {
  const paths: string[][] = [];

  function visit(current: string, path: readonly string[]): void {
    if (path.includes(current)) {
      return;
    }

    const nextPath = [...path, current];
    if (current === finish) {
      paths.push(nextPath);
      return;
    }

    for (const target of mainTargets(workflow, current)) {
      visit(target, nextPath);
    }
  }

  visit(start, []);
  return paths;
}

function requireNode(
  workflow: WorkflowExport,
  name: string,
): WorkflowNode {
  const node = workflow.nodes.find((candidate) => candidate.name === name);

  expect(node, `missing workflow node: ${name}`).toBeDefined();
  return node as WorkflowNode;
}

describe("versioned Prospecta n8n workflow artifact", () => {
  it("declares the approved local contract identity", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);

    expect(contract).toMatchObject({
      contractVersion: "prospecta-import-v1",
      webhookPath: "prospecta/empresaqui/import/v1",
      workflowName: "Prospecta - EmpresaAqui Import v1 - Batch Acceptance",
      acceptanceNodeName: ACCEPTANCE_NODE,
      responseNodeName: RESPONSE_NODE,
    });
    expect(workflow.name).toBe(contract.workflowName);
    expect(workflow.active).toBe(false);
  });

  it("declares the exact multipart request fields", () => {
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);

    expect(contract.request).toEqual({
      contentType: "multipart/form-data",
      binaryField: "arquivo_csv",
      fields: [
        "arquivo_csv",
        "submission_id",
        "idempotency_key",
        "file_sha256",
        "contract_version",
      ],
    });
  });

  it("declares the exact durable acceptance response", () => {
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);

    expect(contract.successResponse).toEqual({
      statusCode: 202,
      exactFields: [
        "accepted",
        "import_batch_id",
        "message",
        "row_count",
        "source",
      ],
      importBatchIdPattern: "^ib_[0-9a-f]{64}$",
      minimumAcceptedRows: 1,
    });
  });

  it("uses a POST response-node webhook on the versioned path", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);
    const webhook = workflow.nodes.find((node) => node.name === WEBHOOK_NODE);

    expect(webhook).toMatchObject({
      type: "n8n-nodes-base.webhook",
      parameters: {
        httpMethod: "POST",
        path: contract.webhookPath,
        responseMode: "responseNode",
      },
    });
  });

  it("makes every response path depend on atomic acceptance", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const responsePaths = pathsBetween(workflow, WEBHOOK_NODE, RESPONSE_NODE);

    expect(responsePaths.length).toBeGreaterThan(0);
    expect(
      responsePaths.every((path) => {
        const acceptanceIndex = path.indexOf(ACCEPTANCE_NODE);
        const responseIndex = path.indexOf(RESPONSE_NODE);
        return acceptanceIndex >= 0 && acceptanceIndex < responseIndex;
      }),
    ).toBe(true);
  });

  it("validates exact bytes, transport metadata, size, UTF-8, and SHA-256 before extraction", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const validation = requireNode(
      workflow,
      "Validate Transport and Hash",
    );
    const code = String(validation.parameters.jsCode ?? "");

    expect(validation.type).toBe("n8n-nodes-base.code");
    expect(code).toContain("getBinaryDataBuffer");
    expect(code).toContain("10485760");
    expect(code).toContain("TextDecoder('utf-8', { fatal: true })");
    expect(code).toContain("subtle.digest('SHA-256', bytes)");
    expect(code).toContain("IMPORT_FILE_HASH_MISMATCH");
    expect(code).not.toContain("arquivo_csv0");
    for (const field of [
      "submission_id",
      "idempotency_key",
      "file_sha256",
      "contract_version",
    ]) {
      expect(code).toContain(field);
    }
  });

  it("extracts semicolon UTF-8 CSV with headers before producer normalization", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const extract = requireNode(workflow, "Extract EmpresaAqui CSV");
    const normalization = requireNode(
      workflow,
      "Normalize EmpresaAqui Rows",
    );
    const code = String(normalization.parameters.jsCode ?? "");

    expect(extract).toMatchObject({
      type: "n8n-nodes-base.extractFromFile",
      parameters: {
        options: {
          delimiter: ";",
          encoding: "utf8",
          relaxQuotes: true,
          headerRow: true,
        },
      },
    });
    expect(code).toContain("source_row: index + 2");
    expect(code).toContain("hasField(first, aliases.cnpj)");
    expect(code).toContain("hasField(first, aliases.razao)");
    expect(code).toContain("raw_row_sha256");
    expect(code).toContain("normalized_row_sha256");
    expect(code).toContain("cnpj_normalizado");
    expect(code).toContain("IMPORT_REQUIRED_HEADERS_MISSING");
  });

  it("aggregates the entire batch into one parameterized acceptance call", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const aggregate = requireNode(
      workflow,
      "Aggregate Acceptance Payload",
    );
    const acceptance = requireNode(workflow, ACCEPTANCE_NODE);
    const aggregateCode = String(aggregate.parameters.jsCode ?? "");
    const options = acceptance.parameters.options as
      | Record<string, unknown>
      | undefined;

    expect(aggregateCode).toContain("acceptance_payload");
    expect(aggregateCode).toContain("raw_rows_sha256");
    expect(aggregateCode).toContain("header_sha256");
    expect(aggregateCode).toContain("row_count: rows.length");
    expect(acceptance.parameters.query).toBe(
      "SELECT public.prospecta_accept_empresaqui_batch_v1($1::jsonb) AS acceptance;",
    );
    expect(options?.queryReplacement).toBe(
      "={{ [JSON.stringify($json.acceptance_payload)] }}",
    );
    expect(String(acceptance.parameters.query)).not.toContain("{{");
  });

  it("emits exactly five success fields and only after committed acceptance", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const prepare = requireNode(
      workflow,
      "Prepare Durable Acceptance Response",
    );
    const respond = requireNode(workflow, RESPONSE_NODE);
    const code = String(prepare.parameters.jsCode ?? "");

    expect(code).toContain("acceptance.accepted_at");
    expect(code).toContain("message: 'Lote aceito para processamento.'");
    expect(code).not.toMatch(/replayed\s*:/);
    expect(code).not.toMatch(/accepted_at\s*:/);
    expect(respond).toMatchObject({
      type: "n8n-nodes-base.respondToWebhook",
      parameters: {
        respondWith: "json",
        responseBody: "={{ $json }}",
        options: { responseCode: 202 },
      },
    });
  });

  it("makes OPEN-02 passable only with one exact approved terminal per accepted row", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);
    const gate = requireNode(workflow, WORKER_GATE_NODE);
    const code = String(gate.parameters.jsCode ?? "");

    expect(contract.workerCompletion).toEqual({
      contractVersion: "prospecta-producer-worker-v1",
      exactFields: [
        "worker_contract_version",
        "import_batch_id",
        "source_row",
        "input_row_id",
        "lead_run_id",
        "idempotency_key",
        "terminal_class",
      ],
      terminalClasses: ["MATERIALIZED", "BLOCKED", "FAILED"],
      gateNodeName: WORKER_GATE_NODE,
    });
    expect(code.trimStart()).not.toMatch(/^throw /);
    expect(code).toContain(
      "results.length !== acceptance.row_count",
    );
    expect(code).toContain("sourceRows.has(result.source_row)");
    for (const terminalClass of contract.workerCompletion.terminalClasses) {
      expect(code).toContain(terminalClass);
    }
  });

  it("keeps explicit close after the worker terminal gate and parameterizes its metadata", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);
    const close = requireNode(workflow, CLOSE_NODE);
    const paths = pathsBetween(workflow, RESPONSE_NODE, CLOSE_NODE);
    const options = close.parameters.options as
      | Record<string, unknown>
      | undefined;

    expect(contract.close).toEqual({
      contractVersion: "prospecta-import-v1",
      reason: "WORKER_ORCHESTRATION_FINISHED",
      nodeName: CLOSE_NODE,
    });
    expect(paths.length).toBeGreaterThan(0);
    expect(
      paths.every((path) => {
        const gateIndex = path.indexOf(WORKER_GATE_NODE);
        const closeIndex = path.indexOf(CLOSE_NODE);
        return gateIndex >= 0 && gateIndex < closeIndex;
      }),
    ).toBe(true);
    expect(close.parameters.query).toBe(
      "SELECT public.prospecta_close_empresaqui_batch_v1($1::jsonb) AS batch_close;",
    );
    expect(String(options?.queryReplacement)).toContain(
      "WORKER_ORCHESTRATION_FINISHED",
    );
    expect(String(close.parameters.query)).not.toContain("{{");
  });

  it("contains no remote identity, credentials, URLs, or pinned data", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const serialized = JSON.stringify(workflow);

    expect(serialized).not.toMatch(
      /6HM8Era5svuUN24x|4be457b8-ccd1-47f9-9d0e-a1fbb38edc7e/,
    );
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(serialized).not.toMatch(/"credentials"\s*:/i);
    expect(serialized).not.toMatch(/password|secret|api[_-]?key|bearer/i);
    expect(workflow.pinData ?? {}).toEqual({});
    expect(workflow.settings.saveDataSuccessExecution).toBe("none");
  });

  it("documents inactive import and rollback without workflow publication", () => {
    const readme = readFileSync(README_PATH, "utf8");

    expect(readme).toMatch(/inativ[oa]/i);
    expect(readme).toMatch(/não publicar/i);
    expect(readme).toMatch(/rollback/i);
    expect(readme).toMatch(/credencial.*manualmente/i);
  });
});
