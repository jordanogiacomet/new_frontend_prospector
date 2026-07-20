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
  });

  it("documents inactive import and rollback without workflow publication", () => {
    const readme = readFileSync(README_PATH, "utf8");

    expect(readme).toMatch(/inativ[oa]/i);
    expect(readme).toMatch(/não publicar/i);
    expect(readme).toMatch(/rollback/i);
    expect(readme).toMatch(/credencial.*manualmente/i);
  });
});
