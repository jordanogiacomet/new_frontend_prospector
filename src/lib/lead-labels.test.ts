import { describe, expect, it } from "vitest";

import { UNAVAILABLE_LABEL } from "./formatters";
import {
  UNKNOWN_DOMAIN_LABEL,
  deriveConfidenceIndicator,
  getConfidenceLabel,
  getLeadActionLabel,
  getPriorityLabel,
  getTrustStatusLabel,
  getVerdictLabel,
} from "./lead-labels";

describe("approved lead action labels", () => {
  it.each([
    ["PROSPECTAR", "Prospectar"],
    ["PROSPECTAR_COM_CAUTELA", "Prospectar com cautela"],
    ["NUTRIR", "Nutrir"],
    ["NAO_ABORDAR", "Não abordar"],
    ["REVISAO_HUMANA", "Revisão humana"],
  ])("maps %s exactly", (storedValue, label) => {
    expect(getLeadActionLabel(storedValue)).toBe(label);
  });

  it("keeps a missing action unavailable", () => {
    expect(getLeadActionLabel(null)).toBe(UNAVAILABLE_LABEL);
  });

  it("renders an unknown action neutrally", () => {
    expect(getLeadActionLabel("ABORDAR")).toBe(UNKNOWN_DOMAIN_LABEL);
  });

  it("does not normalize the case of an action", () => {
    expect(getLeadActionLabel("prospectar")).toBe(UNKNOWN_DOMAIN_LABEL);
  });
});

describe("approved priority labels", () => {
  it.each([
    ["B", "Prioridade B"],
    ["C", "Prioridade C"],
    ["E", "Prioridade E"],
    ["R", "Prioridade R"],
  ])("maps %s without inferring rank", (storedValue, label) => {
    expect(getPriorityLabel(storedValue)).toBe(label);
  });

  it("keeps a missing priority unavailable", () => {
    expect(getPriorityLabel(null)).toBe(UNAVAILABLE_LABEL);
  });

  it("renders an unknown priority neutrally", () => {
    expect(getPriorityLabel("A")).toBe(UNKNOWN_DOMAIN_LABEL);
  });
});

describe("approved verdict and trust labels", () => {
  it("maps the only approved verdict token", () => {
    expect(getVerdictLabel("REVISAO_HUMANA")).toBe("Revisão humana");
  });

  it("renders an unknown verdict neutrally", () => {
    expect(getVerdictLabel("APROVADO")).toBe(UNKNOWN_DOMAIN_LABEL);
  });

  it("keeps a missing verdict unavailable", () => {
    expect(getVerdictLabel(null)).toBe(UNAVAILABLE_LABEL);
  });

  it("maps the exact approved trust status", () => {
    expect(getTrustStatusLabel("Revisão Humana")).toBe("Revisão humana");
  });

  it("does not normalize an unapproved trust status", () => {
    expect(getTrustStatusLabel("REVISAO_HUMANA")).toBe(UNKNOWN_DOMAIN_LABEL);
  });

  it("keeps a missing trust status unavailable", () => {
    expect(getTrustStatusLabel(null)).toBe(UNAVAILABLE_LABEL);
  });
});

describe("low-confidence presentation", () => {
  it("does not infer low confidence from a review trust status", () => {
    expect(deriveConfidenceIndicator("Revisão Humana")).toBe("unknown");
  });

  it("does not infer low confidence from an unknown trust status", () => {
    expect(deriveConfidenceIndicator("BAIXA")).toBe("unknown");
  });

  it("does not infer low confidence from a missing trust status", () => {
    expect(deriveConfidenceIndicator(null)).toBe("unknown");
  });

  it("uses neutral confidence copy while no low-confidence token is approved", () => {
    expect(getConfidenceLabel("BAIXA")).toBe("Confiança não mapeada");
  });
});
