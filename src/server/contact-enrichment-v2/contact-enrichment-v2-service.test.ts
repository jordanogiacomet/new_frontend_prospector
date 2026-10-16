import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordPreviewResult: vi.fn(), readPreviewRequest: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./contact-enrichment-v2-repository", () => mocks);
vi.mock("./contact-company-search-service", () => ({
  applyCompanyMatchRetention: vi.fn(),
  resolveCompanyMatchSelection: vi.fn(),
}));

import type { AuthorizedActor } from "../auth";
import type { ParsedServerEnv } from "../env";
import { getContactPreview, processPreviewCallback } from "./contact-enrichment-v2-service";

const actor = { subject: "synthetic-actor", organizationId: "org-synthetic-contact" } as AuthorizedActor;
const environment = {
  AUTH_ALLOWED_ORG_ID: actor.organizationId,
  FEATURE_CONTACT_DATA_ENABLED: true,
  CONTACT_DATA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
  CONTACT_DATA_ENCRYPTION_KEY_ID: "synthetic-key-v1",
  CONTACT_SUPPRESSION_HMAC_KEY: "synthetic-suppression-secret-at-least-32-bytes",
} as ParsedServerEnv;
const requestId = "00000000-0000-4000-8000-000000000776";
const callback = {
  contract_version: "prospecta-contact-enrichment-preview-v2", request_id: requestId,
  status: "PROVIDER_OUTCOME_UNKNOWN", occurred_at: "2026-10-06T12:00:00.000Z", candidates: [],
};

beforeEach(() => { mocks.recordPreviewResult.mockReset(); mocks.readPreviewRequest.mockReset(); });

describe("contact preview diagnostic service", () => {
  it("persists only validated diagnostics and exposes the same facts under the actor's organization", async () => {
    const searchDiagnostics = [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "TIMEOUT" }] as const;
    mocks.recordPreviewResult.mockResolvedValue({ kind: "recorded" });
    await processPreviewCallback({ ...callback, search_diagnostics: searchDiagnostics }, environment);
    expect(mocks.recordPreviewResult).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: actor.organizationId, searchDiagnostics, status: "PROVIDER_OUTCOME_UNKNOWN", candidates: [],
    }));
    mocks.readPreviewRequest.mockResolvedValue({ request: {
      requestId, status: "PROVIDER_OUTCOME_UNKNOWN", searchDiagnostics,
      requestedAt: new Date(callback.occurred_at), updatedAt: new Date(callback.occurred_at), previewExpiresAt: null,
    }, candidates: [], companyPhone: null });
    await expect(getContactPreview({ actor, requestId }, environment)).resolves.toMatchObject({
      status: "PROVIDER_OUTCOME_UNKNOWN", searchDiagnostics,
    });
    expect(mocks.readPreviewRequest).toHaveBeenCalledWith(expect.objectContaining({ organizationId: actor.organizationId }));
  });

  it("keeps legacy reasons unavailable and rejects raw provider details before persistence", async () => {
    mocks.recordPreviewResult.mockResolvedValue({ kind: "recorded" });
    await processPreviewCallback(callback, environment);
    expect(mocks.recordPreviewResult).toHaveBeenCalledWith(expect.objectContaining({ searchDiagnostics: null }));
    mocks.recordPreviewResult.mockClear();
    await expect(processPreviewCallback({ ...callback, search_diagnostics: [{
      provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "TIMEOUT", message: "secret raw provider detail",
    }] }, environment)).rejects.toThrow();
    expect(mocks.recordPreviewResult).not.toHaveBeenCalled();
  });

  it("projects recovery ledger facts without exposing provider references or bypassing transparency", async () => {
    const reveal = {
      revealRequestId: "00000000-0000-4000-8000-000000000778", status: "REVEAL_EMPTY",
      requestedChannels: ["work_email"], channelsMatchResult: false,
      requestedAt: callback.occurred_at, updatedAt: callback.occurred_at,
    };
    mocks.readPreviewRequest.mockResolvedValue({ request: {
      requestId, status: "PREVIEW_AVAILABLE", requestedAt: new Date(callback.occurred_at),
      updatedAt: new Date(callback.occurred_at), previewExpiresAt: new Date("2026-11-06T12:00:00Z"),
    }, candidates: [{
      contactId: "00000000-0000-4000-8000-000000000779", reveal,
      obtainedAt: new Date(callback.occurred_at), expiresAt: new Date("2026-11-06T12:00:00Z"),
      suppressedAt: new Date(callback.occurred_at), erasedAt: null,
      encryptedProfile: null, encryptedProviderRef: null, encryptedChannels: null,
      providerRefHmac: "private-provider-fingerprint", channelRevealRequestId: null,
      channelExpiresAt: null, channelSuppressedAt: null, channelErasedAt: null,
    }], companyPhone: null });
    const now = new Date("2026-10-13T12:00:00Z");
    const result = await getContactPreview({ actor, requestId, now }, {
      ...environment, CONTACT_CONTROLLER_LEGAL_NAME: "Controlador Sintético", CONTACT_PRIVACY_CONTACT: "privacy@example.test",
    });
    expect(result?.candidates?.[0]?.reveal).toEqual(reveal);
    expect(JSON.stringify(result)).not.toMatch(/private-provider-fingerprint|encryptedProfile|encryptedChannels|actorSubject|organizationId/);
    const withheld = await getContactPreview({ actor, requestId, now }, environment);
    expect(withheld?.candidates).toBeNull();
  });
});
