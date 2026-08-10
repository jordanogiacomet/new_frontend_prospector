import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
  CONTACT_PREVIEW_CONTRACT_VERSION,
} from "./contact-enrichment-v2-contract";
import {
  dispatchContactCompanySearch,
  dispatchContactPreview,
} from "./contact-enrichment-v2-client";

const request = {
  contract_version: CONTACT_PREVIEW_CONTRACT_VERSION,
  action: "PREVIEW" as const,
  request_id: "00000000-0000-4000-8000-000000000921",
  idempotency_key: "synthetic-idempotency-key",
  cnpj_normalizado: "12345678000195",
  company_domain: "empresa.example",
};
const configuration = {
  url: "https://n8n.example.test/webhook/prospecta/lusha/contact-enrichment-v2",
  secret: "synthetic-ingress-secret-value-at-least-32-bytes",
  timeoutMs: 25,
};

describe("contact enrichment v2 client", () => {
  it("accepts only the exact safe 202 acknowledgement", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          contract_version: CONTACT_PREVIEW_CONTRACT_VERSION,
          request_id: request.request_id,
          status: "PREVIEW_DISPATCHED",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      dispatchContactPreview(request, configuration, fetchImplementation),
    ).resolves.toEqual({ kind: "acknowledged" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(fetchImplementation.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify(request),
    );
  });

  it("returns unknown on timeout without retry", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      dispatchContactPreview(request, configuration, fetchImplementation),
    ).resolves.toEqual({ kind: "unknown" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("accepts only a correlated company-search acknowledgement", async () => {
    const companySearchRequest = {
      contract_version: CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
      action: "COMPANY_SEARCH" as const,
      search_request_id: "00000000-0000-4000-8000-000000000922",
      idempotency_key: "synthetic-company-search-key",
      cnpj_normalizado: "12345678000195",
      company_name: "Empresa Sintética",
      company_city: "Recife",
      company_state: "PE",
      company_country_iso2: "BR" as const,
    };
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          contract_version: CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
          search_request_id: companySearchRequest.search_request_id,
          status: "SEARCH_DISPATCHED",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      dispatchContactCompanySearch(
        companySearchRequest,
        configuration,
        fetchImplementation,
      ),
    ).resolves.toEqual({ kind: "acknowledged" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("treats a 202 containing contacts as invalid", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          contract_version: CONTACT_PREVIEW_CONTRACT_VERSION,
          request_id: request.request_id,
          status: "PREVIEW_DISPATCHED",
          contacts: [{ email: "must-not-pass@example.test" }],
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      dispatchContactPreview(request, configuration, fetchImplementation),
    ).resolves.toEqual({ kind: "unknown" });
  });
});
