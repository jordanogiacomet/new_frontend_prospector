import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordCompanySearchIntent: vi.fn(),
  recordCompanySearchDispatchOutcome: vi.fn(),
  recordCompanySearchResult: vi.fn(),
  readCompanySearchRequest: vi.fn(),
  readCompanyMatchForPreview: vi.fn(),
  eraseExpiredCompanyMatches: vi.fn(),
  dispatchContactCompanySearch: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./contact-company-search-repository", () => ({
  recordCompanySearchIntent: mocks.recordCompanySearchIntent,
  recordCompanySearchDispatchOutcome:
    mocks.recordCompanySearchDispatchOutcome,
  recordCompanySearchResult: mocks.recordCompanySearchResult,
  readCompanySearchRequest: mocks.readCompanySearchRequest,
  readCompanyMatchForPreview: mocks.readCompanyMatchForPreview,
  eraseExpiredCompanyMatches: mocks.eraseExpiredCompanyMatches,
}));
vi.mock("./contact-enrichment-v2-client", () => ({
  dispatchContactCompanySearch: mocks.dispatchContactCompanySearch,
}));

import type { AuthorizedActor } from "../auth";
import type { ParsedServerEnv } from "../env";
import { submitContactCompanySearch } from "./contact-company-search-service";

const actor = {
  subject: "demo3-preproduction-user",
  organizationId: "org-synthetic-contact-v2",
} as AuthorizedActor;
const environment = {
  FEATURE_CONTACT_DATA_ENABLED: true,
  N8N_CONTACT_ENRICHMENT_V2_URL:
    "https://n8n.example.test/webhook/prospecta/lusha/contact-enrichment-v2",
  N8N_CONTACT_ENRICHMENT_V2_SECRET:
    "synthetic-ingress-secret-value-at-least-32-bytes",
  CONTACT_ENRICHMENT_TIMEOUT_MS: 25,
} as ParsedServerEnv;
const storedRequest = {
  searchRequestId: "00000000-0000-4000-8000-000000000980",
  organizationId: actor.organizationId,
  actorSubject: actor.subject,
  cnpjNormalizado: "12345678000195",
  status: "SEARCH_REQUEST_RECORDED" as const,
  resultSha256: null,
  requestedAt: new Date("2026-08-06T12:00:00.000Z"),
  updatedAt: new Date("2026-08-06T12:00:00.000Z"),
  providerOccurredAt: null,
  matchesExpiresAt: null,
};

beforeEach(() => {
  mocks.recordCompanySearchIntent.mockReset();
  mocks.recordCompanySearchDispatchOutcome.mockReset();
  mocks.dispatchContactCompanySearch.mockReset();
});

describe("contact company search service", () => {
  it("records canonical intent before one outbound attempt", async () => {
    mocks.recordCompanySearchIntent.mockResolvedValue({
      kind: "created",
      request: storedRequest,
    });
    mocks.dispatchContactCompanySearch.mockResolvedValue({
      kind: "acknowledged",
    });
    mocks.recordCompanySearchDispatchOutcome.mockResolvedValue({
      ...storedRequest,
      status: "SEARCH_DISPATCHED",
    });

    await expect(
      submitContactCompanySearch(
        {
          actor,
          idempotencyKey: "company-search-synthetic-key",
          request: {
            cnpj_normalizado: "12345678000195",
            company_name: "Empresa   Sintética",
            company_city: "  Recife  ",
            company_state: "pe",
            company_country_iso2: "BR",
          },
        },
        environment,
        vi.fn<typeof fetch>(),
      ),
    ).resolves.toMatchObject({
      kind: "created",
      request: { status: "SEARCH_DISPATCHED" },
    });

    expect(mocks.recordCompanySearchIntent).toHaveBeenCalledOnce();
    expect(mocks.dispatchContactCompanySearch).toHaveBeenCalledOnce();
    expect(
      mocks.recordCompanySearchIntent.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.dispatchContactCompanySearch.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.dispatchContactCompanySearch).toHaveBeenCalledWith(
      expect.objectContaining({
        company_name: "Empresa Sintética",
        company_city: "Recife",
        company_state: "PE",
        company_country_iso2: "BR",
      }),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns an idempotent duplicate without a second provider attempt", async () => {
    mocks.recordCompanySearchIntent.mockResolvedValue({
      kind: "duplicate",
      request: storedRequest,
    });

    await expect(
      submitContactCompanySearch(
        {
          actor,
          idempotencyKey: "company-search-synthetic-key",
          request: {
            cnpj_normalizado: "12345678000195",
            company_name: "Empresa Sintética",
            company_city: null,
            company_state: null,
            company_country_iso2: "BR",
          },
        },
        environment,
      ),
    ).resolves.toMatchObject({ kind: "duplicate" });
    expect(mocks.dispatchContactCompanySearch).not.toHaveBeenCalled();
    expect(mocks.recordCompanySearchDispatchOutcome).not.toHaveBeenCalled();
  });
});
