import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CONTACT_ENRICHMENT_CONTRACT_VERSION,
  contactEnrichmentCallbackSchema,
  contactEnrichmentRequestSchema,
  contactEnrichmentResponse,
} from "./contact-enrichment-contract";

describe("contact enrichment v1 application contract", () => {
  it("accepts only the exact normalized request fields", () => {
    expect(
      contactEnrichmentRequestSchema.parse({
        cnpj_normalizado: "12345678000195",
        company_domain: "empresa-sintetica.example",
      }),
    ).toEqual({
      cnpj_normalizado: "12345678000195",
      company_domain: "empresa-sintetica.example",
    });

    for (const value of [
      { cnpj_normalizado: "123", company_domain: "empresa.example" },
      {
        cnpj_normalizado: "12345678000195",
        company_domain: "HTTPS://empresa.example",
      },
      {
        cnpj_normalizado: "12345678000195",
        company_domain: "empresa.example/path",
      },
      {
        cnpj_normalizado: "12345678000195",
        company_domain: "empresa.example",
        contact_name: "Synthetic Person",
      },
    ]) {
      expect(contactEnrichmentRequestSchema.safeParse(value).success).toBe(
        false,
      );
    }
  });

  it("accepts only the exact PII-free callback", () => {
    const valid = {
      contract_version: CONTACT_ENRICHMENT_CONTRACT_VERSION,
      request_id: "00000000-0000-4000-8000-000000000911",
      status: "COMPLETED_WITHHELD",
      occurred_at: "2026-07-31T12:00:03.000Z",
      contact_count: null,
    } as const;

    expect(contactEnrichmentCallbackSchema.parse(valid)).toEqual(valid);

    for (const value of [
      { ...valid, status: "CONTACT_FOUND" },
      { ...valid, contact_count: 1 },
      { ...valid, occurred_at: "not-a-date" },
      { ...valid, email: "synthetic@example.test" },
    ]) {
      expect(contactEnrichmentCallbackSchema.safeParse(value).success).toBe(
        false,
      );
    }
  });

  it("maps only opaque request state into the application response", () => {
    const response = contactEnrichmentResponse({
      requestId: "00000000-0000-4000-8000-000000000911",
      organizationId: "org-hidden",
      actorSubject: "actor-hidden",
      status: "ENRICHMENT_DISPATCHED",
      requestedAt: new Date("2026-07-31T12:00:00.000Z"),
      updatedAt: new Date("2026-07-31T12:00:01.000Z"),
      providerOccurredAt: null,
    });

    expect(response).toEqual({
      requestId: "00000000-0000-4000-8000-000000000911",
      status: "ENRICHMENT_DISPATCHED",
      requestedAt: "2026-07-31T12:00:00.000Z",
      updatedAt: "2026-07-31T12:00:01.000Z",
    });
    expect(JSON.stringify(response)).not.toMatch(
      /org-hidden|actor-hidden|cnpj|domain|email|phone|contact_count/i,
    );
  });
});
