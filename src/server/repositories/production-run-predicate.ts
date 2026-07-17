export type ProductionRunAlias =
  | "terminal"
  | "history"
  | "current_terminal"
  | "run";

export function buildProductionRunPredicate(
  alias: ProductionRunAlias,
): string {
  return `(${alias}.test_case_id IS NULL OR ${alias}.test_case_id = 'SR_' || ${alias}.source_row)`;
}

export function buildLeadRunVisibilityPredicate(
  alias: ProductionRunAlias,
  includeDemo2TestRuns = false,
): string {
  return includeDemo2TestRuns ? "TRUE" : buildProductionRunPredicate(alias);
}
