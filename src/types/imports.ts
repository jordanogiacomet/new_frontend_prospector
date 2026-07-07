export interface BatchSourceSummary {
  import_batch_id: string;
  firstAnalysisAt: string;
  lastAnalysisAt: string;
  savedDecisionCount: number;
  analyzedCompanyCount: number;
}

export type BatchStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "PROCESSING"
  | "COMPLETED"
  | "INCOMPLETE"
  | "NO_UPDATE";

export type BatchStatusBasis =
  | "SUBMISSION_RECORDED"
  | "ACCEPTANCE_CONFIRMED"
  | "PRODUCER_ACTIVITY_OBSERVED"
  | "PRODUCER_CLOSED_ALL_ROWS_TERMINAL"
  | "PRODUCER_CLOSED_ROWS_MISSING"
  | "FRESHNESS_WINDOW_EXCEEDED";

export type BatchObservationStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "INCONSISTENT";

export type BatchObservationBasis =
  | "PRODUCER_SOURCE_UNAVAILABLE"
  | "PRODUCER_EVIDENCE_CONFLICT"
  | "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE";

export type BatchTerminalClass = "MATERIALIZED" | "BLOCKED" | "FAILED";

export type BatchTimestampInput = Date | string;

export interface BatchNamedFact {
  readonly factSource: string;
}

export interface BatchSubmissionFact extends BatchNamedFact {
  readonly submissionId: string;
  readonly submittedAt: BatchTimestampInput;
}

export interface BatchAcknowledgementFact extends BatchNamedFact {
  readonly import_batch_id: string;
  readonly acknowledgedAt: BatchTimestampInput;
}

export interface BatchAcceptanceFact extends BatchNamedFact {
  readonly import_batch_id: string;
  readonly acceptedAt: BatchTimestampInput;
  readonly rowCountAccepted: number;
}

export interface BatchObservedAtFact extends BatchNamedFact {
  readonly observedAt: BatchTimestampInput;
}

export interface BatchAcceptedRowFact extends BatchNamedFact {
  readonly sourceRow: number;
}

export type BatchTerminalOutcomeFact =
  | (BatchNamedFact & {
      readonly sourceRow: number;
      readonly terminalClass: "MATERIALIZED";
      readonly leadRunId: string;
    })
  | (BatchNamedFact & {
      readonly sourceRow: number;
      readonly terminalClass: "BLOCKED" | "FAILED";
    });

export interface BatchCloseFact extends BatchNamedFact {
  readonly closedAt: BatchTimestampInput;
}

export interface BatchRetainedLegacyObservationFact
  extends BatchNamedFact {
  readonly sourceRow: number | null;
  readonly leadRunId: string | null;
  readonly observedAt: BatchTimestampInput;
}

export interface BatchProducerObservationFacts extends BatchNamedFact {
  readonly availability: "AVAILABLE" | "UNAVAILABLE";
  readonly unavailableBasis?: "PRODUCER_SOURCE_UNAVAILABLE";
  readonly lastObservedAt: BatchObservedAtFact | null;
  readonly acceptedRows: readonly BatchAcceptedRowFact[];
  readonly terminalOutcomes: readonly BatchTerminalOutcomeFact[];
  readonly close: BatchCloseFact | null;
  readonly retainedLegacyObservations?: readonly BatchRetainedLegacyObservationFact[];
}

export interface BatchFreshnessPolicy extends BatchNamedFact {
  readonly referenceTime: BatchTimestampInput;
  readonly freshnessWindowMs: number;
}

export interface BatchStatusMapperInput {
  readonly submission: BatchSubmissionFact;
  readonly acknowledgement: BatchAcknowledgementFact | null;
  readonly acceptance: BatchAcceptanceFact | null;
  readonly producerObservations: BatchProducerObservationFacts | null;
  readonly freshness: BatchFreshnessPolicy | null;
}

export interface BatchSummary {
  readonly submissionId: string;
  readonly import_batch_id: string | null;
  readonly status: BatchStatus;
  readonly submittedAt: string;
  readonly acceptedAt: string | null;
  readonly lastObservedAt: string | null;
  readonly rowCountAccepted: number | null;
  readonly terminalCount: number | null;
  readonly blockedCount: number | null;
  readonly failedCount: number | null;
  readonly leadCount: number | null;
  readonly statusBasis: BatchStatusBasis;
  readonly observationStatus: BatchObservationStatus;
  readonly observationBasis: BatchObservationBasis | null;
}
