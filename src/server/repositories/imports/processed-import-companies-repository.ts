import "server-only";

import { leadRunIdPattern } from "../../../lib/validators/lead-query";
import { SafeApiError } from "../../api/errors";
import { query, type SqlStatement } from "../../db/producer-client";
import {
  appendCorrelatedCurrentLeadBatchIds,
  currentLeadSourceGuardStatement,
  maximumCurrentLeadProjections,
} from "../current-lead-query";
import {
  buildLeadRunVisibilityPredicate,
  type LeadRunVisibilityOptions,
} from "../production-run-predicate";

export interface ListProcessedImportCompaniesInput {
  readonly importBatchId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ProcessedImportCompany {
  readonly source_row: number;
  readonly processedAt: string;
}

export interface ListProcessedImportCompaniesResult {
  readonly companies: readonly ProcessedImportCompany[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export class ProcessedImportCompaniesRepositoryInputError extends Error {
  readonly code = "INVALID_PROCESSED_IMPORT_COMPANIES_INPUT";

  constructor() {
    super("Invalid processed import companies input.");
    this.name = "ProcessedImportCompaniesRepositoryInputError";
  }
}

interface SourceGuardRow {
  readonly cnpj: string;
}

interface CountRow {
  readonly total: number;
}

interface ProcessedCompanyRow {
  readonly source_row: string | number;
  readonly processed_at: Date | string;
}

interface ScopedQuery {
  readonly cte: string;
  readonly values: readonly unknown[];
}

export async function listProcessedImportCompanies(
  input: ListProcessedImportCompaniesInput,
  options: LeadRunVisibilityOptions = {},
): Promise<ListProcessedImportCompaniesResult> {
  validateInput(input);
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const sourceRows = await query<SourceGuardRow>(currentLeadSourceGuardStatement);

  if (sourceRows.length > maximumCurrentLeadProjections) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const scoped = buildScopedQuery(input.importBatchId, options);
  const [count] = await query<CountRow>({
    text: `${scoped.cte}
SELECT COUNT(*)::integer AS total
FROM eligible_results`,
    values: scoped.values,
  });

  if (
    count === undefined || typeof count.total !== "number" ||
    !Number.isSafeInteger(count.total) || count.total < 0 ||
    count.total > maximumCurrentLeadProjections
  ) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const rows = await query<ProcessedCompanyRow>(buildDataStatement(scoped, page, pageSize));

  return {
    companies: rows.map((row) => ({
      source_row: parseSourceRow(row.source_row),
      processedAt: parseProcessedAt(row.processed_at),
    })),
    page,
    pageSize,
    total: count.total,
  };
}

function buildScopedQuery(
  importBatchId: string,
  options: LeadRunVisibilityOptions,
): ScopedQuery {
  const values: unknown[] = [
    "OK",
    "^[0-9]{14}$",
    ["INSERIDO_VALIDATION", "CRM_DECIDIU_E_SALVO"],
    "",
    leadRunIdPattern.source,
    1,
  ];
  const correlatedImportBatchIdsParameter = appendCorrelatedCurrentLeadBatchIds(values, options);
  values.push(importBatchId);
  const batchParameter = `$${values.length}`;

  return {
    cte: `WITH current_terminal_candidates AS (
  SELECT
    terminal.import_batch_id,
    terminal.source_row,
    terminal.run_created_at AS processed_at,
    COUNT(*) OVER (PARTITION BY company_validations.id) AS terminal_count
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
    AND terminal.processing_result = ANY($3::text[])
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
    AND terminal.import_batch_id = ${batchParameter}
    AND terminal.source_row > 0
    AND terminal.source_row <= 9007199254740991
),
current_row_candidates AS (
  SELECT
    import_batch_id,
    source_row,
    processed_at,
    terminal_count,
    COUNT(*) OVER (PARTITION BY import_batch_id, source_row) AS row_result_count
  FROM current_terminal_candidates
),
eligible_results AS (
  SELECT source_row, processed_at
  FROM current_row_candidates
  WHERE terminal_count = $6 AND row_result_count = $6
)`,
    values,
  };
}

function buildDataStatement(scoped: ScopedQuery, page: number, pageSize: number): SqlStatement {
  const values = [...scoped.values, pageSize, (page - 1) * pageSize];

  return {
    text: `${scoped.cte}
SELECT source_row, processed_at
FROM eligible_results
ORDER BY source_row ASC
LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  };
}

function validateInput(input: ListProcessedImportCompaniesInput): void {
  if (
    typeof input !== "object" || input === null || Array.isArray(input) ||
    typeof input.importBatchId !== "string" ||
    input.importBatchId.trim() !== input.importBatchId ||
    input.importBatchId.length < 1 || input.importBatchId.length > 128 ||
    (input.page !== undefined &&
      (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 10_000)) ||
    (input.pageSize !== undefined &&
      (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100))
  ) {
    throw new ProcessedImportCompaniesRepositoryInputError();
  }
}

function parseSourceRow(value: string | number): number {
  if (
    (typeof value !== "string" || !/^\d+$/.test(value)) &&
    typeof value !== "number"
  ) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  return parsed;
}

function parseProcessedAt(value: Date | string): string {
  if (!(value instanceof Date) && typeof value !== "string") {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  return parsed.toISOString();
}
