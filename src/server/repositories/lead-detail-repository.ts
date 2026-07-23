import "server-only";

import { leadRunIdPattern } from "../../lib/validators/lead-query";
import type { LeadDetail } from "../../types/leads";
import {
  query as databaseQuery,
  type SqlStatement,
} from "../db/producer-client";
import {
  mapLeadDetail,
  type LeadDetailRow,
} from "../mappers/lead-detail-mapper";
import type { SensitiveContentAccess } from "../mappers/lead-sensitive-content";
import {
  buildLeadRunVisibilityPredicate,
  type LeadRunVisibilityOptions,
} from "./production-run-predicate";

const baseValues: readonly unknown[] = [
  "OK",
  "^[0-9]{14}$",
  "INSERIDO_VALIDATION",
  "",
  leadRunIdPattern.source,
  1,
];

function buildDetailStatement(
  cnpj: string,
  leadRunId?: string,
  includeSensitiveContent = false,
  options: LeadRunVisibilityOptions = {},
): SqlStatement {
  const values: unknown[] = [...baseValues, cnpj];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedImportBatchIds(values, options);
  const strategicReportCte = includeSensitiveContent
    ? `,
report_detail AS (
  SELECT
    eligible_detail.*,
    strategic_report.strategic_report_match_count,
    strategic_report.strategic_report_markdown,
    strategic_report.strategic_report_integrity_status,
    strategic_report.strategic_report_expires_at
  FROM eligible_detail
  LEFT JOIN LATERAL (
    SELECT
      COUNT(report.lead_run_id)::integer AS strategic_report_match_count,
      CASE
        WHEN COUNT(report.lead_run_id) = 1
          AND BOOL_AND(report.integrity_status = $1)
          THEN MAX(report.report_markdown)
        ELSE NULL
      END AS strategic_report_markdown,
      CASE
        WHEN COUNT(report.lead_run_id) = 1
          THEN MAX(report.integrity_status)
        ELSE NULL
      END AS strategic_report_integrity_status,
      CASE
        WHEN COUNT(report.lead_run_id) = 1
          THEN MAX(report.expires_at)
        ELSE NULL
      END AS strategic_report_expires_at
    FROM public.company_strategic_research_reports AS report
    WHERE report.lead_run_id = eligible_detail.lead_run_id
      AND report.cnpj = eligible_detail.cnpj_normalizado
  ) AS strategic_report ON TRUE
)`
    : "";
  const detailSource = includeSensitiveContent
    ? "report_detail"
    : "eligible_detail";
  const exactRunClause =
    leadRunId === undefined
      ? ""
      : `\n    AND terminal.lead_run_id = $${values.push(leadRunId)}`;

  return {
    text: `WITH detail_candidates AS (
  SELECT
    terminal.id::text AS decision_id,
    terminal.import_batch_id,
    terminal.lead_run_id,
    terminal.source_row,
    company_validations.source_hash,
    company_validations.agent_version,
    company_validations.cnpj_normalizado,
    company_validations.nome_fantasia,
    company_validations.razao_social,
    company_validations.cidade,
    company_validations.uf,
    company_validations.cnae_principal,
    company_validations.cnae_descricao,
    company_validations.porte_empresa,
    company_validations.regime_tributario,
    company_validations.faturamento_estimado,
    company_validations.quadro_funcionarios,
    company_validations.quantidade_filiais,
    company_validations.trust_score,
    company_validations.trust_verdict,
    company_validations.trust_status,
    company_validations.priority,
    terminal.final_action,
    terminal.reason,
    company_validations.icp_score,
    company_validations.strategic_asset_score,
    company_validations.strategic_tier,
    terminal.idempotency_key,
    company_validations.used_cache,
    company_validations.validated_at,
    company_validations.created_at,
    company_validations.updated_at,
    company_validations.expires_at,
    ${includeSensitiveContent ? "company_validations.risk_flags," : ""}
    ${includeSensitiveContent ? "company_validations.positive_signals," : ""}
    ${includeSensitiveContent ? "company_validations.evidences," : ""}
    company_validations.id AS projection_id,
    COUNT(*) OVER (
      PARTITION BY company_validations.id
    ) AS terminal_count
  FROM public.company_validations AS company_validations
  INNER JOIN public.company_validation_runs AS terminal
    ON terminal.lead_run_id = company_validations.last_lead_run_id
  WHERE company_validations.integrity_status = $1
    AND company_validations.cnpj_normalizado ~ $2
    AND company_validations.cnpj::text = company_validations.cnpj_normalizado
    AND BTRIM(company_validations.last_lead_run_id) <> $4
    AND BTRIM(company_validations.agent_version) <> $4
    AND company_validations.validated_at <= CURRENT_TIMESTAMP
    AND terminal.integrity_status = $1
    AND terminal.processing_result = $3
    AND ${buildLeadRunVisibilityPredicate("terminal", {
      includeDemo2TestRuns: options.includeDemo2TestRuns,
      correlatedImportBatchIdsParameter,
    })}
    AND terminal.lead_run_id ~ $5
    AND terminal.cnpj_normalizado = company_validations.cnpj_normalizado
    AND terminal.import_batch_id IS NOT DISTINCT FROM company_validations.last_import_batch_id
    AND terminal.source_row IS NOT DISTINCT FROM company_validations.last_source_row
    AND BTRIM(terminal.final_action) <> $4
    AND terminal.run_created_at <= CURRENT_TIMESTAMP
    AND company_validations.cnpj_normalizado = $7${exactRunClause}
),
eligible_detail AS (
  SELECT *
  FROM detail_candidates
  WHERE detail_candidates.terminal_count = $6
)
${strategicReportCte}
SELECT
  detail.decision_id,
  detail.import_batch_id,
  detail.lead_run_id,
  detail.source_row,
  detail.source_hash,
  detail.agent_version,
  detail.cnpj_normalizado,
  detail.nome_fantasia,
  detail.razao_social,
  detail.cidade,
  detail.uf,
  detail.cnae_principal,
  detail.cnae_descricao,
  detail.porte_empresa,
  detail.regime_tributario,
  detail.faturamento_estimado,
  detail.quadro_funcionarios,
  detail.quantidade_filiais,
  detail.trust_score,
  detail.trust_verdict,
  detail.trust_status,
  detail.priority,
  detail.final_action,
  detail.reason,
  detail.icp_score,
  detail.strategic_asset_score,
  detail.strategic_tier,
  detail.idempotency_key,
  detail.used_cache,
  detail.validated_at,
  detail.created_at,
  detail.updated_at,
  detail.expires_at${includeSensitiveContent ? ",\n  detail.risk_flags,\n  detail.positive_signals,\n  detail.evidences,\n  detail.strategic_report_match_count,\n  detail.strategic_report_markdown,\n  detail.strategic_report_integrity_status,\n  detail.strategic_report_expires_at" : ""}
FROM ${detailSource} AS detail
ORDER BY detail.validated_at DESC, detail.projection_id DESC
LIMIT 1`,
    values,
  };
}

export async function getLeadDetail(
  cnpj: string,
  leadRunId?: string,
  sensitiveAccess: SensitiveContentAccess = {
    enabled: false,
    allowedUrlHosts: [],
    now: new Date(),
  },
  options: LeadRunVisibilityOptions = {},
): Promise<LeadDetail | null> {
  const [row] = await databaseQuery<LeadDetailRow>(
    buildDetailStatement(
      cnpj,
      leadRunId,
      sensitiveAccess.enabled,
      options,
    ),
  );

  return row ? mapLeadDetail(row, sensitiveAccess) : null;
}

function appendCorrelatedImportBatchIds(
  values: unknown[],
  options: LeadRunVisibilityOptions,
): number | undefined {
  const importBatchIds = options.includeTestRunsFromImportBatchIds;

  if (
    options.includeDemo2TestRuns ||
    importBatchIds === undefined ||
    importBatchIds.length === 0
  ) {
    return undefined;
  }

  values.push(importBatchIds);
  return values.length;
}
