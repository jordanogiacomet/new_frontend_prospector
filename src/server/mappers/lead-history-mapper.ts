import type { LeadHistoryItem } from "../../types/leads";

export interface LeadHistoryRow {
  id: string;
  import_batch_id: string | null;
  lead_run_id: string;
  source_row: number | null;
  created_at: Date | string | null;
  final_action: string;
  reason: string | null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toNullableIsoString(
  value: Date | string | null,
): string | null {
  return value === null ? null : toIsoString(value);
}

export function mapLeadHistoryItem(
  row: LeadHistoryRow,
  currentDecisionId: string | null,
): LeadHistoryItem {
  return {
    decision_id: row.id,
    import_batch_id: row.import_batch_id,
    lead_run_id: row.lead_run_id,
    source_row: row.source_row,
    analyzedAt: toNullableIsoString(row.created_at),
    recommendedAction: row.final_action,
    recommendedActionReason: row.reason,
    isCurrent: row.id === currentDecisionId,
  };
}
