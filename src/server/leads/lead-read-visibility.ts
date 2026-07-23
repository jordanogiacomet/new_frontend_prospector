import "server-only";

import type { AuthorizedActor } from "../auth/authorization";
import {
  isDemo2TestRunVisibilityEnabled,
  isDemo3CorrelatedLeadVisibilityEnabled,
} from "../demo/mode";
import { listCorrelatedImportBatchIds } from "../repositories/imports/import-submissions-repository";
import type { LeadRunVisibilityOptions } from "../repositories/production-run-predicate";

const demo3Issuer = "urn:prospecta:demo3-preproduction";
const demo3Subject = "demo3-preproduction-user";

export async function resolveLeadReadVisibility(
  actor: AuthorizedActor,
): Promise<LeadRunVisibilityOptions> {
  if (isDemo2TestRunVisibilityEnabled()) {
    return { includeDemo2TestRuns: true };
  }

  if (
    !isDemo3CorrelatedLeadVisibilityEnabled() ||
    actor.issuer !== demo3Issuer ||
    actor.subject !== demo3Subject
  ) {
    return {};
  }

  const importBatchIds = await listCorrelatedImportBatchIds({
    organizationId: actor.organizationId,
  });

  return importBatchIds.length === 0
    ? {}
    : { includeTestRunsFromImportBatchIds: importBatchIds };
}
