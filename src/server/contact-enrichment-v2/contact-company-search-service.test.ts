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
import {
  getContactCompanySearch,
  processCompanySearchCallback,
  resolveCompanyMatchSelection,
  submitContactCompanySearch,
} from "./contact-company-search-service";
import {
  createContactDataKeyMaterial,
  encryptContactJson,
} from "./contact-data-crypto";

const actor = {
  subject: "demo3-preproduction-user",
  organizationId: "org-synthetic-contact-v2",
} as AuthorizedActor;
const environment = {
  AUTH_ALLOWED_ORG_ID: actor.organizationId,
  FEATURE_CONTACT_DATA_ENABLED: true,
  N8N_CONTACT_ENRICHMENT_V2_URL:
    "https://n8n.example.test/webhook/prospecta/lusha/contact-enrichment-v2",
  N8N_CONTACT_ENRICHMENT_V2_SECRET:
    "synthetic-ingress-secret-value-at-least-32-bytes",
  CONTACT_ENRICHMENT_TIMEOUT_MS: 25,
  CONTACT_DATA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
  CONTACT_DATA_ENCRYPTION_KEY_ID: "synthetic-key-v1",
  CONTACT_SUPPRESSION_HMAC_KEY:
    "synthetic-suppression-key-value-at-least-32-bytes",
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
  mocks.readCompanySearchRequest.mockReset();
  mocks.recordCompanySearchResult.mockReset();
});

describe("contact company search service", () => {
  it("persists the confirmed safe reason and returns it without company identifiers", async () => {
    const searchDiagnostics = [{ provider: "LUSHA", stage: "COMPANY_SEARCH", code: "ACCESS_DENIED" }] as const;
    mocks.recordCompanySearchResult.mockResolvedValue({ kind: "recorded", request: storedRequest });
    await processCompanySearchCallback({
      contract_version: "prospecta-contact-company-search-v2",
      search_request_id: storedRequest.searchRequestId,
      status: "SEARCH_FAILED", occurred_at: "2026-10-06T12:00:00.000Z", matches: [],
      search_diagnostics: searchDiagnostics,
    }, environment);
    expect(mocks.recordCompanySearchResult).toHaveBeenCalledWith(expect.objectContaining({ searchDiagnostics }));
    mocks.readCompanySearchRequest.mockResolvedValue({
      request: { ...storedRequest, status: "SEARCH_FAILED", searchDiagnostics }, matches: [],
    });
    await expect(getContactCompanySearch({ actor, searchRequestId: storedRequest.searchRequestId }, environment))
      .resolves.toMatchObject({ status: "SEARCH_FAILED", matches: [], searchDiagnostics });
  });

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

  it("resolves the confirmed provider company and its exact fallback domain", async () => {
    const companyMatchId = "00000000-0000-4000-8000-000000000981";
    const keys = createContactDataKeyMaterial({
      keyId: environment.CONTACT_DATA_ENCRYPTION_KEY_ID!,
      encryptionKeyBase64: environment.CONTACT_DATA_ENCRYPTION_KEY_BASE64!,
      suppressionKey: environment.CONTACT_SUPPRESSION_HMAC_KEY!,
    });
    mocks.readCompanyMatchForPreview.mockResolvedValue({
      companyMatchId,
      searchRequestId: storedRequest.searchRequestId,
      encryptedProviderRef: encryptContactJson(
        "lusha-company-id",
        `company-provider:${actor.organizationId}:${storedRequest.searchRequestId}:${companyMatchId}`,
        keys,
      ),
      encryptedProfile: encryptContactJson(
        {
          companyName: "Empresa Sintética",
          companyDomain: "empresa.example",
          industry: null,
          location: { city: "Recife", state: "PE", country: "Brazil" },
        },
        `company-profile:${actor.organizationId}:${storedRequest.searchRequestId}:${companyMatchId}`,
        keys,
      ),
      obtainedAt: new Date("2026-08-10T12:00:00.000Z"),
      expiresAt: new Date("2026-08-11T12:00:00.000Z"),
      erasedAt: null,
    });

    await expect(
      resolveCompanyMatchSelection(
        {
          actor,
          cnpjNormalizado: "12345678000195",
          companyMatchId,
        },
        environment,
      ),
    ).resolves.toEqual({
      providerCompanyId: "lusha-company-id",
      companyDomain: "empresa.example",
      searchRequestId: storedRequest.searchRequestId,
    });
  });
});
