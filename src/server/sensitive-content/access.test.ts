import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getServerEnvMock = vi.hoisted(() => vi.fn());

vi.mock("../env", () => ({
  getServerEnv: getServerEnvMock,
}));

import { getSensitiveContentAccess } from "./access";

const actor = {
  issuer: "urn:synthetic",
  subject: "synthetic-subject",
  organizationId: "synthetic-organization",
  permissions: ["leads:read", "sensitive:read"],
} as const;

describe("sensitive content access", () => {
  it("requires both the feature and the server actor permission", () => {
    getServerEnvMock.mockReturnValue({
      FEATURE_SENSITIVE_CONTENT_ENABLED: true,
      SENSITIVE_URL_HOSTS: ["evidence.example.com"],
    });

    expect(
      getSensitiveContentAccess(actor, new Date("2026-07-13T12:00:00Z")),
    ).toEqual({
      enabled: true,
      allowedUrlHosts: ["evidence.example.com"],
      now: new Date("2026-07-13T12:00:00Z"),
    });

    expect(
      getSensitiveContentAccess({ ...actor, permissions: ["leads:read"] }),
    ).toMatchObject({ enabled: false });

    getServerEnvMock.mockReturnValue({
      FEATURE_SENSITIVE_CONTENT_ENABLED: false,
      SENSITIVE_URL_HOSTS: ["evidence.example.com"],
    });

    expect(getSensitiveContentAccess(actor)).toMatchObject({ enabled: false });
  });
});
