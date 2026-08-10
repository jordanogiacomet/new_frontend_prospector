import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BoundedJsonError, readBoundedJson } from "./bounded-json";

describe("readBoundedJson", () => {
  it("enforces bytes actually read when Content-Length is absent", async () => {
    const request = new Request("https://prospecta.example.test/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(128) }),
    });
    request.headers.delete("Content-Length");

    await expect(readBoundedJson(request, 32)).rejects.toBeInstanceOf(
      BoundedJsonError,
    );
  });

  it("returns the exact bytes and parsed synthetic JSON within the limit", async () => {
    const raw = JSON.stringify({ request_id: "synthetic" });
    const result = await readBoundedJson(
      new Request("https://prospecta.example.test/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw,
      }),
      1024,
    );

    expect(result.body).toEqual({ request_id: "synthetic" });
    expect(result.exactBytes.equals(Buffer.from(raw))).toBe(true);
  });
});

