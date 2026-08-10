import { type NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  recordCallback: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../server/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock(
  "../../../../server/contact-enrichment/contact-enrichment-repository",
  () => ({ recordContactEnrichmentCallback: mocks.recordCallback }),
);

import { POST } from "./route";

const secret = "synthetic-contact-callback-secret-with-32-bytes";
const callbackBody = {
  contract_version: "prospecta-contact-enrichment-v1",
  request_id: "00000000-0000-4000-8000-000000000915",
  status: "COMPLETED_WITHHELD",
  occurred_at: "2026-07-31T12:00:03.000Z",
  contact_count: null,
} as const;

function request(
  options: {
    readonly authorization?: string;
    readonly json?: unknown;
    readonly contentType?: string;
  } = {},
): { readonly request: NextRequest; readonly json: ReturnType<typeof vi.fn> } {
  const headers = new Headers({
    "Content-Type": options.contentType ?? "application/json",
  });
  if (options.authorization !== undefined) {
    headers.set("X-Prospecta-Contact-Callback-Secret", options.authorization);
  }
  const json = vi.fn().mockResolvedValue(options.json ?? callbackBody);

  return {
    request: { headers, json } as unknown as NextRequest,
    json,
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getServerEnv.mockReturnValue({
    AUTH_ALLOWED_ORG_ID: "org-synthetic-contact",
    FEATURE_CONTACT_ENRICHMENT_ENABLED: true,
    N8N_CONTACT_CALLBACK_SECRET: secret,
  });
  mocks.recordCallback.mockResolvedValue({
    kind: "recorded",
    request: { status: "COMPLETED_WITHHELD" },
  });
});

describe("POST /api/contact-enrichment/callback", () => {
  it("fails closed before parsing when disabled or unauthenticated", async () => {
    mocks.getServerEnv.mockReturnValue({
      AUTH_ALLOWED_ORG_ID: "org-synthetic-contact",
      FEATURE_CONTACT_ENRICHMENT_ENABLED: false,
      N8N_CONTACT_CALLBACK_SECRET: undefined,
    });
    const disabled = request({ authorization: secret });
    expect((await POST(disabled.request)).status).toBe(503);
    expect(disabled.json).not.toHaveBeenCalled();

    mocks.getServerEnv.mockReturnValue({
      AUTH_ALLOWED_ORG_ID: "org-synthetic-contact",
      FEATURE_CONTACT_ENRICHMENT_ENABLED: true,
      N8N_CONTACT_CALLBACK_SECRET: secret,
    });
    const unauthorized = request({ authorization: "wrong-secret" });
    expect((await POST(unauthorized.request)).status).toBe(401);
    expect(unauthorized.json).not.toHaveBeenCalled();
    expect(mocks.recordCallback).not.toHaveBeenCalled();
  });

  it.each([
    { ...callbackBody, status: "CONTACT_FOUND" },
    { ...callbackBody, contact_count: 1 },
    { ...callbackBody, email: "synthetic@example.test" },
    { ...callbackBody, occurred_at: "not-a-date" },
  ])("rejects an invalid callback without persistence", async (json) => {
    const response = await POST(request({ authorization: secret, json }).request);

    expect(response.status).toBe(400);
    expect(mocks.recordCallback).not.toHaveBeenCalled();
  });

  it("records a valid callback under the configured organization", async () => {
    const response = await POST(request({ authorization: secret }).request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.recordCallback).toHaveBeenCalledWith({
      organizationId: "org-synthetic-contact",
      requestId: callbackBody.request_id,
      status: callbackBody.status,
      occurredAt: new Date(callbackBody.occurred_at),
    });
    expect(await response.json()).toEqual({
      data: {
        recorded: true,
        replayed: false,
        status: "COMPLETED_WITHHELD",
      },
    });
  });

  it.each([
    { result: { kind: "replayed", request: { status: "COMPLETED_WITHHELD" } }, status: 200 },
    { result: { kind: "conflict" }, status: 409 },
    { result: { kind: "not_found" }, status: 404 },
  ])("maps replay/correlation result without exposing callback data", async ({ result, status }) => {
    mocks.recordCallback.mockResolvedValue(result);

    const response = await POST(request({ authorization: secret }).request);
    const payload = await response.json();

    expect(response.status).toBe(status);
    expect(JSON.stringify(payload)).not.toMatch(
      /email|phone|cnpj|company_domain|contact_count|occurred_at/i,
    );
  });
});
