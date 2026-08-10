import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ARTIFACT_DIRECTORY = resolve(
  process.cwd(),
  "integrations/n8n/prospecting-contact-enrichment-v1",
);
const WORKFLOW_PATH = resolve(ARTIFACT_DIRECTORY, "workflow.json");
const CONTRACT_PATH = resolve(ARTIFACT_DIRECTORY, "workflow-contract.json");
const README_PATH = resolve(ARTIFACT_DIRECTORY, "README.md");

const CONTRACT_VERSION = "prospecta-contact-enrichment-v1";
const WEBHOOK_NODE = "Webhook Contact Enrichment v1";
const VALIDATION_NODE = "Validate Contact Enrichment Request";
const VALIDATION_DECISION_NODE = "IF Valid Contact Enrichment Request";
const INVALID_RESPONSE_NODE = "Respond Invalid Contact Enrichment Request";
const RESPONSE_NODE = "Respond Contact Enrichment Dispatch";
const PROVIDER_NODE = "Lusha Decision Makers";
const CALLBACK_PREPARATION_NODE = "Prepare Withheld Callback";
const CALLBACK_NODE = "Callback Prospecta Contact Enrichment";

type WorkflowConnection = {
  readonly node: string;
};

type WorkflowNode = {
  readonly name: string;
  readonly type: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly webhookId?: string;
  readonly retryOnFail?: boolean;
  readonly continueOnFail?: boolean;
};

type WorkflowExport = {
  readonly id: string;
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
  readonly workflowState: string;
  readonly ingress: {
    readonly method: string;
    readonly webhookPath: string;
    readonly authentication: {
      readonly nodeAuthentication: string;
      readonly credentialType: string;
      readonly artifactCredentialBinding: string;
    };
    readonly requestExactFields: readonly string[];
    readonly requestValidation: Readonly<Record<string, string>>;
  };
  readonly initialResponse: {
    readonly statusCode: number;
    readonly exactFields: readonly string[];
    readonly status: string;
  };
  readonly provider: {
    readonly operation: string;
    readonly url: string;
    readonly authentication: {
      readonly type: string;
      readonly genericAuthType: string;
      readonly artifactCredentialBinding: string;
    };
    readonly requestFields: readonly string[];
    readonly prohibitedOperations: readonly string[];
    readonly timeoutOutcome: string;
    readonly automaticRetry: boolean;
  };
  readonly callback: {
    readonly url: string;
    readonly authentication: {
      readonly type: string;
      readonly genericAuthType: string;
      readonly artifactCredentialBinding: string;
    };
    readonly exactFields: readonly string[];
    readonly statuses: readonly string[];
    readonly contactCount: null;
    readonly rejectConditions: readonly string[];
  };
  readonly idempotency: {
    readonly owner: string;
    readonly n8nProvidesIdempotency: boolean;
    readonly sameInputBehavior: string;
    readonly changedInputBehavior: string;
    readonly timeoutBehavior: string;
  };
  readonly pii: {
    readonly forbiddenOutputFields: readonly string[];
    readonly executionDataRetention: string;
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

function requireNode(workflow: WorkflowExport, name: string): WorkflowNode {
  const node = workflow.nodes.find((candidate) => candidate.name === name);

  expect(node, `Missing node ${name}`).toBeDefined();

  return node as WorkflowNode;
}

describe("Prospecta contact-enrichment-v1 static contract", () => {
  it("has a stable n8n workflow ID for repeatable inactive imports", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);

    expect(workflow.id).toBe("PCEv1Demo3a7K2mQ");
  });

  it("keeps idempotency in the Prospecta app-owned ledger", () => {
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);

    expect(contract.contractVersion).toBe(CONTRACT_VERSION);
    expect(contract.idempotency).toEqual({
      owner: "prospecta_app_owned_ledger",
      n8nProvidesIdempotency: false,
      sameInputBehavior: "RETURN_ORIGINAL_SAFE_APP_RESULT_WITHOUT_N8N_CALL",
      changedInputBehavior: "REJECT_409_BEFORE_N8N_CALL",
      timeoutBehavior: "PERSIST_PROVIDER_OUTCOME_UNKNOWN_WITHOUT_RETRY",
    });
  });

  it("requires authenticated input and returns an exact PII-free 202", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);
    const webhook = requireNode(workflow, WEBHOOK_NODE);
    const validation = requireNode(workflow, VALIDATION_NODE);
    const invalidResponse = requireNode(workflow, INVALID_RESPONSE_NODE);
    const response = requireNode(workflow, RESPONSE_NODE);
    const validationCode = String(validation.parameters.jsCode ?? "");
    const invalidResponseBody = String(
      invalidResponse.parameters.responseBody ?? "",
    );
    const responseBody = String(response.parameters.responseBody ?? "");

    expect(contract.ingress).toMatchObject({
      method: "POST",
      webhookPath: "prospecta/lusha/decision-makers",
      authentication: {
        nodeAuthentication: "headerAuth",
        credentialType: "httpHeaderAuth",
        artifactCredentialBinding: "MANUAL_AFTER_APPROVAL",
      },
      requestExactFields: [
        "contract_version",
        "request_id",
        "idempotency_key",
        "cnpj_normalizado",
        "company_domain",
      ],
      requestValidation: {
        contract_version: CONTRACT_VERSION,
        request_id: "UUID",
        idempotency_key: "TRIMMED_TEXT_1_TO_128",
        cnpj_normalizado: "ASCII_14_DIGITS",
        company_domain: "LOWERCASE_HOSTNAME",
      },
    });
    expect(webhook.parameters).toMatchObject({
      httpMethod: "POST",
      path: contract.ingress.webhookPath,
      authentication: "headerAuth",
      responseMode: "responseNode",
    });
    expect(webhook.webhookId).toBe(
      "f14d8c06-9af8-4d43-84d4-d9dd5af0df3e",
    );
    expect(validationCode).toContain("cnpj_normalizado");
    expect(validationCode).toContain("valid: false");
    expect(validationCode).not.toMatch(/throw\s+new\s+Error/i);
    expect(mainTargets(workflow, WEBHOOK_NODE)).toEqual([VALIDATION_NODE]);
    expect(mainTargets(workflow, VALIDATION_NODE)).toEqual([
      VALIDATION_DECISION_NODE,
    ]);
    expect(workflow.connections[VALIDATION_DECISION_NODE]?.main[0]).toEqual([
      expect.objectContaining({ node: RESPONSE_NODE }),
    ]);
    expect(workflow.connections[VALIDATION_DECISION_NODE]?.main[1]).toEqual([
      expect.objectContaining({ node: INVALID_RESPONSE_NODE }),
    ]);
    expect(invalidResponse.parameters.options).toEqual({ responseCode: 400 });
    expect(invalidResponseBody).toContain("INVALID_ENRICHMENT_REQUEST");
    expect(invalidResponseBody).not.toMatch(
      /cnpj_normalizado|company_domain|idempotency_key/i,
    );
    expect(contract.initialResponse).toEqual({
      statusCode: 202,
      exactFields: ["contract_version", "request_id", "status"],
      status: "ENRICHMENT_DISPATCHED",
    });
    expect(response.parameters.options).toEqual({ responseCode: 202 });
    expect(responseBody).toContain("ENRICHMENT_DISPATCHED");
    for (const forbiddenField of [
      "cnpj_normalizado",
      "email",
      "phone",
      "contact_name",
      "contact_id",
    ]) {
      expect(responseBody.toLowerCase()).not.toContain(forbiddenField);
    }
    for (const codeNode of workflow.nodes.filter(
      (node) => node.type === "n8n-nodes-base.code",
    )) {
      expect(codeNode.parameters.mode).toBe("runOnceForEachItem");
      expect(String(codeNode.parameters.jsCode ?? "")).not.toMatch(
        /return\s*\[\s*\{\s*json\s*:/,
      );
    }
  });

  it("uses unbound native n8n credentials and never configures automatic retry", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);
    const provider = requireNode(workflow, PROVIDER_NODE);
    const callback = requireNode(workflow, CALLBACK_NODE);
    const serialized = JSON.stringify(workflow);

    expect(contract.provider).toMatchObject({
      operation: "LUSHA_DECISION_MAKERS",
      url: "https://api.lusha.com/v3/contacts/decision-makers",
      authentication: {
        type: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        artifactCredentialBinding: "MANUAL_AFTER_APPROVAL",
      },
      requestFields: ["domain", "clientReferenceId"],
      prohibitedOperations: ["LUSHA_CONTACT_REVEAL", "LUSHA_CONTACT_ENRICH"],
      timeoutOutcome: "PROVIDER_OUTCOME_UNKNOWN",
      automaticRetry: false,
    });
    expect(provider.parameters).toMatchObject({
      method: "POST",
      url: contract.provider.url,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    });
    expect(callback.parameters).toMatchObject({
      method: "POST",
      url: "http://192.168.0.20:30100/api/contact-enrichment/callback",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
    });
    expect(provider.retryOnFail).toBe(false);
    expect(callback.retryOnFail).toBe(false);
    expect(serialized).not.toMatch(/"credentials"\s*:/i);
    expect(serialized).not.toMatch(/LUSHA_API_KEY|\$env|process\.env/i);
  });

  it("routes only a minimized provider outcome to the authenticated callback", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);
    const responseTargets = mainTargets(workflow, RESPONSE_NODE);
    const preparation = requireNode(workflow, CALLBACK_PREPARATION_NODE);
    const callback = requireNode(workflow, CALLBACK_NODE);
    const callbackBody = String(callback.parameters.jsonBody ?? "");
    const preparationCode = String(preparation.parameters.jsCode ?? "");

    expect(responseTargets).toEqual(["Prepare Lusha Decision Makers"]);
    expect(mainTargets(workflow, "Prepare Lusha Decision Makers")).toEqual([
      PROVIDER_NODE,
    ]);
    expect(mainTargets(workflow, PROVIDER_NODE)).toEqual([
      CALLBACK_PREPARATION_NODE,
    ]);
    expect(mainTargets(workflow, CALLBACK_PREPARATION_NODE)).toEqual([
      CALLBACK_NODE,
    ]);
    expect(contract.callback).toEqual({
      url: "http://192.168.0.20:30100/api/contact-enrichment/callback",
      authentication: {
        type: "genericCredentialType",
        genericAuthType: "httpHeaderAuth",
        artifactCredentialBinding: "MANUAL_AFTER_APPROVAL",
      },
      exactFields: [
        "contract_version",
        "request_id",
        "status",
        "occurred_at",
        "contact_count",
      ],
      statuses: ["COMPLETED_WITHHELD", "PROVIDER_OUTCOME_UNKNOWN"],
      contactCount: null,
      rejectConditions: [
        "UNAUTHENTICATED",
        "EXTRA_OR_MISSING_FIELD",
        "UNKNOWN_ORGANIZATION_REQUEST",
        "REPLAY_CONFLICT",
      ],
    });
    expect(callbackBody).toBe("={{ JSON.stringify($json) }}");
    expect(preparationCode).toContain("contact_count");
    expect(preparationCode).toContain("COMPLETED_WITHHELD");
    expect(preparationCode).toContain("PROVIDER_OUTCOME_UNKNOWN");
    expect(preparationCode).not.toMatch(/console\.|logger|JSON\.stringify\(\$json/i);
  });

  it("does not leak PII into artifact outputs, logs, executions, or database work", () => {
    const workflow = readJson<WorkflowExport>(WORKFLOW_PATH);
    const contract = readJson<WorkflowContract>(CONTRACT_PATH);
    const readme = readFileSync(README_PATH, "utf8");
    const serialized = JSON.stringify(workflow);
    const codeNodes = workflow.nodes.filter(
      (node) => node.type === "n8n-nodes-base.code",
    );

    expect(contract.pii).toEqual({
      forbiddenOutputFields: [
        "contact_name",
        "email",
        "phone",
        "contact_id",
        "profile_url",
        "job_title",
        "provider_response",
        "provider_billing",
        "cnpj_normalizado",
        "idempotency_key",
      ],
      executionDataRetention: "DISABLED",
    });
    expect(workflow.active).toBe(false);
    expect(workflow.pinData ?? {}).toEqual({});
    expect(workflow.settings.saveDataSuccessExecution).toBe("none");
    expect(workflow.settings.saveDataErrorExecution).toBe("none");
    expect(workflow.settings.saveManualExecutions).toBe(false);
    expect(serialized).not.toMatch(/n8n-nodes-base\.(postgres|mysql|mssql)/i);
    expect(serialized).not.toMatch(/INSERT\s+INTO|UPDATE\s+prospecting_|DELETE\s+FROM/i);
    expect(codeNodes).toHaveLength(3);
    for (const node of codeNodes) {
      expect(String(node.parameters.jsCode ?? "")).not.toMatch(
        /console\.|logger|fetch\(/i,
      );
    }
    expect(readme).toMatch(/não ativar/i);
    expect(readme).toMatch(/não publicar/i);
    expect(readme).toMatch(/PII|dados pessoais/i);
  });
});
