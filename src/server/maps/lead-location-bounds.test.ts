import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { registeredAddressBounds } from "./lead-location-bounds";

describe("registered address map bounds", () => {
  it("keeps a tight block-level viewport centered on the returned point", () => {
    expect(registeredAddressBounds(-3.731862, -38.52667)).toEqual({
      boundingBox: [-38.52817, -3.732862, -38.52517, -3.730862],
    });
  });
});
