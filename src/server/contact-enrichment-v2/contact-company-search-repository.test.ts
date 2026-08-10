import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({
  transaction: mocks.transaction,
}));

import type { AppDatabaseTransaction } from "../db/app-client";
import { recordCompanySearchIntent } from "./contact-company-search-repository";

const requestedAt = new Date("2026-08-06T12:00:00.000Z");

function searchRow(inputSha256 = "b".repeat(64)) {
  return {
    search_request_id: "00000000-0000-4000-8000-000000000970",
    organization_id: "org-synthetic-contact-v2",
    actor_subject: "demo3-preproduction-user",
    cnpj_normalizado: "12345678000195",
    idempotency_key_sha256: "a".repeat(64),
    input_sha256: inputSha256,
    status: "SEARCH_REQUEST_RECORDED",
    result_sha256: null,
    requested_at: requestedAt,
    updated_at: requestedAt,
    provider_occurred_at: null,
    matches_expires_at: null,
  };
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.transaction.mockReset();
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
});

describe("contact company search repository", () => {
  it("returns the original request for the same organization key and input", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([searchRow()]);

    await expect(
      recordCompanySearchIntent({
        organizationId: "org-synthetic-contact-v2",
        actorSubject: "demo3-preproduction-user",
        cnpjNormalizado: "12345678000195",
        idempotencyKeySha256: "a".repeat(64),
        inputSha256: "b".repeat(64),
      }),
    ).resolves.toMatchObject({
      kind: "duplicate",
      request: {
        searchRequestId: "00000000-0000-4000-8000-000000000970",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });

  it("returns a conflict without provider work for changed canonical input", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([searchRow("c".repeat(64))]);

    await expect(
      recordCompanySearchIntent({
        organizationId: "org-synthetic-contact-v2",
        actorSubject: "demo3-preproduction-user",
        cnpjNormalizado: "12345678000195",
        idempotencyKeySha256: "a".repeat(64),
        inputSha256: "b".repeat(64),
      }),
    ).resolves.toEqual({ kind: "conflict" });
  });
});
