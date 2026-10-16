import "server-only";

import { randomUUID } from "node:crypto";

import type { LeadDetail } from "../../types/leads";
import type {
  claimLeadApproachDraft,
  completeLeadApproachDraft,
  failLeadApproachDraft,
} from "./lead-approach-draft-repository";
import {
  generateLeadApproachMessage,
  LEAD_APPROACH_GENERATOR_VERSION,
  LeadApproachGenerationError,
  type LeadApproachGenerationConfiguration,
} from "./generate-lead-approach";

const generationLeaseGraceMilliseconds = 5_000;
const generationFailureCooldownMilliseconds = 5 * 60_000;

interface LeadApproachPreparationContext {
  readonly organizationId: string;
  readonly actorSubject: string;
}

interface LeadApproachPreparationDependencies {
  readonly claim: typeof claimLeadApproachDraft;
  readonly complete: typeof completeLeadApproachDraft;
  readonly fail: typeof failLeadApproachDraft;
  readonly generate: typeof generateLeadApproachMessage;
  readonly now: () => Date;
  readonly randomUuid: () => string;
}

export type LeadApproachPreparationResult =
  | { readonly status: "ready"; readonly message: string }
  | { readonly status: "preparing" };

const defaultDependencies: LeadApproachPreparationDependencies = {
  claim: async (input) =>
    (await import("./lead-approach-draft-repository"))
      .claimLeadApproachDraft(input),
  complete: async (input) =>
    (await import("./lead-approach-draft-repository"))
      .completeLeadApproachDraft(input),
  fail: async (input) =>
    (await import("./lead-approach-draft-repository"))
      .failLeadApproachDraft(input),
  generate: generateLeadApproachMessage,
  now: () => new Date(),
  randomUuid: randomUUID,
};

export async function prepareLeadApproachMessage(
  lead: LeadDetail,
  context: LeadApproachPreparationContext,
  configuration: LeadApproachGenerationConfiguration,
  dependencies: LeadApproachPreparationDependencies = defaultDependencies,
): Promise<LeadApproachPreparationResult> {
  const startedAt = dependencies.now();
  const identity = {
    organizationId: context.organizationId,
    cnpjNormalizado: lead.cnpj,
    observedLeadRunId: lead.lead_run_id,
    generatorVersion: LEAD_APPROACH_GENERATOR_VERSION,
  } as const;
  const claim = await dependencies.claim({
    ...identity,
    approachDraftId: dependencies.randomUuid(),
    generationAttemptId: dependencies.randomUuid(),
    requestedBySubject: context.actorSubject,
    now: startedAt,
    leaseExpiresAt: new Date(
      startedAt.getTime() +
        configuration.timeoutMilliseconds +
        generationLeaseGraceMilliseconds,
    ),
  });

  if (claim.kind === "ready") {
    return { status: "ready", message: claim.message };
  }
  if (claim.kind === "preparing") {
    return { status: "preparing" };
  }
  if (claim.kind === "cooldown") {
    throw new LeadApproachGenerationError();
  }

  try {
    const generated = await dependencies.generate(lead, configuration);
    const completedAt = dependencies.now();
    const completed = await dependencies.complete({
      ...identity,
      generationAttemptId: claim.generationAttemptId,
      message: generated.message,
      now: completedAt,
    });

    if (!completed) {
      throw new LeadApproachGenerationError();
    }

    return { status: "ready", message: generated.message };
  } catch (error) {
    const failedAt = dependencies.now();
    await dependencies.fail({
      ...identity,
      generationAttemptId: claim.generationAttemptId,
      now: failedAt,
      retryAfter: new Date(
        failedAt.getTime() + generationFailureCooldownMilliseconds,
      ),
    });

    if (error instanceof LeadApproachGenerationError) {
      throw error;
    }
    throw new LeadApproachGenerationError();
  }
}
