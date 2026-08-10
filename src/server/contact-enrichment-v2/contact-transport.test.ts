import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hasVerifiedHttpsTransport } from "./contact-transport";

describe("contact data transport", () => {
  it("accepts direct HTTPS or a trusted HTTPS forwarded protocol", () => {
    expect(
      hasVerifiedHttpsTransport(
        new Request("https://prospecta.example.test/api/contact-enrichment/v2"),
      ),
    ).toBe(true);
    expect(
      hasVerifiedHttpsTransport(
        new Request("http://app.internal/api/contact-enrichment/v2", {
          headers: { "X-Forwarded-Proto": "https" },
        }),
      ),
    ).toBe(true);
  });

  it("rejects the exact Demo 3 plain-HTTP profile even if the URL is internal", () => {
    expect(
      hasVerifiedHttpsTransport(
        new Request("http://192.168.0.20:30100/api/contact-enrichment/v2", {
          headers: { "X-Forwarded-Proto": "http" },
        }),
      ),
    ).toBe(false);
  });
});

