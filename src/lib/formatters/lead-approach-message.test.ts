import { describe, expect, it } from "vitest";

import type { LeadDetail } from "../../types/leads";
import { buildLeadApproachDraft } from "./lead-approach-message";

type ApproachLead = Pick<
  LeadDetail,
  | "companyName"
  | "tradeName"
  | "legalName"
  | "sector"
  | "strategicReport"
>;

function lead(overrides: Partial<ApproachLead> = {}): ApproachLead {
  return {
    companyName: "Lume Sistemas Sintéticos",
    tradeName: "Lume Sistemas",
    legalName: "Lume Sistemas Sintéticos Ltda.",
    sector: "Tecnologia",
    strategicReport: {
      status: "available",
      content:
        "Relatório comercial sintético\n\nProblema identificado: dificuldade em consolidar indicadores entre unidades\nFit estratégico: 87/100\nConfiança: alta",
    },
    ...overrides,
  };
}

describe("lead approach message formatter", () => {
  it("uses the company identity, sector, and an explicit report problem", () => {
    const draft = buildLeadApproachDraft(lead());

    expect(draft).not.toBeNull();
    expect(draft?.message).toContain("Lume Sistemas");
    expect(draft?.message).toContain("contexto de tecnologia");
    expect(draft?.message).toContain(
      "dificuldade em consolidar indicadores entre unidades",
    );
    expect(draft?.contexts[0]?.basis).toBe(
      "Problema identificado no relatório",
    );
    expect(draft?.contexts[0]?.focus).toBe(
      "dificuldade em consolidar indicadores entre unidades",
    );
    expect(draft?.message).not.toMatch(/87\/100|confiança|fit estratégico/i);
  });

  it("creates materially different messages for companies with different problems", () => {
    const first = buildLeadApproachDraft(lead());
    const second = buildLeadApproachDraft(
      lead({
        companyName: "Rota Logística Sintética",
        tradeName: "Rota Logística",
        strategicReport: {
          status: "available",
          content:
            "Relatório comercial sintético\n\nDesafio principal: reduzir atrasos na distribuição regional",
        },
      }),
    );

    expect(first?.message).not.toBe(second?.message);
    expect(second?.message).toContain("Rota Logística");
    expect(second?.message).toContain(
      "reduzir atrasos na distribuição regional",
    );
    expect(second?.message).not.toContain(
      "consolidar indicadores entre unidades",
    );
  });

  it.each([
    ["Problema principal", "retrabalho recorrente no fechamento mensal"],
    ["Desafio identificado", "integrar informações de equipes remotas"],
    ["Gargalo operacional", "aprovação manual de cada pedido"],
    ["Dor identificada", "baixa previsibilidade da demanda"],
    ["Necessidade identificada", "centralizar documentos comerciais"],
    ["Ponto de atenção", "crescimento acima da capacidade atual"],
  ])("accepts the explicit problem label %s", (label, problem) => {
    const draft = buildLeadApproachDraft(
      lead({
        strategicReport: {
          status: "available",
          content: `${label}: ${problem}`,
        },
      }),
    );

    expect(draft?.contexts[0]?.focus).toBe(problem);
    expect(draft?.message).toContain(problem);
  });

  it("uses opportunity and differential when the report has no explicit problem", () => {
    const draft = buildLeadApproachDraft(
      lead({
        strategicReport: {
          status: "available",
          content:
            "Research Report Comercial — LUME\n\nOportunidade identificada: ampliar canais B2B\nDiferencial identificado: presença regional consolidada\nPrioridade comercial: R\nValor de pesquisa: C\nFit estratégico: 72/100\nConfiança: média",
        },
      }),
    );

    expect(draft).not.toBeNull();
    expect(draft?.message).toContain("ampliar canais B2B");
    expect(draft?.message).toContain("presença regional consolidada");
    expect(draft?.contexts).toEqual([
      {
        basis: "Oportunidade identificada no relatório",
        focus: "ampliar canais B2B",
      },
      {
        basis: "Diferencial identificado no relatório",
        focus: "presença regional consolidada",
      },
    ]);
    expect(draft?.message).not.toMatch(
      /prioridade comercial|valor de pesquisa|72\/100|confiança|fit estratégico/i,
    );
  });

  it.each([
    ["Ativo estratégico", "rede própria de distribuição"],
    ["Sinal positivo", "crescimento consistente em novos mercados"],
    ["Contexto", "expansão da operação para novas regiões"],
    ["Resumo executivo", "empresa em fase de consolidação nacional"],
  ])("uses the approved report context label %s", (label, context) => {
    const draft = buildLeadApproachDraft(
      lead({
        strategicReport: {
          status: "available",
          content: `${label}: ${context}`,
        },
      }),
    );

    expect(draft?.contexts[0]?.focus).toBe(context);
    expect(draft?.message).toContain(context);
  });

  it("skips unsafe qualification language and uses the next approved report fact", () => {
    const draft = buildLeadApproachDraft(
      lead({
        strategicReport: {
          status: "available",
          content:
            "Problema identificado: baixo fit estratégico e prioridade R\nOportunidade: ampliar a presença no mercado regional",
        },
      }),
    );

    expect(draft?.message).toContain("ampliar a presença no mercado regional");
    expect(draft?.message).not.toMatch(/fit estratégico|prioridade R/i);
  });

  it.each(["NÃO_IDENTIFICADO", "não disponível", "unknown"])(
    "does not copy the unavailable context placeholder %s",
    (placeholder) => {
      const draft = buildLeadApproachDraft(
        lead({
          sector: null,
          strategicReport: {
            status: "available",
            content: `Problema identificado: ${placeholder}`,
          },
        }),
      );

      expect(draft).not.toBeNull();
      expect(draft?.message).not.toContain(placeholder);
      expect(draft?.contexts[0]?.basis).toBe("Identidade da empresa");
    },
  );

  it("uses safe report prose when no approved labeled field is present", () => {
    const draft = buildLeadApproachDraft(
      lead({
        sector: null,
        strategicReport: {
          status: "available",
          content:
            "Panorama comercial\n\nCrescimento regional sustentado por contratos recorrentes.",
        },
      }),
    );

    expect(draft?.contexts[0]).toEqual({
      basis: "Contexto descrito no relatório",
      focus: "Crescimento regional sustentado por contratos recorrentes",
    });
    expect(draft?.message).toContain(
      "Crescimento regional sustentado por contratos recorrentes",
    );
  });

  it("never turns internal research-quality commentary into customer copy", () => {
    const internalCommentary =
      "A IA analisou a pesquisa, porém as fontes são fracas ou insuficientes. Usar como hipótese inicial e validar antes de tratar como report premium.";
    const draft = buildLeadApproachDraft(
      lead({
        companyName: "PLASFORT FORTALEZA LTDA",
        tradeName: null,
        legalName: "PLASFORT FORTALEZA LTDA",
        sector:
          "Fabricação de artefatos de borracha não especificados anteriormente",
        strategicReport: {
          status: "available",
          content: internalCommentary,
        },
      }),
    );

    expect(draft).not.toBeNull();
    expect(draft?.message).toContain("PLASFORT FORTALEZA LTDA");
    expect(draft?.message).not.toContain(internalCommentary);
    expect(draft?.message).not.toMatch(
      /\b(?:IA|pesquisa|fontes?|hipótese|validar|report premium)\b/i,
    );
    expect(draft?.contexts).toEqual([
      {
        basis: "Setor da empresa",
        focus:
          "Fabricação de artefatos de borracha não especificados anteriormente",
      },
    ]);
  });

  it("uses the report sector for the current legacy-shaped report", () => {
    const draft = buildLeadApproachDraft(
      lead({
        sector: null,
        strategicReport: {
          status: "available",
          content:
            "Research Report Comercial — LUME\n\nPrioridade comercial: R\nValor de pesquisa: C\nFit estratégico: 72/100\nConfiança: média\nSetor detectado: manufatura_sintetica",
        },
      }),
    );

    expect(draft?.contexts[0]).toEqual({
      basis: "Setor identificado no relatório",
      focus: "manufatura sintetica",
    });
    expect(draft?.message).toContain("manufatura sintetica");
    expect(draft?.message).not.toMatch(
      /prioridade comercial|valor de pesquisa|72\/100|confiança|fit estratégico/i,
    );
  });

  it.each(["missing", "unavailable", "omitted_by_policy"] as const)(
    "does not build a draft when the report is %s",
    (status) => {
      expect(
        buildLeadApproachDraft(
          lead({ strategicReport: { status, content: null } }),
        ),
      ).toBeNull();
    },
  );

  it("requires company identity but not an explicit problem", () => {
    expect(
      buildLeadApproachDraft(
        lead({
          companyName: null,
          tradeName: null,
          legalName: null,
        }),
      ),
    ).toBeNull();

    const draft = buildLeadApproachDraft(
      lead({
        sector: null,
        strategicReport: {
          status: "available",
          content:
            "Prioridade comercial: R\nFit estratégico: 72/100\nConfiança: média",
        },
      }),
    );

    expect(draft).not.toBeNull();
    expect(draft?.message).toContain("Lume Sistemas");
    expect(draft?.contexts[0]?.basis).toBe("Identidade da empresa");
    expect(draft?.message).not.toMatch(
      /prioridade comercial|72\/100|confiança|fit estratégico/i,
    );
  });
});
