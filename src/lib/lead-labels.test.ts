import { describe, expect, it } from "vitest";

import { UNAVAILABLE_LABEL } from "./formatters";
import {
  UNKNOWN_DOMAIN_LABEL,
  deriveConfidenceIndicator,
  formatDecisionReason,
  getConfidenceLabel,
  getLeadActionLabel,
  getLeadCommercialAssessment,
  getPriorityLabel,
  getRiskFlagLabel,
  getTrustStatusLabel,
  getVerdictLabel,
} from "./lead-labels";

describe("approved decision-reason terms", () => {
  it("presents the approved CRM history term in business language", () => {
    expect(
      formatDecisionReason(
        "Histórico CRM encontrado: REENGAJAR_COM_HISTORICO. Revisão humana obrigatória.",
      ),
    ).toBe(
      "Histórico CRM encontrado: Reengajar com histórico. Revisão humana obrigatória.",
    );
  });

  it.each([
    "REENGAJAR_COM_HISTORICO",
    "ENRIQUECER_E_REABORDAR_COM_CONTEXTO",
  ])(
    "summarizes the technical CRM review reason for managers with %s",
    (action) => {
      expect(
        formatDecisionReason(
          `Histórico CRM encontrado, mas match não encerrou a validação pública: ${action}. Dívida ativa indicada no cadastro sem confirmação pública aceita; revisão humana obrigatória.`,
        ),
      ).toBe(
        "Esta empresa já possui histórico no CRM, mas os dados públicos ainda precisam ser confirmados. Há também uma indicação não confirmada de dívida ativa. Revise essas informações antes de retomar o contato.",
      );
    },
  );

  it("does not mention debt when the technical reason does not contain it", () => {
    expect(
      formatDecisionReason(
        "Histórico CRM encontrado, mas match não encerrou a validação pública: REENGAJAR_COM_HISTORICO. Revisão humana obrigatória.",
      ),
    ).toBe(
      "Esta empresa já possui histórico no CRM, mas os dados públicos ainda precisam ser confirmados. Revise essas informações antes de retomar o contato.",
    );
  });

  it("humanizes any uppercase underscore term mechanically", () => {
    expect(formatDecisionReason("ACAO_INTERNA_NAO_MAPEADA")).toBe(
      "Ação interna não mapeada",
    );
    expect(formatDecisionReason("NOVO_TERMO_INTERNO_42")).toBe(
      "Novo termo interno 42",
    );
  });

  it("keeps known business acronyms uppercase", () => {
    expect(formatDecisionReason("CRM_SEM_HISTORICO")).toBe(
      "CRM sem histórico",
    );
    expect(formatDecisionReason("CNPJ_NAO_VALIDADO")).toBe(
      "CNPJ não validado",
    );
  });

  it("does not change prose without an uppercase underscore term", () => {
    expect(formatDecisionReason("Revisão humana obrigatória.")).toBe(
      "Revisão humana obrigatória.",
    );
  });

  it("keeps a missing reason unavailable", () => {
    expect(formatDecisionReason(null)).toBe(UNAVAILABLE_LABEL);
  });
});

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

describe("commercial assessment presentation boundary", () => {
  it.each([null, "prospectar", "CONTATAR_AGORA", "__proto__", "constructor"])(
    "keeps absent and unapproved action %s unavailable without inference",
    (action) => {
      expect(getLeadCommercialAssessment(action)).toMatchObject({
        conclusion: "Recomendação indisponível", emphasis: "unavailable",
      });
      expect(getLeadActionLabel(action)).toBe(action === null ? UNAVAILABLE_LABEL : UNKNOWN_DOMAIN_LABEL);
    },
  );
});

describe("approved risk flag labels", () => {
  it.each([
    ["SEM_SITE", "O site da empresa não foi localizado nos dados analisados."],
    [
      "SEM_EMAIL",
      "O e-mail corporativo não foi localizado nos dados analisados.",
    ],
    [
      "SEM_TELEFONE",
      "O telefone da empresa não foi localizado nos dados analisados.",
    ],
    [
      "DIVIDA_FEDERAL_ATIVA_INFORMADA",
      "A análise informa a existência de dívida ativa federal.",
    ],
  ])("maps %s to business copy", (storedValue, label) => {
    expect(getRiskFlagLabel(storedValue)).toBe(label);
  });

  it("returns the original value for an unknown risk flag", () => {
    expect(getRiskFlagLabel("RISCO_NOVO_NAO_MAPEADO")).toBe(
      "RISCO_NOVO_NAO_MAPEADO",
    );
  });
});

describe("approved priority labels", () => {
  it.each([
    ["B", "Prioridade B"],
    ["C", "Prioridade C"],
    ["D", "Prioridade D"],
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

  it.each([
    ["Aprovada com validação sintética", "Aprovada"],
    ["Nutrir - evidência sintética insuficiente", "Nutrir"],
    ["Não Abordar", "Não abordar"],
    ["Revisão Humana - validação sintética", "Revisão humana"],
  ])("maps the approved trust-status category in %s", (storedValue, label) => {
    expect(getTrustStatusLabel(storedValue)).toBe(label);
  });

  it.each([
    "Aprovadamente",
    "NutrirAgora",
    "Não Abordaremos",
    "Revisão Humanamente",
  ])("does not map an unbounded trust-status prefix in %s", (storedValue) => {
    expect(getTrustStatusLabel(storedValue)).toBe(UNKNOWN_DOMAIN_LABEL);
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
