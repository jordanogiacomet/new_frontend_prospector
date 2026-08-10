import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CONTACT_PREVIEW_CONTRACT_VERSION,
  CONTACT_REVEAL_CONTRACT_VERSION,
  contactPreviewCallbackSchema,
  contactRevealCallbackSchema,
} from "./contact-enrichment-v2-contract";
import {
  normalizeContactCandidates,
  normalizeRevealedChannels,
} from "./contact-data-policy";

describe("contact data policy", () => {
  it("allows only an approved LinkedIn profile and exact preview fields", () => {
    const callback = contactPreviewCallbackSchema.parse({
      contract_version: CONTACT_PREVIEW_CONTRACT_VERSION,
      request_id: "00000000-0000-4000-8000-000000000801",
      status: "PREVIEW_AVAILABLE",
      occurred_at: "2026-07-31T12:00:00.000Z",
      candidates: [
        {
          provider_contact_id: "provider-synthetic-1",
          full_name: "Pessoa Sintética",
          job_title: "Direção financeira",
          departments: ["Finance", "Finance"],
          seniority: "Director",
          location: { city: "Recife", state: "PE", country: "Brasil" },
          linkedin_url: "https://www.linkedin.com/in/pessoa-sintetica",
          can_reveal_work_email: true,
          can_reveal_business_phone: true,
        },
      ],
    });

    expect(normalizeContactCandidates(callback)).toEqual([
      expect.objectContaining({
        fullName: "Pessoa Sintética",
        departments: ["Finance"],
        linkedinUrl: "https://www.linkedin.com/in/pessoa-sintetica",
      }),
    ]);
    expect(() =>
      contactPreviewCallbackSchema.parse({
        ...callback,
        candidates: [{ ...callback.candidates[0], billing: { credits: 1 } }],
      }),
    ).toThrow();
  });

  it("drops private emails, mobile phones and all DNC values from exposure", () => {
    const callback = contactRevealCallbackSchema.parse({
      contract_version: CONTACT_REVEAL_CONTRACT_VERSION,
      request_id: "00000000-0000-4000-8000-000000000811",
      reveal_request_id: "00000000-0000-4000-8000-000000000812",
      status: "REVEAL_AVAILABLE",
      occurred_at: "2026-07-31T12:00:00.000Z",
      provider_contact_id: "provider-synthetic-2",
      emails: [
        { email: "work@example.test", type: "work", confidence: "A", update_date: "2026-07-01" },
        { email: "private@example.test", type: "private", confidence: null, update_date: null },
      ],
      phones: [
        { number: "+5511999999999", type: "mobile", do_not_call: false, update_date: null },
        { number: "+551133333333", type: "direct", do_not_call: true, update_date: "2026-07-01" },
        { number: "+551144444444", type: "work", do_not_call: false, update_date: "2026-07-01" },
      ],
    });
    const result = normalizeRevealedChannels(callback);

    expect(result.workEmails.map((value) => value.value)).toEqual([
      "work@example.test",
    ]);
    expect(result.businessPhones.map((value) => value.value)).toEqual([
      "+551144444444",
    ]);
    expect(result.doNotCallPhones).toEqual(["+551133333333"]);
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(JSON.stringify(result)).not.toContain("+5511999999999");
  });
});

