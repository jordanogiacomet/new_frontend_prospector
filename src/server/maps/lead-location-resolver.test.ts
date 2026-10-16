import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveLeadMunicipalityLocation } from "./lead-location-resolver";

describe("lead municipality location resolver", () => {
  it("resolves the versioned centroid for an exact city and UF pair", () => {
    expect(
      resolveLeadMunicipalityLocation({ city: "Fortaleza", uf: "CE" }),
    ).toEqual({
      precision: "municipality_center",
      latitude: -3.71664,
      longitude: -38.5423,
      boundingBox: [-38.6823, -3.81664, -38.4023, -3.61664],
    });
  });

  it("normalizes accents, whitespace and casing without fuzzy matching", () => {
    const normalized = resolveLeadMunicipalityLocation({
      city: "  SÃO PAULO ",
      uf: " sp ",
    });

    expect(normalized).toMatchObject({
      latitude: -23.5329,
      longitude: -46.6395,
    });
  });

  it("fails closed for incomplete, unknown, or mismatched locations", () => {
    expect(
      resolveLeadMunicipalityLocation({ city: null, uf: "CE" }),
    ).toBeNull();
    expect(
      resolveLeadMunicipalityLocation({ city: "Fortaleza", uf: null }),
    ).toBeNull();
    expect(
      resolveLeadMunicipalityLocation({ city: "Fortaleza", uf: "SP" }),
    ).toBeNull();
    expect(
      resolveLeadMunicipalityLocation({ city: "Cidade inventada", uf: "CE" }),
    ).toBeNull();
  });
});
