import type { LeadDetail } from "../../types/leads";
import {
  mapLeadSummary,
  type LeadSummaryRow,
} from "./lead-summary-mapper";
import {
  mapSensitiveLeadEvidences,
  mapSensitiveLeadInsights,
  mapSensitiveStrategicReport,
  type SensitiveContentAccess,
} from "./lead-sensitive-content";

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
  risk_flags?: unknown;
  positive_signals?: unknown;
  evidences?: unknown;
  strategic_report_markdown?: unknown;
  strategic_report_match_count?: unknown;
  strategic_report_integrity_status?: unknown;
  strategic_report_expires_at?: Date | string | null;
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

export function mapLeadDetail(
  row: LeadDetailRow,
  sensitiveAccess: SensitiveContentAccess = {
    enabled: false,
    allowedUrlHosts: [],
    now: new Date(),
  },
): LeadDetail {
  const summary = mapLeadSummary(row);
  const sourceRow = toNullableInteger(
    row.source_row,
    Number.NEGATIVE_INFINITY,
  );
  const sensitiveInsights = mapSensitiveLeadInsights(
    row.risk_flags,
    row.positive_signals,
    sensitiveAccess,
    row.expires_at,
  );
  const evidences = mapSensitiveLeadEvidences(
    row.evidences,
    sensitiveAccess,
    row.expires_at,
  );
  const strategicReport = mapSensitiveStrategicReport(
    row.strategic_report_markdown,
    row.strategic_report_match_count,
    row.strategic_report_integrity_status,
    sensitiveAccess,
    row.strategic_report_expires_at ?? null,
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
    riskFlags: sensitiveInsights.riskFlags,
    positiveSignals: sensitiveInsights.positiveSignals,
    evidences,
    strategicReport,
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
      ...(evidences.status === "omitted_by_policy"
        ? [
            {
              code: "CONTENT_WITHHELD" as const,
              field: "evidences",
            },
          ]
        : []),
      ...(strategicReport.status === "omitted_by_policy"
        ? [
            {
              code: "CONTENT_WITHHELD" as const,
              field: "strategicReport",
            },
          ]
        : []),
    ],
  };
}
