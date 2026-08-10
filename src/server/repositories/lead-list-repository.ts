import "server-only";

import type { LeadListQuery } from "../../lib/validators/lead-query";
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
import {
  appendCorrelatedCurrentLeadBatchIds,
  buildEligibleCurrentLeadsCte,
  currentLeadBaseValues,
  currentLeadDefaultOrderBy,
  currentLeadSourceGuardStatement,
  maximumCurrentLeadProjections,
} from "./current-lead-query";
import type { LeadRunVisibilityOptions } from "./production-run-predicate";

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

export type LeadListOptions = LeadRunVisibilityOptions;

interface FilterStatements {
  readonly clause: string;
  readonly values: readonly unknown[];
}

function buildFilters(input: LeadListQuery): FilterStatements {
  const conditions: string[] = [];
  const values: unknown[] = [...currentLeadBaseValues];

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

function buildCountStatement(
  filters: FilterStatements,
  options: LeadListOptions,
): SqlStatement {
  const values = [...filters.values];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedCurrentLeadBatchIds(values, options);

  return {
    text: `${buildEligibleCurrentLeadsCte(
      options,
      correlatedImportBatchIdsParameter,
    )}
SELECT COUNT(*)::integer AS total
FROM eligible_current AS lead${filters.clause}`,
    values,
  };
}

function buildDataStatement(
  filters: FilterStatements,
  input: LeadListQuery,
  options: LeadListOptions,
): SqlStatement {
  const values = [...filters.values];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedCurrentLeadBatchIds(values, options);
  values.push(input.pageSize);
  const limitParameter = `$${values.length}`;
  values.push((input.page - 1) * input.pageSize);
  const offsetParameter = `$${values.length}`;

  return {
    text: `${buildEligibleCurrentLeadsCte(
      options,
      correlatedImportBatchIdsParameter,
    )}
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
ORDER BY ${currentLeadDefaultOrderBy}
LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
    values,
  };
}

function isValidTotal(total: unknown): total is number {
  return (
    typeof total === "number" &&
    Number.isSafeInteger(total) &&
    total >= 0 &&
    total <= maximumCurrentLeadProjections
  );
}

export async function listLeads(
  input: LeadListQuery,
  options: LeadListOptions = {},
): Promise<LeadListResult> {
  const sourceRows = await databaseQuery<SourceGuardRow>(
    currentLeadSourceGuardStatement,
  );

  if (sourceRows.length > maximumCurrentLeadProjections) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const filters = buildFilters(input);
  const [countRow] = await databaseQuery<LeadCountRow>(
    buildCountStatement(filters, options),
  );

  if (!countRow || !isValidTotal(countRow.total)) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const rows = await databaseQuery<LeadSummaryRow>(
    buildDataStatement(filters, input, options),
  );

  return {
    leads: rows.map(mapLeadSummary),
    total: countRow.total,
  };
}
