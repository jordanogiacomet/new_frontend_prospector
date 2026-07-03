# Batch Status Contract

**Status:** APPROVED FOR IMPLEMENTATION — current workflow still cannot prove
completion

## Principle

Every displayed state and count must be backed by a named fact source. Absence
of a producer event is not success or failure, and an unavailable count is
`null`, not `0`.

## Identifiers

| Identifier | Owner | Purpose |
| --- | --- | --- |
| `submissionId` | App | Stable app submission and audit identity |
| `idempotencyKey` | App/producer contract | Replay identity; not shown in the main UI |
| `fileSha256` | App/producer contract | Byte correlation; audit-only |
| `producerBatchId` | Producer | Opaque producer batch identity |
| `sourceRow` | Producer | Row position with approved header semantics |
| `leadRunId` | Producer | Distinct analysis identity |

## API Read Model

```ts
type BatchStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "PROCESSING"
  | "COMPLETED"
  | "INCOMPLETE"
  | "NO_UPDATE";

interface BatchSummary {
  submissionId: string;
  producerBatchId: string | null;
  status: BatchStatus;
  submittedAt: string;
  acceptedAt: string | null;
  lastObservedAt: string | null;
  rowCountAccepted: number | null;
  terminalCount: number | null;
  blockedCount: number | null;
  failedCount: number | null;
  leadCount: number | null;
  statusBasis: string;
  observationStatus: "AVAILABLE" | "UNAVAILABLE" | "INCONSISTENT";
  observationBasis: string | null;
}
```

`statusBasis` is an allowlisted explanatory code, not raw producer telemetry.

Approved codes are:

```text
SUBMISSION_RECORDED
ACCEPTANCE_CONFIRMED
PRODUCER_ACTIVITY_OBSERVED
PRODUCER_CLOSED_ALL_ROWS_TERMINAL
PRODUCER_CLOSED_ROWS_MISSING
FRESHNESS_WINDOW_EXCEEDED
```

Approved `observationBasis` values are
`PRODUCER_SOURCE_UNAVAILABLE`, `PRODUCER_EVIDENCE_CONFLICT`, and
`PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE`.

When producer observations are unavailable or inconsistent, the app retains
the last independently proven app/acceptance status, sets producer-derived
counts to `null`, and reports the observation condition separately. It never
advances to `COMPLETED` or chooses among conflicting facts.

## State Derivation

| State | Minimum evidence |
| --- | --- |
| `SUBMITTED` | Durable app submission exists; no validated producer acceptance |
| `ACCEPTED` | Valid, durable `202` acceptance is stored |
| `PROCESSING` | Acceptance exists and approved producer activity is observed, but batch completion is not proven |
| `COMPLETED` | Producer has an explicit durable close fact and every accepted row identity has exactly one approved terminal outcome |
| `INCOMPLETE` | Producer explicitly closes the batch while one or more accepted rows lack an approved terminal outcome |
| `NO_UPDATE` | Accepted/processing batch has no new approved observation beyond the configured freshness window |

`NO_UPDATE` does not mean failed. The freshness window requires operational
approval and may differ by environment.

## Count Rules

- `rowCountAccepted` comes only from durable producer acceptance.
- Terminal counts use distinct approved row identities, not event-row counts.
- Duplicate events do not increment business counts.
- `blockedCount` and `failedCount` require explicit approved terminal classes.
- `leadCount` means leads materialized under an approved rule; its relationship
  to accepted rows must be documented.
- Counts are `null` when their source is absent, unavailable, or not approved.
- Counts never derive from browser state.

## Current Legacy Limitation

`company_validation_runs.import_batch_id` plus `source_row` can provide
observations, but the current model has no batch master acceptance row or
proven completion marker. Therefore it can support a clearly labeled legacy
observation view, but not `SUBMITTED`, `ACCEPTED`, or `COMPLETED` under this
contract.

## Terminal Fact Contract

Approved contract-level terminal classes:

| Class | Meaning |
| --- | --- |
| `MATERIALIZED` | Producer completed the row and retained a correlated `leadRunId`/decision fact |
| `BLOCKED` | Producer explicitly ended the row without a lead decision under an approved blocking result |
| `FAILED` | Producer explicitly ended the row under an approved failure result |

The producer owner must document the exact producer result-to-class mapping
before integration. Unknown results are non-terminal. Conflicting or duplicate
terminal classes for one row make completion unavailable and trigger an
integrity alert; the app does not pick one.

Completion algorithm:

1. Require a durable validated acceptance.
2. Require a matching explicit producer close fact.
3. Build the set of accepted row identities from the approved producer source.
4. Build terminal facts by distinct row identity after rejecting conflicts.
5. If either set exceeds `rowCountAccepted`, retain the last independently
   proven status and set observation status to `INCONSISTENT`.
6. If every accepted row has exactly one terminal fact, return `COMPLETED`.
7. If the producer is closed and one or more accepted rows have no terminal
   fact, return `INCOMPLETE`.
8. Without a close fact, return `PROCESSING` or `NO_UPDATE`; never completion.

## External Evidence Blockers

- Producer physical source/view and row-identity proof.
- Exact producer-result mapping to the three terminal classes.
- Whole-batch close/completion persistence proof.
- Freshness window and operational owner.
- Retention guarantees for producer observations.

## Contract Tests

- Every state with minimal evidence only.
- Missing acceptance.
- Missing, duplicate, and conflicting row observations.
- Explicit close with missing terminals.
- No-update threshold.
- Nullable counts.
- Producer source unavailable.
- More terminal identities than accepted rows must fail closed.
