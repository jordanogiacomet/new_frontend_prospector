import "server-only";

import { createHash } from "node:crypto";

import type { AuthorizedActor } from "../auth/authorization";
import {
  submitContactEnrichmentToN8n,
  type ContactEnrichmentClientDependencies,
  type ContactEnrichmentIngressResult,
} from "./contact-enrichment-client";
import {
  CONTACT_ENRICHMENT_CONTRACT_VERSION,
  contactEnrichmentRequestSchema,
  type ContactEnrichmentRequest,
} from "./contact-enrichment-contract";
import {
  recordContactEnrichmentDispatchOutcome,
  recordContactEnrichmentIntent,
  type ContactEnrichmentRecord,
} from "./contact-enrichment-repository";

type ContactEnrichmentActor = Pick<
  AuthorizedActor,
  "organizationId" | "subject" | "permissions"
>;

export interface SubmitContactEnrichmentInput {
  readonly organizationId: string;
  readonly actor: ContactEnrichmentActor;
  readonly idempotencyKey: string;
  readonly request: ContactEnrichmentRequest;
}

export interface SubmitContactEnrichmentDependencies {
  readonly ingressClient: ContactEnrichmentClientDependencies;
}

export type SubmitContactEnrichmentResult =
  | { readonly kind: "submitted"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "duplicate"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "conflict" };

export class SubmitContactEnrichmentInputError extends Error {
  readonly code = "INVALID_CONTACT_ENRICHMENT_INPUT";

  constructor() {
    super("Invalid contact enrichment input.");
    this.name = "SubmitContactEnrichmentInputError";
  }
}

export async function submitContactEnrichment(
  input: SubmitContactEnrichmentInput,
  dependencies: SubmitContactEnrichmentDependencies,
): Promise<SubmitContactEnrichmentResult> {
  validateInput(input);
  const parsedRequest = contactEnrichmentRequestSchema.parse(input.request);
  const intent = await recordContactEnrichmentIntent({
    organizationId: input.organizationId,
    actorSubject: input.actor.subject,
    idempotencyKeySha256: sha256(input.idempotencyKey),
    inputSha256: sha256(
      JSON.stringify({
        contract_version: CONTACT_ENRICHMENT_CONTRACT_VERSION,
        ...parsedRequest,
      }),
    ),
  });

  if (intent.kind === "conflict") {
    return { kind: "conflict" };
  }

  if (intent.kind === "duplicate") {
    return { kind: "duplicate", request: intent.request };
  }

  const ingressResult = await submitSafely(
    {
      contract_version: CONTACT_ENRICHMENT_CONTRACT_VERSION,
      request_id: intent.request.requestId,
      idempotency_key: input.idempotencyKey,
      ...parsedRequest,
    },
    dependencies.ingressClient,
  );
  const dispatch = await recordContactEnrichmentDispatchOutcome({
    organizationId: input.organizationId,
    actorSubject: input.actor.subject,
    requestId: intent.request.requestId,
    outcome: ingressResult.kind === "acknowledged" ? "acknowledged" : "unknown",
  });

  return {
    kind: "submitted",
    request:
      dispatch.kind === "recorded" || dispatch.kind === "unchanged"
        ? dispatch.request
        : intent.request,
  };
}

async function submitSafely(
  request: Parameters<typeof submitContactEnrichmentToN8n>[0],
  dependencies: ContactEnrichmentClientDependencies,
): Promise<ContactEnrichmentIngressResult> {
  try {
    return await submitContactEnrichmentToN8n(request, dependencies);
  } catch {
    return { kind: "unknown" };
  }
}

function validateInput(input: SubmitContactEnrichmentInput): void {
  if (
    typeof input.organizationId !== "string" ||
    input.organizationId.length === 0 ||
    input.organizationId.length > 128 ||
    input.organizationId.trim() !== input.organizationId ||
    typeof input.actor !== "object" ||
    input.actor === null ||
    input.actor.organizationId !== input.organizationId ||
    typeof input.actor.subject !== "string" ||
    input.actor.subject.length === 0 ||
    input.actor.subject.length > 256 ||
    input.actor.subject.trim() !== input.actor.subject ||
    !input.actor.permissions.includes("contacts:enrich") ||
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length === 0 ||
    input.idempotencyKey.length > 128 ||
    input.idempotencyKey.trim() !== input.idempotencyKey
  ) {
    throw new SubmitContactEnrichmentInputError();
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
