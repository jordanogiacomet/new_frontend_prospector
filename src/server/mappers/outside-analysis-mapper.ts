import type { OutsideAnalysisCompany } from "../../types/leads";

export interface OutsideAnalysisCompanyRow {
  import_batch_id: string | null;
  source_row: number | null;
  cnpj_normalizado: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  cidade: string | null;
  uf: string | null;
  cnae_descricao: string | null;
  final_action: string | null;
  reason: string | null;
  decided_at: Date | string;
}

function toNullableText(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function mapOutsideAnalysisCompany(
  row: OutsideAnalysisCompanyRow,
): OutsideAnalysisCompany {
  return {
    import_batch_id: row.import_batch_id,
    source_row: row.source_row,
    cnpj: row.cnpj_normalizado,
    companyName:
      toNullableText(row.nome_fantasia) ??
      toNullableText(row.razao_social),
    city: toNullableText(row.cidade),
    uf: toNullableText(row.uf),
    sector: toNullableText(row.cnae_descricao),
    decidedAction: toNullableText(row.final_action),
    decisionReason: toNullableText(row.reason),
    decidedAt: toIsoString(row.decided_at),
  };
}
