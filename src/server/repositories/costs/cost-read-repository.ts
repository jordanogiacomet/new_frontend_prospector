import "server-only";

import { leadRunIdPattern } from "../../../lib/validators/lead-query";
import type {
  CostRun,
  CostRunAvailability,
} from "../../../types/costs";
import { SafeApiError } from "../../api/errors";
import {
  query as queryProducerDatabase,
  type SqlStatement,
} from "../../db/producer-client";
import { buildProductionRunPredicate } from "../production-run-predicate";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;
const MAX_IMPORT_BATCH_ID_LENGTH = 128;

export interface ListProducerRunCostsInput {
  readonly importBatchIds: readonly string[];
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ProducerRunCostPage {
  readonly runs: readonly CostRun[];
  readonly total: number;
  readonly availableCount: number;
  readonly unknownCount: number;
  readonly ambiguousCount: number;
  readonly subtotalEstimatedUsd: string | null;
}

export class CostReadRepositoryInputError extends Error {
  readonly code = "INVALID_COST_READ_INPUT";

  constructor() {
    super("Invalid cost read input.");
    this.name = "CostReadRepositoryInputError";
  }
}

interface CostSummaryRow {
  readonly total: number | string;
  readonly available_count: number | string;
  readonly unknown_count: number | string;
  readonly ambiguous_count: number | string;
  readonly subtotal_estimated_usd: string | null;
}

interface CostRunRow {
  readonly lead_run_id: string;
  readonly availability: string;
  readonly estimated_cost_usd: string | null;
}

const classifiedRunsCte = `WITH eligible_runs AS (
  SELECT
    run.lead_run_id,
    run.llm_total_tokens,
    run.llm_estimated_cost_usd
  FROM public.company_validation_runs AS run
  WHERE run.import_batch_id = ANY($1::text[])
    AND run.integrity_status = $2
    AND run.processing_result = $3
    AND ${buildProductionRunPredicate("run")}
    AND BTRIM(run.lead_run_id) <> $4
    AND run.lead_run_id ~ $5
),
grouped_runs AS (
  SELECT
    lead_run_id,
    COUNT(*)::integer AS observation_count,
    MAX(llm_total_tokens) AS llm_total_tokens,
    MAX(llm_estimated_cost_usd) AS llm_estimated_cost_usd
  FROM eligible_runs
  GROUP BY lead_run_id
),
classified_runs AS (
  SELECT
    lead_run_id,
    llm_estimated_cost_usd,
    CASE
      WHEN observation_count > 1 THEN 'AMBIGUOUS'
      WHEN llm_total_tokens > 0 AND llm_estimated_cost_usd > 0 THEN 'AVAILABLE'
      ELSE 'UNKNOWN'
    END AS availability
  FROM grouped_runs
)`;

export async function listProducerRunCosts(
  input: ListProducerRunCostsInput,
): Promise<ProducerRunCostPage> {
  const pagination = validateInput(input);

  if (input.importBatchIds.length === 0) {
    return emptyProducerRunCostPage();
  }

  const [summary] = await queryProducerDatabase<CostSummaryRow>(
    buildSummaryStatement(input.importBatchIds),
  );
  const rows = await queryProducerDatabase<CostRunRow>(
    buildPageStatement(input.importBatchIds, pagination),
  );

  return {
    ...mapSummaryRow(summary),
    runs: rows.map(mapCostRunRow),
  };
}

function validateInput(input: ListProducerRunCostsInput): {
  readonly page: number;
  readonly pageSize: number;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray(input.importBatchIds)
  ) {
    throw new CostReadRepositoryInputError();
  }

  for (const importBatchId of input.importBatchIds) {
    if (
      typeof importBatchId !== "string" ||
      importBatchId.trim() !== importBatchId ||
      importBatchId.length === 0 ||
      importBatchId.length > MAX_IMPORT_BATCH_ID_LENGTH
    ) {
      throw new CostReadRepositoryInputError();
    }
  }

  const page = input.page ?? DEFAULT_PAGE;
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new CostReadRepositoryInputError();
  }

  return { page, pageSize };
}

function buildSummaryStatement(
  importBatchIds: readonly string[],
): SqlStatement {
  return {
    text: `${classifiedRunsCte}
SELECT
  COUNT(*)::integer AS total,
  COUNT(*) FILTER (WHERE availability = 'AVAILABLE')::integer AS available_count,
  COUNT(*) FILTER (WHERE availability = 'UNKNOWN')::integer AS unknown_count,
  COUNT(*) FILTER (WHERE availability = 'AMBIGUOUS')::integer AS ambiguous_count,
  SUM(
    CASE
      WHEN availability = 'AVAILABLE' THEN llm_estimated_cost_usd
      ELSE NULL
    END
  )::text AS subtotal_estimated_usd
FROM classified_runs`,
    values: [
      [...importBatchIds],
      "OK",
      "INSERIDO_VALIDATION",
      "",
      leadRunIdPattern.source,
    ],
  };
}

function buildPageStatement(
  importBatchIds: readonly string[],
  pagination: { readonly page: number; readonly pageSize: number },
): SqlStatement {
  return {
    text: `${classifiedRunsCte}
SELECT
  lead_run_id,
  availability,
  CASE
    WHEN availability = 'AVAILABLE' THEN llm_estimated_cost_usd::text
    ELSE NULL
  END AS estimated_cost_usd
FROM classified_runs
ORDER BY lead_run_id ASC
LIMIT $6 OFFSET $7`,
    values: [
      [...importBatchIds],
      "OK",
      "INSERIDO_VALIDATION",
      "",
      leadRunIdPattern.source,
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize,
    ],
  };
}

function emptyProducerRunCostPage(): ProducerRunCostPage {
  return {
    runs: [],
    total: 0,
    availableCount: 0,
    unknownCount: 0,
    ambiguousCount: 0,
    subtotalEstimatedUsd: null,
  };
}

function mapSummaryRow(row: CostSummaryRow | undefined): Omit<
  ProducerRunCostPage,
  "runs"
> {
  if (row === undefined) {
    throw unavailableSource();
  }

  const total = toSafeCount(row.total);
  const availableCount = toSafeCount(row.available_count);
  const unknownCount = toSafeCount(row.unknown_count);
  const ambiguousCount = toSafeCount(row.ambiguous_count);

  if (availableCount + unknownCount + ambiguousCount !== total) {
    throw unavailableSource();
  }

  const subtotalEstimatedUsd =
    availableCount === 0
      ? null
      : toPositiveCanonicalDecimal(row.subtotal_estimated_usd);

  if (availableCount > 0 && subtotalEstimatedUsd === null) {
    throw unavailableSource();
  }

  return {
    total,
    availableCount,
    unknownCount,
    ambiguousCount,
    subtotalEstimatedUsd,
  };
}

function mapCostRunRow(row: CostRunRow): CostRun {
  if (
    typeof row.lead_run_id !== "string" ||
    !leadRunIdPattern.test(row.lead_run_id)
  ) {
    throw unavailableSource();
  }

  const availability = toAvailability(row.availability);

  if (availability === "AVAILABLE") {
    const estimatedCostUsd = toPositiveCanonicalDecimal(
      row.estimated_cost_usd,
    );

    if (estimatedCostUsd === null) {
      throw unavailableSource();
    }

    return {
      leadRunId: row.lead_run_id,
      availability,
      estimatedCostUsd,
    };
  }

  return {
    leadRunId: row.lead_run_id,
    availability,
    estimatedCostUsd: null,
  };
}

function toSafeCount(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw unavailableSource();
  }

  return parsed;
}

function toAvailability(value: string): CostRunAvailability {
  if (
    value === "AVAILABLE" ||
    value === "UNKNOWN" ||
    value === "AMBIGUOUS"
  ) {
    return value;
  }

  throw unavailableSource();
}

function toPositiveCanonicalDecimal(value: string | null): string | null {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/.test(value) ||
    !/[1-9]/.test(value)
  ) {
    return null;
  }

  return value;
}

function unavailableSource(): SafeApiError {
  return new SafeApiError("DATA_SOURCE_UNAVAILABLE");
}
