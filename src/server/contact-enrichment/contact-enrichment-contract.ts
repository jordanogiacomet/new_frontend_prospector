import "server-only";

import { z } from "zod";

import type { ContactEnrichmentRecord } from "./contact-enrichment-repository";

export const CONTACT_ENRICHMENT_CONTRACT_VERSION =
  "prospecta-contact-enrichment-v1" as const;

const companyDomain = z
  .string()
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
  );

const idempotencyKey = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value);

export const contactEnrichmentRequestSchema = z.strictObject({
  cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
  company_domain: companyDomain,
});

export type ContactEnrichmentRequest = z.infer<
  typeof contactEnrichmentRequestSchema
>;

export const contactEnrichmentN8nRequestSchema = z.strictObject({
  contract_version: z.literal(CONTACT_ENRICHMENT_CONTRACT_VERSION),
  request_id: z.uuid(),
  idempotency_key: idempotencyKey,
  cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
  company_domain: companyDomain,
});

export type ContactEnrichmentN8nRequest = z.infer<
  typeof contactEnrichmentN8nRequestSchema
>;

export const contactEnrichmentN8nResponseSchema = z.strictObject({
  contract_version: z.literal(CONTACT_ENRICHMENT_CONTRACT_VERSION),
  request_id: z.uuid(),
  status: z.literal("ENRICHMENT_DISPATCHED"),
});

export const contactEnrichmentCallbackSchema = z.strictObject({
  contract_version: z.literal(CONTACT_ENRICHMENT_CONTRACT_VERSION),
  request_id: z.uuid(),
  status: z.enum(["COMPLETED_WITHHELD", "PROVIDER_OUTCOME_UNKNOWN"]),
  occurred_at: z.iso.datetime({ offset: true }),
  contact_count: z.null(),
});

export type ContactEnrichmentCallback = z.infer<
  typeof contactEnrichmentCallbackSchema
>;

export interface ContactEnrichmentResponse {
  readonly requestId: string;
  readonly status: ContactEnrichmentRecord["status"];
  readonly requestedAt: string;
  readonly updatedAt: string;
}

export function contactEnrichmentResponse(
  request: ContactEnrichmentRecord,
): ContactEnrichmentResponse {
  return {
    requestId: request.requestId,
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}
