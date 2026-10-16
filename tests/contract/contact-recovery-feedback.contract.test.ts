import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPreviewRequest: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../src/server/contact-enrichment-v2/contact-enrichment-v2-repository", () => mocks);
vi.mock("../../src/server/contact-enrichment-v2/contact-company-search-service", () => ({
  applyCompanyMatchRetention: vi.fn(), resolveCompanyMatchSelection: vi.fn(),
}));

import type { AuthorizedActor } from "../../src/server/auth";
import type { ParsedServerEnv } from "../../src/server/env";
import { getContactPreview } from "../../src/server/contact-enrichment-v2/contact-enrichment-v2-service";
import { describeContactRevealStatus } from "../../src/lib/contact-search-feedback";
import type { ContactCandidateDto } from "../../src/types/contact-enrichment";

const actor = { subject: "synthetic-contract-actor", organizationId: "synthetic-contract-org" } as AuthorizedActor;
const requestId = "00000000-0000-4000-8000-000000000776";
const occurredAt = new Date("2026-10-13T12:00:00Z");
const environment = {
  FEATURE_CONTACT_DATA_ENABLED: true,
  CONTACT_DATA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
  CONTACT_DATA_ENCRYPTION_KEY_ID: "synthetic-contract-key",
  CONTACT_SUPPRESSION_HMAC_KEY: "synthetic-contact-contract-secret-of-32-bytes",
  CONTACT_CONTROLLER_LEGAL_NAME: "Controlador Sintético",
  CONTACT_PRIVACY_CONTACT: "privacy@example.test",
} as ParsedServerEnv;

describe("contact recovery feedback projection contract", () => {
  it("exposes only approved recovery ledger facts and withholds them without transparency", async () => {
    const reveal = {
      revealRequestId: "00000000-0000-4000-8000-000000000777",
      status: "REVEAL_EMPTY", requestedChannels: ["work_email"],
      requestedAt: occurredAt.toISOString(), updatedAt: occurredAt.toISOString(), channelsMatchResult: false,
      providerContactId: "private-provider-id", rawPayload: "private-payload", idempotencyKey: "private-key",
    };
    mocks.readPreviewRequest.mockResolvedValue({ request: {
      requestId, status: "PREVIEW_AVAILABLE", requestedAt: occurredAt, updatedAt: occurredAt, previewExpiresAt: null,
    }, companyPhone: null, candidates: [{
      contactId: "00000000-0000-4000-8000-000000000778", reveal,
      obtainedAt: occurredAt, expiresAt: new Date("2026-11-12T12:00:00Z"),
      suppressedAt: occurredAt, erasedAt: null, encryptedProfile: null, encryptedProviderRef: null, encryptedChannels: null,
    }] });
    const result = await getContactPreview({ actor, requestId, now: occurredAt }, environment);
    expect(Object.keys(result?.candidates?.[0]?.reveal ?? {}).sort()).toEqual([
      "channelsMatchResult", "requestedAt", "requestedChannels", "revealRequestId", "status", "updatedAt",
    ]);
    expect(result?.candidates?.[0]?.reveal?.status).toBe("REVEAL_EMPTY");
    expect(JSON.stringify(result)).not.toMatch(/private-provider-id|private-payload|private-key|providerContactId|rawPayload|idempotencyKey/);
    expect(mocks.readPreviewRequest).toHaveBeenCalledWith(expect.objectContaining({ organizationId: actor.organizationId, requestId }));
    const withheld = await getContactPreview({ actor, requestId, now: occurredAt }, { ...environment, CONTACT_PRIVACY_CONTACT: undefined });
    expect(withheld?.candidates).toBeNull();
  });

  it("requires matching governed channel facts to announce complete or partial recovery", () => {
    const contact = {
      governanceState: "AVAILABLE", reveal: { requestedChannels: ["work_email", "business_phone"], channelsMatchResult: true },
      channels: { workEmails: [{ value: "synthetic@example.test" }], businessPhones: [] },
    } as unknown as ContactCandidateDto;
    expect(describeContactRevealStatus("REVEAL_AVAILABLE", contact)).toContain("Recuperação parcial");
    expect(describeContactRevealStatus("REVEAL_AVAILABLE", {
      ...contact, channels: { ...contact.channels!, businessPhones: [{ value: "+551133334444", type: "work", sourceUpdatedAt: null }] },
    })).toContain("Recuperação concluída");
    expect(describeContactRevealStatus("REVEAL_AVAILABLE", { ...contact, channels: null })).not.toMatch(/Recuperação concluída|Recuperação parcial/);
    expect(describeContactRevealStatus("REVEAL_AVAILABLE", { ...contact, reveal: { ...contact.reveal!, channelsMatchResult: false } })).not.toMatch(/Recuperação concluída|Recuperação parcial/);
    expect(describeContactRevealStatus("REVEAL_AVAILABLE", { ...contact, governanceState: "SUPPRESSED" })).not.toMatch(/Recuperação concluída|Recuperação parcial/);
  });
});
