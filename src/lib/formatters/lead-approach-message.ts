import type { LeadDetail } from "../../types/leads";

export type LeadApproachSource = Pick<
  LeadDetail,
  | "companyName"
  | "tradeName"
  | "legalName"
  | "sector"
  | "strategicReport"
>;

export interface LeadApproachContext {
  readonly basis: string;
  readonly focus: string;
}

export interface LeadApproachDraft {
  readonly companyName: string;
  readonly contexts: readonly LeadApproachContext[];
  readonly message: string;
}

interface ContextDefinition {
  readonly basis: string;
  readonly labels: readonly string[];
  readonly phrase: (value: string) => string;
}

interface ContextMatch extends LeadApproachContext {
  readonly phrase: string;
  readonly type: "business" | "sector";
}

const reportContextDefinitions: readonly ContextDefinition[] = [
  {
    basis: "Problema identificado no relatório",
    labels: ["problema identificado", "problema principal", "problema"],
    phrase: (value) => `um desafio específico: ${value}`,
  },
  {
    basis: "Desafio identificado no relatório",
    labels: ["desafio identificado", "desafio principal", "desafio"],
    phrase: (value) => `um desafio específico: ${value}`,
  },
  {
    basis: "Gargalo identificado no relatório",
    labels: ["gargalo operacional", "gargalo"],
    phrase: (value) => `um gargalo relevante: ${value}`,
  },
  {
    basis: "Dor identificada no relatório",
    labels: ["dor identificada", "dor"],
    phrase: (value) => `uma questão relevante: ${value}`,
  },
  {
    basis: "Necessidade identificada no relatório",
    labels: ["necessidade identificada", "necessidade"],
    phrase: (value) => `uma necessidade específica: ${value}`,
  },
  {
    basis: "Ponto de atenção no relatório",
    labels: ["ponto de atencao"],
    phrase: (value) => `um ponto de atenção: ${value}`,
  },
  {
    basis: "Oportunidade identificada no relatório",
    labels: ["oportunidade identificada", "oportunidade"],
    phrase: (value) => `uma oportunidade relevante: ${value}`,
  },
  {
    basis: "Diferencial identificado no relatório",
    labels: ["diferencial identificado", "diferencial"],
    phrase: (value) => `um diferencial da empresa: ${value}`,
  },
  {
    basis: "Ativo estratégico identificado no relatório",
    labels: ["ativo estrategico"],
    phrase: (value) => `um ativo estratégico: ${value}`,
  },
  {
    basis: "Sinal positivo identificado no relatório",
    labels: ["sinal positivo"],
    phrase: (value) => `um sinal positivo: ${value}`,
  },
  {
    basis: "Contexto descrito no relatório",
    labels: ["contexto", "resumo executivo"],
    phrase: (value) => `um aspecto relevante do contexto: ${value}`,
  },
];

const sectorDefinitions: readonly ContextDefinition[] = [
  {
    basis: "Setor identificado no relatório",
    labels: ["setor detectado", "setor"],
    phrase: (value) => `a atuação no setor de ${lowercaseInitial(value)}`,
  },
  {
    basis: "Segmento identificado no relatório",
    labels: ["segmento"],
    phrase: (value) => `a atuação no segmento de ${lowercaseInitial(value)}`,
  },
  {
    basis: "Mercado identificado no relatório",
    labels: ["mercado"],
    phrase: (value) => `a atuação no mercado de ${lowercaseInitial(value)}`,
  },
];

const internalDecisionPattern =
  /\b(?:prioridade|score|pontua[cç][aã]o|fit\s+estrat[eé]gico|confian[cç]a|valor\s+de\s+pesquisa|prospectar|nutrir|recomenda[cç][aã]o|lead)\b/i;
const researchMetadataPattern =
  /\b(?:a\s+ia|uma\s+ia|intelig[eê]ncia\s+artificial|pesquisa\s+(?:estrat[eé]gica|comercial)|fontes?\s+(?:fracas?|insuficientes?|limitadas?)|hip[oó]tese\s+inicial|reports?\s+premium|relat[oó]rios?\s+premium|validar\s+antes\s+de\s+(?:tratar|usar)|qualidade\s+(?:das?\s+)?fontes?)\b/i;
const reportHeadingPattern =
  /^(?:an[aá]lise\s+estrat[eé]gica|panorama\s+comercial|relat[oó]rio|research\s+report)\b/i;
const unavailableContextValues = new Set([
  "indisponivel",
  "n/a",
  "nao aplicavel",
  "nao disponivel",
  "nao identificado",
  "nao informado",
  "sem informacao",
  "unknown",
]);

export function buildLeadApproachDraft(
  lead: LeadApproachSource,
): LeadApproachDraft | null {
  if (lead.strategicReport.status !== "available") {
    return null;
  }

  const companyName = firstText(
    lead.tradeName,
    lead.companyName,
    lead.legalName,
  );
  if (companyName === null) {
    return null;
  }

  const contexts = findReportContexts(lead.strategicReport.content);
  if (contexts.length === 0) {
    const prose = findSafeReportProse(lead.strategicReport.content);
    if (prose !== null) {
      contexts.push(prose);
    }
  }
  if (contexts.length === 0) {
    contexts.push(
      ...findLabeledContexts(
        lead.strategicReport.content,
        sectorDefinitions,
        1,
        "sector",
      ),
    );
  }
  if (contexts.length === 0) {
    const leadSector = prepareContextValue(lead.sector ?? "");
    if (leadSector !== null) {
      contexts.push({
        basis: "Setor da empresa",
        focus: leadSector,
        phrase: `a atuação no setor de ${lowercaseInitial(leadSector)}`,
        type: "sector",
      });
    }
  }

  if (contexts.length === 0) {
    return buildNeutralDraft(companyName);
  }

  const leadSector = prepareContextValue(lead.sector ?? "");
  const includesSector = contexts.some((context) => context.type === "sector");
  const companyContext =
    leadSector === null || includesSector
      ? `Ao conhecer melhor a ${companyName},`
      : `Ao conhecer melhor a ${companyName}, no contexto de ${lowercaseInitial(leadSector)},`;
  const primary = contexts[0];
  if (primary === undefined) {
    return buildNeutralDraft(companyName);
  }
  const supporting = contexts[1];
  const contextParagraphs = [
    `${companyContext} chamou atenção ${primary.phrase}.`,
  ];
  if (supporting !== undefined) {
    contextParagraphs.push(`Outro ponto relevante é ${supporting.phrase}.`);
  }

  return {
    companyName,
    contexts: contexts.map(({ basis, focus }) => ({ basis, focus })),
    message: [
      "Olá! Tudo bem?",
      ...contextParagraphs,
      supporting === undefined
        ? "Gostaria de entender como esse tema se conecta às prioridades atuais de vocês e, se fizer sentido, trocar ideias sobre caminhos para avançar nessa frente."
        : "Gostaria de entender como esses pontos se conectam às prioridades atuais de vocês e, se fizer sentido, trocar ideias sobre caminhos para avançar nessas frentes.",
      "Faz sentido conversarmos por alguns minutos nos próximos dias?",
    ].join("\n\n"),
  };
}

function buildNeutralDraft(companyName: string): LeadApproachDraft {
  return {
    companyName,
    contexts: [
      {
        basis: "Identidade da empresa",
        focus: "Momento e prioridades atuais",
      },
    ],
    message: [
      "Olá! Tudo bem?",
      `Ao conhecer melhor a ${companyName}, gostaria de compreender melhor o momento atual da empresa e as prioridades para os próximos meses.`,
      "Se fizer sentido, podemos trocar ideias sobre oportunidades alinhadas a esse contexto e identificar uma frente útil para a empresa.",
      "Faz sentido conversarmos por alguns minutos nos próximos dias?",
    ].join("\n\n"),
  };
}

function findReportContexts(content: string): ContextMatch[] {
  return findLabeledContexts(
    content,
    reportContextDefinitions,
    2,
    "business",
  );
}

function findLabeledContexts(
  content: string,
  definitions: readonly ContextDefinition[],
  maximumContexts: number,
  type: ContextMatch["type"],
): ContextMatch[] {
  const fields = parseReportFields(content);
  const contexts: ContextMatch[] = [];

  for (const definition of definitions) {
    for (const label of definition.labels) {
      const field = fields.find((candidate) => candidate.label === label);
      if (
        field === undefined ||
        contexts.some((context) => context.focus === field.value)
      ) {
        continue;
      }

      contexts.push({
        basis: definition.basis,
        focus: field.value,
        phrase: definition.phrase(field.value),
        type,
      });
      if (contexts.length === maximumContexts) {
        return contexts;
      }
    }
  }

  return contexts;
}

function parseReportFields(
  content: string,
): readonly { readonly label: string; readonly value: string }[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0 || separator > 80) {
        return [];
      }

      const value = prepareContextValue(line.slice(separator + 1));
      return value === null
        ? []
        : [{ label: normalizeLabel(line.slice(0, separator)), value }];
    });
}

function findSafeReportProse(content: string): ContextMatch | null {
  for (const line of content.split("\n")) {
    const normalized = prepareContextValue(line);
    if (
      line.includes(":") ||
      normalized === null ||
      normalized.length < 24 ||
      reportHeadingPattern.test(normalized)
    ) {
      continue;
    }

    return {
      basis: "Contexto descrito no relatório",
      focus: normalized,
      phrase: `um aspecto relevante do contexto: ${normalized}`,
      type: "business",
    };
  }

  return null;
}

function firstText(...values: readonly (string | null)[]): string | null {
  for (const value of values) {
    const normalized = normalizeText(value ?? "");
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

function prepareContextValue(value: string): string | null {
  const normalized = normalizeText(value.replace(/_/g, " "))
    .replace(/^[|,;:\-–—\s]+/, "")
    .replace(/[|,;:.!?\-–—\s]+$/, "");

  if (
    normalized.length === 0 ||
    unavailableContextValues.has(normalizeLabel(normalized)) ||
    internalDecisionPattern.test(normalized) ||
    researchMetadataPattern.test(normalized)
  ) {
    return null;
  }

  return truncateAtWord(normalized, 180);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lowercaseInitial(value: string): string {
  return value.length === 0
    ? value
    : `${value[0]?.toLocaleLowerCase("pt-BR")}${value.slice(1)}`;
}

function truncateAtWord(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) {
    return value;
  }

  const candidate = value.slice(0, maximumLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const boundary = lastSpace > maximumLength / 2 ? lastSpace : maximumLength;
  return `${candidate.slice(0, boundary).trimEnd()}…`;
}
