import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CONTACT_ASSET_OPERATIONS_PROFILE_SEARCH_TITLES,
  CONTACT_ASSET_PROFILE_SEARCH_TITLES,
  CONTACT_EXCLUDED_PROFILE_SEARCH_TITLES,
  CONTACT_FINANCE_PROFILE_SEARCH_TITLES,
  CONTACT_SEARCH_POLICY_VERSION,
} from "../../src/lib/contact-search-policy";
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
const companyPhoneFallbackMigrationText = readFileSync(
  resolve(
    process.cwd(),
    "db/app/012_contact_company_phone_fallback_forward.sql",
  ),
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

function runCodeNode(
  nodeName: string,
  request: Readonly<Record<string, unknown>>,
  input: Readonly<Record<string, unknown>>,
  nodeOutputs: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {},
): unknown {
  const result = runInNewContext(
    `(() => { ${codeFor(nodeName)} })()`,
    {
      $json: input,
      URL,
      $: (requestedNode: string) => {
        if (requestedNode === "Validate v2 Request") {
          return { first: () => ({ json: request }) };
        }
        const output = nodeOutputs[requestedNode];
        if (
          output === undefined &&
          (requestedNode === "Prepare Apollo People Fallback" ||
            requestedNode === "Map Preview Callback")
        ) {
          return { first: () => ({ json: {} }) };
        }
        if (output === undefined) {
          throw new Error(`Unexpected node lookup: ${requestedNode}`);
        }
        return { first: () => ({ json: output }) };
      },
    },
    { timeout: 1_000 },
  );
  return JSON.parse(JSON.stringify(result)) as unknown;
}

function runPreviewMapper(
  nodeName: "Map Preview Callback" | "Map Apollo Preview Callback",
  people: readonly { readonly id: string; readonly name: string; readonly title?: string }[],
): {
  readonly status: string;
  readonly candidates: readonly Readonly<Record<string, unknown>>[];
  readonly company_phone?: unknown;
  readonly search_diagnostics: readonly Readonly<Record<string, unknown>>[];
} {
  const request = {
    action: "PREVIEW",
    request_id: "00000000-0000-4000-8000-000000001950",
    fallback_company_domain: "empresa.example",
  };
  const body = nodeName === "Map Preview Callback"
    ? {
        results: [{
          clientReferenceId: request.request_id,
          decisionMakers: people.map((person) => ({
            id: person.id,
            fullName: person.name,
            jobTitle: { title: person.title },
          })),
        }],
      }
    : { people };
  const result = runCodeNode(nodeName, request, { statusCode: 200, body }) as {
    readonly json: ReturnType<typeof runPreviewMapper>;
  };
  return result.json;
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
    expect(nodes()).toHaveLength(29);
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
    expect(companySearchPreparation).not.toContain("location.city =");
    expect(companySearchPreparation).not.toContain("location.state =");
    expect(companySearchPreparation).not.toContain("countryIso2:");
    expect(workflowText).not.toContain(
      "result.clientReferenceId === request.search_request_id",
    );
    expect(workflowText).toContain(
      "https://api.lusha.com/v3/contacts/decision-makers",
    );
    expect(workflowText).toContain(
      "https://api.apollo.io/api/v1/organizations/enrich",
    );
    expect(workflowText).toContain(
      "https://api.apollo.io/api/v1/mixed_people/api_search",
    );
    expect(workflowText).toContain(
      "https://api.apollo.io/api/v1/people/match",
    );
    expect(workflowText).not.toContain(
      "https://api.lusha.com/v3/contacts/prospecting",
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

  it("requests one exact-company decision-maker sample of up to 100", () => {
    const domainRequest = runCodeNode(
      "Prepare Priority Decision Makers",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000929",
        company_domain: "empresa.example",
      },
      {},
    ) as {
      readonly json: {
        readonly lusha_request_body: {
          readonly pagination: { readonly page: number; readonly size: number };
          readonly companies: readonly Readonly<Record<string, unknown>>[];
        };
      };
    };
    expect(domainRequest.json.lusha_request_body).toEqual({
      companies: [
        {
          domain: "empresa.example",
          clientReferenceId: "00000000-0000-4000-8000-000000000929",
        },
      ],
      pagination: { page: 0, size: 100 },
    });
    expect(domainRequest.json.lusha_request_body).not.toHaveProperty("tableId");
    expect(domainRequest.json.lusha_request_body).not.toHaveProperty("reveal");

    const companyIdRequest = runCodeNode(
      "Prepare Priority Decision Makers",
      {
        action: "PREVIEW_BY_COMPANY_ID",
        request_id: "00000000-0000-4000-8000-000000000929",
        provider_company_id: "v3.synthetic-company-id",
      },
      {},
    ) as {
      readonly json: {
        readonly lusha_request_body: {
          readonly companies: readonly Readonly<Record<string, unknown>>[];
        };
      };
    };
    expect(companyIdRequest.json.lusha_request_body.companies).toEqual([
      {
        id: "v3.synthetic-company-id",
        clientReferenceId: "00000000-0000-4000-8000-000000000929",
      },
    ]);
  });

  it("uses Apollo only as an exact-domain fallback after a confirmed empty Lusha sample", () => {
    const connections = (workflow as WorkflowArtifact & {
      readonly connections?: Readonly<Record<string, unknown>>;
    }).connections;
    expect(connections).toMatchObject({
      "Map Preview Callback": {
        main: [[{ node: "IF Lusha Preview Empty" }]],
      },
      "IF Lusha Preview Empty": {
        main: [
          [{ node: "Apollo Organization Enrichment v1" }],
          [{ node: "Callback Prospecta Preview v2" }],
        ],
      },
      "Apollo Organization Enrichment v1": {
        main: [[{ node: "Prepare Apollo People Fallback" }]],
      },
      "Prepare Apollo People Fallback": {
        main: [[{ node: "IF Apollo Organization Match" }]],
      },
      "IF Apollo Organization Match": {
        main: [
          [{ node: "Apollo People Search Fallback v1" }],
          [{ node: "Callback Prospecta Preview v2" }],
        ],
      },
    });

    const prepared = runCodeNode(
      "Prepare Apollo People Fallback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000932",
        fallback_company_domain: "empresa.example",
      },
      {
        statusCode: 200,
        body: {
          organization: {
            id: "apollo-company-id",
            primary_domain: "empresa.example",
          },
        },
      },
    ) as {
      readonly json: {
        readonly apollo_organization_matched: boolean;
        readonly apollo_request_body: Readonly<Record<string, unknown>>;
      };
    };
    expect(prepared.json.apollo_organization_matched).toBe(true);
    expect(prepared.json.apollo_request_body).toEqual({
      organization_ids: ["apollo-company-id"],
      person_seniorities: [
        "owner",
        "founder",
        "c_suite",
        "vp",
        "head",
        "director",
        "manager",
      ],
      page: 1,
      per_page: 10,
    });

    const rejectedCompany = runCodeNode(
      "Prepare Apollo People Fallback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000932",
        fallback_company_domain: "empresa.example",
      },
      {
        statusCode: 200,
        body: {
          organization: {
            id: "wrong-apollo-company-id",
            primary_domain: "outra.example",
          },
        },
      },
    ) as {
      readonly json: {
        readonly apollo_organization_matched: boolean;
        readonly candidates: readonly unknown[];
      };
    };
    expect(rejectedCompany.json.apollo_organization_matched).toBe(false);
    expect(rejectedCompany.json.candidates).toEqual([]);

    for (const [statusCode, expectedStatus] of [
      [401, "PREVIEW_FAILED"],
      [504, "PROVIDER_OUTCOME_UNKNOWN"],
    ] as const) {
      const failedOrganization = runCodeNode(
        "Prepare Apollo People Fallback",
        {
          action: "PREVIEW",
          request_id: "00000000-0000-4000-8000-000000000932",
          fallback_company_domain: "empresa.example",
        },
        { statusCode, body: {} },
      ) as {
        readonly json: {
          readonly status: string;
          readonly apollo_organization_matched: boolean;
        };
      };
      expect(failedOrganization.json).toMatchObject({
        status: expectedStatus,
        apollo_organization_matched: false,
      });
    }

    const mapped = runCodeNode(
      "Map Apollo Preview Callback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000932",
        fallback_company_domain: "empresa.example",
      },
      {
        statusCode: 200,
        body: {
          people: [
            {
              id: "generic-current-company",
              first_name: "Pessoa",
              last_name_obfuscated: "O.",
              title: "Operations Director",
              organization: { name: "Empresa Sintética" },
              has_email: true,
            },
            {
              id: "priority-current-company",
              first_name: "Pessoa",
              last_name_obfuscated: "C.",
              title: "Senior Controller",
              departments: ["finance"],
              seniority: "director",
              city: "Recife",
              state: "PE",
              country: "Brazil",
              linkedin_url: "http://www.linkedin.com/in/not-in-search-contract",
              organization: { name: "Empresa Sintética" },
              has_email: true,
            },
          ],
          pagination: { total_entries: 2 },
        },
      },
    ) as {
      readonly json: {
        readonly status: string;
        readonly candidates: readonly Readonly<Record<string, unknown>>[];
      };
    };
    expect(mapped.json.status).toBe("PREVIEW_AVAILABLE");
    expect(
      mapped.json.candidates.map((candidate) =>
        candidate.provider_contact_id),
    ).toEqual(["priority-current-company"]);
    expect(mapped.json.candidates[0]).toMatchObject({
      provider_source: "APOLLO",
      linkedin_url: null,
      can_reveal_work_email: true,
      can_reveal_business_phone: false,
    });
    expect(JSON.stringify(mapped.json)).not.toMatch(
      /pagination|total_entries|empresa sintética/i,
    );
  });

  it("returns one sanitized corporate phone only after both person samples are empty", () => {
    const prepared = runCodeNode(
      "Prepare Apollo People Fallback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000942",
        fallback_company_domain: "empresa.example",
      },
      {
        statusCode: 200,
        body: {
          organization: {
            id: "apollo-company-id",
            primary_domain: "empresa.example",
            primary_phone: {
              number: "(11) 3333-4444",
              sanitized_number: "+551133334444",
              source: "Scraped",
            },
            phone: "+5511999999999",
          },
        },
      },
    ) as {
      readonly json: {
        readonly apollo_company_phone: string | null;
      };
    };
    expect(prepared.json.apollo_company_phone).toBe("+551133334444");
    expect(JSON.stringify(prepared.json)).not.toContain("5511999999999");
    expect(JSON.stringify(prepared.json)).not.toContain("Scraped");

    const emptyPeople = runCodeNode(
      "Map Apollo Preview Callback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000942",
        fallback_company_domain: "empresa.example",
      },
      { statusCode: 200, body: { people: [] } },
      { "Prepare Apollo People Fallback": prepared.json },
    ) as {
      readonly json: {
        readonly status: string;
        readonly candidates: readonly unknown[];
        readonly company_phone: Readonly<Record<string, unknown>> | null;
      };
    };
    expect(emptyPeople.json).toMatchObject({
      status: "PREVIEW_AVAILABLE",
      candidates: [],
      company_phone: {
        number: "+551133334444",
        provider_source: "APOLLO",
        contactability: "UNKNOWN",
      },
    });

    const peopleFound = runCodeNode(
      "Map Apollo Preview Callback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000942",
        fallback_company_domain: "empresa.example",
      },
      {
        statusCode: 200,
        body: {
          people: [{ id: "person-id", name: "Pessoa S.", title: "Director" }],
        },
      },
      { "Prepare Apollo People Fallback": prepared.json },
    ) as {
      readonly json: { readonly company_phone: unknown };
    };
    expect(peopleFound.json.company_phone).toBeNull();

    const mismatched = runCodeNode(
      "Prepare Apollo People Fallback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000942",
        fallback_company_domain: "empresa.example",
      },
      {
        statusCode: 200,
        body: {
          organization: {
            id: "wrong-company-id",
            primary_domain: "outra.example",
            sanitized_phone: "+551133334444",
          },
        },
      },
    ) as {
      readonly json: { readonly apollo_company_phone: string | null };
    };
    expect(mismatched.json.apollo_company_phone).toBeNull();
  });

  it("maps an explicit Apollo work-email reveal and never requests phone or waterfall", () => {
    const prepared = runCodeNode(
      "Prepare Apollo Contact Reveal",
      {
        action: "REVEAL",
        request_id: "00000000-0000-4000-8000-000000000933",
        reveal_request_id: "00000000-0000-4000-8000-000000000934",
        provider_source: "APOLLO",
        provider_contact_id: "apollo-person-id",
        reveal: ["emails"],
      },
      {},
    ) as {
      readonly json: { readonly apollo_query: Readonly<Record<string, unknown>> };
    };
    expect(prepared.json.apollo_query).toEqual({
      id: "apollo-person-id",
      reveal_personal_emails: false,
      reveal_phone_number: false,
      run_waterfall_email: false,
      run_waterfall_phone: false,
    });

    const mapped = runCodeNode(
      "Map Apollo Reveal Callback",
      {
        action: "REVEAL",
        request_id: "00000000-0000-4000-8000-000000000933",
        reveal_request_id: "00000000-0000-4000-8000-000000000934",
        provider_source: "APOLLO",
        provider_contact_id: "apollo-person-id",
        reveal: ["emails"],
      },
      {
        statusCode: 200,
        body: {
          person: {
            id: "apollo-person-id",
            name: "Pessoa Apollo Sintética",
            linkedin_url:
              "http://www.linkedin.com/in/pessoa-apollo-sintetica",
            email: "work@empresa.example",
            email_status: "verified",
            personal_emails: ["private@example.test"],
            phone_numbers: [{ sanitized_number: "+5511999999999" }],
          },
          credits_consumed: 1,
        },
      },
    ) as {
      readonly json: Readonly<Record<string, unknown>> & {
        readonly emails: readonly Readonly<Record<string, unknown>>[];
        readonly phones: readonly unknown[];
      };
    };
    expect(mapped.json).toMatchObject({
      provider_source: "APOLLO",
      status: "REVEAL_AVAILABLE",
      profile_update: {
        full_name: "Pessoa Apollo Sintética",
        linkedin_url:
          "https://www.linkedin.com/in/pessoa-apollo-sintetica",
      },
      emails: [
        {
          email: "work@empresa.example",
          type: "work",
          confidence: "verified",
          update_date: null,
        },
      ],
      phones: [],
    });
    expect(JSON.stringify(mapped.json)).not.toMatch(
      /private@example\.test|5511999999999|credits_consumed/i,
    );
  });

  it("preserves provider order within the finance tier and omits unrelated roles", () => {
    const mapped = runCodeNode(
      "Map Preview Callback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000930",
      },
      {
        statusCode: 200,
        body: {
          requestId: "provider-request-id",
          results: [
            {
              clientReferenceId:
                "00000000-0000-4000-8000-000000000930",
              companyId: "synthetic-company-id",
              decisionMakers: [
                {
                  id: "non-priority-contact-id",
                  fullName: "Contato Não Prioritário",
                  jobTitle: {
                    title: "Vice President of Operations",
                    departments: ["Operations"],
                    seniority: "Vice President",
                  },
                },
                {
                  id: "adjacent-contact-id",
                  fullName: "Contato Próximo",
                  jobTitle: {
                    title: "Chief Financial Officer",
                    departments: ["Finance"],
                    seniority: "C-Suite",
                  },
                },
                {
                  id: "synthetic-contact-id",
                  fullName: "Contato Sintético",
                  jobTitle: {
                    title: "Senior Controller LATAM",
                    departments: ["Finance"],
                    seniority: "Director",
                  },
                  location: {
                    city: "Recife",
                    state: "PE",
                    country: "Brazil",
                  },
                  socialLinks: {
                    linkedin:
                      "https://www.linkedin.com/in/synthetic-contact",
                  },
                  canReveal: [{ field: "emails" }],
                },
                {
                  id: "adjacent-treasury-contact-id",
                  fullName: "Contato Tesouraria",
                  jobTitle: {
                    title: "Treasury Manager",
                    departments: ["Finance"],
                    seniority: "Manager",
                  },
                },
              ],
            },
          ],
          billing: { creditsCharged: 0 },
        },
      },
    ) as {
      readonly json: Readonly<Record<string, unknown>> & {
        readonly status: string;
        readonly candidates: readonly Readonly<Record<string, unknown>>[];
      };
    };
    expect(mapped.json.status).toBe("PREVIEW_AVAILABLE");
    expect(mapped.json.candidates).toHaveLength(3);
    expect(
      mapped.json.candidates.map(
        (candidate) => candidate.provider_contact_id,
      ),
    ).toEqual([
      "adjacent-contact-id",
      "synthetic-contact-id",
      "adjacent-treasury-contact-id",
    ]);
    expect(mapped.json.candidates[1]).toMatchObject({
      provider_source: "LUSHA",
      provider_contact_id: "synthetic-contact-id",
      full_name: "Contato Sintético",
      job_title: "Senior Controller LATAM",
      departments: ["Finance"],
      seniority: "Director",
      linkedin_url: "https://www.linkedin.com/in/synthetic-contact",
      can_reveal_work_email: true,
      can_reveal_business_phone: false,
    });
    expect(mapped.json).not.toHaveProperty("billing");
    expect(mapped.json).not.toHaveProperty("requestId");
    expect(mapped.json.candidates[0]).not.toHaveProperty("company");
    expect(
      mapped.json.candidates.some(
        (candidate) =>
          candidate.provider_contact_id === "non-priority-contact-id",
      ),
    ).toBe(false);
  });

  it("withholds unrelated decision makers instead of substituting generic contacts", () => {
    const decisionMakers = Array.from({ length: 12 }, (_, index) => ({
      id: `generic-contact-${index + 1}`,
      fullName: `Contato Genérico ${index + 1}`,
      jobTitle: {
        title: index % 2 === 0 ? "Vice President of Operations" : "People Director",
        departments: [index % 2 === 0 ? "Operations" : "Human Resources"],
        seniority: "Director",
      },
    }));
    const mapped = runCodeNode(
      "Map Preview Callback",
      {
        action: "PREVIEW",
        request_id: "00000000-0000-4000-8000-000000000931",
      },
      {
        statusCode: 200,
        body: {
          results: [
            {
              clientReferenceId:
                "00000000-0000-4000-8000-000000000931",
              decisionMakers,
            },
          ],
        },
      },
    ) as {
      readonly json: {
        readonly status: string;
        readonly candidates: readonly Readonly<Record<string, unknown>>[];
      };
    };

    expect(mapped.json.status).toBe("PREVIEW_EMPTY");
    expect(mapped.json.candidates).toEqual([]);
    expect(mapped.json).toMatchObject({
      search_diagnostics: [
        { provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES" },
        { provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NOT_ATTEMPTED" },
      ],
    });
  });

  it("uses the shared targeting aliases in both inactive provider mappers", () => {
    for (const nodeName of ["Map Preview Callback", "Map Apollo Preview Callback"]) {
      for (const titles of [
        CONTACT_ASSET_PROFILE_SEARCH_TITLES,
        CONTACT_FINANCE_PROFILE_SEARCH_TITLES,
        CONTACT_ASSET_OPERATIONS_PROFILE_SEARCH_TITLES,
        CONTACT_EXCLUDED_PROFILE_SEARCH_TITLES,
      ]) {
        expect(codeFor(nodeName)).toContain(JSON.stringify(titles));
      }
    }
    expect(JSON.parse(contractText)).toMatchObject({
      preview: {
        searchPolicyVersion: CONTACT_SEARCH_POLICY_VERSION,
        localSelection: "ASSETS_THEN_FINANCE_THEN_EXPLICIT_ASSET_OPERATIONS",
        genericFallback: "PROHIBITED",
        excludedTitles: "PERSONAL_WEALTH_ALIASES_VETO_ALL_SEARCH_TIERS",
        commercialScoreEligibility: "EXISTING_CONTACT_COMMERCIAL_SCORE_V1_ONLY",
      },
      searchDiagnostics: {
        allowedCodes: expect.arrayContaining(["NO_RELEVANT_MATCHES"]),
        noRelevantStages: ["CONTACT_PREVIEW"],
      },
    });
  });

  it.each(["Map Preview Callback", "Map Apollo Preview Callback"] as const)(
    "prioritizes assets over finance and explicit asset operations in %s",
    (nodeName) => {
      const mapped = runPreviewMapper(nodeName, [
        { id: "finance-first", name: "Pessoa Contábil", title: "Senior Controller" },
        { id: "inventory", name: "Pessoa Inventário", title: "Inventory Manager" },
        { id: "unrelated", name: "Pessoa Operações", title: "Operations Director" },
        { id: "asset-first", name: "Pessoa Patrimônio", title: "Analista de Patrimônio" },
        { id: "finance-second", name: "Pessoa Financeira", title: "Chief Financial Officer" },
        { id: "asset-second", name: "Pessoa Imobilizado", title: "Fixed Assets Manager" },
        { id: "stock", name: "Pessoa Estoques", title: "Gerente de Estoques" },
        { id: "accountant", name: "Pessoa Contadora", title: "Contadora" },
        { id: "controladoria", name: "Pessoa Controladoria", title: "Gerente de Controladoria" },
      ]);
      expect(mapped.status).toBe("PREVIEW_AVAILABLE");
      expect(mapped.candidates.map((candidate) => candidate.provider_contact_id)).toEqual([
        "asset-first", "asset-second", "finance-first", "finance-second", "accountant", "controladoria", "inventory", "stock",
      ]);
    },
  );

  it.each(["Map Preview Callback", "Map Apollo Preview Callback"] as const)(
    "deduplicates provider IDs before the ten-candidate cap in %s",
    (nodeName) => {
      const mapped = runPreviewMapper(nodeName, [
        ...Array.from({ length: 15 }, (_, index) => ({
          id: "repeated-asset", name: `Pessoa Repetida ${index}`, title: "Fixed Asset Analyst",
        })),
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `asset-${index}`, name: `Pessoa Imobilizado ${index}`, title: "Fixed Asset Manager",
        })),
        { id: "finance-last", name: "Pessoa Contábil", title: "Controller" },
      ]);
      expect(mapped.candidates.map((candidate) => candidate.provider_contact_id)).toEqual([
        "repeated-asset", ...Array.from({ length: 9 }, (_, index) => `asset-${index}`),
      ]);
      expect(mapped.candidates[0]?.full_name).toBe("Pessoa Repetida 0");

      const tiers = runPreviewMapper(nodeName, [
        { id: "shared", name: "Pessoa Contábil", title: "Controller" },
        { id: "other", name: "Pessoa Financeira", title: "Chief Financial Officer" },
        { id: "shared", name: "Pessoa Patrimonial", title: "Gerente Patrimonial" },
      ]);
      expect(tiers.candidates.map((candidate) => candidate.provider_contact_id)).toEqual(["shared", "other"]);
      expect(tiers.candidates[0]?.full_name).toBe("Pessoa Patrimonial");
    },
  );

  it.each(["Map Preview Callback", "Map Apollo Preview Callback"] as const)(
    "excludes personal-wealth responsibilities before all tiers in %s",
    (nodeName) => {
      const mapped = runPreviewMapper(nodeName, [
        { id: "personal", name: "Pessoa Patrimônio Pessoal", title: "Gerente de Patrimônio Pessoal" },
        { id: "wealth", name: "Pessoa Fortunas", title: "Fixed Assets Manager / Wealth Management" },
        { id: "fortunes", name: "Pessoa Fortunas", title: "Gerente de Patrimônio / Gestão de Fortunas" },
        { id: "private", name: "Pessoa Banco", title: "Chief Financial Officer / Private Banker" },
      ]);
      expect(mapped.status).toBe("PREVIEW_EMPTY");
      expect(mapped.candidates).toEqual([]);
      expect(mapped.search_diagnostics).toContainEqual({
        provider: nodeName === "Map Preview Callback" ? "LUSHA" : "APOLLO",
        stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES",
      });
      const physicalResponsibility = runPreviewMapper(nodeName, [
        { id: "physical", name: "Pessoa Ativos Físicos", title: "Marketing Manager / Fixed Assets Manager" },
      ]);
      expect(physicalResponsibility.candidates.map((candidate) => candidate.provider_contact_id))
        .toEqual(["physical"]);
    },
  );

  it.each(["Map Preview Callback", "Map Apollo Preview Callback"] as const)(
    "withholds missing, unsafe and unrelated titles in %s",
    (nodeName) => {
      const mapped = runPreviewMapper(nodeName, [
        { id: "missing", name: "Pessoa Sem Cargo" },
        { id: "unsafe", name: "Pessoa Título Inseguro", title: "<b>Controller</b>" },
        { id: "people", name: "Pessoa RH", title: "People Director" },
        { id: "marketing", name: "Pessoa Marketing", title: "Marketing Director" },
        { id: "sales", name: "Pessoa Vendas", title: "Sales Manager" },
        { id: "operations", name: "Pessoa Operações", title: "Operations Director" },
        { id: "wealth", name: "Pessoa Investimentos", title: "Wealth Manager" },
      ]);
      expect(mapped.status).toBe("PREVIEW_EMPTY");
      expect(mapped.candidates).toEqual([]);
      expect(mapped.search_diagnostics).toContainEqual({
        provider: nodeName === "Map Preview Callback" ? "LUSHA" : "APOLLO",
        stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES",
      });
    },
  );

  it("prioritizes a local company and otherwise preserves the provider's first result", () => {
    const request = {
      action: "COMPANY_SEARCH",
      search_request_id: "00000000-0000-4000-8000-000000000900",
      company_city: "Recife",
      company_state: "PE",
    };
    const company = (
      id: string,
      city: string,
      state: string,
    ): Readonly<Record<string, unknown>> => ({
      id,
      name: `Empresa ${id}`,
      domain: `${id}.example`,
      industry: "Synthetic",
      location: { city, state, country: "Brazil" },
    });

    const localResult = runCodeNode("Map Company Search Callback", request, {
      statusCode: 200,
      body: {
        results: [
          company("provider-first", "São Paulo", "SP"),
          company("local-match", "RECIFE", "Pernambuco"),
          company("provider-third", "Curitiba", "PR"),
        ],
      },
    }) as { readonly json: { readonly matches: readonly { readonly provider_company_id: string }[] } };
    expect(localResult.json.matches.map((match) => match.provider_company_id)).toEqual([
      "local-match",
      "provider-first",
      "provider-third",
    ]);

    const fallbackResult = runCodeNode("Map Company Search Callback", request, {
      statusCode: 200,
      body: {
        results: [
          company("provider-first", "São Paulo", "SP"),
          company("provider-second", "Curitiba", "PR"),
        ],
      },
    }) as { readonly json: { readonly matches: readonly { readonly provider_company_id: string }[] } };
    expect(fallbackResult.json.matches[0]?.provider_company_id).toBe(
      "provider-first",
    );
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
        fallback_company_domain: "empresa.example",
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
        provider_source: "LUSHA",
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
        provider_source: "LUSHA",
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
      provider_source: "LUSHA",
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
    expect(companyPhoneFallbackMigrationText).toContain(
      "phone_data_ciphertext bytea",
    );
    expect(companyPhoneFallbackMigrationText).toContain("phone_hmac text");
    expect(companyPhoneFallbackMigrationText).not.toMatch(
      /phone_number\s+text|phone_value\s+text/i,
    );
    expect(migrationText).not.toMatch(/REFERENCES\s+(?!prospecting_app\.)/i);
    expect(companyPhoneFallbackMigrationText).not.toMatch(
      /REFERENCES\s+(?!prospecting_app\.)/i,
    );
    expect(queueSource).toContain('fetch("/api/contact-enrichment/v2"');
    expect(queueSource).not.toMatch(/api\.lusha\.com|192\.168\.0\.20|webhook\/prospecta/i);
    expect(queueSource).not.toMatch(/mailto:|tel:/i);
  });
});
