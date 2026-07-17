import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AuthorizedActor } from "../auth/authorization";

import { createCommercialAuditActorContext } from "./audit-context";

const actor: AuthorizedActor = {
  issuer: "https://identity.synthetic.test/tenant",
  subject: "oidc|synthetic-commercial-actor",
  organizationId: "org-synthetic-commercial",
  permissions: ["commercial:write"],
};

describe("commercial audit actor context", () => {
  it("derives verified identity fields and creates a correlation UUID", () => {
    const context = createCommercialAuditActorContext(actor);

    expect(context).toMatchObject({
      organizationId: actor.organizationId,
      actorSubject: actor.subject,
      actorIssuer: actor.issuer,
      authorizationBasis: "verified_oidc",
    });
    expect(context.requestCorrelationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("marks the allowlisted local Demo 3 issuer without granting permissions", () => {
    const context = createCommercialAuditActorContext({
      ...actor,
      issuer: "urn:prospecta:local-demo",
      permissions: [],
    });

    expect(context.authorizationBasis).toBe("local_demo3");
    expect(context).not.toHaveProperty("permissions");
  });

  it("does not mislabel the local Demo 2 issuer as verified OIDC", () => {
    const context = createCommercialAuditActorContext({
      ...actor,
      issuer: "urn:prospecta:local-development",
    });

    expect(context.authorizationBasis).toBe("local_demo2");
  });
});
