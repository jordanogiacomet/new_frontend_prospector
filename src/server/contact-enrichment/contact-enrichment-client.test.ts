import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ getServerEnv: mocks.getServerEnv }));

import {
  submitContactEnrichmentToN8n,
  type ContactEnrichmentFetch,
} from "./contact-enrichment-client";

const request = {
  contract_version: "prospecta-contact-enrichment-v1",
  request_id: "00000000-0000-4000-8000-000000000912",
  idempotency_key: "synthetic-idempotency-912",
  cnpj_normalizado: "12345678000195",
  company_domain: "empresa-sintetica.example",
} as const;

beforeEach(() => {
  mocks.getServerEnv.mockReset();
  mocks.getServerEnv.mockReturnValue({
    N8N_CONTACT_ENRICHMENT_URL:
      "https://automation.example.test/webhook/prospecta/lusha/decision-makers",
    N8N_CONTACT_ENRICHMENT_SECRET:
      "synthetic-contact-ingress-secret-with-32-bytes",
    CONTACT_ENRICHMENT_TIMEOUT_MS: 15_000,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("contact enrichment n8n client", () => {
  it("makes one authenticated exact-body request and validates the PII-free 202", async () => {
    const fetch = vi.fn<ContactEnrichmentFetch>().mockResolvedValue({
      status: 202,
      json: async () => ({
        contract_version: request.contract_version,
        request_id: request.request_id,
        status: "ENRICHMENT_DISPATCHED",
      }),
    });

    await expect(
      submitContactEnrichmentToN8n(request, { fetch }),
    ).resolves.toEqual({ kind: "acknowledged" });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://automation.example.test/webhook/prospecta/lusha/decision-makers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Prospecta-Contact-Enrichment-Secret":
            "synthetic-contact-ingress-secret-with-32-bytes",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    { status: 500, payload: { raw: "provider failure" } },
    { status: 202, payload: { ...request, status: "CONTACT_FOUND" } },
    {
      status: 202,
      payload: {
        contract_version: request.contract_version,
        request_id: "00000000-0000-4000-8000-000000000999",
        status: "ENRICHMENT_DISPATCHED",
      },
    },
  ])("maps a non-contract response to unknown without retry", async ({
    status,
    payload,
  }) => {
    const fetch = vi.fn<ContactEnrichmentFetch>().mockResolvedValue({
      status,
      json: async () => payload,
    });

    await expect(
      submitContactEnrichmentToN8n(request, { fetch }),
    ).resolves.toEqual({ kind: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("times out honestly and never retries", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<ContactEnrichmentFetch>().mockImplementation(
      async () => new Promise(() => undefined),
    );

    const pending = submitContactEnrichmentToN8n(request, { fetch });
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toEqual({ kind: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
