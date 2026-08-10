import "server-only";

import { leadRunIdPattern } from "../../lib/validators/lead-query";
import type { SqlStatement } from "../db/producer-client";
import {
  buildLeadRunVisibilityPredicate,
  type LeadRunVisibilityOptions,
} from "./production-run-predicate";

export const maximumCurrentLeadProjections = 1_000;

export const currentLeadSourceGuardStatement: SqlStatement = {
  text: `SELECT company_validations.cnpj
FROM public.company_validations AS company_validations
LIMIT $1`,
  values: [maximumCurrentLeadProjections + 1],
};

export const currentLeadBaseValues: readonly unknown[] = [
  "OK",
  "^[0-9]{14}$",
  "INSERIDO_VALIDATION",
  "",
  leadRunIdPattern.source,
  1,
];

export const currentLeadDefaultOrderBy =
  "lead.validated_at DESC, lead.projection_id DESC";

export function buildEligibleCurrentLeadsCte(
  options: LeadRunVisibilityOptions,
  correlatedImportBatchIdsParameter?: number,
): string {
  return `WITH current_terminal_candidates AS (
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
    company_validations.cnae_descricao,
    company_validations.trust_score,
    company_validations.priority,
    terminal.final_action,
    company_validations.trust_status,
    company_validations.validated_at,
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
),
eligible_current AS (
  SELECT
    current_terminal_candidates.decision_id,
    current_terminal_candidates.import_batch_id,
    current_terminal_candidates.lead_run_id,
    current_terminal_candidates.source_row,
    current_terminal_candidates.source_hash,
    current_terminal_candidates.agent_version,
    current_terminal_candidates.cnpj_normalizado,
    current_terminal_candidates.nome_fantasia,
    current_terminal_candidates.razao_social,
    current_terminal_candidates.cidade,
    current_terminal_candidates.uf,
    current_terminal_candidates.cnae_descricao,
    current_terminal_candidates.trust_score,
    current_terminal_candidates.priority,
    current_terminal_candidates.final_action,
    current_terminal_candidates.trust_status,
    current_terminal_candidates.validated_at,
    current_terminal_candidates.projection_id
  FROM current_terminal_candidates
  WHERE current_terminal_candidates.terminal_count = $6
)`;
}

export function appendCorrelatedCurrentLeadBatchIds(
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
