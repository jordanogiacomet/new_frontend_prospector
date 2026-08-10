import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordIntent: vi.fn(),
  recordDispatch: vi.fn(),
  submitToN8n: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./contact-enrichment-repository", () => ({
  recordContactEnrichmentIntent: mocks.recordIntent,
  recordContactEnrichmentDispatchOutcome: mocks.recordDispatch,
}));
vi.mock("./contact-enrichment-client", () => ({
  submitContactEnrichmentToN8n: mocks.submitToN8n,
}));

import {
  SubmitContactEnrichmentInputError,
  submitContactEnrichment,
} from "./submit-contact-enrichment";

const actor = {
  issuer: "urn:prospecta:demo3-preproduction",
  subject: "demo3-preproduction-user",
  organizationId: "org-synthetic-contact",
  permissions: ["contacts:enrich"],
} as const;
const requestRecord = {
  requestId: "00000000-0000-4000-8000-000000000913",
  organizationId: actor.organizationId,
  actorSubject: actor.subject,
  status: "REQUEST_RECORDED",
  requestedAt: new Date("2026-07-31T12:00:00.000Z"),
  updatedAt: new Date("2026-07-31T12:00:00.000Z"),
  providerOccurredAt: null,
} as const;
const input = {
  organizationId: actor.organizationId,
  actor,
  idempotencyKey: "synthetic-idempotency-913",
  request: {
    cnpj_normalizado: "12345678000195",
    company_domain: "empresa-sintetica.example",
  },
} as const;

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.recordIntent.mockResolvedValue({
    kind: "created",
    request: requestRecord,
  });
  mocks.submitToN8n.mockResolvedValue({ kind: "acknowledged" });
  mocks.recordDispatch.mockResolvedValue({
    kind: "recorded",
    request: { ...requestRecord, status: "ENRICHMENT_DISPATCHED" },
  });
});

describe("submitContactEnrichment", () => {
  it("stores only hashes before making one exact n8n dispatch", async () => {
    const result = await submitContactEnrichment(input, {
      ingressClient: { fetch: vi.fn() },
    });

    expect(result).toMatchObject({
      kind: "submitted",
      request: { status: "ENRICHMENT_DISPATCHED" },
    });
    expect(mocks.recordIntent).toHaveBeenCalledWith({
      organizationId: actor.organizationId,
      actorSubject: actor.subject,
      idempotencyKeySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      inputSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const stored = JSON.stringify(mocks.recordIntent.mock.calls[0]?.[0]);
    expect(stored).not.toContain(input.idempotencyKey);
    expect(stored).not.toContain(input.request.cnpj_normalizado);
    expect(stored).not.toContain(input.request.company_domain);
    expect(mocks.recordIntent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submitToN8n.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.submitToN8n).toHaveBeenCalledTimes(1);
    expect(mocks.submitToN8n).toHaveBeenCalledWith(
      {
        contract_version: "prospecta-contact-enrichment-v1",
        request_id: requestRecord.requestId,
        idempotency_key: input.idempotencyKey,
        cnpj_normalizado: input.request.cnpj_normalizado,
        company_domain: input.request.company_domain,
      },
      { fetch: expect.any(Function) },
    );
  });

  it("returns an idempotent duplicate without calling n8n", async () => {
    mocks.recordIntent.mockResolvedValue({
      kind: "duplicate",
      request: requestRecord,
    });

    await expect(
      submitContactEnrichment(input, {
        ingressClient: { fetch: vi.fn() },
      }),
    ).resolves.toMatchObject({ kind: "duplicate", request: requestRecord });
    expect(mocks.submitToN8n).not.toHaveBeenCalled();
    expect(mocks.recordDispatch).not.toHaveBeenCalled();
  });

  it("returns a conflict before n8n for a changed idempotent input", async () => {
    mocks.recordIntent.mockResolvedValue({ kind: "conflict" });

    await expect(
      submitContactEnrichment(input, {
        ingressClient: { fetch: vi.fn() },
      }),
    ).resolves.toEqual({ kind: "conflict" });
    expect(mocks.submitToN8n).not.toHaveBeenCalled();
  });

  it("records an honest unknown after one failed outbound attempt", async () => {
    mocks.submitToN8n.mockResolvedValue({ kind: "unknown" });
    mocks.recordDispatch.mockResolvedValue({
      kind: "recorded",
      request: { ...requestRecord, status: "DISPATCH_OUTCOME_UNKNOWN" },
    });

    await expect(
      submitContactEnrichment(input, {
        ingressClient: { fetch: vi.fn() },
      }),
    ).resolves.toMatchObject({
      kind: "submitted",
      request: { status: "DISPATCH_OUTCOME_UNKNOWN" },
    });
    expect(mocks.submitToN8n).toHaveBeenCalledTimes(1);
    expect(mocks.recordDispatch).toHaveBeenCalledWith({
      organizationId: actor.organizationId,
      actorSubject: actor.subject,
      requestId: requestRecord.requestId,
      outcome: "unknown",
    });
  });

  it("rejects a mismatched actor scope before persistence or n8n", async () => {
    await expect(
      submitContactEnrichment(
        { ...input, organizationId: "org-other" },
        { ingressClient: { fetch: vi.fn() } },
      ),
    ).rejects.toBeInstanceOf(SubmitContactEnrichmentInputError);
    expect(mocks.recordIntent).not.toHaveBeenCalled();
    expect(mocks.submitToN8n).not.toHaveBeenCalled();
  });
});
