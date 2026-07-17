import "server-only";

import type { AuthorizedActor } from "../auth/authorization";
import { getServerEnv } from "../env";
import type { SensitiveContentAccess } from "../mappers/lead-sensitive-content";

export function getSensitiveContentAccess(
  actor: AuthorizedActor,
  now: Date = new Date(),
): SensitiveContentAccess {
  const environment = getServerEnv();

  return {
    enabled:
      environment.FEATURE_SENSITIVE_CONTENT_ENABLED &&
      actor.permissions.includes("sensitive:read"),
    allowedUrlHosts: environment.SENSITIVE_URL_HOSTS,
    now,
  };
}
