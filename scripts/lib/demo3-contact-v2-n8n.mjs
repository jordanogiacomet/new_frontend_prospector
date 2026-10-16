import { demo3ContactV2BaseUrl } from "./demo3-contact-v2-material.mjs";

export const demo3ContactV2N8n = Object.freeze({
  n8nVersion: "2.30.6",
  namespace: "n8n",
  deployment: "n8n",
  postgresDeployment: "postgres",
  secretName: "n8n-secrets",
  referenceWorkflowPath:
    "integrations/n8n/prospecting-contact-enrichment-v2/workflow.json",
  v1WorkflowId: "PCEv1Demo3a7K2mQ",
  v1WorkflowName: "Prospecta - Contact Enrichment v1",
  workflowId: "PCEv2Demo3b8L3nR",
  workflowName: "Prospecta - Contact Enrichment v2 - Demo 3 Inactive",
  ingressCredentialId: "PCEv2IngressD3",
  ingressCredentialName:
    "Prospecta Contact Enrichment v2 Ingress Demo3",
  callbackCredentialId: "PCEv2CallbackD3",
  callbackCredentialName:
    "Prospecta Contact Enrichment v2 Callback Demo3",
  lushaCredentialName: "Lusha API V3 Demo3",
  apolloCredentialName: "Apollo API Demo3",
  credentialType: "httpHeaderAuth",
  previewCallbackUrl:
    `${demo3ContactV2BaseUrl}/api/contact-enrichment/v2/callback`,
  companySearchCallbackUrl:
    `${demo3ContactV2BaseUrl}/api/contact-enrichment/v2/company-search-callback`,
  revealCallbackUrl:
    `${demo3ContactV2BaseUrl}/api/contact-enrichment/v2/reveal-callback`,
});

const nodeBindings = Object.freeze({
  "Webhook Contact Enrichment v2": "ingress",
  "Lusha Prospecting Companies v2": "lusha",
  "Lusha Decision Makers Priority Fallback v2": "lusha",
  "Lusha Enrich Selected Contact v2": "lusha",
  "Apollo Organization Enrichment v1": "apollo",
  "Apollo People Search Fallback v1": "apollo",
  "Apollo Enrich Selected Contact v1": "apollo",
  "Callback Prospecta Preview v2": "callback",
  "Callback Prospecta Company Search v2": "callback",
  "Callback Prospecta Reveal v2": "callback",
});

function fail(message) {
  throw new Error(`Demo 3 contact v2 n8n render: ${message}`);
}

function object(value, description) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${description} must be an object`);
  }

  return value;
}

function exactNode(nodes, name) {
  const matches = nodes.filter((node) => node?.name === name);
  if (matches.length !== 1) {
    fail(`expected exactly one ${name} node`);
  }

  return matches[0];
}

function credentialBinding(id, name) {
  if (typeof id !== "string" || id === "" || typeof name !== "string" || name === "") {
    fail("credential binding metadata is invalid");
  }

  return {
    [demo3ContactV2N8n.credentialType]: { id, name },
  };
}

export function renderDemo3ContactV2Credentials(material) {
  object(material, "derived material");

  for (const field of ["contactV2IngressSecret", "contactV2CallbackSecret"]) {
    if (typeof material[field] !== "string" || material[field] === "") {
      fail(`${field} is missing`);
    }
  }

  if (material.contactV2IngressSecret === material.contactV2CallbackSecret) {
    fail("ingress and callback secrets must be distinct");
  }

  return [
    {
      id: demo3ContactV2N8n.ingressCredentialId,
      name: demo3ContactV2N8n.ingressCredentialName,
      type: demo3ContactV2N8n.credentialType,
      data: {
        name: "X-Prospecta-Contact-Enrichment-Secret",
        value: material.contactV2IngressSecret,
      },
    },
    {
      id: demo3ContactV2N8n.callbackCredentialId,
      name: demo3ContactV2N8n.callbackCredentialName,
      type: demo3ContactV2N8n.credentialType,
      data: {
        name: "X-Prospecta-Contact-Callback-Secret",
        value: material.contactV2CallbackSecret,
      },
    },
  ];
}

export function renderDemo3ContactV2Workflow(
  referenceWorkflow,
  lushaCredential,
  apolloCredential,
) {
  object(referenceWorkflow, "reference workflow");
  object(lushaCredential, "Lusha credential metadata");
  object(apolloCredential, "Apollo credential metadata");

  if (
    lushaCredential.type !== demo3ContactV2N8n.credentialType ||
    typeof lushaCredential.id !== "string" ||
    lushaCredential.id === "" ||
    lushaCredential.name !== demo3ContactV2N8n.lushaCredentialName
  ) {
    fail("Lusha credential metadata does not match the approved binding");
  }
  if (
    apolloCredential.type !== demo3ContactV2N8n.credentialType ||
    typeof apolloCredential.id !== "string" ||
    apolloCredential.id === "" ||
    apolloCredential.name !== demo3ContactV2N8n.apolloCredentialName
  ) {
    fail("Apollo credential metadata does not match the approved binding");
  }

  const workflow = structuredClone(referenceWorkflow);
  if (!Array.isArray(workflow.nodes)) {
    fail("reference workflow nodes are invalid");
  }

  workflow.id = demo3ContactV2N8n.workflowId;
  workflow.name = demo3ContactV2N8n.workflowName;
  workflow.active = false;
  workflow.settings = {
    ...object(workflow.settings, "reference workflow settings"),
    saveDataSuccessExecution: "none",
    saveDataErrorExecution: "none",
    saveManualExecutions: false,
  };
  workflow.pinData = {};

  const bindings = {
    ingress: credentialBinding(
      demo3ContactV2N8n.ingressCredentialId,
      demo3ContactV2N8n.ingressCredentialName,
    ),
    callback: credentialBinding(
      demo3ContactV2N8n.callbackCredentialId,
      demo3ContactV2N8n.callbackCredentialName,
    ),
    lusha: credentialBinding(lushaCredential.id, lushaCredential.name),
    apollo: credentialBinding(apolloCredential.id, apolloCredential.name),
  };

  for (const [name, binding] of Object.entries(nodeBindings)) {
    exactNode(workflow.nodes, name).credentials = bindings[binding];
  }

  exactNode(
    workflow.nodes,
    "Callback Prospecta Preview v2",
  ).parameters.url = demo3ContactV2N8n.previewCallbackUrl;
  exactNode(
    workflow.nodes,
    "Callback Prospecta Company Search v2",
  ).parameters.url = demo3ContactV2N8n.companySearchCallbackUrl;
  exactNode(
    workflow.nodes,
    "Callback Prospecta Reveal v2",
  ).parameters.url = demo3ContactV2N8n.revealCallbackUrl;

  const renderedText = JSON.stringify(workflow);
  if (renderedText.includes("replace-prospecta.example.com")) {
    fail("rendered workflow still contains a blocked target");
  }

  return workflow;
}

export function expectedDemo3ContactV2Bindings(
  lushaCredential,
  apolloCredential,
) {
  return [
    [
      "Webhook Contact Enrichment v2",
      demo3ContactV2N8n.credentialType,
      demo3ContactV2N8n.ingressCredentialId,
      demo3ContactV2N8n.ingressCredentialName,
    ],
    [
      "Lusha Decision Makers Priority Fallback v2",
      demo3ContactV2N8n.credentialType,
      lushaCredential.id,
      lushaCredential.name,
    ],
    [
      "Lusha Prospecting Companies v2",
      demo3ContactV2N8n.credentialType,
      lushaCredential.id,
      lushaCredential.name,
    ],
    [
      "Lusha Enrich Selected Contact v2",
      demo3ContactV2N8n.credentialType,
      lushaCredential.id,
      lushaCredential.name,
    ],
    [
      "Apollo Organization Enrichment v1",
      demo3ContactV2N8n.credentialType,
      apolloCredential.id,
      apolloCredential.name,
    ],
    [
      "Apollo People Search Fallback v1",
      demo3ContactV2N8n.credentialType,
      apolloCredential.id,
      apolloCredential.name,
    ],
    [
      "Apollo Enrich Selected Contact v1",
      demo3ContactV2N8n.credentialType,
      apolloCredential.id,
      apolloCredential.name,
    ],
    [
      "Callback Prospecta Preview v2",
      demo3ContactV2N8n.credentialType,
      demo3ContactV2N8n.callbackCredentialId,
      demo3ContactV2N8n.callbackCredentialName,
    ],
    [
      "Callback Prospecta Company Search v2",
      demo3ContactV2N8n.credentialType,
      demo3ContactV2N8n.callbackCredentialId,
      demo3ContactV2N8n.callbackCredentialName,
    ],
    [
      "Callback Prospecta Reveal v2",
      demo3ContactV2N8n.credentialType,
      demo3ContactV2N8n.callbackCredentialId,
      demo3ContactV2N8n.callbackCredentialName,
    ],
  ];
}
