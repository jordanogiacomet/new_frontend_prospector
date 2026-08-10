import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({
  transaction: mocks.transaction,
}));

import type {
  AppDatabaseTransaction,
  SqlStatement,
} from "../db/app-client";
import {
  ContactEnrichmentRepositoryInputError,
  recordContactEnrichmentCallback,
  recordContactEnrichmentDispatchOutcome,
  recordContactEnrichmentIntent,
  type ContactEnrichmentRecord,
} from "./contact-enrichment-repository";

const organizationId = "org-synthetic-contact";
const actorSubject = "demo3-preproduction-user";
const requestId = "00000000-0000-4000-8000-000000000901";
const idempotencyKeySha256 = "a".repeat(64);
const inputSha256 = "b".repeat(64);
const requestedAt = new Date("2026-07-31T12:00:00.000Z");
const providerOccurredAt = new Date("2026-07-31T12:00:03.000Z");

function installTransactionMock(): void {
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
}

function row(
  overrides: Partial<{
    request_id: string;
    organization_id: string;
    actor_subject: string;
    idempotency_key_sha256: string;
    input_sha256: string;
    status: ContactEnrichmentRecord["status"];
    requested_at: Date;
    updated_at: Date;
    provider_occurred_at: Date | null;
  }> = {},
) {
  return {
    request_id: overrides.request_id ?? requestId,
    organization_id: overrides.organization_id ?? organizationId,
    actor_subject: overrides.actor_subject ?? actorSubject,
    idempotency_key_sha256:
      overrides.idempotency_key_sha256 ?? idempotencyKeySha256,
    input_sha256: overrides.input_sha256 ?? inputSha256,
    status: overrides.status ?? "REQUEST_RECORDED",
    requested_at: overrides.requested_at ?? requestedAt,
    updated_at: overrides.updated_at ?? requestedAt,
    provider_occurred_at: Object.hasOwn(overrides, "provider_occurred_at")
      ? (overrides.provider_occurred_at ?? null)
      : null,
  };
}

function statements(): SqlStatement[] {
  return mocks.client.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function intentInput() {
  return {
    organizationId,
    actorSubject,
    idempotencyKeySha256,
    inputSha256,
  };
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.transaction.mockReset();
  installTransactionMock();
});

describe("contact enrichment app-owned ledger", () => {
  it("records durable intent and an append-only event in one transaction", async () => {
    mocks.client.query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([]);

    const result = await recordContactEnrichmentIntent(intentInput());

    expect(result).toMatchObject({
      kind: "created",
      request: {
        requestId,
        organizationId,
        actorSubject,
        status: "REQUEST_RECORDED",
        providerOccurredAt: null,
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(statements()).toHaveLength(2);
    expect(statements()[0]?.text).toMatch(
      /INSERT INTO prospecting_app\.contact_enrichment_requests/i,
    );
    expect(statements()[1]?.text).toMatch(
      /INSERT INTO prospecting_app\.contact_enrichment_events/i,
    );
    expect(statements()[0]?.values).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      organizationId,
      actorSubject,
      idempotencyKeySha256,
      inputSha256,
    ]);
  });

  it("returns the original request for the same organization, key hash, and input hash", async () => {
    mocks.client.query.mockResolvedValueOnce([]).mockResolvedValueOnce([row()]);

    const result = await recordContactEnrichmentIntent(intentInput());

    expect(result).toMatchObject({
      kind: "duplicate",
      request: { requestId, status: "REQUEST_RECORDED" },
    });
    expect(statements()).toHaveLength(2);
    expect(statements()[1]?.values).toEqual([
      organizationId,
      idempotencyKeySha256,
    ]);
  });

  it("rejects the same organization/key hash with a changed input hash", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row({ input_sha256: "c".repeat(64) })]);

    await expect(
      recordContactEnrichmentIntent(intentInput()),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("records a dispatch acknowledgement without overwriting a terminal callback", async () => {
    mocks.client.query
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([
        row({
          status: "ENRICHMENT_DISPATCHED",
          updated_at: new Date("2026-07-31T12:00:01.000Z"),
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordContactEnrichmentDispatchOutcome({
      organizationId,
      actorSubject,
      requestId,
      outcome: "acknowledged",
    });

    expect(result).toMatchObject({
      kind: "recorded",
      request: { status: "ENRICHMENT_DISPATCHED" },
    });
    expect(statements()[0]?.text).toMatch(/FOR UPDATE/i);
    expect(statements()[1]?.text).toMatch(
      /UPDATE prospecting_app\.contact_enrichment_requests/i,
    );
    expect(statements()[2]?.values).toEqual([
      expect.any(String),
      organizationId,
      requestId,
      actorSubject,
      "ENRICHMENT_DISPATCHED",
      expect.any(Date),
    ]);
  });

  it("records a strict callback and treats only an exact replay as a no-op", async () => {
    mocks.client.query
      .mockResolvedValueOnce([row({ status: "ENRICHMENT_DISPATCHED" })])
      .mockResolvedValueOnce([
        row({
          status: "COMPLETED_WITHHELD",
          provider_occurred_at: providerOccurredAt,
        }),
      ])
      .mockResolvedValueOnce([]);

    const recorded = await recordContactEnrichmentCallback({
      organizationId,
      requestId,
      status: "COMPLETED_WITHHELD",
      occurredAt: providerOccurredAt,
    });

    expect(recorded).toMatchObject({
      kind: "recorded",
      request: {
        status: "COMPLETED_WITHHELD",
        providerOccurredAt,
      },
    });
    expect(statements()[2]?.values).toEqual([
      expect.any(String),
      organizationId,
      requestId,
      "system:n8n-contact-enrichment-callback",
      "COMPLETED_WITHHELD",
      providerOccurredAt,
    ]);

    mocks.client.query.mockReset();
    mocks.client.query.mockResolvedValueOnce([
      row({
        status: "COMPLETED_WITHHELD",
        provider_occurred_at: providerOccurredAt,
      }),
    ]);

    await expect(
      recordContactEnrichmentCallback({
        organizationId,
        requestId,
        status: "COMPLETED_WITHHELD",
        occurredAt: providerOccurredAt,
      }),
    ).resolves.toMatchObject({ kind: "replayed" });
    expect(statements()).toHaveLength(1);
  });

  it("rejects a conflicting terminal callback and an unknown request", async () => {
    mocks.client.query.mockResolvedValueOnce([
      row({
        status: "COMPLETED_WITHHELD",
        provider_occurred_at: providerOccurredAt,
      }),
    ]);

    await expect(
      recordContactEnrichmentCallback({
        organizationId,
        requestId,
        status: "PROVIDER_OUTCOME_UNKNOWN",
        occurredAt: providerOccurredAt,
      }),
    ).resolves.toEqual({ kind: "conflict" });

    mocks.client.query.mockReset();
    mocks.client.query.mockResolvedValueOnce([]);

    await expect(
      recordContactEnrichmentCallback({
        organizationId,
        requestId,
        status: "COMPLETED_WITHHELD",
        occurredAt: providerOccurredAt,
      }),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("rejects invalid scope and hash input before opening a transaction", async () => {
    await expect(
      recordContactEnrichmentIntent({
        ...intentInput(),
        inputSha256: "not-a-hash",
      }),
    ).rejects.toBeInstanceOf(ContactEnrichmentRepositoryInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("contains no contact PII, raw payload, JSON metadata, or producer access", () => {
    const repository = readFileSync(
      resolve(
        process.cwd(),
        "src/server/contact-enrichment/contact-enrichment-repository.ts",
      ),
      "utf8",
    );
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "db/app/009_contact_enrichment_ledger_forward.sql",
      ),
      "utf8",
    );
    const combined = `${repository}\n${migration}`;

    expect(combined).not.toMatch(
      /cnpj_normalizado|company_domain|contact_count|provider_response|\bemail\b|\bphone\b|\bjsonb\b/i,
    );
    expect(combined).not.toMatch(
      /company_validations|lead_processing|crm_|prospecting\.(?!contact_enrichment)/i,
    );
    expect(migration).toContain(
      "contact_enrichment_events_append_only",
    );
    expect(migration).toContain(
      "prospecting_app.reject_append_only_mutation()",
    );
    expect(migration).toMatch(
      /GRANT UPDATE \(status, updated_at, provider_occurred_at\) ON TABLE/i,
    );
    expect(migration).toMatch(/REVOKE DELETE ON ALL TABLES/i);
  });
});
