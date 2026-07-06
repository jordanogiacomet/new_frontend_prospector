import "server-only";

import {
  leadRunIdPattern,
  type LeadListQuery,
} from "../../lib/validators/lead-query";
import type { LeadSummary } from "../../types/leads";
import { SafeApiError } from "../api/errors";
import {
  query as databaseQuery,
  type SqlStatement,
} from "../db/producer-client";
import {
  mapLeadSummary,
  type LeadSummaryRow,
} from "../mappers/lead-summary-mapper";
import { buildProductionRunPredicate } from "./production-run-predicate";

const maximumCurrentProjections = 20;
const sourceGuardLimit = maximumCurrentProjections + 1;

const sourceGuardStatement: SqlStatement = {
  text: `SELECT company_validations.cnpj
FROM public.company_validations AS company_validations
LIMIT $1`,
  values: [sourceGuardLimit],
};

const eligibleCurrentCte = `WITH current_terminal_candidates AS (
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
    AND ${buildProductionRunPredicate("terminal")}
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

const baseValues: readonly unknown[] = [
  "OK",
  "^[0-9]{14}$",
  "INSERIDO_VALIDATION",
  "",
  leadRunIdPattern.source,
  1,
];

interface SourceGuardRow {
  cnpj: string;
}

interface LeadCountRow {
  total: number;
}

export interface LeadListResult {
  readonly leads: LeadSummary[];
  readonly total: number;
}

interface FilterStatements {
  readonly clause: string;
  readonly values: readonly unknown[];
}

function buildFilters(input: LeadListQuery): FilterStatements {
  const conditions: string[] = [];
  const values: unknown[] = [...baseValues];

  if (input.cnpj !== undefined) {
    values.push(input.cnpj);
    conditions.push(`lead.cnpj_normalizado = $${values.length}`);
  }

  if (input.uf !== undefined) {
    values.push(input.uf);
    conditions.push(`lead.uf = $${values.length}`);
  }

  if (input.priority !== undefined) {
    values.push(input.priority);
    conditions.push(`lead.priority = $${values.length}`);
  }

  return {
    clause:
      conditions.length === 0
        ? ""
        : `\nWHERE ${conditions.join("\n  AND ")}`,
    values,
  };
}

function buildCountStatement(filters: FilterStatements): SqlStatement {
  return {
    text: `${eligibleCurrentCte}
SELECT COUNT(*)::integer AS total
FROM eligible_current AS lead${filters.clause}`,
    values: filters.values,
  };
}

function buildDataStatement(
  filters: FilterStatements,
  input: LeadListQuery,
): SqlStatement {
  const values = [...filters.values, input.pageSize];
  const limitParameter = `$${values.length}`;
  values.push((input.page - 1) * input.pageSize);
  const offsetParameter = `$${values.length}`;

  return {
    text: `${eligibleCurrentCte}
SELECT
  lead.decision_id,
  lead.import_batch_id,
  lead.lead_run_id,
  lead.source_row,
  lead.source_hash,
  lead.agent_version,
  lead.cnpj_normalizado,
  lead.nome_fantasia,
  lead.razao_social,
  lead.cidade,
  lead.uf,
  lead.cnae_descricao,
  lead.trust_score,
  lead.priority,
  lead.final_action,
  lead.trust_status,
  lead.validated_at
FROM eligible_current AS lead${filters.clause}
ORDER BY lead.validated_at DESC, lead.projection_id DESC
LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
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

export async function listLeads(
  input: LeadListQuery,
): Promise<LeadListResult> {
  const sourceRows = await databaseQuery<SourceGuardRow>(sourceGuardStatement);

  if (sourceRows.length > maximumCurrentProjections) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const filters = buildFilters(input);
  const [countRow] = await databaseQuery<LeadCountRow>(
    buildCountStatement(filters),
  );

  if (!countRow || !isValidTotal(countRow.total)) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const rows = await databaseQuery<LeadSummaryRow>(
    buildDataStatement(filters, input),
  );

  return {
    leads: rows.map(mapLeadSummary),
    total: countRow.total,
  };
}
