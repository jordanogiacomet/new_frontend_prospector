import "server-only";

import {
  leadRunIdPattern,
  type LeadHistoryQuery,
} from "../../lib/validators/lead-query";
import type { LeadHistoryItem } from "../../types/leads";
import { SafeApiError } from "../api/errors";
import {
  query as databaseQuery,
  type SqlStatement,
} from "../db/producer-client";
import {
  mapLeadHistoryItem,
  type LeadHistoryRow,
} from "../mappers/lead-history-mapper";
import { buildProductionRunPredicate } from "./production-run-predicate";

const maximumRetainedHistoryRows = 6;
const retainedHistoryCompleteness = "retained_only";
const retainedHistoryLabel = "Análises retidas encontradas";
const retainedHistoryCaveat =
  "Análises mais antigas podem não estar presentes.";

const eligibleHistoryCte = `WITH eligible_history AS (
  SELECT
    history.id,
    history.import_batch_id,
    history.lead_run_id,
    history.source_row,
    history.created_at,
    history.final_action,
    history.reason
  FROM public.company_validation_runs AS history
  WHERE history.integrity_status = $1
    AND history.processing_result = $2
    AND ${buildProductionRunPredicate("history")}
    AND BTRIM(history.lead_run_id) <> $3
    AND history.lead_run_id ~ $4
    AND history.cnpj_normalizado = $5
    AND BTRIM(history.final_action) <> $3
    AND history.run_created_at <= CURRENT_TIMESTAMP
)`;

const currentDecisionCtes = `current_terminal_candidates AS (
  SELECT
    current_terminal.id::text AS decision_id,
    COUNT(*) OVER (
      PARTITION BY current_projection.id
    ) AS terminal_count
  FROM public.company_validations AS current_projection
  INNER JOIN public.company_validation_runs AS current_terminal
    ON current_terminal.lead_run_id = current_projection.last_lead_run_id
  WHERE current_projection.integrity_status = $1
    AND current_projection.cnpj::text = current_projection.cnpj_normalizado
    AND BTRIM(current_projection.last_lead_run_id) <> $3
    AND current_projection.last_lead_run_id ~ $4
    AND BTRIM(current_projection.agent_version) <> $3
    AND current_projection.validated_at <= CURRENT_TIMESTAMP
    AND current_projection.cnpj_normalizado = $5
    AND current_terminal.integrity_status = $1
    AND current_terminal.processing_result = $2
    AND ${buildProductionRunPredicate("current_terminal")}
    AND current_terminal.lead_run_id ~ $4
    AND current_terminal.cnpj_normalizado = current_projection.cnpj_normalizado
    AND current_terminal.import_batch_id IS NOT DISTINCT FROM current_projection.last_import_batch_id
    AND current_terminal.source_row IS NOT DISTINCT FROM current_projection.last_source_row
    AND BTRIM(current_terminal.final_action) <> $3
    AND current_terminal.run_created_at <= CURRENT_TIMESTAMP
),
current_decision AS (
  SELECT current_terminal_candidates.decision_id
  FROM current_terminal_candidates
  WHERE current_terminal_candidates.terminal_count = $6
)`;

interface LeadHistoryCountRow {
  total: number;
}

interface LeadHistoryQueryRow extends LeadHistoryRow {
  current_decision_id: string | null;
}

export interface LeadHistoryResult {
  readonly history: LeadHistoryItem[];
  readonly total: number;
  readonly completeness: typeof retainedHistoryCompleteness;
  readonly label: typeof retainedHistoryLabel;
  readonly caveat: typeof retainedHistoryCaveat;
}

function buildCountStatement(cnpj: string): SqlStatement {
  return {
    text: `${eligibleHistoryCte}
SELECT COUNT(*)::integer AS total
FROM eligible_history`,
    values: [
      "OK",
      "INSERIDO_VALIDATION",
      "",
      leadRunIdPattern.source,
      cnpj,
    ],
  };
}

function buildDataStatement(
  cnpj: string,
  input: LeadHistoryQuery,
): SqlStatement {
  const values: unknown[] = [
    "OK",
    "INSERIDO_VALIDATION",
    "",
    leadRunIdPattern.source,
    cnpj,
    1,
    input.pageSize,
    (input.page - 1) * input.pageSize,
  ];

  return {
    text: `${eligibleHistoryCte},
${currentDecisionCtes}
SELECT
  history.id::text AS id,
  history.import_batch_id,
  history.lead_run_id,
  history.source_row,
  history.created_at,
  history.final_action,
  history.reason,
  current_decision.decision_id AS current_decision_id
FROM eligible_history AS history
LEFT JOIN current_decision
  ON current_decision.decision_id = history.id::text
ORDER BY history.created_at DESC, history.id DESC
LIMIT $7 OFFSET $8`,
    values,
  };
}

function isApprovedTotal(total: unknown): total is number {
  return (
    typeof total === "number" &&
    Number.isSafeInteger(total) &&
    total >= 0 &&
    total <= maximumRetainedHistoryRows
  );
}

export async function listLeadHistory(
  cnpj: string,
  input: LeadHistoryQuery,
): Promise<LeadHistoryResult> {
  const [countRow] = await databaseQuery<LeadHistoryCountRow>(
    buildCountStatement(cnpj),
  );

  if (!countRow || !isApprovedTotal(countRow.total)) {
    throw new SafeApiError("HISTORY_UNAVAILABLE");
  }

  const rows = await databaseQuery<LeadHistoryQueryRow>(
    buildDataStatement(cnpj, input),
  );

  return {
    history: rows.map((row) =>
      mapLeadHistoryItem(row, row.current_decision_id),
    ),
    total: countRow.total,
    completeness: retainedHistoryCompleteness,
    label: retainedHistoryLabel,
    caveat: retainedHistoryCaveat,
  };
}
