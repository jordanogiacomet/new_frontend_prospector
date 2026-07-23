export type ProductionRunAlias =
  | "terminal"
  | "history"
  | "current_terminal"
  | "run";

export interface LeadRunVisibilityOptions {
  readonly includeDemo2TestRuns?: boolean;
  readonly includeTestRunsFromImportBatchIds?: readonly string[];
}

interface LeadRunVisibilityPredicateOptions {
  readonly includeDemo2TestRuns?: boolean;
  readonly correlatedImportBatchIdsParameter?: number;
}

export function buildProductionRunPredicate(
  alias: ProductionRunAlias,
): string {
  return `(${alias}.test_case_id IS NULL OR ${alias}.test_case_id = 'SR_' || ${alias}.source_row)`;
}

export function buildLeadRunVisibilityPredicate(
  alias: ProductionRunAlias,
  options: LeadRunVisibilityPredicateOptions = {},
): string {
  if (options.includeDemo2TestRuns) {
    return "TRUE";
  }

  const productionPredicate = buildProductionRunPredicate(alias);
  const parameter = options.correlatedImportBatchIdsParameter;

  return parameter === undefined
    ? productionPredicate
    : `(${productionPredicate} OR ${alias}.import_batch_id = ANY($${parameter}::text[]))`;
}
