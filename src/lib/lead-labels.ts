import type { LeadConfidenceIndicator } from "@/types/leads";

import { UNAVAILABLE_LABEL } from "./formatters";

export const UNKNOWN_DOMAIN_LABEL = "Não mapeado";

const ACTION_LABELS: Readonly<Record<string, string>> = {
  PROSPECTAR: "Prospectar",
  PROSPECTAR_COM_CAUTELA: "Prospectar com cautela",
  NUTRIR: "Nutrir",
  NAO_ABORDAR: "Não abordar",
  REVISAO_HUMANA: "Revisão humana",
};

interface LeadCommercialAssessment {
  readonly conclusion: string;
  readonly guidance: string;
  readonly emphasis: "proceed" | "review" | "hold" | "decline" | "unavailable";
}

const COMMERCIAL_ASSESSMENTS: Readonly<Record<string, LeadCommercialAssessment>> = {
  PROSPECTAR: {
    conclusion: "Prospecção recomendada",
    guidance: "A análise registrada recomenda prospectar esta empresa. Revise o motivo e os fundamentos para definir sua abordagem comercial.",
    emphasis: "proceed",
  },
  PROSPECTAR_COM_CAUTELA: {
    conclusion: "Prospecção recomendada com cautela",
    guidance: "A análise registrada recomenda prospectar com cautela. Revise os pontos de atenção antes de avançar com a abordagem comercial.",
    emphasis: "review",
  },
  NUTRIR: {
    conclusion: "Manter em acompanhamento",
    guidance: "A análise registrada recomenda acompanhar esta empresa. Use o contexto registrado para decidir quando reavaliar a oportunidade.",
    emphasis: "hold",
  },
  NAO_ABORDAR: {
    conclusion: "Prospecção não recomendada",
    guidance: "A análise registrada orienta não abordar esta empresa. Revise o motivo registrado antes de considerar uma iniciativa comercial.",
    emphasis: "decline",
  },
  REVISAO_HUMANA: {
    conclusion: "Revisão comercial necessária",
    guidance: "A análise registrada solicita revisão humana. Confira o motivo, os riscos e as evidências disponíveis antes de decidir se deve prospectar esta empresa.",
    emphasis: "review",
  },
};

const PRIORITY_LABELS: Readonly<Record<string, string>> = {
  B: "Prioridade B",
  C: "Prioridade C",
  D: "Prioridade D",
  E: "Prioridade E",
  R: "Prioridade R",
};

const VERDICT_LABELS: Readonly<Record<string, string>> = {
  REVISAO_HUMANA: "Revisão humana",
};

const RISK_FLAG_LABELS: Readonly<Record<string, string>> = {
  SEM_SITE: "O site da empresa não foi localizado nos dados analisados.",
  SEM_EMAIL:
    "O e-mail corporativo não foi localizado nos dados analisados.",
  SEM_TELEFONE:
    "O telefone da empresa não foi localizado nos dados analisados.",
  DIVIDA_FEDERAL_ATIVA_INFORMADA:
    "A análise informa a existência de dívida ativa federal.",
};

const DECISION_REASON_WORD_LABELS: Readonly<Record<string, string>> = {
  ACAO: "ação",
  ANALISE: "análise",
  API: "API",
  CNPJ: "CNPJ",
  CODIGO: "código",
  CONFIRMACAO: "confirmação",
  CPF: "CPF",
  CRM: "CRM",
  DECISAO: "decisão",
  DIVIDA: "dívida",
  EVIDENCIA: "evidência",
  HISTORICO: "histórico",
  ICP: "ICP",
  INFORMACAO: "informação",
  LGPD: "LGPD",
  LLM: "LLM",
  NAO: "não",
  PUBLICA: "pública",
  RAZAO: "razão",
  RECOMENDACAO: "recomendação",
  RESTRICAO: "restrição",
  REVISAO: "revisão",
  SITUACAO: "situação",
  URL: "URL",
  USD: "USD",
  VALIDACAO: "validação",
};

const DECISION_REASON_TERM_PATTERN =
  /\p{Lu}[\p{Lu}\p{N}]*(?:_[\p{Lu}\p{N}]+)+/gu;

const TECHNICAL_CRM_REVIEW_REASON_PATTERN =
  /^Histórico CRM encontrado,\s*mas match não encerrou a validação pública:\s*(?:Reengajar com histórico|Enriquecer e reabordar com contexto)\.\s*(?:Dívida ativa indicada no cadastro sem confirmação pública aceita;\s*)?revisão humana obrigatória\.?$/iu;

const UNCONFIRMED_DEBT_REASON_PATTERN =
  /Dívida ativa indicada no cadastro sem confirmação pública aceita/iu;

const TRUST_STATUS_CATEGORY_LABELS = [
  { prefix: "Aprovada", label: "Aprovada" },
  { prefix: "Nutrir", label: "Nutrir" },
  { prefix: "Não Abordar", label: "Não abordar" },
  { prefix: "Revisão Humana", label: "Revisão humana" },
] as const;

const APPROVED_LOW_CONFIDENCE_TRUST_STATUSES: ReadonlySet<string> = new Set();

const CONFIDENCE_LABELS: Readonly<
  Record<LeadConfidenceIndicator, string>
> = {
  normal: "Confiança normal",
  low: "Baixa confiança",
  unknown: "Confiança não mapeada",
};

function getDomainLabel(
  labels: Readonly<Record<string, string>>,
  storedValue: string | null,
): string {
  if (typeof storedValue !== "string") {
    return UNAVAILABLE_LABEL;
  }

  return Object.hasOwn(labels, storedValue) ? labels[storedValue] : UNKNOWN_DOMAIN_LABEL;
}

export function getLeadActionLabel(storedValue: string | null): string {
  return getDomainLabel(ACTION_LABELS, storedValue);
}

export function getLeadCommercialAssessment(storedAction: string | null): LeadCommercialAssessment {
  return (storedAction !== null && Object.hasOwn(COMMERCIAL_ASSESSMENTS, storedAction)
    ? COMMERCIAL_ASSESSMENTS[storedAction] : undefined) ?? {
    conclusion: "Recomendação indisponível",
    guidance: "Não foi possível apresentar uma ação comercial para esta análise. A pontuação e a prioridade, isoladamente, não definem se deve prospectar.",
    emphasis: "unavailable",
  };
}

export function getPriorityLabel(storedValue: string | null): string {
  return getDomainLabel(PRIORITY_LABELS, storedValue);
}

export function getVerdictLabel(storedValue: string | null): string {
  return getDomainLabel(VERDICT_LABELS, storedValue);
}

export function getRiskFlagLabel(storedValue: string): string {
  return RISK_FLAG_LABELS[storedValue] ?? storedValue;
}

export function formatDecisionReason(storedValue: string | null): string {
  if (typeof storedValue !== "string") {
    return UNAVAILABLE_LABEL;
  }

  const readableReason = storedValue.replace(
    DECISION_REASON_TERM_PATTERN,
    (term) => {
      const readableTerm = term
        .split("_")
        .map(
          (word) =>
            DECISION_REASON_WORD_LABELS[word] ??
            word.toLocaleLowerCase("pt-BR"),
        )
        .join(" ");

      return `${readableTerm.charAt(0).toLocaleUpperCase("pt-BR")}${readableTerm.slice(1)}`;
    },
  );

  if (TECHNICAL_CRM_REVIEW_REASON_PATTERN.test(readableReason)) {
    const debtContext = UNCONFIRMED_DEBT_REASON_PATTERN.test(readableReason)
      ? " Há também uma indicação não confirmada de dívida ativa."
      : "";

    return `Esta empresa já possui histórico no CRM, mas os dados públicos ainda precisam ser confirmados.${debtContext} Revise essas informações antes de retomar o contato.`;
  }

  return readableReason;
}

export function getTrustStatusLabel(storedValue: string | null): string {
  if (typeof storedValue !== "string") {
    return UNAVAILABLE_LABEL;
  }

  const category = TRUST_STATUS_CATEGORY_LABELS.find(
    ({ prefix }) =>
      storedValue === prefix || storedValue.startsWith(`${prefix} `),
  );

  return category?.label ?? UNKNOWN_DOMAIN_LABEL;
}

export function deriveConfidenceIndicator(
  storedTrustStatus: string | null,
): LeadConfidenceIndicator {
  if (
    typeof storedTrustStatus === "string" &&
    APPROVED_LOW_CONFIDENCE_TRUST_STATUSES.has(storedTrustStatus)
  ) {
    return "low";
  }

  return "unknown";
}

export function getConfidenceLabel(storedTrustStatus: string | null): string {
  return CONFIDENCE_LABELS[deriveConfidenceIndicator(storedTrustStatus)];
}
