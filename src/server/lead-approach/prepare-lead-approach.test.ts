import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { LeadDetail } from "../../types/leads";
import { LeadApproachGenerationError } from "./generate-lead-approach";
import { prepareLeadApproachMessage } from "./prepare-lead-approach";

const now = new Date("2026-08-17T12:00:00.000Z");
const detail = {
  cnpj: "11222333000181",
  lead_run_id: `lr_${"a".repeat(64)}`,
  companyName: "Empresa Aurora Sintética",
  tradeName: "Aurora",
  legalName: "Empresa Aurora Sintética Ltda.",
  sector: "Serviços empresariais",
  strategicReport: {
    status: "available",
    content: "Oportunidade: ampliar contratos recorrentes",
  },
} as LeadDetail;
const context = {
  organizationId: "org-synthetic-approach",
  actorSubject: "oidc|synthetic-manager",
} as const;
const configuration = {
  apiKey: "sk-synthetic-never-use",
  model: "gpt-synthetic-model",
  timeoutMilliseconds: 20_000,
} as const;

const mocks = {
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  generate: vi.fn(),
  now: vi.fn(() => now),
  randomUuid: vi
    .fn()
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000961")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000962"),
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockClear();
  mocks.randomUuid
    .mockReset()
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000961")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000962");
  mocks.now.mockReturnValue(now);
  mocks.complete.mockResolvedValue(true);
  mocks.fail.mockResolvedValue(true);
  mocks.generate.mockResolvedValue({
    message: "Mensagem sintética pronta para revisão.",
  });
});

describe("cached lead approach preparation", () => {
  it("returns a ready cached draft without calling the provider", async () => {
    mocks.claim.mockResolvedValue({
      kind: "ready",
      message: "Mensagem já armazenada.",
    });

    await expect(
      prepareLeadApproachMessage(
        detail,
        context,
        configuration,
        mocks,
      ),
    ).resolves.toEqual({ status: "ready", message: "Mensagem já armazenada." });

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("calls the provider once only after acquiring a durable claim", async () => {
    mocks.claim.mockResolvedValue({
      kind: "claimed",
      generationAttemptId: "00000000-0000-4000-8000-000000000962",
    });

    await expect(
      prepareLeadApproachMessage(
        detail,
        context,
        configuration,
        mocks,
      ),
    ).resolves.toEqual({
      status: "ready",
      message: "Mensagem sintética pronta para revisão.",
    });

    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: context.organizationId,
        cnpjNormalizado: detail.cnpj,
        observedLeadRunId: detail.lead_run_id,
        approachDraftId: "00000000-0000-4000-8000-000000000961",
        generationAttemptId: "00000000-0000-4000-8000-000000000962",
        requestedBySubject: context.actorSubject,
        now,
        leaseExpiresAt: new Date("2026-08-17T12:00:25.000Z"),
      }),
    );
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate).toHaveBeenCalledWith(detail, configuration);
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        generationAttemptId: "00000000-0000-4000-8000-000000000962",
        message: "Mensagem sintética pronta para revisão.",
      }),
    );
  });

  it("reports an existing active claim without provider work", async () => {
    mocks.claim.mockResolvedValue({ kind: "preparing" });

    await expect(
      prepareLeadApproachMessage(
        detail,
        context,
        configuration,
        mocks,
      ),
    ).resolves.toEqual({ status: "preparing" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("fails closed during cooldown without retrying the provider", async () => {
    mocks.claim.mockResolvedValue({ kind: "cooldown" });

    await expect(
      prepareLeadApproachMessage(
        detail,
        context,
        configuration,
        mocks,
      ),
    ).rejects.toBeInstanceOf(LeadApproachGenerationError);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("records a cooldown after one failed provider call", async () => {
    mocks.claim.mockResolvedValue({
      kind: "claimed",
      generationAttemptId: "00000000-0000-4000-8000-000000000962",
    });
    mocks.generate.mockRejectedValue(new LeadApproachGenerationError());

    await expect(
      prepareLeadApproachMessage(
        detail,
        context,
        configuration,
        mocks,
      ),
    ).rejects.toBeInstanceOf(LeadApproachGenerationError);

    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        generationAttemptId: "00000000-0000-4000-8000-000000000962",
        now,
        retryAfter: new Date("2026-08-17T12:05:00.000Z"),
      }),
    );
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});

