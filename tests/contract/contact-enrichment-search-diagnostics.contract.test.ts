import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface WorkflowNode {
  readonly name: string;
  readonly parameters: {
    readonly jsCode?: string;
    readonly jsonBody?: string;
    readonly conditions?: {
      readonly combinator: string;
      readonly conditions: readonly {
        readonly leftValue: string;
        readonly rightValue: unknown;
        readonly operator: { readonly operation: string };
      }[];
    };
  };
}

interface Diagnostic {
  readonly provider: "LUSHA" | "APOLLO";
  readonly stage: "COMPANY_SEARCH" | "COMPANY_MATCH" | "CONTACT_PREVIEW";
  readonly code: string;
}

interface Callback {
  readonly status: string;
  readonly search_diagnostics: readonly Diagnostic[];
  readonly candidates?: readonly unknown[];
  readonly matches?: readonly unknown[];
  readonly apollo_organization_matched?: boolean;
  readonly apollo_request_body?: unknown;
  readonly company_phone?: unknown;
  readonly apollo_company_phone?: string | null;
}

const workflow = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "integrations/n8n/prospecting-contact-enrichment-v2/workflow.json",
    ),
    "utf8",
  ),
) as { readonly nodes: readonly WorkflowNode[] };

const request = {
  action: "PREVIEW",
  request_id: "00000000-0000-4000-8000-000000001940",
  search_request_id: "00000000-0000-4000-8000-000000001941",
  fallback_company_domain: "empresa.example",
};

const lushaEmpty: Diagnostic = {
  provider: "LUSHA",
  stage: "CONTACT_PREVIEW",
  code: "NO_MATCHES",
};

function runMapper(
  name: string,
  input: Readonly<Record<string, unknown>>,
  options: {
    readonly request?: Readonly<Record<string, unknown>>;
    readonly preparation?: Callback;
  } = {},
): Callback {
  const code = workflow.nodes.find((node) => node.name === name)?.parameters
    .jsCode;
  if (!code) throw new Error(`Missing mapper: ${name}`);
  const result = runInNewContext(
    `(() => { ${code} })()`,
    {
      $json: input,
      $: (nodeName: string) => {
        const json =
          nodeName === "Validate v2 Request"
            ? options.request ?? request
            : nodeName === "Map Preview Callback"
              ? { search_diagnostics: [lushaEmpty] }
              : nodeName === "Prepare Apollo People Fallback"
                ? options.preparation ?? {
                    search_diagnostics: [
                      lushaEmpty,
                      {
                        provider: "APOLLO",
                        stage: "COMPANY_MATCH",
                        code: "RESULTS_FOUND",
                      },
                    ],
                    apollo_company_phone: "+551133334444",
                  }
                : undefined;
        if (!json) throw new Error(`Unexpected lookup: ${nodeName}`);
        return { first: () => ({ json }) };
      },
    },
    { timeout: 1_000 },
  ) as { readonly json: Callback };
  return JSON.parse(JSON.stringify(result.json)) as Callback;
}

function apolloFallbackAllowed(callback: Callback, domain: string | null): boolean {
  const conditions = workflow.nodes.find((node) => node.name === "IF Lusha Preview Empty")
    ?.parameters.conditions;
  if (!conditions || conditions.combinator !== "and") {
    throw new Error("Missing combined Apollo fallback gate");
  }
  return conditions.conditions.every((condition) => {
    const value = runInNewContext(condition.leftValue.slice(3, -3).trim(), {
      $json: callback,
      $: () => ({ first: () => ({ json: { ...request, fallback_company_domain: domain } }) }),
    }) as unknown;
    if (condition.operator.operation === "equals") return value === condition.rightValue;
    if (condition.operator.operation === "true") return value === true;
    if (condition.operator.operation === "notEmpty") return typeof value === "string" && value.length > 0;
    throw new Error("Unexpected fallback gate operator");
  });
}

describe("contact search diagnostics workflow contract", () => {
  it.each([
    ["Map Company Search Callback", "LUSHA", "COMPANY_SEARCH"],
    ["Map Preview Callback", "LUSHA", "CONTACT_PREVIEW"],
    ["Prepare Apollo People Fallback", "APOLLO", "COMPANY_MATCH"],
    ["Map Apollo Preview Callback", "APOLLO", "CONTACT_PREVIEW"],
  ] as const)("maps confirmed HTTP facts safely in %s", (node, provider, stage) => {
    for (const [statusCode, code] of [
      [401, "ACCESS_DENIED"],
      [403, "ACCESS_DENIED"],
      [429, "RATE_LIMITED"],
      [422, "PROVIDER_ERROR"],
      [500, "PROVIDER_ERROR"],
      [504, "PROVIDER_ERROR"],
    ] as const) {
      const mapped = runMapper(node, {
        statusCode,
        body: {
          error: "secret raw provider message",
          requestId: "provider-private-id",
          credits_remaining: 0,
        },
      });
      expect(mapped.search_diagnostics).toContainEqual({
        provider,
        stage,
        code,
      });
      expect(mapped.status).not.toBe("PREVIEW_EMPTY");
      expect(mapped.status).not.toBe("SEARCH_EMPTY");
      expect(mapped.company_phone ?? null).toBeNull();
      expect(JSON.stringify(mapped)).not.toMatch(
        /secret raw|provider-private-id|credits_remaining|statusCode/,
      );
    }
  });

  it.each([
    "Map Company Search Callback",
    "Map Preview Callback",
    "Prepare Apollo People Fallback",
    "Map Apollo Preview Callback",
  ])("uses structured timeout facts and keeps uncertainty in %s", (node) => {
    for (const error of [
      { code: "ETIMEDOUT", message: "private transport detail" },
      { cause: { code: "ESOCKETTIMEDOUT" } },
    ]) {
      const mapped = runMapper(node, { error });
      expect(mapped.status).toBe("PROVIDER_OUTCOME_UNKNOWN");
      expect(mapped.search_diagnostics.some((item) => item.code === "TIMEOUT"))
        .toBe(true);
      expect(JSON.stringify(mapped)).not.toMatch(
        /ETIMEDOUT|ESOCKETTIMEDOUT|private transport/,
      );
    }
    for (const input of [
      { error: "ETIMEDOUT private transport detail" },
      { error: { code: "ECONNRESET", message: "timeout" } },
      {},
    ]) {
      const mapped = runMapper(node, input);
      expect(mapped.status).toBe("PROVIDER_OUTCOME_UNKNOWN");
      expect(mapped.search_diagnostics.some((item) => item.code === "OUTCOME_UNKNOWN"))
        .toBe(true);
      expect(mapped.search_diagnostics.some((item) => item.code === "TIMEOUT"))
        .toBe(false);
    }
  });

  it("distinguishes a confirmed empty company search from malformed results", () => {
    const empty = runMapper("Map Company Search Callback", {
      statusCode: 200,
      body: { results: [] },
    });
    expect(empty).toMatchObject({
      status: "SEARCH_EMPTY",
      matches: [],
      search_diagnostics: [
        { provider: "LUSHA", stage: "COMPANY_SEARCH", code: "NO_MATCHES" },
      ],
    });
    for (const body of [{}, { results: [{}] }, { results: "not-an-array" }]) {
      const invalid = runMapper("Map Company Search Callback", {
        statusCode: 200,
        body,
      });
      expect(invalid.status).not.toBe("SEARCH_EMPTY");
      expect(invalid.search_diagnostics[0]?.code).toBe("INVALID_RESPONSE");
    }
  });

  it("reports company-search results without retaining provider errors", () => {
    const mapped = runMapper("Map Company Search Callback", {
      statusCode: 200,
      body: {
        results: [{ id: "company-id", name: "Empresa Sintética" }],
        requestId: "private-id",
        billing: { creditsCharged: 1 },
      },
    });
    expect(mapped.status).toBe("SEARCH_AVAILABLE");
    expect(mapped.search_diagnostics[0]?.code).toBe("RESULTS_FOUND");
    expect(JSON.stringify(mapped)).not.toMatch(/private-id|billing|creditsCharged/);
  });

  it("requires an explicit correlated empty decision-maker sample before Apollo", () => {
    const empty = runMapper("Map Preview Callback", {
      statusCode: 200,
      body: {
        results: [{ clientReferenceId: request.request_id, decisionMakers: [] }],
      },
    });
    expect(empty).toMatchObject({
      status: "PREVIEW_EMPTY",
      candidates: [],
      search_diagnostics: [lushaEmpty],
    });
    expect(apolloFallbackAllowed(empty, request.fallback_company_domain)).toBe(true);
    expect(apolloFallbackAllowed(empty, null)).toBe(false);
    for (const body of [
      {},
      { results: [] },
      { results: [{}] },
      { results: [{ clientReferenceId: request.request_id }] },
      { results: [{ clientReferenceId: "other-request", decisionMakers: [] }] },
      { results: [{ decisionMakers: [{}] }] },
      { results: [{ decisionMakers: "not-an-array" }] },
    ]) {
      const invalid = runMapper("Map Preview Callback", { statusCode: 200, body });
      expect(invalid.status).toBe("PROVIDER_OUTCOME_UNKNOWN");
      expect(invalid.search_diagnostics).toEqual([
        { provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "INVALID_RESPONSE" },
        { provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NOT_ATTEMPTED" },
      ]);
      expect(apolloFallbackAllowed(invalid, request.fallback_company_domain)).toBe(false);
    }
  });

  it("does not consult Apollo when a valid Lusha sample contains no approved job title", () => {
    const filtered = runMapper("Map Preview Callback", {
      statusCode: 200,
      body: {
        results: [{
          clientReferenceId: request.request_id,
          decisionMakers: [{
            id: "unrelated-person", fullName: "Pessoa Sintética",
            jobTitle: { title: "Operations Director" },
          }],
        }],
      },
    });
    expect(filtered).toMatchObject({
      status: "PREVIEW_EMPTY", candidates: [],
      search_diagnostics: [
        { provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES" },
        { provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NOT_ATTEMPTED" },
      ],
    });
    expect(apolloFallbackAllowed(filtered, request.fallback_company_domain)).toBe(false);
    for (const diagnostics of [
      [],
      [{ provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NO_MATCHES" }],
      [{ provider: "LUSHA", stage: "COMPANY_SEARCH", code: "NO_MATCHES" }],
    ] as const) {
      expect(apolloFallbackAllowed({ ...filtered, search_diagnostics: diagnostics }, request.fallback_company_domain)).toBe(false);
    }
  });

  it("preserves singleton responses without a correlation key but rejects a provider error", () => {
    const empty = runMapper("Map Preview Callback", {
      statusCode: 200,
      body: { results: [{ decisionMakers: [] }] },
    });
    expect(empty.status).toBe("PREVIEW_EMPTY");
    const error = runMapper("Map Preview Callback", {
      statusCode: 200,
      body: {
        results: [{ clientReferenceId: request.request_id, error: "private" }],
      },
    });
    expect(error.status).toBe("PROVIDER_OUTCOME_UNKNOWN");
    expect(error.search_diagnostics[0]?.code).toBe("PROVIDER_ERROR");
    expect(JSON.stringify(error)).not.toContain("private");
  });

  it("explains that Apollo cannot use an unavailable confirmed domain", () => {
    const mapped = runMapper(
      "Map Preview Callback",
      { statusCode: 200, body: { results: [{ decisionMakers: [] }] } },
      { request: { ...request, fallback_company_domain: null } },
    );
    expect(mapped.status).toBe("PREVIEW_EMPTY");
    expect(mapped.search_diagnostics).toEqual([
      lushaEmpty,
      { provider: "APOLLO", stage: "COMPANY_MATCH", code: "DOMAIN_UNAVAILABLE" },
    ]);
  });

  it("explains the exact-company mismatch and keeps people lookup unattempted", () => {
    const mapped = runMapper("Prepare Apollo People Fallback", {
      statusCode: 200,
      body: {
        organization: {
          id: "wrong-company",
          primary_domain: "outra.example",
          sanitized_phone: "+551133334444",
        },
      },
    });
    expect(mapped).toMatchObject({
      status: "PREVIEW_EMPTY",
      apollo_organization_matched: false,
      apollo_request_body: null,
      apollo_company_phone: null,
      search_diagnostics: [
        lushaEmpty,
        { provider: "APOLLO", stage: "COMPANY_MATCH", code: "COMPANY_NOT_CONFIRMED" },
        { provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NOT_ATTEMPTED" },
      ],
    });
  });

  it.each([
    { id: "company-without-domain" },
    { id: "company-with-malformed-domain", primary_domain: "https://empresa.example" },
    { id: "company-with-null-domain", primary_domain: null },
    { primary_domain: "empresa.example" },
    {},
  ])("preserves the original empty sample when Apollo cannot confirm its company: %j", (organization) => {
    const mapped = runMapper("Prepare Apollo People Fallback", {
      statusCode: 200,
      body: { organization },
    });
    expect(mapped).toMatchObject({
      status: "PREVIEW_EMPTY",
      apollo_organization_matched: false,
      apollo_request_body: null,
      apollo_company_phone: null,
      search_diagnostics: [
        lushaEmpty,
        { provider: "APOLLO", stage: "COMPANY_MATCH", code: "COMPANY_NOT_CONFIRMED" },
        { provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NOT_ATTEMPTED" },
      ],
    });
  });

  it("keeps both provider facts through a successful Apollo people fallback", () => {
    const preparation = runMapper("Prepare Apollo People Fallback", {
      statusCode: 200,
      body: { organization: { id: "exact-company", primary_domain: "empresa.example" } },
    });
    const mapped = runMapper(
      "Map Apollo Preview Callback",
      { statusCode: 200, body: { people: [{ id: "person", name: "Pessoa S.", title: "Controller" }] } },
      { preparation },
    );
    expect(mapped.status).toBe("PREVIEW_AVAILABLE");
    expect(mapped.search_diagnostics).toEqual([
      lushaEmpty,
      { provider: "APOLLO", stage: "COMPANY_MATCH", code: "RESULTS_FOUND" },
      { provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "RESULTS_FOUND" },
    ]);
  });

  it("distinguishes empty Apollo people from invalid data even when a company phone is available", () => {
    const empty = runMapper("Map Apollo Preview Callback", {
      statusCode: 200,
      body: { people: [] },
    });
    expect(empty.status).toBe("PREVIEW_AVAILABLE");
    expect(empty.company_phone).toMatchObject({ number: "+551133334444" });
    expect(empty.search_diagnostics.at(-1)?.code).toBe("NO_MATCHES");
    for (const body of [{}, { people: [{}] }, { people: "not-an-array" }]) {
      const invalid = runMapper("Map Apollo Preview Callback", { statusCode: 200, body });
      expect(invalid.status).toBe("PROVIDER_OUTCOME_UNKNOWN");
      expect(invalid.company_phone).toBeNull();
      expect(invalid.search_diagnostics.at(-1)?.code).toBe("INVALID_RESPONSE");
    }
  });

  it("does not substitute a company phone for nonempty Apollo people excluded by title", () => {
    const mapped = runMapper("Map Apollo Preview Callback", {
      statusCode: 200,
      body: { people: [{ id: "unrelated-person", name: "Pessoa S.", title: "People Director" }] },
    });
    expect(mapped).toMatchObject({
      status: "PREVIEW_EMPTY", candidates: [], company_phone: null,
    });
    expect(mapped.search_diagnostics.at(-1)).toEqual({
      provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES",
    });
  });

  it("projects only callback fields while keeping diagnostics under the four-entry limit", () => {
    const preparation = runMapper("Prepare Apollo People Fallback", {
      statusCode: 200,
      body: { organization: { id: "exact-company", primary_domain: "empresa.example" } },
    });
    const expression = workflow.nodes.find(
      (node) => node.name === "Callback Prospecta Preview v2",
    )?.parameters.jsonBody;
    if (!expression) throw new Error("Missing callback projection");
    const projected = JSON.parse(
      runInNewContext(expression.slice(3, -3).trim(), { $json: preparation }) as string,
    ) as Readonly<Record<string, unknown>>;
    expect(projected.search_diagnostics).toEqual(preparation.search_diagnostics);
    expect(preparation.search_diagnostics.length).toBeLessThanOrEqual(4);
    expect(projected).not.toHaveProperty("apollo_request_body");
    expect(projected).not.toHaveProperty("apollo_company_phone");
    expect(projected).not.toHaveProperty("apollo_organization_matched");
    expect(JSON.stringify(projected)).not.toContain("exact-company");
  });
});
