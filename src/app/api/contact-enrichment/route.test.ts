import { type NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../server/auth/require-api-session";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireSameOrigin: vi.fn(),
  getServerEnv: vi.fn(),
  submitContactEnrichment: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../server/contact-enrichment/submit-contact-enrichment", () => ({
  submitContactEnrichment: mocks.submitContactEnrichment,
}));

import { SafeApiError } from "../../../server/api/errors";
import { POST } from "./route";

const actor = {
  issuer: "urn:prospecta:demo3-preproduction",
  subject: "demo3-preproduction-user",
  organizationId: "org-synthetic-contact",
  permissions: ["contacts:enrich"],
} as const;
const authorization: ApiAuthorizationContext = {
  status: "authorized",
  actor,
};
const requestRecord = {
  requestId: "00000000-0000-4000-8000-000000000914",
  organizationId: actor.organizationId,
  actorSubject: actor.subject,
  status: "ENRICHMENT_DISPATCHED",
  requestedAt: new Date("2026-07-31T12:00:00.000Z"),
  updatedAt: new Date("2026-07-31T12:00:01.000Z"),
  providerOccurredAt: null,
} as const;

function request(
  body: unknown = {
    cnpj_normalizado: "12345678000195",
    company_domain: "empresa-sintetica.example",
  },
  idempotencyKey = "synthetic-idempotency-914",
): NextRequest {
  return new Request("http://localhost/api/contact-enrichment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      Origin: "http://localhost",
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requirePermission.mockResolvedValue(authorization);
  mocks.getServerEnv.mockReturnValue({
    FEATURE_CONTACT_ENRICHMENT_ENABLED: true,
  });
  mocks.submitContactEnrichment.mockResolvedValue({
    kind: "submitted",
    request: requestRecord,
  });
});

describe("POST /api/contact-enrichment", () => {
  it("requires permission and same origin before parsing or service work", async () => {
    mocks.requirePermission.mockRejectedValue(new SafeApiError("ACCESS_DENIED"));
    const denied = request();
    const json = vi.spyOn(denied, "json");

    const response = await POST(denied);

    expect(response.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith("contacts:enrich");
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(mocks.submitContactEnrichment).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue(authorization);
    mocks.requireSameOrigin.mockImplementation(() => {
      throw new SafeApiError("ACCESS_DENIED");
    });
    const crossOrigin = request();
    const crossOriginJson = vi.spyOn(crossOrigin, "json");

    const crossOriginResponse = await POST(crossOrigin);

    expect(crossOriginResponse.status).toBe(403);
    expect(crossOriginJson).not.toHaveBeenCalled();
    expect(mocks.submitContactEnrichment).not.toHaveBeenCalled();
  });

  it.each([
    { cnpj_normalizado: "123", company_domain: "empresa.example" },
    {
      cnpj_normalizado: "12345678000195",
      company_domain: "empresa.example",
      email: "synthetic@example.test",
    },
  ])("rejects an invalid or extra request field", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(mocks.submitContactEnrichment).not.toHaveBeenCalled();
  });

  it("uses only the verified actor and returns a safe 202 envelope", async () => {
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.submitContactEnrichment).toHaveBeenCalledWith(
      {
        organizationId: actor.organizationId,
        actor,
        idempotencyKey: "synthetic-idempotency-914",
        request: {
          cnpj_normalizado: "12345678000195",
          company_domain: "empresa-sintetica.example",
        },
      },
      { ingressClient: { fetch: globalThis.fetch } },
    );
    expect(payload).toEqual({
      data: {
        requestId: requestRecord.requestId,
        status: "ENRICHMENT_DISPATCHED",
        requestedAt: "2026-07-31T12:00:00.000Z",
        updatedAt: "2026-07-31T12:00:01.000Z",
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /cnpj|domain|idempotency|email|phone|contact_count/i,
    );
  });

  it("returns 200 for an idempotent duplicate and 409 for changed input", async () => {
    mocks.submitContactEnrichment.mockResolvedValueOnce({
      kind: "duplicate",
      request: requestRecord,
    });
    expect((await POST(request())).status).toBe(200);

    mocks.submitContactEnrichment.mockResolvedValueOnce({ kind: "conflict" });
    const conflict = await POST(request());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: {
        code: "CONTACT_ENRICHMENT_IDEMPOTENCY_CONFLICT",
        message: "Esta solicitação conflita com um enriquecimento já registrado.",
      },
    });
  });
});
