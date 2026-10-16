import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createProviderReference,
  parseProviderReference,
  providerIdentityValue,
} from "./contact-provider-reference";

describe("contact provider reference", () => {
  it("keeps legacy encrypted scalar references compatible with Lusha", () => {
    expect(parseProviderReference("legacy-lusha-id")).toEqual({
      source: "LUSHA",
      providerContactId: "legacy-lusha-id",
    });
    expect(providerIdentityValue(parseProviderReference("legacy-lusha-id"))).toBe(
      "legacy-lusha-id",
    );
  });

  it("namespaces Apollo provider identities without exposing credentials", () => {
    const reference = createProviderReference("APOLLO", "apollo-person-id");
    expect(parseProviderReference(reference)).toEqual({
      source: "APOLLO",
      providerContactId: "apollo-person-id",
    });
    expect(providerIdentityValue(reference)).toBe("APOLLO:apollo-person-id");
    expect(JSON.stringify(reference)).not.toMatch(/api[_-]?key|secret/i);
  });
});
