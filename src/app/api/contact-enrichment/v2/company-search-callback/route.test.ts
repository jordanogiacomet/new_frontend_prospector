import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readBoundedJson: vi.fn(),
  processCompanySearchCallback: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../server/contact-enrichment-v2/bounded-json", () => ({
  readBoundedJson: mocks.readBoundedJson,
}));
vi.mock(
  "../../../../../server/contact-enrichment-v2/contact-company-search-service",
  () => ({
    processCompanySearchCallback: mocks.processCompanySearchCallback,
  }),
);
vi.mock("../../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

import { POST } from "./route";

const callbackSecret = "synthetic-v2-callback-secret-at-least-32-bytes";

function request(secret: string | null = callbackSecret): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret !== null) {
    headers["X-Prospecta-Contact-Callback-Secret"] = secret;
  }
  return new NextRequest(
    "https://prospecta.example.test/api/contact-enrichment/v2/company-search-callback",
    { method: "POST", headers, body: JSON.stringify({ synthetic: true }) },
  );
}

beforeEach(() => {
  mocks.readBoundedJson.mockReset();
  mocks.processCompanySearchCallback.mockReset();
  mocks.getServerEnv.mockReset();
  mocks.getServerEnv.mockReturnValue({
    FEATURE_CONTACT_DATA_ENABLED: true,
    N8N_CONTACT_CALLBACK_V2_SECRET: callbackSecret,
  });
});

describe("POST /api/contact-enrichment/v2/company-search-callback", () => {
  it("rejects machine authentication before reading the body", async () => {
    const response = await POST(
      request("wrong-secret-value-at-least-32-bytes"),
    );

    expect(response.status).toBe(401);
    expect(mocks.readBoundedJson).not.toHaveBeenCalled();
    expect(mocks.processCompanySearchCallback).not.toHaveBeenCalled();
  });

  it("records a strict callback without returning provider company data", async () => {
    const body = {
      contract_version: "prospecta-contact-company-search-v2",
      search_request_id: "00000000-0000-4000-8000-000000000951",
      status: "SEARCH_AVAILABLE",
      occurred_at: "2026-08-06T12:00:00.000Z",
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
    mocks.readBoundedJson.mockResolvedValue({
      body,
      exactBytes: Buffer.from("{}"),
    });
    mocks.processCompanySearchCallback.mockResolvedValue({
      kind: "recorded",
      request: { status: "SEARCH_AVAILABLE" },
    });

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.processCompanySearchCallback).toHaveBeenCalledWith(
      body,
      expect.objectContaining({ FEATURE_CONTACT_DATA_ENABLED: true }),
    );
    expect(payload).toEqual({
      data: {
        recorded: true,
        replayed: false,
        status: "SEARCH_AVAILABLE",
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /provider_company_id|company_name|company_domain|billing/i,
    );
  });
});
