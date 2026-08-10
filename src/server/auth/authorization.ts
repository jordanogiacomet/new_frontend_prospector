import "server-only";

import type { Permission } from "./permissions";

export interface AuthorizationPolicy {
  issuer: string;
  organizationId: string;
  costsReadEnabled: boolean;
  costsReadSubjects: readonly string[];
  contactDataEnabled: boolean;
  contactReadSubjects: readonly string[];
  contactGovernSubjects: readonly string[];
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
      reason: "issuer" | "subject" | "organization";
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
  demoDataEnabled = false,
  demo2FullAccessEnabled = false,
  sensitiveContentEnabled = false,
  costsEnabled = false,
  costsReadSubjects: readonly string[] = [],
  demo2K8sRuntimeEnabled = false,
  demo3LocalRuntimeEnabled = false,
  contactEnrichmentEnabled = false,
  contactDataEnabled = false,
  contactReadSubjects: readonly string[] = [],
  contactGovernSubjects: readonly string[] = [],
): ServerSessionAuthorization | null {
  const isApprovedDemo2Runtime =
    nodeEnv === "development" || demo2K8sRuntimeEnabled;

  if (
    !enabled ||
    (nodeEnv !== "development" &&
      !demoDataEnabled &&
      !demo2K8sRuntimeEnabled &&
      !demo3LocalRuntimeEnabled)
  ) {
    return null;
  }

  const hasDemo2FullAccess =
    demo2FullAccessEnabled &&
    isApprovedDemo2Runtime &&
    !demoDataEnabled;
  const hasDemo3FullAccess =
    demo3LocalRuntimeEnabled &&
    nodeEnv === "production" &&
    !demoDataEnabled &&
    !demo2FullAccessEnabled &&
    !demo2K8sRuntimeEnabled;
  const subject = hasDemo3FullAccess
    ? "demo3-preproduction-user"
    : demoDataEnabled
      ? "local-demo-user"
      : "local-development-user";
  const hasCostsReadAccess =
    (hasDemo2FullAccess || hasDemo3FullAccess) &&
    costsEnabled &&
    costsReadSubjects.includes(subject);
  const hasContactReadAccess =
    hasDemo3FullAccess &&
    contactEnrichmentEnabled &&
    contactDataEnabled &&
    contactReadSubjects.includes(subject);
  const hasContactGovernAccess =
    hasContactReadAccess && contactGovernSubjects.includes(subject);
  const permissions: readonly Permission[] = hasDemo2FullAccess
    ? [
        "leads:read",
        "imports:read",
        "imports:create",
        "commercial:read",
        "commercial:write",
        "commercial:assign",
        "audit:read",
        ...(sensitiveContentEnabled ? (["sensitive:read"] as const) : []),
        ...(hasCostsReadAccess ? (["costs:read"] as const) : []),
      ]
    : hasDemo3FullAccess
      ? [
          "leads:read",
          "imports:read",
          "imports:create",
          "commercial:read",
          "commercial:write",
          "commercial:assign",
          "audit:read",
          ...(contactEnrichmentEnabled
            ? (["contacts:enrich"] as const)
            : []),
          ...(hasContactReadAccess
            ? (["contacts:read", "contacts:reveal"] as const)
            : []),
          ...(hasContactGovernAccess
            ? (["contacts:govern"] as const)
            : []),
          ...(sensitiveContentEnabled ? (["sensitive:read"] as const) : []),
          ...(hasCostsReadAccess ? (["costs:read"] as const) : []),
        ]
    : demoDataEnabled
      ? ["leads:read", "commercial:read"]
      : [];

  return {
    status: "authorized",
    actor: {
      issuer: hasDemo3FullAccess
        ? "urn:prospecta:demo3-preproduction"
        : demoDataEnabled
          ? "urn:prospecta:local-demo"
          : "urn:prospecta:local-development",
      subject,
      organizationId,
      permissions,
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

function permissionsForIdentity(
  identity: AuthorizedIdentityFields,
  policy: AuthorizationPolicy,
): readonly Permission[] {
  const permissions: Permission[] = [];

  if (
    policy.costsReadEnabled &&
    policy.costsReadSubjects.includes(identity.subject)
  ) {
    permissions.push("costs:read");
  }
  if (
    policy.contactDataEnabled &&
    policy.contactReadSubjects.includes(identity.subject)
  ) {
    permissions.push("contacts:enrich", "contacts:read", "contacts:reveal");
  }
  if (
    policy.contactDataEnabled &&
    policy.contactGovernSubjects.includes(identity.subject)
  ) {
    permissions.push("contacts:govern");
  }

  return permissions;
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
      permissions: permissionsForIdentity(authorization.identity, policy),
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

  return {
    status: "authorized",
    actor: {
      ...authorization.identity,
      permissions: permissionsForIdentity(authorization.identity, policy),
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
