import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
  CONTACT_PREVIEW_BY_COMPANY_ID_CONTRACT_VERSION,
  CONTACT_PREVIEW_CONTRACT_VERSION,
  CONTACT_REVEAL_CONTRACT_VERSION,
  contactCompanySearchCallbackSchema,
  contactCompanySearchN8nRequestSchema,
  contactPreviewByCompanyIdN8nRequestSchema,
  contactPreviewCallbackSchema,
  contactPreviewN8nRequestSchema,
  contactRevealCallbackSchema,
  contactRevealN8nRequestSchema,
} from "../../src/server/contact-enrichment-v2/contact-enrichment-v2-contract";

interface WorkflowNode {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly retryOnFail?: unknown;
  readonly credentials?: unknown;
  readonly parameters?: unknown;
}

interface WorkflowArtifact {
  readonly active?: unknown;
  readonly nodes?: unknown;
  readonly settings?: unknown;
  readonly pinData?: unknown;
}

const workflowPath = resolve(
  process.cwd(),
  "integrations/n8n/prospecting-contact-enrichment-v2/workflow.json",
);
const workflowText = readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText) as WorkflowArtifact;
const contractText = readFileSync(
  resolve(
    process.cwd(),
    "integrations/n8n/prospecting-contact-enrichment-v2/workflow-contract.json",
  ),
  "utf8",
);
const migrationText = readFileSync(
  resolve(process.cwd(), "db/app/010_contact_data_governance_forward.sql"),
  "utf8",
);
const companyResolutionMigrationText = readFileSync(
  resolve(process.cwd(), "db/app/011_contact_company_resolution_forward.sql"),
  "utf8",
);
const queueSource = readFileSync(
  resolve(process.cwd(), "src/components/contacts/contact-enrichment-action.tsx"),
  "utf8",
);

function nodes(): readonly WorkflowNode[] {
  if (!Array.isArray(workflow.nodes)) throw new Error("Invalid workflow nodes.");
  return workflow.nodes as readonly WorkflowNode[];
}

function codeFor(nodeName: string): string {
  const node = nodes().find((candidate) => candidate.name === nodeName);
  const parameters = node?.parameters;
  if (
    typeof parameters !== "object" ||
    parameters === null ||
    !("jsCode" in parameters) ||
    typeof parameters.jsCode !== "string"
  ) {
    throw new Error(`Missing Code node: ${nodeName}`);
  }
  return parameters.jsCode;
}

describe("contact enrichment v2 repository contract", () => {
  it("versions the location-filtered company lookup independently", () => {
    expect(CONTACT_COMPANY_SEARCH_CONTRACT_VERSION).toBe(
      "prospecta-contact-company-search-v2",
    );
  });

  it("keeps the separate workflow inactive, credential-free, and without execution persistence", () => {
    expect(workflow.active).toBe(false);
    expect(workflow.pinData).toEqual({});
    expect(nodes()).toHaveLength(19);
    expect(nodes().every((node) => node.credentials === undefined)).toBe(true);
    expect(
      nodes()
        .filter((node) => node.type === "n8n-nodes-base.httpRequest")
        .every((node) => node.retryOnFail === false),
    ).toBe(true);
    expect(workflow.settings).toMatchObject({
      saveDataSuccessExecution: "none",
      saveDataErrorExecution: "none",
      saveManualExecutions: false,
    });
    expect(workflowText).not.toMatch(/192\.168\.0\.20|localhost|api_key\s*[:=]/i);
    expect(workflowText).not.toMatch(/console\.(log|info|error)|waterfallReveal/i);
  });

  it("uses only the exact HTTPS provider operations and placeholder HTTPS callbacks", () => {
    expect(workflowText).toContain(
      "https://api.lusha.com/v3/companies/prospecting",
    );
    expect(workflowText).not.toContain(
      "https://api.lusha.com/v3/companies/search",
    );
    expect(workflowText).toContain("filters: { companies: { include:");
    expect(workflowText).toContain("names: [request.company_name]");
    const companySearchPreparation = codeFor("Prepare Company Search");
    expect(companySearchPreparation).toContain(
      "pagination: { page: 0, size: 10 }",
    );
    expect(companySearchPreparation).toContain("country: 'Brazil'");
    expect(companySearchPreparation).not.toContain("countryIso2:");
    expect(workflowText).not.toContain(
      "result.clientReferenceId === request.search_request_id",
    );
    expect(workflowText).toContain(
      "https://api.lusha.com/v3/contacts/decision-makers",
    );
    expect(workflowText).toContain(
      "https://replace-prospecta.example.com/api/contact-enrichment/v2/company-search-callback",
    );
    expect(workflowText).toContain(
      "https://api.lusha.com/v3/contacts/enrich",
    );
    expect(workflowText).toContain(
      "https://replace-prospecta.example.com/api/contact-enrichment/v2/callback",
    );
    expect(workflowText).toContain(
      "https://replace-prospecta.example.com/api/contact-enrichment/v2/reveal-callback",
    );
    expect(contractText).toContain("HMAC_TIMESTAMP_NONCE_REPLAY_CONTRACT");
    expect(contractText).toContain("DURABLE_RATE_LIMIT");
  });

  it("validates exact preview and reveal requests and prohibits waterfall fields", () => {
    expect(
      contactCompanySearchN8nRequestSchema.parse({
        contract_version: CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
        action: "COMPANY_SEARCH",
        search_request_id: "00000000-0000-4000-8000-000000000900",
        idempotency_key: "company-search-synthetic-idempotency",
        cnpj_normalizado: "12345678000195",
        company_name: "Empresa Sintética",
        company_city: "Recife",
        company_state: "PE",
        company_country_iso2: "BR",
      }),
    ).toBeTruthy();
    expect(() =>
      contactCompanySearchN8nRequestSchema.parse({
        contract_version: CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
        action: "COMPANY_SEARCH",
        search_request_id: "00000000-0000-4000-8000-000000000900",
        idempotency_key: "company-search-synthetic-idempotency",
        cnpj_normalizado: "12345678000195",
        company_name: "Empresa Sintética",
        company_city: "Recife",
        company_state: "PERNAMBUCO",
        company_country_iso2: "BR",
      }),
    ).toThrow();
    expect(
      contactPreviewN8nRequestSchema.parse({
        contract_version: CONTACT_PREVIEW_CONTRACT_VERSION,
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000901",
        idempotency_key: "preview-synthetic-idempotency",
        cnpj_normalizado: "12345678000195",
        company_domain: "empresa.example",
      }),
    ).toBeTruthy();
    expect(
      contactPreviewByCompanyIdN8nRequestSchema.parse({
        contract_version: CONTACT_PREVIEW_BY_COMPANY_ID_CONTRACT_VERSION,
        action: "PREVIEW_BY_COMPANY_ID",
        request_id: "00000000-0000-4000-8000-000000000901",
        idempotency_key: "preview-match-synthetic-idempotency",
        cnpj_normalizado: "12345678000195",
        provider_company_id: "v3.synthetic-company-id",
      }),
    ).toBeTruthy();
    expect(
      contactRevealN8nRequestSchema.parse({
        contract_version: CONTACT_REVEAL_CONTRACT_VERSION,
        action: "REVEAL",
        request_id: "00000000-0000-4000-8000-000000000901",
        reveal_request_id: "00000000-0000-4000-8000-000000000902",
        idempotency_key: "reveal-synthetic-idempotency",
        provider_contact_id: "synthetic-provider-contact",
        reveal: ["emails", "phones"],
      }),
    ).toBeTruthy();
    expect(() =>
      contactRevealN8nRequestSchema.parse({
        contract_version: CONTACT_REVEAL_CONTRACT_VERSION,
        action: "REVEAL",
        request_id: "00000000-0000-4000-8000-000000000901",
        reveal_request_id: "00000000-0000-4000-8000-000000000902",
        idempotency_key: "reveal-synthetic-idempotency",
        provider_contact_id: "synthetic-provider-contact",
        reveal: ["emails"],
        waterfall_reveal: ["emails"],
      }),
    ).toThrow();
  });

  it("rejects callback payloads with raw or billing fields", () => {
    const companySearch = {
      contract_version: CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
      search_request_id: "00000000-0000-4000-8000-000000000910",
      status: "SEARCH_AVAILABLE",
      occurred_at: "2026-07-31T12:00:00.000Z",
      matches: [
        {
          provider_company_id: "v3.synthetic-company-id",
          company_name: "Empresa Sintética",
          company_domain: "empresa.example",
          industry: null,
          location: { city: null, state: null, country: "Brasil" },
        },
      ],
    };
    const preview = {
      contract_version: CONTACT_PREVIEW_CONTRACT_VERSION,
      request_id: "00000000-0000-4000-8000-000000000911",
      status: "PREVIEW_EMPTY",
      occurred_at: "2026-07-31T12:00:00.000Z",
      candidates: [],
    };
    const reveal = {
      contract_version: CONTACT_REVEAL_CONTRACT_VERSION,
      request_id: "00000000-0000-4000-8000-000000000911",
      reveal_request_id: "00000000-0000-4000-8000-000000000912",
      status: "REVEAL_EMPTY",
      occurred_at: "2026-07-31T12:00:00.000Z",
      provider_contact_id: "synthetic-provider-contact",
      emails: [],
      phones: [],
    };

    expect(contactCompanySearchCallbackSchema.parse(companySearch)).toBeTruthy();
    expect(contactPreviewCallbackSchema.parse(preview)).toBeTruthy();
    expect(contactRevealCallbackSchema.parse(reveal)).toBeTruthy();
    expect(() =>
      contactCompanySearchCallbackSchema.parse({
        ...companySearch,
        billing: { creditsCharged: 1 },
      }),
    ).toThrow();
    expect(() =>
      contactPreviewCallbackSchema.parse({ ...preview, provider_response: {} }),
    ).toThrow();
    expect(() =>
      contactRevealCallbackSchema.parse({ ...reveal, billing: { credits: 1 } }),
    ).toThrow();
  });

  it("keeps PII only in app-owned ciphertext and browser calls only Prospecta", () => {
    expect(migrationText).toContain("profile_ciphertext bytea");
    expect(migrationText).toContain("channel_data_ciphertext bytea");
    expect(migrationText).toContain("identity_hmac text");
    expect(companyResolutionMigrationText).toContain(
      "provider_ref_ciphertext bytea",
    );
    expect(companyResolutionMigrationText).toContain(
      "profile_ciphertext bytea",
    );
    expect(companyResolutionMigrationText).not.toContain("company_name text");
    expect(migrationText).not.toMatch(/REFERENCES\s+(?!prospecting_app\.)/i);
    expect(queueSource).toContain('fetch("/api/contact-enrichment/v2"');
    expect(queueSource).not.toMatch(/api\.lusha\.com|192\.168\.0\.20|webhook\/prospecta/i);
    expect(queueSource).not.toMatch(/mailto:|tel:/i);
  });
});
