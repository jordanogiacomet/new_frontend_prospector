# Batch Status Contract

**Status:** APPROVED SEMANTIC TARGET — official webhook cannot yet prove
durable acceptance or completion

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
| `import_batch_id` | Producer | Batch identity returned by the official workflow |
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
  import_batch_id: string | null;
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

### Individual processing notices

`GET /api/imports/:id?processedCompaniesPage=1&pageSize=100` preserves
`BatchSummary` and optionally adds `meta.processedCompanies`. Authorization
requires `imports:read` and the imports feature before validating the request.
The app verifies the submission in the actor's organization before any
individual producer read. Producer access additionally requires
`FEATURE_BATCH_OBSERVATION_ENABLED`, a known correlated `import_batch_id` and
synthetic demo mode disabled; visibility is resolved from the verified actor.

- Named fact source: `producer_current_company_results_v1`, a SELECT of current
  `company_validations` joined to their last `company_validation_runs` through
  matching analysis, company, batch and row identities.
- Allowed `processing_result` values: `INSERIDO_VALIDATION` and
  `CRM_DECIDIU_E_SALVO`; both records require integrity `OK`. Existing producer
  visibility predicates and query safety bounds still apply. Ambiguous
  company/run or batch/row identities are excluded rather than selected.
- Field allowlist: positive safe-integer `source_row` and `processedAt` mapped
  from the matched run's `run_created_at`. This is the recorded analysis date,
  not a newly established completion timestamp. No name, CNPJ, contact, CSV
  row, recommendation, payload or run identifier is exposed.
- The metadata contains `available`, `data`, `page`, `pageSize`, `total` and
  `factSource`. A missing gate, unknown correlation or synthetic demo data
  returns `available:false`, `data:[]`, `total:null` without visibility or
  producer repository reads. Read failure returns a safe error; zero requires
  an authorized successful query. Pages contain at most 100 results.
- A correlated approved current result supports “Empresa processada” for its
  row. Upload receipt, workflow start, absent callback, blocked/failed/unknown
  result or observation failure does not support this notice.
- This is a mutable current projection. Later processing may replace a current
  company result; it is not an immutable historical terminal ledger or a
  complete enumeration of all processed rows in the batch.
- Its total is independent from `rowCountAccepted`, `terminalCount`,
  `blockedCount`, `failedCount`, `leadCount`, producer recommendations and batch
  status. It does not establish durable acceptance or promote `COMPLETED`.
  Existing nullability and completion requirements remain unchanged.

The browser reads this metadata exclusively for individual company notices.
A newly confirmed app upload subscribes with `includeExisting:true`, allowing
results already recorded before its first read. Existing list/detail pages
subscribe with `false`: their first successful complete paginated read
establishes a historical baseline without notices. List subscriptions cover
valid visible submission IDs, remain stable across refreshes of the same ID set
and are released on pagination or navigation. The private-layout provider
retains baseline and row deduplication across subscription release/navigation;
reloading starts a new visual session.

Every newly observed submission/row queues once. Partial reads and failures
neither advance the baseline nor produce success. Observation uses GET every
five seconds, without overlap, only in the visible imports area. 401/403 stop
all observations and clear notices; 404 stops the affected submission. An
explicit operational close plus a complete unique result set equal to the
reported row count may stop browser polling only, never change batch status
or its nullable counts.

### Individual receipts — historical compatibility

`GET /api/imports/:id?receivedCompaniesPage=1&pageSize=100` continues to
preserve the batch read model and optionally add `meta.receivedCompanies`.
The read requires `imports:read`, the imports feature gate and a submission in
the actor's organization before querying the paginated app-owned receipt source.
A request combining received and processed pagination views is rejected before
database work.

- Fact source: `prospecting_app.import_received_companies`, recorded from the
  authenticated `ACCEPTED_ROW` callback in the start-report transaction.
- Identity: organization, submission and positive safe-integer `source_row`;
  duplicate callbacks retain the first reported timestamp.
- Field allowlist: `source_row`, `receivedAt`; no name, CNPJ, contact, CSV row,
  producer payload or run identifier is retained or exposed by this source.
- The envelope contains `available`, `data`, `page`, `pageSize` and `total`.
  Unavailable synthetic facts use `available:false`, `data:[]`, `total:null`;
  database failure returns a safe error. Zero requires a successful scoped read.
- A receipt proves only receipt and row position. Missing row identity does
  not create a receipt. Historical callbacks are not reconstructed from
  retained producer rows or CSV contents. Receipt data no longer feeds the
  company confirmation popup and cannot prove individual processing.
- Receipt pagination and its total are independent from `rowCountAccepted`,
  `terminalCount`, `leadCount`, status and producer recommendations. Neither a
  receipt nor the operational workflow close promotes contractual completion.
- Migration 019 and its recorded historical deployment remain applicable.
  Receipts are append-only; application rollback retains populated storage.

### Batch states

| State | Minimum evidence |
| --- | --- |
| `SUBMITTED` | Durable app submission exists; no validated producer acceptance |
| `ACCEPTED` | Valid `202` response is backed by durable producer acceptance and is stored by the app |
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

## Current Official Workflow Limitation

The official `EmpresaAqui_Webhook_Import_v1.json` workflow returns
`import_batch_id` and `row_count` in a controlled `202` after extraction and
normalization. Its response branch does not wait for a durable batch acceptance
record. `company_validation_runs.import_batch_id` plus `source_row` can provide
later observations, but the current model has no batch master acceptance row
or proven completion marker.

Therefore the response may be retained as an acknowledgement/correlation fact,
but it cannot advance the batch to `ACCEPTED` or `COMPLETED` under this
contract. `SUBMITTED` remains the last independently proven app status until
durable acceptance evidence exists.

## Planned Versioned Acceptance Source

The local implementation plan introduces a producer-owned acceptance ledger
and an allowlisted read view keyed by the app `submissionId`. This source is a
planned contract, not a fact exposed by the current workflow.

For the versioned ingress, the app may persist `DURABLE_ACCEPTED` only when a
read-back matches all of:

- organization-scoped app submission;
- exact app-owned file SHA-256;
- canonical producer `import_batch_id`;
- positive durable accepted-row count;
- producer acceptance timestamp.

The promotion and its append-only reconciliation event must commit in one
app-owned transaction. Missing or conflicting read-back preserves the previous
status. A timeout does not trigger another n8n call. `NO_UPDATE` remains
disabled until its environment-specific freshness window has an operational
owner.

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
