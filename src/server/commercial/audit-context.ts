import "server-only";

import { randomUUID } from "node:crypto";

import type { AuthorizedActor } from "../auth/authorization";
import {
  commercialAuthorizationBases,
  type CommercialAuditActorContext,
  type CommercialAuthorizationBasis,
} from "../../types/commercial";

const LOCAL_DEMO_ISSUER = "urn:prospecta:local-demo";
const LOCAL_DEVELOPMENT_ISSUER = "urn:prospecta:local-development";

export function createCommercialAuditActorContext(
  actor: AuthorizedActor,
): CommercialAuditActorContext {
  return {
    organizationId: actor.organizationId,
    actorSubject: actor.subject,
    actorIssuer: actor.issuer,
    requestCorrelationId: randomUUID(),
    authorizationBasis: authorizationBasisForIssuer(actor.issuer),
  };
}

export function hasValidCommercialAuditFields(
  actor: CommercialAuditActorContext,
): boolean {
  return (
    actor.actorIssuer === actor.actorIssuer.trim() &&
    actor.actorIssuer.length >= 1 &&
    actor.actorIssuer.length <= 2_048 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      actor.requestCorrelationId,
    ) &&
    commercialAuthorizationBases.includes(actor.authorizationBasis) &&
    actor.authorizationBasis === authorizationBasisForIssuer(actor.actorIssuer)
  );
}

function authorizationBasisForIssuer(
  issuer: string,
): CommercialAuthorizationBasis {
  if (issuer === LOCAL_DEMO_ISSUER) {
    return "local_demo3";
  }

  return issuer === LOCAL_DEVELOPMENT_ISSUER
    ? "local_demo2"
    : "verified_oidc";
}
