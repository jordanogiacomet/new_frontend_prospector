import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn() },
  transaction: vi.fn(),
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({
  transaction: mocks.transaction,
  query: mocks.query,
}));

import type { AppDatabaseTransaction } from "../db/app-client";
import {
  recordPreviewIntent,
  readPreviewRequest,
  recordPreviewResult,
  recordRevealResult,
  suppressContact,
} from "./contact-enrichment-v2-repository";

const organizationId = "org-synthetic-contact-v2";
const actorSubject = "demo3-preproduction-user";
const requestId = "00000000-0000-4000-8000-000000000961";
const contactId = "00000000-0000-4000-8000-000000000962";
const revealRequestId = "00000000-0000-4000-8000-000000000963";
const requestedAt = new Date("2026-07-31T12:00:00.000Z");

function previewRow(inputSha256 = "b".repeat(64)) {
  return {
    request_id: requestId,
    organization_id: organizationId,
    actor_subject: actorSubject,
    cnpj_normalizado: "12345678000195",
    company_domain: "empresa.example",
    company_match_id: null,
    idempotency_key_sha256: "a".repeat(64),
    input_sha256: inputSha256,
    status: "REQUEST_RECORDED",
    result_sha256: null,
    requested_at: requestedAt,
    updated_at: requestedAt,
    provider_occurred_at: null,
    preview_expires_at: null,
  };
}

function revealRow() {
  return {
    reveal_request_id: revealRequestId,
    organization_id: organizationId,
    request_id: requestId,
    contact_id: contactId,
    actor_subject: actorSubject,
    idempotency_key_sha256: "c".repeat(64),
    input_sha256: "d".repeat(64),
    requested_channels: ["work_email"],
    status: "REVEAL_DISPATCHED",
    result_sha256: null,
    requested_at: requestedAt,
    updated_at: requestedAt,
    provider_occurred_at: null,
  };
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.transaction.mockReset();
  mocks.query.mockReset();
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
});

describe("contact enrichment v2 repository", () => {
  it("reads the latest recovery once per candidate within the same organization and request", async () => {
    mocks.client.query.mockResolvedValueOnce([previewRow()]).mockResolvedValueOnce([{
      contact_id: contactId, request_id: requestId, provider_ref_hmac: "private-provider-hash",
      provider_ref_key_id: null, provider_ref_nonce: null, provider_ref_ciphertext: null, provider_ref_auth_tag: null,
      profile_key_id: null, profile_nonce: null, profile_ciphertext: null, profile_auth_tag: null,
      can_reveal_work_email: true, can_reveal_business_phone: true,
      obtained_at: requestedAt, expires_at: new Date("2026-08-30T12:00:00Z"), suppressed_at: null, erased_at: null,
      channel_data_key_id: null, channel_data_nonce: null, channel_data_ciphertext: null, channel_data_auth_tag: null,
      work_email_hmacs: null, business_phone_hmacs: null, channel_expires_at: null,
      channel_reveal_request_id: null, channel_suppressed_at: null, channel_erased_at: null,
      latest_reveal_request_id: revealRequestId, latest_reveal_status: "REVEAL_EMPTY",
      latest_requested_channels: ["work_email"], latest_reveal_requested_at: requestedAt, latest_reveal_updated_at: requestedAt,
    }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await readPreviewRequest({ organizationId, actorSubject, requestId, occurredAt: requestedAt });
    expect(result?.candidates[0]?.reveal).toEqual({
      revealRequestId, status: "REVEAL_EMPTY", requestedChannels: ["work_email"], channelsMatchResult: false,
      requestedAt: requestedAt.toISOString(), updatedAt: requestedAt.toISOString(),
    });
    const query = mocks.client.query.mock.calls[1]?.[0];
    expect(query).toMatchObject({ values: [organizationId, requestId] });
    expect(query.text).toMatch(/reveal\.organization_id = candidate\.organization_id/);
    expect(query.text).toMatch(/reveal\.request_id = candidate\.request_id/);
    expect(query.text).toMatch(/reveal\.contact_id = candidate\.contact_id/);
    expect(query.text).toMatch(/ORDER BY reveal\.requested_at DESC, reveal\.reveal_request_id DESC\s+LIMIT 1/);
    expect(mocks.client.query).toHaveBeenCalledTimes(4);
  });

  it("records safe diagnostics atomically with the terminal result and leaves audit redacted", async () => {
    const occurredAt = new Date("2026-10-06T12:00:02.000Z");
    const searchDiagnostics = [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "ACCESS_DENIED" }] as const;
    mocks.client.query
      .mockResolvedValueOnce([previewRow()])
      .mockResolvedValueOnce([{ ...previewRow(), status: "PREVIEW_FAILED", result_sha256: "e".repeat(64),
        provider_occurred_at: occurredAt, search_diagnostics: searchDiagnostics }])
      .mockResolvedValueOnce([]);
    await expect(recordPreviewResult({
      organizationId, requestId, status: "PREVIEW_FAILED", resultSha256: "e".repeat(64),
      occurredAt, expiresAt: null, candidates: [], companyPhone: null, searchDiagnostics,
    })).resolves.toMatchObject({ kind: "recorded", request: { searchDiagnostics } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const update = mocks.client.query.mock.calls[1]?.[0];
    expect(update.text).toContain("search_diagnostics = $7::jsonb");
    expect(update.values[6]).toBe(JSON.stringify(searchDiagnostics));
    expect(JSON.stringify(mocks.client.query.mock.calls[2]?.[0])).not.toContain("ACCESS_DENIED");
  });

  it("stores a company phone fallback only as ciphertext and a keyed fingerprint", async () => {
    const occurredAt = new Date("2026-08-11T12:00:02.000Z");
    const expiresAt = new Date("2026-09-10T12:00:02.000Z");
    const encryptedPhone = {
      keyId: "contact-key-v1",
      nonce: Buffer.alloc(12, 1),
      ciphertext: Buffer.from("synthetic-company-phone-ciphertext"),
      authenticationTag: Buffer.alloc(16, 2),
    };
    mocks.client.query
      .mockResolvedValueOnce([
        {
          ...previewRow(),
          status: "PREVIEW_DISPATCHED",
        },
      ])
      .mockResolvedValueOnce([{ request_id: requestId }])
      .mockResolvedValueOnce([
        {
          ...previewRow(),
          status: "PREVIEW_AVAILABLE",
          result_sha256: "e".repeat(64),
          provider_occurred_at: occurredAt,
          preview_expires_at: expiresAt,
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      recordPreviewResult({
        organizationId,
        requestId,
        status: "PREVIEW_AVAILABLE",
        resultSha256: "e".repeat(64),
        occurredAt,
        expiresAt,
        candidates: [],
        companyPhone: {
          phoneHmac: "f".repeat(64),
          encryptedPhone,
        },
      }),
    ).resolves.toMatchObject({
      kind: "recorded",
      request: { status: "PREVIEW_AVAILABLE" },
    });

    const insert = mocks.client.query.mock.calls[1]?.[0];
    expect(insert).toMatchObject({
      text: expect.stringContaining(
        "INSERT INTO prospecting_app.contact_company_phone_fallbacks",
      ),
      values: [
        requestId,
        organizationId,
        "f".repeat(64),
        encryptedPhone.keyId,
        encryptedPhone.nonce,
        encryptedPhone.ciphertext,
        encryptedPhone.authenticationTag,
        occurredAt,
        expiresAt,
      ],
    });
    expect(JSON.stringify(insert)).not.toContain("+551133334444");
  });

  it("returns the original request for the same idempotency key and canonical input", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([previewRow()]);

    await expect(
      recordPreviewIntent({
        organizationId,
        actorSubject,
        cnpjNormalizado: "12345678000195",
        companyDomain: "empresa.example",
        companyMatchId: null,
        idempotencyKeySha256: "a".repeat(64),
        inputSha256: "b".repeat(64),
      }),
    ).resolves.toMatchObject({
      kind: "duplicate",
      request: { requestId, status: "REQUEST_RECORDED" },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });

  it("rejects a changed input under the same organization-scoped key", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([previewRow("e".repeat(64))]);

    await expect(
      recordPreviewIntent({
        organizationId,
        actorSubject,
        cnpjNormalizado: "12345678000195",
        companyDomain: "empresa.example",
        companyMatchId: null,
        idempotencyKeySha256: "a".repeat(64),
        inputSha256: "b".repeat(64),
      }),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("rejects a reveal callback whose provider identity does not match the selected candidate", async () => {
    mocks.client.query
      .mockResolvedValueOnce([revealRow()])
      .mockResolvedValueOnce([{ provider_ref_hmac: "f".repeat(64) }]);

    await expect(
      recordRevealResult({
        organizationId,
        requestId,
        revealRequestId,
        providerRefHmac: "1".repeat(64),
        status: "REVEAL_EMPTY",
        resultSha256: "2".repeat(64),
        occurredAt: new Date("2026-07-31T12:00:03.000Z"),
        expiresAt: null,
        encryptedChannels: null,
        channels: {
          workEmails: [],
          businessPhones: [],
          doNotCallPhones: [],
        },
        workEmailHmacs: [],
        businessPhoneHmacs: [],
        dncPhoneHmacs: [],
      }),
    ).resolves.toEqual({ kind: "conflict" });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });

  it("updates only the selected unsuppressed candidate profile inside the reveal transaction", async () => {
    const occurredAt = new Date("2026-07-31T12:00:03.000Z");
    const encryptedProfileUpdate = {
      keyId: "contact-key-v1",
      nonce: Buffer.alloc(12, 1),
      ciphertext: Buffer.from("synthetic-profile-ciphertext"),
      authenticationTag: Buffer.alloc(16, 2),
    };
    mocks.client.query
      .mockResolvedValueOnce([revealRow()])
      .mockResolvedValueOnce([{ provider_ref_hmac: "1".repeat(64) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...revealRow(),
          status: "REVEAL_EMPTY",
          result_sha256: "2".repeat(64),
          provider_occurred_at: occurredAt,
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      recordRevealResult({
        organizationId,
        requestId,
        revealRequestId,
        providerRefHmac: "1".repeat(64),
        status: "REVEAL_EMPTY",
        resultSha256: "2".repeat(64),
        occurredAt,
        expiresAt: null,
        encryptedChannels: null,
        encryptedProfileUpdate,
        channels: {
          workEmails: [],
          businessPhones: [],
          doNotCallPhones: [],
        },
        workEmailHmacs: [],
        businessPhoneHmacs: [],
        dncPhoneHmacs: [],
      }),
    ).resolves.toMatchObject({ kind: "recorded" });

    expect(mocks.client.query.mock.calls[2]?.[0]).toMatchObject({
      text: expect.stringMatching(
        /UPDATE prospecting_app\.contact_candidates[\s\S]*profile_ciphertext[\s\S]*suppressed_at IS NULL[\s\S]*erased_at IS NULL/,
      ),
      values: [
        organizationId,
        contactId,
        encryptedProfileUpdate.keyId,
        encryptedProfileUpdate.nonce,
        encryptedProfileUpdate.ciphertext,
        encryptedProfileUpdate.authenticationTag,
      ],
    });
  });

  it("locks only the candidate side when recording a suppression", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        {
          contact_id: contactId,
          request_id: requestId,
          provider_ref_hmac: "f".repeat(64),
          work_email_hmacs: [],
          business_phone_hmacs: [],
        },
      ])
      .mockResolvedValue([]);

    await expect(
      suppressContact({
        organizationId,
        actorSubject,
        contactId,
        scope: "all",
        reason: "DATA_SUBJECT_OPT_OUT",
        occurredAt: new Date("2026-07-31T12:00:04.000Z"),
      }),
    ).resolves.toBe("recorded");

    expect(mocks.client.query.mock.calls[0]?.[0]).toMatchObject({
      text: expect.stringContaining("FOR UPDATE OF candidate"),
    });
  });
});
