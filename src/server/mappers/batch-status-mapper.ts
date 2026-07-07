import type {
  BatchAcceptanceFact,
  BatchFreshnessPolicy,
  BatchObservationBasis,
  BatchProducerObservationFacts,
  BatchStatus,
  BatchStatusMapperInput,
  BatchSummary,
  BatchTerminalClass,
  BatchTerminalOutcomeFact,
  BatchTimestampInput,
} from "../../types/imports";

const invalidBatchStatusMessage = "Metadados de status de lote inválidos.";

interface ProducerCounts {
  readonly terminalCount: number;
  readonly blockedCount: number;
  readonly failedCount: number;
  readonly leadCount: number;
}

interface TerminalEvidence {
  readonly bySourceRow: ReadonlyMap<number, ReadonlySet<BatchTerminalClass>>;
  readonly hasConflict: boolean;
}

function failInvalidBatchStatus(): never {
  throw new TypeError(invalidBatchStatusMessage);
}

function requireNamedFact(fact: unknown): void {
  if (
    typeof fact !== "object" ||
    fact === null ||
    !("factSource" in fact) ||
    typeof fact.factSource !== "string" ||
    fact.factSource.trim() === ""
  ) {
    failInvalidBatchStatus();
  }
}

function requireText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    failInvalidBatchStatus();
  }

  return value;
}

function toIsoString(value: BatchTimestampInput): string {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    failInvalidBatchStatus();
  }

  return date.toISOString();
}

function toTime(value: BatchTimestampInput): number {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    failInvalidBatchStatus();
  }

  return date.getTime();
}

function toNonNegativeInteger(value: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    failInvalidBatchStatus();
  }

  return value;
}

function toSourceRow(value: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    failInvalidBatchStatus();
  }

  return value;
}

export function mapBatchStatus(
  input: BatchStatusMapperInput,
): BatchSummary {
  validateInputShell(input);

  const submissionId = requireText(input.submission.submissionId);
  const submittedAt = toIsoString(input.submission.submittedAt);
  const acknowledgementBatchId =
    input.acknowledgement === null
      ? null
      : requireAcknowledgement(input.acknowledgement);
  const acceptance =
    input.acceptance === null ? null : requireAcceptance(input.acceptance);
  const importBatchId = acceptance?.import_batch_id ?? acknowledgementBatchId;
  const acceptedAt =
    acceptance === null ? null : toIsoString(acceptance.acceptedAt);
  const rowCountAccepted =
    acceptance === null ? null : acceptance.rowCountAccepted;

  if (acceptance === null) {
    return {
      submissionId,
      import_batch_id: importBatchId,
      status: "SUBMITTED",
      submittedAt,
      acceptedAt: null,
      lastObservedAt: observedAtOrNull(input.producerObservations),
      rowCountAccepted: null,
      ...nullProducerCounts(),
      statusBasis: "SUBMISSION_RECORDED",
      ...observationCondition(input.producerObservations, null),
    };
  }

  const unavailableCondition = unavailableObservationCondition(
    input.producerObservations,
  );

  if (unavailableCondition !== null) {
    return {
      submissionId,
      import_batch_id: importBatchId,
      status: "ACCEPTED",
      submittedAt,
      acceptedAt,
      lastObservedAt: observedAtOrNull(input.producerObservations),
      rowCountAccepted,
      ...nullProducerCounts(),
      statusBasis: "ACCEPTANCE_CONFIRMED",
      ...unavailableCondition,
    };
  }

  const producerObservations = input.producerObservations;

  if (producerObservations === null) {
    return {
      submissionId,
      import_batch_id: importBatchId,
      status: statusWithoutProducerObservations(acceptance, input.freshness),
      submittedAt,
      acceptedAt,
      lastObservedAt: null,
      rowCountAccepted,
      ...nullProducerCounts(),
      statusBasis: statusBasisWithoutProducerObservations(
        acceptance,
        input.freshness,
      ),
      observationStatus: "AVAILABLE",
      observationBasis: null,
    };
  }

  const acceptedRows = distinctAcceptedRows(producerObservations);
  const terminalEvidence = terminalEvidenceFrom(producerObservations);
  const inconsistencyBasis = findInconsistency(
    acceptance.rowCountAccepted,
    acceptedRows,
    terminalEvidence,
  );

  if (inconsistencyBasis !== null) {
    return {
      submissionId,
      import_batch_id: importBatchId,
      status: "ACCEPTED",
      submittedAt,
      acceptedAt,
      lastObservedAt: observedAtOrNull(producerObservations),
      rowCountAccepted,
      ...nullProducerCounts(),
      statusBasis: "ACCEPTANCE_CONFIRMED",
      observationStatus: "INCONSISTENT",
      observationBasis: inconsistencyBasis,
    };
  }

  const counts = producerCounts(terminalEvidence);
  const status = statusFromConsistentEvidence(
    acceptance,
    producerObservations,
    acceptedRows,
    terminalEvidence,
    input.freshness,
  );

  return {
    submissionId,
    import_batch_id: importBatchId,
    status,
    submittedAt,
    acceptedAt,
    lastObservedAt: observedAtOrNull(producerObservations),
    rowCountAccepted,
    ...counts,
    statusBasis: statusBasisFor(status),
    observationStatus: "AVAILABLE",
    observationBasis: null,
  };
}

function validateInputShell(input: BatchStatusMapperInput): void {
  if (typeof input !== "object" || input === null) {
    failInvalidBatchStatus();
  }

  requireNamedFact(input.submission);
}

function requireAcknowledgement(
  acknowledgement: NonNullable<BatchStatusMapperInput["acknowledgement"]>,
): string {
  requireNamedFact(acknowledgement);
  toIsoString(acknowledgement.acknowledgedAt);

  return requireText(acknowledgement.import_batch_id);
}

function requireAcceptance(
  acceptance: BatchAcceptanceFact,
): BatchAcceptanceFact {
  requireNamedFact(acceptance);
  requireText(acceptance.import_batch_id);
  toIsoString(acceptance.acceptedAt);

  return {
    ...acceptance,
    rowCountAccepted: toNonNegativeInteger(
      acceptance.rowCountAccepted,
    ),
  };
}

function observedAtOrNull(
  observations: BatchProducerObservationFacts | null,
): string | null {
  if (observations === null || observations.lastObservedAt === null) {
    return null;
  }

  requireNamedFact(observations.lastObservedAt);

  return toIsoString(observations.lastObservedAt.observedAt);
}

function nullProducerCounts(): Pick<
  BatchSummary,
  "terminalCount" | "blockedCount" | "failedCount" | "leadCount"
> {
  return {
    terminalCount: null,
    blockedCount: null,
    failedCount: null,
    leadCount: null,
  };
}

function observationCondition(
  observations: BatchProducerObservationFacts | null,
  observationBasis: BatchObservationBasis | null,
): Pick<BatchSummary, "observationStatus" | "observationBasis"> {
  const unavailable = unavailableObservationCondition(observations);

  if (unavailable !== null) {
    return unavailable;
  }

  if (observationBasis !== null) {
    return {
      observationStatus: "INCONSISTENT",
      observationBasis,
    };
  }

  return {
    observationStatus: "AVAILABLE",
    observationBasis: null,
  };
}

function unavailableObservationCondition(
  observations: BatchProducerObservationFacts | null,
): Pick<BatchSummary, "observationStatus" | "observationBasis"> | null {
  if (observations === null) {
    return null;
  }

  requireNamedFact(observations);

  if (observations.availability === "UNAVAILABLE") {
    return {
      observationStatus: "UNAVAILABLE",
      observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
    };
  }

  return null;
}

function distinctAcceptedRows(
  observations: BatchProducerObservationFacts,
): ReadonlySet<number> {
  const rows = new Set<number>();

  for (const fact of observations.acceptedRows) {
    requireNamedFact(fact);
    rows.add(toSourceRow(fact.sourceRow));
  }

  return rows;
}

function terminalEvidenceFrom(
  observations: BatchProducerObservationFacts,
): TerminalEvidence {
  const bySourceRow = new Map<number, Set<BatchTerminalClass>>();

  for (const fact of observations.terminalOutcomes) {
    requireTerminalFact(fact);

    const sourceRow = toSourceRow(fact.sourceRow);
    const classes = bySourceRow.get(sourceRow) ?? new Set();
    classes.add(fact.terminalClass);
    bySourceRow.set(sourceRow, classes);
  }

  return {
    bySourceRow,
    hasConflict: hasTerminalConflict(bySourceRow),
  };
}

function requireTerminalFact(fact: BatchTerminalOutcomeFact): void {
  requireNamedFact(fact);

  if (fact.terminalClass === "MATERIALIZED") {
    requireText(fact.leadRunId);
  }
}

function hasTerminalConflict(
  terminalsBySourceRow: ReadonlyMap<number, ReadonlySet<BatchTerminalClass>>,
): boolean {
  for (const classes of terminalsBySourceRow.values()) {
    if (classes.size > 1) {
      return true;
    }
  }

  return false;
}

function findInconsistency(
  rowCountAccepted: number,
  acceptedRows: ReadonlySet<number>,
  terminalEvidence: TerminalEvidence,
): BatchObservationBasis | null {
  if (
    acceptedRows.size > rowCountAccepted ||
    terminalEvidence.bySourceRow.size > rowCountAccepted
  ) {
    return "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE";
  }

  if (terminalEvidence.hasConflict) {
    return "PRODUCER_EVIDENCE_CONFLICT";
  }

  if (acceptedRows.size === rowCountAccepted) {
    for (const sourceRow of terminalEvidence.bySourceRow.keys()) {
      if (!acceptedRows.has(sourceRow)) {
        return "PRODUCER_EVIDENCE_CONFLICT";
      }
    }
  }

  return null;
}

function producerCounts(terminalEvidence: TerminalEvidence): ProducerCounts {
  let blockedCount = 0;
  let failedCount = 0;
  let leadCount = 0;

  for (const classes of terminalEvidence.bySourceRow.values()) {
    const terminalClass = onlyTerminalClass(classes);

    if (terminalClass === "BLOCKED") {
      blockedCount += 1;
    } else if (terminalClass === "FAILED") {
      failedCount += 1;
    } else {
      leadCount += 1;
    }
  }

  return {
    terminalCount: terminalEvidence.bySourceRow.size,
    blockedCount,
    failedCount,
    leadCount,
  };
}

function onlyTerminalClass(
  classes: ReadonlySet<BatchTerminalClass>,
): BatchTerminalClass {
  const [terminalClass] = Array.from(classes);

  if (terminalClass === undefined || classes.size !== 1) {
    failInvalidBatchStatus();
  }

  return terminalClass;
}

function statusWithoutProducerObservations(
  acceptance: BatchAcceptanceFact,
  freshness: BatchFreshnessPolicy | null,
): BatchStatus {
  return isFreshnessExceeded(acceptance.acceptedAt, freshness)
    ? "NO_UPDATE"
    : "ACCEPTED";
}

function statusBasisWithoutProducerObservations(
  acceptance: BatchAcceptanceFact,
  freshness: BatchFreshnessPolicy | null,
): BatchSummary["statusBasis"] {
  return statusBasisFor(
    statusWithoutProducerObservations(acceptance, freshness),
  );
}

function statusFromConsistentEvidence(
  acceptance: BatchAcceptanceFact,
  observations: BatchProducerObservationFacts,
  acceptedRows: ReadonlySet<number>,
  terminalEvidence: TerminalEvidence,
  freshness: BatchFreshnessPolicy | null,
): BatchStatus {
  validateCloseFact(observations);

  if (observations.close !== null) {
    return allAcceptedRowsHaveOneTerminal(
      acceptance.rowCountAccepted,
      acceptedRows,
      terminalEvidence,
    )
      ? "COMPLETED"
      : "INCOMPLETE";
  }

  const lastObservationTime =
    observations.lastObservedAt?.observedAt ?? acceptance.acceptedAt;

  if (isFreshnessExceeded(lastObservationTime, freshness)) {
    return "NO_UPDATE";
  }

  return hasProducerActivity(observations, terminalEvidence)
    ? "PROCESSING"
    : "ACCEPTED";
}

function validateCloseFact(
  observations: BatchProducerObservationFacts,
): void {
  if (observations.close === null) {
    return;
  }

  requireNamedFact(observations.close);
  toIsoString(observations.close.closedAt);
}

function allAcceptedRowsHaveOneTerminal(
  rowCountAccepted: number,
  acceptedRows: ReadonlySet<number>,
  terminalEvidence: TerminalEvidence,
): boolean {
  if (
    acceptedRows.size !== rowCountAccepted ||
    terminalEvidence.bySourceRow.size !== rowCountAccepted
  ) {
    return false;
  }

  for (const sourceRow of acceptedRows) {
    if (!terminalEvidence.bySourceRow.has(sourceRow)) {
      return false;
    }
  }

  return true;
}

function isFreshnessExceeded(
  lastApprovedObservation: BatchTimestampInput,
  freshness: BatchFreshnessPolicy | null,
): boolean {
  if (freshness === null) {
    return false;
  }

  requireNamedFact(freshness);
  const freshnessWindowMs = toNonNegativeInteger(freshness.freshnessWindowMs);

  return (
    toTime(freshness.referenceTime) - toTime(lastApprovedObservation) >
    freshnessWindowMs
  );
}

function hasProducerActivity(
  observations: BatchProducerObservationFacts,
  terminalEvidence: TerminalEvidence,
): boolean {
  return (
    observations.acceptedRows.length > 0 ||
    terminalEvidence.bySourceRow.size > 0
  );
}

function statusBasisFor(status: BatchStatus): BatchSummary["statusBasis"] {
  switch (status) {
    case "SUBMITTED":
      return "SUBMISSION_RECORDED";
    case "ACCEPTED":
      return "ACCEPTANCE_CONFIRMED";
    case "PROCESSING":
      return "PRODUCER_ACTIVITY_OBSERVED";
    case "COMPLETED":
      return "PRODUCER_CLOSED_ALL_ROWS_TERMINAL";
    case "INCOMPLETE":
      return "PRODUCER_CLOSED_ROWS_MISSING";
    case "NO_UPDATE":
      return "FRESHNESS_WINDOW_EXCEEDED";
  }
}
