import "server-only";

import {
  permissionsForRoles,
  retainApprovedPermissions,
  type Permission,
  type RoleBundleMapping,
} from "./permissions";

export interface AuthorizationPolicy {
  issuer: string;
  organizationId: string;
  roleClaim: string;
  roleBundles: RoleBundleMapping;
}

export interface AuthorizedActor {
  readonly issuer: string;
  readonly subject: string;
  readonly organizationId: string;
  readonly permissions: readonly Permission[];
}

export type IdentityAuthorization =
  | {
      status: "authorized";
      actor: AuthorizedActor;
    }
  | {
      status: "unauthorized";
      reason: "issuer" | "subject" | "organization" | "permissions";
    };

export type ServerSessionAuthorization =
  | { status: "missing" }
  | { status: "expired" }
  | { status: "unauthorized" }
  | { status: "authorized"; actor: AuthorizedActor };

// SPEC_DEVIATION: Local development may use a synthetic actor without OIDC.
// Reason: Explicit opt-in bypass; environment and runtime both reject production.
export function createDevelopmentAuthorization(
  enabled: boolean,
  nodeEnv: string | undefined,
  organizationId: string,
): ServerSessionAuthorization | null {
  if (!enabled || nodeEnv !== "development") {
    return null;
  }

  return {
    status: "authorized",
    actor: {
      issuer: "urn:prospecta:local-development",
      subject: "local-development-user",
      organizationId,
      permissions: ["leads:read"],
    },
  };
}

interface ServerSessionInput {
  expires?: unknown;
  authorization?: unknown;
  actor?: unknown;
}

interface AuthorizedIdentityFields {
  issuer: string;
  subject: string;
  organizationId: string;
}

function authorizeIdentityFields(
  issuer: unknown,
  subject: unknown,
  organizationId: unknown,
  policy: AuthorizationPolicy,
):
  | { status: "authorized"; identity: AuthorizedIdentityFields }
  | {
      status: "unauthorized";
      reason: "issuer" | "subject" | "organization";
    } {
  if (issuer !== policy.issuer) {
    return { status: "unauthorized", reason: "issuer" };
  }

  if (typeof subject !== "string" || subject.trim() === "") {
    return { status: "unauthorized", reason: "subject" };
  }

  if (
    typeof organizationId !== "string" ||
    organizationId === "" ||
    organizationId !== policy.organizationId
  ) {
    return { status: "unauthorized", reason: "organization" };
  }

  return {
    status: "authorized",
    identity: {
      issuer,
      subject,
      organizationId,
    },
  };
}

function verifiedRoles(
  claims: Record<string, unknown>,
  roleClaim: string,
): readonly string[] {
  const roles = claims[roleClaim];

  if (
    !Array.isArray(roles) ||
    !roles.every((role): role is string => typeof role === "string")
  ) {
    return [];
  }

  return roles;
}

export function authorizeIdentityClaims(
  claims: Record<string, unknown>,
  policy: AuthorizationPolicy,
): IdentityAuthorization {
  const authorization = authorizeIdentityFields(
    claims.iss,
    claims.sub,
    claims.org_id,
    policy,
  );

  if (authorization.status !== "authorized") {
    return authorization;
  }

  return {
    status: "authorized",
    actor: {
      ...authorization.identity,
      permissions: permissionsForRoles(
        verifiedRoles(claims, policy.roleClaim),
        policy.roleBundles,
      ),
    },
  };
}

export function authorizeRetainedActor(
  value: unknown,
  policy: AuthorizationPolicy,
): IdentityAuthorization {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return { status: "unauthorized", reason: "subject" };
  }

  const actor = value as Record<string, unknown>;
  const authorization = authorizeIdentityFields(
    actor.issuer,
    actor.subject,
    actor.organizationId,
    policy,
  );

  if (authorization.status !== "authorized") {
    return authorization;
  }

  if (!Array.isArray(actor.permissions)) {
    return { status: "unauthorized", reason: "permissions" };
  }

  return {
    status: "authorized",
    actor: {
      ...authorization.identity,
      permissions: retainApprovedPermissions(actor.permissions),
    },
  };
}

export function classifyServerSession(
  session: ServerSessionInput | null,
  policy: AuthorizationPolicy,
  now: Date = new Date(),
): ServerSessionAuthorization {
  if (session === null) {
    return { status: "missing" };
  }

  if (
    typeof session.expires !== "string" ||
    !Number.isFinite(Date.parse(session.expires)) ||
    Date.parse(session.expires) <= now.getTime()
  ) {
    return { status: "expired" };
  }

  if (session.authorization !== "authorized") {
    return { status: "unauthorized" };
  }

  const authorization = authorizeRetainedActor(session.actor, policy);

  if (authorization.status !== "authorized") {
    return { status: "unauthorized" };
  }

  return {
    status: "authorized",
    actor: authorization.actor,
  };
}
