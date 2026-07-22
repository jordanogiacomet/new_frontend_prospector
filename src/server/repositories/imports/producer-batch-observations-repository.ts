import "server-only";

import type {
  BatchAcceptedRowFact,
  BatchCloseFact,
  BatchObservedAtFact,
  BatchProducerObservationFacts,
  BatchRetainedLegacyObservationFact,
  BatchTerminalClass,
  BatchTerminalOutcomeFact,
  BatchTimestampInput,
} from "../../../types/imports";
import {
  DatabaseUnavailableError,
  query as queryProducerDatabase,
  type SqlStatement,
} from "../../db/producer-client";

const APPROVED_SOURCE = "producer_x4_batch_observations_v1";
const OBSERVATION_FACT_SOURCE = "producer_x4_batch_observations_v1";
const ACCEPTED_ROW_FACT_SOURCE = "producer_x4_accepted_rows_v1";
const TERMINAL_FACT_SOURCE = "producer_x4_terminal_outcomes_v1";
const CLOSE_FACT_SOURCE = "producer_x4_batch_close_v1";
const LEGACY_FACT_SOURCE = "producer_retained_legacy_observations_v1";
const OBSERVED_AT_FACT_SOURCE = "producer_x4_observation_clock_v1";
const MAX_IMPORT_BATCH_ID_LENGTH = 128;
const MAX_BATCH_READ_SIZE = 100;

export interface ReadProducerBatchObservationsInput {
  readonly import_batch_id: string;
}

export interface ReadProducerBatchObservationsByBatchIdsInput {
  readonly import_batch_ids: readonly string[];
}

export class ProducerBatchObservationRepositoryInputError extends Error {
  readonly code = "INVALID_PRODUCER_BATCH_OBSERVATION_INPUT";

  constructor() {
    super("Invalid producer batch observation input.");
    this.name = "ProducerBatchObservationRepositoryInputError";
  }
}

interface ProducerBatchObservationRow {
  readonly import_batch_id: string;
  readonly fact_type: string;
  readonly source_row: number | string | null;
  readonly lead_run_id: string | null;
  readonly producer_result: string | null;
  readonly observed_at: BatchTimestampInput | null;
  readonly closed_at: BatchTimestampInput | null;
}

interface MutableObservations {
  lastObservedAt: Date | null;
  acceptedRowsBySourceRow: Map<number, BatchAcceptedRowFact>;
  terminalOutcomesByIdentity: Map<string, BatchTerminalOutcomeFact>;
  close: BatchCloseFact | null;
  retainedLegacyObservationsByIdentity: Map<
    string,
    BatchRetainedLegacyObservationFact
  >;
}

export async function readProducerBatchObservations(
  input: ReadProducerBatchObservationsInput,
): Promise<BatchProducerObservationFacts> {
  validateImportBatchId(input.import_batch_id);
  const observations = await readProducerBatchObservationsByBatchIds({
    import_batch_ids: [input.import_batch_id],
  });

  return (
    observations.get(input.import_batch_id) ??
    unavailableObservations()
  );
}

export async function readProducerBatchObservationsByBatchIds(
  input: ReadProducerBatchObservationsByBatchIdsInput,
): Promise<ReadonlyMap<string, BatchProducerObservationFacts>> {
  const importBatchIds = validateBatchInput(input);

  if (importBatchIds.length === 0) {
    return new Map();
  }

  try {
    const rows = await queryProducerDatabase<ProducerBatchObservationRow>(
      buildSelectObservationsByBatchIdsStatement(importBatchIds),
    );

    return mapObservationRowsByBatchId(importBatchIds, rows);
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return new Map(
        importBatchIds.map((importBatchId) => [
          importBatchId,
          unavailableObservations(),
        ]),
      );
    }

    throw error;
  }
}

function validateBatchInput(
  input: ReadProducerBatchObservationsByBatchIdsInput,
): readonly string[] {
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray(input.import_batch_ids) ||
    input.import_batch_ids.length > MAX_BATCH_READ_SIZE
  ) {
    throw new ProducerBatchObservationRepositoryInputError();
  }

  for (const importBatchId of input.import_batch_ids) {
    validateImportBatchId(importBatchId);
  }

  return [...new Set(input.import_batch_ids)];
}

function validateImportBatchId(importBatchId: unknown): asserts importBatchId is string {
  if (
    typeof importBatchId !== "string" ||
    importBatchId.trim() !== importBatchId ||
    importBatchId.length < 1 ||
    importBatchId.length > MAX_IMPORT_BATCH_ID_LENGTH
  ) {
    throw new ProducerBatchObservationRepositoryInputError();
  }
}

function buildSelectObservationsByBatchIdsStatement(
  importBatchIds: readonly string[],
): SqlStatement {
  return {
    text: `
      SELECT
        import_batch_id,
        fact_type,
        source_row,
        lead_run_id,
        producer_result,
        observed_at,
        closed_at
      FROM public.prospecta_import_batch_observations_v1
      WHERE import_batch_id = ANY($1::text[])
      ORDER BY
        import_batch_id ASC,
        observed_at ASC,
        fact_type ASC,
        source_row ASC NULLS LAST,
        lead_run_id ASC NULLS LAST,
        producer_result ASC NULLS LAST`,
    values: [importBatchIds],
  };
}

function mapObservationRowsByBatchId(
  importBatchIds: readonly string[],
  rows: readonly ProducerBatchObservationRow[],
): ReadonlyMap<string, BatchProducerObservationFacts> {
  const requested = new Set(importBatchIds);
  const rowsByBatchId = new Map<
    string,
    ProducerBatchObservationRow[]
  >(importBatchIds.map((importBatchId) => [importBatchId, []]));

  for (const row of rows) {
    if (requested.has(row.import_batch_id)) {
      rowsByBatchId.get(row.import_batch_id)?.push(row);
    }
  }

  return new Map(
    importBatchIds.map((importBatchId) => [
      importBatchId,
      mapObservationRows(rowsByBatchId.get(importBatchId) ?? []),
    ]),
  );
}

function mapObservationRows(
  rows: readonly ProducerBatchObservationRow[],
): BatchProducerObservationFacts {
  const observations: MutableObservations = {
    lastObservedAt: null,
    acceptedRowsBySourceRow: new Map(),
    terminalOutcomesByIdentity: new Map(),
    close: null,
    retainedLegacyObservationsByIdentity: new Map(),
  };

  for (const row of rows) {
    recordObservedAt(observations, row.observed_at);

    if (row.fact_type === "ACCEPTED_ROW") {
      recordAcceptedRow(observations, row);
    } else if (row.fact_type === "TERMINAL_OUTCOME") {
      recordTerminalOutcome(observations, row);
    } else if (row.fact_type === "BATCH_CLOSED") {
      recordClose(observations, row);
    } else if (row.fact_type === "RETAINED_LEGACY_OBSERVATION") {
      recordRetainedLegacyObservation(observations, row);
    }
  }

  return {
    factSource: OBSERVATION_FACT_SOURCE,
    availability: "AVAILABLE",
    lastObservedAt:
      observations.lastObservedAt === null
        ? null
        : observedAtFact(observations.lastObservedAt),
    acceptedRows: Array.from(observations.acceptedRowsBySourceRow.values()).sort(
      bySourceRow,
    ),
    terminalOutcomes: Array.from(
      observations.terminalOutcomesByIdentity.values(),
    ).sort(byTerminalOutcome),
    close: observations.close,
    retainedLegacyObservations: Array.from(
      observations.retainedLegacyObservationsByIdentity.values(),
    ).sort(byRetainedLegacyObservation),
  };
}

function unavailableObservations(): BatchProducerObservationFacts {
  return {
    factSource: APPROVED_SOURCE,
    availability: "UNAVAILABLE",
    unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
    lastObservedAt: null,
    acceptedRows: [],
    terminalOutcomes: [],
    close: null,
    retainedLegacyObservations: [],
  };
}

function recordAcceptedRow(
  observations: MutableObservations,
  row: ProducerBatchObservationRow,
): void {
  const sourceRow = toPositiveInteger(row.source_row);

  if (sourceRow === null) {
    return;
  }

  observations.acceptedRowsBySourceRow.set(sourceRow, {
    factSource: ACCEPTED_ROW_FACT_SOURCE,
    sourceRow,
  });
}

function recordTerminalOutcome(
  observations: MutableObservations,
  row: ProducerBatchObservationRow,
): void {
  const sourceRow = toPositiveInteger(row.source_row);
  const terminalClass = terminalClassFrom(row.producer_result);

  if (sourceRow === null || terminalClass === null) {
    return;
  }

  if (terminalClass === "MATERIALIZED") {
    const leadRunId = toPresentText(row.lead_run_id);

    if (leadRunId === null) {
      return;
    }

    observations.terminalOutcomesByIdentity.set(
      `${sourceRow}:${terminalClass}:${leadRunId}`,
      {
        factSource: TERMINAL_FACT_SOURCE,
        sourceRow,
        terminalClass,
        leadRunId,
      },
    );
    return;
  }

  observations.terminalOutcomesByIdentity.set(`${sourceRow}:${terminalClass}`, {
    factSource: TERMINAL_FACT_SOURCE,
    sourceRow,
    terminalClass,
  });
}

function recordClose(
  observations: MutableObservations,
  row: ProducerBatchObservationRow,
): void {
  const closedAt = toValidDate(row.closed_at);

  if (closedAt === null) {
    return;
  }

  if (
    observations.close === null ||
    new Date(observations.close.closedAt).getTime() < closedAt.getTime()
  ) {
    observations.close = {
      factSource: CLOSE_FACT_SOURCE,
      closedAt,
    };
  }

  recordObservedAt(observations, closedAt);
}

function recordRetainedLegacyObservation(
  observations: MutableObservations,
  row: ProducerBatchObservationRow,
): void {
  const observedAt = toValidDate(row.observed_at);

  if (observedAt === null) {
    return;
  }

  const sourceRow = row.source_row === null ? null : toPositiveInteger(row.source_row);
  const leadRunId = row.lead_run_id === null ? null : toPresentText(row.lead_run_id);

  if (row.source_row !== null && sourceRow === null) {
    return;
  }

  if (row.lead_run_id !== null && leadRunId === null) {
    return;
  }

  const identity = `${sourceRow ?? "none"}:${leadRunId ?? "none"}:${observedAt.toISOString()}`;
  observations.retainedLegacyObservationsByIdentity.set(identity, {
    factSource: LEGACY_FACT_SOURCE,
    sourceRow,
    leadRunId,
    observedAt,
  });
}

function recordObservedAt(
  observations: MutableObservations,
  value: BatchTimestampInput | null,
): void {
  const observedAt = toValidDate(value);

  if (observedAt === null) {
    return;
  }

  if (
    observations.lastObservedAt === null ||
    observations.lastObservedAt.getTime() < observedAt.getTime()
  ) {
    observations.lastObservedAt = observedAt;
  }
}

function observedAtFact(observedAt: Date): BatchObservedAtFact {
  return {
    factSource: OBSERVED_AT_FACT_SOURCE,
    observedAt,
  };
}

function terminalClassFrom(
  producerResult: string | null,
): BatchTerminalClass | null {
  if (producerResult === "LEAD_DECISION_SAVED") {
    return "MATERIALIZED";
  }

  if (
    producerResult === "PRE_VALIDATION_BLOCKED" ||
    producerResult === "CRM_REJECTED"
  ) {
    return "BLOCKED";
  }

  if (producerResult === "PROCESSING_FAILED") {
    return "FAILED";
  }

  return null;
}

function toPositiveInteger(value: number | string | null): number | null {
  const numericValue =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : value;

  if (
    typeof numericValue !== "number" ||
    !Number.isSafeInteger(numericValue) ||
    numericValue < 1
  ) {
    return null;
  }

  return numericValue;
}

function toPresentText(value: string | null): string | null {
  if (typeof value !== "string" || value.trim() !== value || value === "") {
    return null;
  }

  return value;
}

function toValidDate(value: BatchTimestampInput | null): Date | null {
  if (value === null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date;
}

function bySourceRow(
  left: BatchAcceptedRowFact,
  right: BatchAcceptedRowFact,
): number {
  return left.sourceRow - right.sourceRow;
}

function byTerminalOutcome(
  left: BatchTerminalOutcomeFact,
  right: BatchTerminalOutcomeFact,
): number {
  return (
    left.sourceRow - right.sourceRow ||
    left.terminalClass.localeCompare(right.terminalClass) ||
    terminalLeadRunId(left).localeCompare(terminalLeadRunId(right))
  );
}

function terminalLeadRunId(fact: BatchTerminalOutcomeFact): string {
  return fact.terminalClass === "MATERIALIZED" ? fact.leadRunId : "";
}

function byRetainedLegacyObservation(
  left: BatchRetainedLegacyObservationFact,
  right: BatchRetainedLegacyObservationFact,
): number {
  return (
    (left.sourceRow ?? Number.MAX_SAFE_INTEGER) -
      (right.sourceRow ?? Number.MAX_SAFE_INTEGER) ||
    String(left.leadRunId ?? "").localeCompare(String(right.leadRunId ?? "")) ||
    toValidDate(left.observedAt)!.getTime() -
      toValidDate(right.observedAt)!.getTime()
  );
}
