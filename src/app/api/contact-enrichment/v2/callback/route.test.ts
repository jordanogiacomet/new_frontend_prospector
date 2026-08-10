import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readBoundedJson: vi.fn(),
  processPreviewCallback: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../server/contact-enrichment-v2/bounded-json", () => ({
  readBoundedJson: mocks.readBoundedJson,
}));
vi.mock(
  "../../../../../server/contact-enrichment-v2/contact-enrichment-v2-service",
  () => ({ processPreviewCallback: mocks.processPreviewCallback }),
);
vi.mock("../../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

import { POST } from "./route";

const callbackSecret = "synthetic-v2-callback-secret-at-least-32-bytes";

function request(secret: string | null = callbackSecret): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["X-Prospecta-Contact-Callback-Secret"] = secret;
  return new NextRequest(
    "https://prospecta.example.test/api/contact-enrichment/v2/callback",
    { method: "POST", headers, body: JSON.stringify({ synthetic: true }) },
  );
}

beforeEach(() => {
  mocks.readBoundedJson.mockReset();
  mocks.processPreviewCallback.mockReset();
  mocks.getServerEnv.mockReset();
  mocks.getServerEnv.mockReturnValue({
    FEATURE_CONTACT_DATA_ENABLED: true,
    N8N_CONTACT_CALLBACK_V2_SECRET: callbackSecret,
  });
});

describe("POST /api/contact-enrichment/v2/callback", () => {
  it("rejects machine authentication before reading the body", async () => {
    const response = await POST(request("wrong-secret-value-at-least-32-bytes"));

    expect(response.status).toBe(401);
    expect(mocks.readBoundedJson).not.toHaveBeenCalled();
    expect(mocks.processPreviewCallback).not.toHaveBeenCalled();
  });

  it("rejects an invalid bounded callback without persistence", async () => {
    mocks.readBoundedJson.mockRejectedValue(new Error("invalid"));
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.processPreviewCallback).not.toHaveBeenCalled();
  });

  it("records an exact callback and returns no contact values", async () => {
    const body = {
      contract_version: "prospecta-contact-enrichment-preview-v2",
      request_id: "00000000-0000-4000-8000-000000000951",
      status: "PREVIEW_EMPTY",
      occurred_at: "2026-07-31T12:00:00.000Z",
      candidates: [],
    };
    mocks.readBoundedJson.mockResolvedValue({ body, exactBytes: Buffer.from("{}") });
    mocks.processPreviewCallback.mockResolvedValue({
      kind: "recorded",
      request: { status: "PREVIEW_EMPTY" },
    });
    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.processPreviewCallback).toHaveBeenCalledWith(
      body,
      expect.objectContaining({ FEATURE_CONTACT_DATA_ENABLED: true }),
    );
    expect(payload).toEqual({
      data: {
        recorded: true,
        replayed: false,
        status: "PREVIEW_EMPTY",
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/email|phone|full_name/i);
  });
});
