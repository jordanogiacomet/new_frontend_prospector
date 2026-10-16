import "server-only";

import {
  leadRunIdPattern,
  type OutsideAnalysisQuery,
} from "../../lib/validators/lead-query";
import type { OutsideAnalysisCompany } from "../../types/leads";
import { SafeApiError } from "../api/errors";
import {
  query as databaseQuery,
  type SqlStatement,
} from "../db/producer-client";
import {
  mapOutsideAnalysisCompany,
  type OutsideAnalysisCompanyRow,
} from "../mappers/outside-analysis-mapper";
import {
  buildLeadRunVisibilityPredicate,
  type LeadRunVisibilityOptions,
} from "./production-run-predicate";

const maximumCurrentProjections = 1_000;
const sourceGuardLimit = maximumCurrentProjections + 1;

const sourceGuardStatement: SqlStatement = {
  text: `SELECT company_validations.cnpj
  FROM public.company_validations AS company_validations
  LIMIT $1`,
  values: [sourceGuardLimit],
};

const baseValues: readonly unknown[] = [
  "OK",
  "^[0-9]{14}$",
  "CRM_DECIDIU_E_SALVO",
  "",
  leadRunIdPattern.source,
  1,
];

interface SourceGuardRow {
  cnpj: string;
}

interface OutsideAnalysisCountRow {
  total: number;
}

export interface OutsideAnalysisResult {
  readonly companies: OutsideAnalysisCompany[];
  readonly total: number;
}

export type OutsideAnalysisOptions = LeadRunVisibilityOptions;

function buildEligibleCurrentCrmCte(
  options: OutsideAnalysisOptions,
  correlatedImportBatchIdsParameter?: number,
): string {
  return `WITH current_crm_candidates AS (
  SELECT
    terminal.import_batch_id,
    terminal.source_row,
    company_validations.cnpj_normalizado,
    company_validations.nome_fantasia,
    company_validations.razao_social,
    company_validations.cidade,
    company_validations.uf,
    company_validations.cnae_descricao,
    terminal.final_action,
    terminal.reason,
    terminal.run_created_at AS decided_at,
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
eligible_current_crm AS (
  SELECT
    current_crm_candidates.import_batch_id,
    current_crm_candidates.source_row,
    current_crm_candidates.cnpj_normalizado,
    current_crm_candidates.nome_fantasia,
    current_crm_candidates.razao_social,
    current_crm_candidates.cidade,
    current_crm_candidates.uf,
    current_crm_candidates.cnae_descricao,
    current_crm_candidates.final_action,
    current_crm_candidates.reason,
    current_crm_candidates.decided_at,
    current_crm_candidates.projection_id
  FROM current_crm_candidates
  WHERE current_crm_candidates.terminal_count = $6
)`;
}

function appendCorrelatedImportBatchIds(
  values: unknown[],
  options: OutsideAnalysisOptions,
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

function buildCountStatement(
  options: OutsideAnalysisOptions,
): SqlStatement {
  const values = [...baseValues];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedImportBatchIds(values, options);

  return {
    text: `${buildEligibleCurrentCrmCte(
      options,
      correlatedImportBatchIdsParameter,
    )}
SELECT COUNT(*)::integer AS total
FROM eligible_current_crm`,
    values,
  };
}

function buildDataStatement(
  input: OutsideAnalysisQuery,
  options: OutsideAnalysisOptions,
): SqlStatement {
  const values = [...baseValues];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedImportBatchIds(values, options);
  values.push(input.pageSize);
  const limitParameter = `$${values.length}`;
  values.push((input.page - 1) * input.pageSize);
  const offsetParameter = `$${values.length}`;

  return {
    text: `${buildEligibleCurrentCrmCte(
      options,
      correlatedImportBatchIdsParameter,
    )}
SELECT
  lead.import_batch_id,
  lead.source_row,
  lead.cnpj_normalizado,
  lead.nome_fantasia,
  lead.razao_social,
  lead.cidade,
  lead.uf,
  lead.cnae_descricao,
  lead.final_action,
  lead.reason,
  lead.decided_at
FROM eligible_current_crm AS lead
ORDER BY lead.decided_at DESC, lead.projection_id DESC
LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
    values,
  };
}

function buildDetailStatement(
  cnpj: string,
  options: OutsideAnalysisOptions,
): SqlStatement {
  const values = [...baseValues];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedImportBatchIds(values, options);
  values.push(cnpj);
  const cnpjParameter = `$${values.length}`;

  return {
    text: `${buildEligibleCurrentCrmCte(
      options,
      correlatedImportBatchIdsParameter,
    )}
SELECT
  lead.import_batch_id,
  lead.source_row,
  lead.cnpj_normalizado,
  lead.nome_fantasia,
  lead.razao_social,
  lead.cidade,
  lead.uf,
  lead.cnae_descricao,
  lead.final_action,
  lead.reason,
  lead.decided_at
FROM eligible_current_crm AS lead
WHERE lead.cnpj_normalizado = ${cnpjParameter}
LIMIT 2`,
    values,
  };
}

function isValidTotal(total: unknown): total is number {
  return (
    typeof total === "number" &&
    Number.isSafeInteger(total) &&
    total >= 0 &&
    total <= maximumCurrentProjections
  );
}

export async function listOutsideAnalysisCompanies(
  input: OutsideAnalysisQuery,
  options: OutsideAnalysisOptions = {},
): Promise<OutsideAnalysisResult> {
  const sourceRows = await databaseQuery<SourceGuardRow>(sourceGuardStatement);

  if (sourceRows.length > maximumCurrentProjections) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const [countRow] = await databaseQuery<OutsideAnalysisCountRow>(
    buildCountStatement(options),
  );

  if (!countRow || !isValidTotal(countRow.total)) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const rows = await databaseQuery<OutsideAnalysisCompanyRow>(
    buildDataStatement(input, options),
  );

  return {
    companies: rows.map(mapOutsideAnalysisCompany),
    total: countRow.total,
  };
}

export async function getOutsideAnalysisCompany(
  cnpj: string,
  options: OutsideAnalysisOptions = {},
): Promise<OutsideAnalysisCompany | null> {
  const sourceRows = await databaseQuery<SourceGuardRow>(sourceGuardStatement);

  if (sourceRows.length > maximumCurrentProjections) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const rows = await databaseQuery<OutsideAnalysisCompanyRow>(
    buildDetailStatement(cnpj, options),
  );

  if (rows.length === 0) {
    return null;
  }

  if (rows.length !== 1) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  return mapOutsideAnalysisCompany(rows[0]);
}
