import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string): never => {
    throw new Error(`Redirect: ${href}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import RetiredPipelinePage from "./page";

describe("retired prospecting pipeline", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it.each([
    [{}, "/leads"],
    [{ cnpj_normalizado: "12345678000195" }, "/leads?cnpj=12345678000195"],
    [{ page: "3", pageSize: "10", priority: "C" }, "/leads?page=3&pageSize=10&priority=C"],
  ])("redirects legacy links to the company list", async (parameters, destination) => {
    await expect(RetiredPipelinePage({ searchParams: Promise.resolve(parameters) }))
      .rejects.toThrow(`Redirect: ${destination}`);
    expect(redirectMock).toHaveBeenCalledWith(destination);
  });

  it("drops retired commercial filters and never queries the queue", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(RetiredPipelinePage({ searchParams: Promise.resolve({
        cnpj_normalizado: "12345678000195",
        commercial_stage: "CONTACTED",
        responsible_subject: "synthetic-owner",
      }) })).rejects.toThrow("Redirect: /leads?cnpj=12345678000195");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects ambiguous company filters", async () => {
    await expect(RetiredPipelinePage({ searchParams: Promise.resolve({
      cnpj_normalizado: ["12345678000195", "22345678000190"],
    }) })).rejects.toThrow("Redirect: /leads");
  });
});
