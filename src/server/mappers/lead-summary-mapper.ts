import { deriveConfidenceIndicator } from "../../lib/lead-labels";
import type { LeadSummary } from "../../types/leads";

export interface LeadSummaryRow {
  decision_id: string;
  import_batch_id: string | null;
  lead_run_id: string;
  source_row: number | null;
  source_hash: string | null;
  agent_version: string;
  cnpj_normalizado: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  cidade: string | null;
  uf: string | null;
  cnae_descricao: string | null;
  trust_score: number | null;
  priority: string | null;
  final_action: string | null;
  trust_status: string | null;
  validated_at: Date | string;
}

function toNullableText(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNullableScore(value: number | null): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function mapLeadSummary(row: LeadSummaryRow): LeadSummary {
  const trustStatus = toNullableText(row.trust_status);

  return {
    decision_id: row.decision_id,
    import_batch_id: row.import_batch_id,
    lead_run_id: row.lead_run_id,
    source_row: row.source_row,
    source_hash: row.source_hash,
    agent_version: row.agent_version,
    cnpj: row.cnpj_normalizado,
    companyName:
      toNullableText(row.nome_fantasia) ??
      toNullableText(row.razao_social),
    city: toNullableText(row.cidade),
    uf: toNullableText(row.uf),
    sector: toNullableText(row.cnae_descricao),
    score: toNullableScore(row.trust_score),
    priority: toNullableText(row.priority),
    recommendedAction: toNullableText(row.final_action),
    trustStatus,
    confidenceIndicator: deriveConfidenceIndicator(trustStatus),
    lastAnalysisAt: toIsoString(row.validated_at),
  };
}
