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
