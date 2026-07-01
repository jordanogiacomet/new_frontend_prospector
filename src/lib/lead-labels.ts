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

const PRIORITY_LABELS: Readonly<Record<string, string>> = {
  B: "Prioridade B",
  C: "Prioridade C",
  E: "Prioridade E",
  R: "Prioridade R",
};

const VERDICT_LABELS: Readonly<Record<string, string>> = {
  REVISAO_HUMANA: "Revisão humana",
};

const TRUST_STATUS_LABELS: Readonly<Record<string, string>> = {
  "Revisão Humana": "Revisão humana",
};

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

  return labels[storedValue] ?? UNKNOWN_DOMAIN_LABEL;
}

export function getLeadActionLabel(storedValue: string | null): string {
  return getDomainLabel(ACTION_LABELS, storedValue);
}

export function getPriorityLabel(storedValue: string | null): string {
  return getDomainLabel(PRIORITY_LABELS, storedValue);
}

export function getVerdictLabel(storedValue: string | null): string {
  return getDomainLabel(VERDICT_LABELS, storedValue);
}

export function getTrustStatusLabel(storedValue: string | null): string {
  return getDomainLabel(TRUST_STATUS_LABELS, storedValue);
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
