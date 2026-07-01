import type { LeadDetail } from "../../types/leads";
import {
  mapLeadSummary,
  type LeadSummaryRow,
} from "./lead-summary-mapper";

export interface LeadDetailRow extends LeadSummaryRow {
  cnae_principal: string | null;
  porte_empresa: string | null;
  regime_tributario: string | null;
  faturamento_estimado: string | null;
  quadro_funcionarios: string | null;
  quantidade_filiais: number | null;
  trust_verdict: string | null;
  reason: string | null;
  icp_score: number | null;
  strategic_asset_score: number | null;
  strategic_tier: string | null;
  idempotency_key: string | null;
  used_cache: boolean | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  expires_at: Date | string | null;
}

function toNullableText(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNullableInteger(
  value: number | null,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function toNullableScore(value: number | null): number | null {
  return toNullableInteger(value, 0, 100);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toNullableIsoString(
  value: Date | string | null,
): string | null {
  return value === null ? null : toIsoString(value);
}

export function mapLeadDetail(row: LeadDetailRow): LeadDetail {
  const summary = mapLeadSummary(row);
  const sourceRow = toNullableInteger(
    row.source_row,
    Number.NEGATIVE_INFINITY,
  );

  return {
    ...summary,
    source_row: sourceRow,
    score: toNullableScore(row.trust_score),
    legalName: toNullableText(row.razao_social),
    tradeName: toNullableText(row.nome_fantasia),
    primaryCnae: toNullableText(row.cnae_principal),
    primaryCnaeDescription: toNullableText(row.cnae_descricao),
    companySize: toNullableText(row.porte_empresa),
    taxRegime: toNullableText(row.regime_tributario),
    estimatedRevenue: toNullableText(row.faturamento_estimado),
    employeeCount: toNullableText(row.quadro_funcionarios),
    branchCount: toNullableInteger(row.quantidade_filiais, 0),
    finalVerdict: toNullableText(row.trust_verdict),
    recommendedActionReason: toNullableText(row.reason),
    icpScore: toNullableScore(row.icp_score),
    strategicAssetScore: toNullableScore(row.strategic_asset_score),
    strategicTier: toNullableText(row.strategic_tier),
    riskFlags: {
      status: "unavailable",
      items: null,
    },
    positiveSignals: {
      status: "unavailable",
      items: null,
    },
    evidences: {
      status: "omitted_by_policy",
      content: null,
    },
    strategicReport: {
      status: "omitted_by_policy",
      content: null,
    },
    audit: {
      decision_id: row.decision_id,
      import_batch_id: row.import_batch_id,
      lead_run_id: row.lead_run_id,
      source_row: sourceRow,
      source_hash: row.source_hash,
      agent_version: row.agent_version,
      idempotency_key: row.idempotency_key,
      used_cache: row.used_cache,
      validated_at: toIsoString(row.validated_at),
      created_at: toIsoString(row.created_at),
      updated_at: toNullableIsoString(row.updated_at),
      expires_at: toNullableIsoString(row.expires_at),
    },
    dataQuality: [
      {
        code: "CONTENT_WITHHELD",
        field: "evidences",
      },
      {
        code: "CONTENT_WITHHELD",
        field: "strategicReport",
      },
    ],
  };
}
