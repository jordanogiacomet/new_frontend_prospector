import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  contactCompanySearchCallbackSchema,
  contactPreviewCallbackSchema,
} from "./contact-enrichment-v2-contract";

const preview = {
  contract_version: "prospecta-contact-enrichment-preview-v2",
  request_id: "00000000-0000-4000-8000-000000000771",
  status: "PREVIEW_EMPTY",
  occurred_at: "2026-10-06T12:00:00.000Z",
  candidates: [],
};

describe("safe contact search diagnostic contract", () => {
  it("preserves callbacks without diagnostics and accepts only allowlisted stage facts", () => {
    expect(contactPreviewCallbackSchema.parse(preview)).not.toHaveProperty("search_diagnostics");
    expect(contactPreviewCallbackSchema.parse({
      ...preview,
      search_diagnostics: [
        { provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_MATCHES" },
        { provider: "APOLLO", stage: "COMPANY_MATCH", code: "DOMAIN_UNAVAILABLE" },
      ],
    }).search_diagnostics).toHaveLength(2);
  });

  it.each([
    [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_MATCHES", message: "raw body" }],
    [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "CREDITS_EXHAUSTED" }],
    [{ provider: "LUSHA", stage: "COMPANY_MATCH", code: "NO_MATCHES" }],
    [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_MATCHES" },
      { provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "RESULTS_FOUND" }],
    [{ provider: "LUSHA", stage: "COMPANY_SEARCH", code: "NO_MATCHES" }],
    [{ provider: "APOLLO", stage: "COMPANY_MATCH", code: "NO_RELEVANT_MATCHES" }],
  ].map((search_diagnostics) => ({ search_diagnostics })))
  ("rejects diagnostic data outside the exact preview allowlist: %j", ({ search_diagnostics }) => {
    expect(contactPreviewCallbackSchema.safeParse({ ...preview, search_diagnostics }).success).toBe(false);
  });

  it.each(["LUSHA", "APOLLO"] as const)("accepts confirmed non-relevant %s contact samples", (provider) => {
    expect(contactPreviewCallbackSchema.parse({
      ...preview,
      search_diagnostics: [{ provider, stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES" }],
    }).search_diagnostics?.[0].code).toBe("NO_RELEVANT_MATCHES");
  });

  it("restricts company search feedback to its Lusha company-search stage", () => {
    const company = {
      contract_version: "prospecta-contact-company-search-v2",
      search_request_id: preview.request_id,
      status: "SEARCH_FAILED",
      occurred_at: preview.occurred_at,
      matches: [],
    };
    expect(contactCompanySearchCallbackSchema.parse({
      ...company,
      search_diagnostics: [{ provider: "LUSHA", stage: "COMPANY_SEARCH", code: "ACCESS_DENIED" }],
    }).search_diagnostics?.[0].code).toBe("ACCESS_DENIED");
    expect(contactCompanySearchCallbackSchema.safeParse({
      ...company,
      search_diagnostics: [{ provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "ACCESS_DENIED" }],
    }).success).toBe(false);
    expect(contactCompanySearchCallbackSchema.safeParse({
      ...company,
      search_diagnostics: [{ provider: "LUSHA", stage: "COMPANY_SEARCH", code: "NO_RELEVANT_MATCHES" }],
    }).success).toBe(false);
  });
});
