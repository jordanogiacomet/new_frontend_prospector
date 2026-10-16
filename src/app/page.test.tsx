import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import Home from "./page";

describe("application entry", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("opens the private guide without assuming lead-read access", () => {
    expect(() => Home()).toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/inicio");
  });
});
