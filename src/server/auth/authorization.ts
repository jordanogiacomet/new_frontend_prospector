import "server-only";

export interface AuthorizationPolicy {
  issuer: string;
  organizationId: string;
}

export interface AuthorizedIdentity {
  issuer: string;
  subject: string;
  organizationId: string;
}

export type IdentityAuthorization =
  | {
      status: "authorized";
      identity: AuthorizedIdentity;
    }
  | {
      status: "unauthorized";
      reason: "issuer" | "subject" | "organization";
    };

export type ServerSessionAuthorization =
  | { status: "missing" }
  | { status: "expired" }
  | { status: "unauthorized" }
  | { status: "authorized" };

interface ServerSessionInput {
  expires?: unknown;
  authorization?: unknown;
}

export function authorizeIdentityClaims(
  claims: Record<string, unknown>,
  policy: AuthorizationPolicy,
): IdentityAuthorization {
  if (claims.iss !== policy.issuer) {
    return { status: "unauthorized", reason: "issuer" };
  }

  if (typeof claims.sub !== "string" || claims.sub.trim() === "") {
    return { status: "unauthorized", reason: "subject" };
  }

  if (
    typeof claims.org_id !== "string" ||
    claims.org_id === "" ||
    claims.org_id !== policy.organizationId
  ) {
    return { status: "unauthorized", reason: "organization" };
  }

  return {
    status: "authorized",
    identity: {
      issuer: claims.iss,
      subject: claims.sub,
      organizationId: claims.org_id,
    },
  };
}

export function classifyServerSession(
  session: ServerSessionInput | null,
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

  return { status: "authorized" };
}
