import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({ query: mocks.query }));

import {
  claimLeadApproachDraft,
  completeLeadApproachDraft,
  failLeadApproachDraft,
  LeadApproachDraftRepositoryInputError,
  listLeadApproachDraftStates,
} from "./lead-approach-draft-repository";

const identity = {
  organizationId: "org-synthetic-approach",
  cnpjNormalizado: "11222333000181",
  observedLeadRunId: `lr_${"a".repeat(64)}`,
  generatorVersion: "apollo-low-pressure-v1",
} as const;
const draftId = "00000000-0000-4000-8000-000000000941";
const attemptId = "00000000-0000-4000-8000-000000000942";
const now = new Date("2026-08-17T12:00:00.000Z");
const leaseExpiresAt = new Date("2026-08-17T12:01:00.000Z");
const retryAfter = new Date("2026-08-17T12:05:00.000Z");

beforeEach(() => {
  mocks.query.mockReset();
});

describe("lead approach draft repository", () => {
  it("acquires one atomic generation claim with an attempt token", async () => {
    mocks.query.mockResolvedValue([
      {
        status: "GENERATING",
        generation_attempt_id: attemptId,
        message: null,
        lease_expires_at: leaseExpiresAt,
        retry_after: null,
      },
    ]);

    await expect(
      claimLeadApproachDraft({
        ...identity,
        approachDraftId: draftId,
        generationAttemptId: attemptId,
        requestedBySubject: "oidc|synthetic-manager",
        now,
        leaseExpiresAt,
      }),
    ).resolves.toEqual({ kind: "claimed", generationAttemptId: attemptId });

    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(
          /INSERT INTO prospecting_app\.lead_approach_drafts[\s\S]*ON CONFLICT[\s\S]*DO UPDATE[\s\S]*WHERE[\s\S]*lease_expires_at <= \$8[\s\S]*retry_after <= \$8[\s\S]*RETURNING/i,
        ),
        values: [
          draftId,
          identity.organizationId,
          identity.cnpjNormalizado,
          identity.observedLeadRunId,
          identity.generatorVersion,
          attemptId,
          "oidc|synthetic-manager",
          now,
          leaseExpiresAt,
        ],
      }),
    );
  });

  it("reuses ready content and reports active claims without acquiring them", async () => {
    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          status: "READY",
          generation_attempt_id: null,
          message: "Mensagem sintética já validada.",
          lease_expires_at: null,
          retry_after: null,
        },
      ]);

    await expect(
      claimLeadApproachDraft({
        ...identity,
        approachDraftId: draftId,
        generationAttemptId: attemptId,
        requestedBySubject: "oidc|synthetic-manager",
        now,
        leaseExpiresAt,
      }),
    ).resolves.toEqual({
      kind: "ready",
      message: "Mensagem sintética já validada.",
    });

    mocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          status: "GENERATING",
          generation_attempt_id: draftId,
          message: null,
          lease_expires_at: leaseExpiresAt,
          retry_after: null,
        },
      ]);

    await expect(
      claimLeadApproachDraft({
        ...identity,
        approachDraftId: draftId,
        generationAttemptId: attemptId,
        requestedBySubject: "oidc|synthetic-manager",
        now,
        leaseExpiresAt,
      }),
    ).resolves.toEqual({ kind: "preparing" });
  });

  it("lists only exact requested identities and maps expired state as missing", async () => {
    const otherRun = `lr_${"b".repeat(64)}`;
    mocks.query.mockResolvedValue([
      {
        cnpj_normalizado: identity.cnpjNormalizado,
        observed_lead_run_id: identity.observedLeadRunId,
        status: "READY",
        message: "Mensagem pronta.",
        lease_expires_at: null,
        retry_after: null,
      },
      {
        cnpj_normalizado: "99888777000166",
        observed_lead_run_id: otherRun,
        status: "FAILED",
        message: null,
        lease_expires_at: null,
        retry_after: new Date("2026-08-17T11:59:59.000Z"),
      },
    ]);

    await expect(
      listLeadApproachDraftStates({
        organizationId: identity.organizationId,
        generatorVersion: identity.generatorVersion,
        identities: [
          {
            cnpjNormalizado: identity.cnpjNormalizado,
            observedLeadRunId: identity.observedLeadRunId,
          },
          {
            cnpjNormalizado: "99888777000166",
            observedLeadRunId: otherRun,
          },
        ],
        now,
      }),
    ).resolves.toEqual([
      {
        cnpjNormalizado: identity.cnpjNormalizado,
        observedLeadRunId: identity.observedLeadRunId,
        status: "ready",
        message: "Mensagem pronta.",
      },
      {
        cnpjNormalizado: "99888777000166",
        observedLeadRunId: otherRun,
        status: "missing",
        message: null,
      },
    ]);

    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(
          /unnest\(\$3::text\[\], \$4::text\[\]\)[\s\S]*organization_id = \$1[\s\S]*generator_version = \$2/i,
        ),
        values: [
          identity.organizationId,
          identity.generatorVersion,
          [identity.cnpjNormalizado, "99888777000166"],
          [identity.observedLeadRunId, otherRun],
        ],
      }),
    );
  });

  it("completes and fails only the matching active attempt", async () => {
    mocks.query.mockResolvedValueOnce([{ updated: true }]);
    await expect(
      completeLeadApproachDraft({
        ...identity,
        generationAttemptId: attemptId,
        message: "Mensagem sintética validada.",
        now,
      }),
    ).resolves.toBe(true);

    mocks.query.mockResolvedValueOnce([]);
    await expect(
      failLeadApproachDraft({
        ...identity,
        generationAttemptId: attemptId,
        now,
        retryAfter,
      }),
    ).resolves.toBe(false);

    expect(mocks.query.mock.calls[0]?.[0].text).toMatch(
      /status = 'GENERATING'[\s\S]*generation_attempt_id = \$5/i,
    );
    expect(mocks.query.mock.calls[1]?.[0].values).toEqual([
      identity.organizationId,
      identity.cnpjNormalizado,
      identity.observedLeadRunId,
      identity.generatorVersion,
      attemptId,
      now,
      retryAfter,
    ]);
  });

  it("rejects invalid scope, identifiers, times and messages before SQL", async () => {
    await expect(
      claimLeadApproachDraft({
        ...identity,
        organizationId: " org-synthetic-approach",
        approachDraftId: draftId,
        generationAttemptId: attemptId,
        requestedBySubject: "oidc|synthetic-manager",
        now,
        leaseExpiresAt,
      }),
    ).rejects.toBeInstanceOf(LeadApproachDraftRepositoryInputError);
    await expect(
      completeLeadApproachDraft({
        ...identity,
        generationAttemptId: attemptId,
        message: "x".repeat(1601),
        now,
      }),
    ).rejects.toBeInstanceOf(LeadApproachDraftRepositoryInputError);
    await expect(
      listLeadApproachDraftStates({
        organizationId: identity.organizationId,
        generatorVersion: identity.generatorVersion,
        identities: [],
        now: new Date("invalid"),
      }),
    ).rejects.toBeInstanceOf(LeadApproachDraftRepositoryInputError);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

