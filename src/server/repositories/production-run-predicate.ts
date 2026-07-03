export type ProductionRunAlias =
  | "terminal"
  | "history"
  | "current_terminal";

export function buildProductionRunPredicate(
  alias: ProductionRunAlias,
): string {
  return `(${alias}.test_case_id IS NULL OR ${alias}.test_case_id = 'SR_' || ${alias}.source_row)`;
}
