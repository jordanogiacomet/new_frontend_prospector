import type { BatchSourceSummary } from "../../types/imports";

export interface BatchSourceSummaryRow {
  import_batch_id: string;
  first_analysis_at: Date | string;
  last_analysis_at: Date | string;
  saved_decision_count: number;
  analyzed_company_count: number;
}

const invalidBatchSourceMessage =
  "Metadados agregados de lote inválidos.";

function failInvalidBatchSource(): never {
  throw new TypeError(invalidBatchSourceMessage);
}

function toBatchIdentifier(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return failInvalidBatchSource();
  }

  return value;
}

function toIsoString(value: unknown): string {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : failInvalidBatchSource();

  if (!Number.isFinite(date.getTime())) {
    return failInvalidBatchSource();
  }

  return date.toISOString();
}

function toCount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return failInvalidBatchSource();
  }

  return value;
}

export function mapBatchSourceSummary(
  row: BatchSourceSummaryRow,
): BatchSourceSummary {
  if (typeof row !== "object" || row === null) {
    return failInvalidBatchSource();
  }

  return {
    import_batch_id: toBatchIdentifier(row.import_batch_id),
    firstAnalysisAt: toIsoString(row.first_analysis_at),
    lastAnalysisAt: toIsoString(row.last_analysis_at),
    savedDecisionCount: toCount(row.saved_decision_count),
    analyzedCompanyCount: toCount(row.analyzed_company_count),
  };
}
