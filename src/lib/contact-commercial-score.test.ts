import { describe, expect, it } from "vitest";

import { calculateContactCommercialScore } from "./contact-commercial-score";

function candidate(
  jobTitle: string | null,
  governanceState: "AVAILABLE" | "SUPPRESSED" | "EXPIRED" = "AVAILABLE",
) {
  return { jobTitle, governanceState } as const;
}

describe("calculateContactCommercialScore", () => {
  it.each([
    ["Director of Finance", 15, "Diretor Financeiro"],
    ["Controller", 15, "Controller"],
    ["Gerente Contábil", 12, "Gerente Contábil"],
    ["Accounting Coordinator", 10, "Coordenador Contábil"],
    ["Supervisor Contábil", 8, "Supervisor Contábil"],
    ["Accounting Analyst", 5, "Analista/Assistente Contábil"],
    ["Assistente de Patrimônio", 5, "Analista/Assistente de Patrimônio"],
  ])(
    "applies the approved bonus for %s",
    (jobTitle, expectedBonus, expectedProfile) => {
      expect(
        calculateContactCommercialScore(70, [candidate(jobTitle)]),
      ).toEqual({
        kind: "SCORED",
        producerScore: 70,
        commercialScore: 70 + expectedBonus,
        bonus: expectedBonus,
        matchedProfile: expectedProfile,
      });
    },
  );

  it("uses only the highest eligible bonus and caps the result at 100", () => {
    expect(
      calculateContactCommercialScore(92, [
        candidate("Accounting Assistant"),
        candidate("Financial Controller"),
        candidate("Accounting Manager"),
      ]),
    ).toEqual({
      kind: "SCORED",
      producerScore: 92,
      commercialScore: 100,
      bonus: 15,
      matchedProfile: "Controller",
    });
  });

  it("does not change the score when no priority profile is available", () => {
    expect(
      calculateContactCommercialScore(61, [
        candidate("Vice President of Operations"),
        candidate("Controller", "SUPPRESSED"),
        candidate("Accounting Manager", "EXPIRED"),
      ]),
    ).toEqual({
      kind: "NO_PRIORITY_PROFILE",
      producerScore: 61,
    });
  });

  it("does not score adjacent finance roles that are used only for search fallback", () => {
    expect(
      calculateContactCommercialScore(70, [
        candidate("Chief Financial Officer"),
        candidate("Treasury Manager"),
      ]),
    ).toEqual({
      kind: "NO_PRIORITY_PROFILE",
      producerScore: 70,
    });
  });

  it.each(["Gerente de Patrimônio", "Fixed Assets Manager", "Inventory Manager"])("does not broaden the commercial bonus for the newly targeted role %s", (jobTitle) => {
    expect(calculateContactCommercialScore(70, [candidate(jobTitle)])).toEqual({
      kind: "NO_PRIORITY_PROFILE",
      producerScore: 70,
    });
  });

  it("does not invent a commercial score when the producer score is unavailable", () => {
    expect(
      calculateContactCommercialScore(null, [candidate("Controller")]),
    ).toEqual({
      kind: "PRODUCER_SCORE_UNAVAILABLE",
      bonus: 15,
      matchedProfile: "Controller",
    });
  });

  it("preserves an unavailable producer score when no profile matches", () => {
    expect(
      calculateContactCommercialScore(null, [candidate("Operations Manager")]),
    ).toEqual({
      kind: "NO_PRIORITY_PROFILE",
      producerScore: null,
    });
  });
});
