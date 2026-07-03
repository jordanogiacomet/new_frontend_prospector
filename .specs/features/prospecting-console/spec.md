# Prospecta — Prospecting Console Specification

**Status:** AUTHORIZED FOR STAGED IMPLEMENTATION  
**Date:** 2026-07-03  
**Authority:** repository-owner authorization recorded on 2026-07-03 and
formalized in `AGENTS.md`

Development, synthetic/local verification, and preparation of a separate
versioned n8n ingress are authorized. Production migration, workflow
activation, deployment, and release remain separately gated.

## Problem Statement

The current read-only lead browser exposes retained n8n qualification results,
but it does not support audited batch submission or commercial follow-up. The
producer workflow also lacks the ingress, correlation, idempotency, and batch
completion contracts required for the app to add those capabilities safely.

The contract package is now the implementation baseline. External producer,
identity, database, data-policy, and production evidence gates remain explicit
dependencies rather than being silently assumed.

## Goals

- [x] Define an approvable boundary between producer data and app-owned data.
- [x] Define a versioned, authenticated n8n import contract with replay safety.
- [x] Define honest batch states that do not infer success or failure.
- [x] Define actor identity, permissions, and append-only write auditing.
- [x] Define CSV retention and sensitive-content policies.
- [x] Establish evidence and performance gates before implementation planning.
- [x] Establish an atomic implementation plan with external gates.

## Phase 0 Approval Gates

Repository implementation may proceed under the following gate split.
Integration or production activation may not cross a pending external gate:

| Gate | Required decision | Current status |
| --- | --- | --- |
| PC-G01 | Repository product authority | Approved for staged development; LGPD owner still required for production sensitive content |
| PC-G02 | Controlling repository instructions | Approved; formalized in `AGENTS.md` |
| PC-G03 | Separate versioned ingress rather than current workflow change | Approved for development; non-production n8n owner/target pending |
| PC-G04 | HMAC, idempotency, and `202` acceptance contract | Approved as `prospecting-import-v1`; executable endpoint proof pending |
| PC-G05 | Batch/row/terminal correlation and completion semantics | Contract finalized; producer persistence/view proof pending |
| PC-G06 | App-owned schema and separate roles | Local/non-production design authorized; production target/grants/migration approval pending |
| PC-G07 | Actor and permission model | Application policy authorized; identity-provider claim/role assignment pending |
| PC-G08 | CSV retention | Direct-forwarding baseline authorized; operations/data-policy production approval pending |
| PC-G09 | Sensitive content | Deny-by-default mechanism authorized; exact production field/host/contact allowlists pending |
| PC-G10 | Query scale, indexes, and production-like performance envelope | Pending |

## Permanent and production-gated exclusions

| Capability | Reason |
| --- | --- |
| Browser-to-n8n or browser-to-PostgreSQL | Permanent trust-boundary prohibition |
| Current productive workflow edits | Permanent for this initiative; ingress is separate and versioned |
| Production n8n calls | Blocked until an approved endpoint, secret, owner, rollout, and rollback exist |
| Production database migrations | Blocked until target, credentials, review, and rollback are approved |
| App-owned production writes | Blocked until schema grants, actor claims, backup, and rollout gates pass |
| Producer-table writes | Permanent system-boundary prohibition |
| Automatic retry or reprocessing | Can duplicate cost and processing |
| Score/action/verdict recalculation | n8n remains the sole qualification producer |
| Export, broad analytics, CRM sync | Not required for the first commercial console MVP |

## User Stories

### P1: Approve a safe producer ingress contract

**User Story:** As the integration owner, I want a versioned and authenticated
batch acceptance contract so that every accepted upload has stable correlation
and replay semantics.

**Acceptance Criteria:**

1. WHEN the contract is approved THEN it SHALL identify the producer endpoint,
   owner, authentication method, request limits, and contract version.
2. WHEN the same idempotency key and file hash are replayed THEN the producer
   SHALL return the original acceptance without creating another batch.
3. WHEN the same idempotency key is paired with a different hash THEN the
   producer SHALL reject it with `409`.
4. WHEN the producer accepts a submission THEN it SHALL return `202` with an
   opaque `producerBatchId`, the accepted row count, and acceptance time.
5. WHEN the producer cannot prove acceptance THEN the app SHALL not display the
   batch as accepted.

**Independent Test:** Execute contract tests against a non-production producer
endpoint and verify replay, conflict, authentication, and safe errors.

### P1: Preserve the producer/app data boundary

**User Story:** As the system owner, I want producer decisions to remain
immutable to the app so that commercial activity cannot corrupt qualification
history.

**Acceptance Criteria:**

1. WHEN the app reads qualification data THEN it SHALL use a producer role with
   `SELECT` only on approved sources.
2. WHEN the app records commercial state THEN it SHALL write only to an
   app-owned schema through a distinct database role.
3. WHEN commercial state references a lead THEN it SHALL retain the observed
   `lead_run_id` without changing the producer row.
4. WHEN producer content is absent or mutable THEN the UI SHALL represent it as
   absent, unavailable, stale, or incomplete rather than fabricate a value.

**Independent Test:** Database privilege tests prove that the producer role
cannot write and the app role cannot mutate producer tables.

### P1: Identify and authorize every actor

**User Story:** As an auditor, I want every privileged read and commercial
write attributed to an organization member so that actions are reviewable.

**Acceptance Criteria:**

1. WHEN authentication succeeds THEN the server authorization context SHALL
   retain the verified issuer, subject, organization, and approved permissions.
2. WHEN a user lacks a required permission THEN the server SHALL return a safe
   `403` before performing database or producer work.
3. WHEN an app-owned record changes THEN an append-only event SHALL capture the
   actor, organization, timestamp, action, and target identifiers.
4. WHEN sensitive content is requested THEN a distinct permission SHALL be
   evaluated server-side.

**Independent Test:** Route tests cover missing session, wrong organization,
missing permission, and actor-attributed success.

### P1: Report batch state honestly

**User Story:** As a manager, I want to understand what is known about a batch
without mistaking missing telemetry for success or failure.

**Acceptance Criteria:**

1. WHEN only app submission exists THEN the state SHALL be `SUBMITTED`.
2. WHEN a valid producer acceptance exists THEN the state SHALL be `ACCEPTED`.
3. WHEN producer work is observed without a proven terminal batch condition
   THEN the state SHALL be `PROCESSING` or `NO_UPDATE`, according to an approved
   freshness policy.
4. WHEN completion cannot be proven THEN the app SHALL not show `COMPLETED`.
5. WHEN counts are unavailable THEN the API SHALL return `null`, not zero.
6. WHEN failure or blocking is shown THEN it SHALL be backed by an approved
   explicit producer terminal result.

**Independent Test:** Mapper fixtures cover every state, nullable count, stale
observation, duplicate event, and incomplete correlation.

### P1: Govern CSV and sensitive data

**User Story:** As the data-policy owner, I want explicit retention and content
rules so that the console minimizes exposure of business and personal data.

**Acceptance Criteria:**

1. WHEN a CSV is received THEN only the approved transient mechanism SHALL hold
   its bytes, for the approved maximum duration.
2. WHEN upload processing reaches a defined terminal point or retention limit
   THEN deletion SHALL be attempted and auditable without logging contents.
3. WHEN report, evidence, URL, contact, or CRM content lacks semantic approval
   THEN the API SHALL withhold it.
4. WHEN external URLs are exposed THEN they SHALL pass a server-side protocol
   and host policy.
5. WHEN report text is rendered THEN it SHALL be sanitized.

**Independent Test:** Policy tests prove withheld-by-default behavior, safe URL
handling, sanitization, and deletion-event recording.

### P2: Deliver a controlled import experience

After the relevant external integration gates pass, an authorized manager can
submit one valid EmpresaAqui CSV, receive producer acceptance, and monitor
correlated progress.

### P2: Deliver a commercial work queue

Authorized staged implementation may build this capability against a
disposable app schema. Production use still requires the database, identity,
security, and rollout gates.

### P3: Expand governed content and integrations

Contact content, CRM integration, notifications, analytics, and exports remain
separate, policy-gated features.

## Requirement Traceability

| Requirement ID | Requirement | Artifact | Status |
| --- | --- | --- | --- |
| PC-01 | Versioned authenticated ingress | `contracts/n8n-import-webhook.md` | Approved for implementation |
| PC-02 | Replay-safe upload idempotency | `contracts/n8n-import-webhook.md` | Approved for implementation |
| PC-03 | Honest batch status | `contracts/batch-status-contract.md` | Approved; producer proof pending |
| PC-04 | Producer/app write isolation | `decisions/producer-app-boundary.md` | Approved |
| PC-05 | Actor identity and permissions | `contracts/authorization-policy.md` | Approved; IdP mapping pending |
| PC-06 | App-owned commercial model | `contracts/app-write-model.md` | Approved for local/non-production |
| PC-07 | CSV retention and deletion | `decisions/csv-retention.md` | Approved baseline; production policy pending |
| PC-08 | Sensitive-content policy | `decisions/sensitive-content-policy.md` | Approved framework; production allowlists pending |
| PC-09 | Current producer evidence | `evidence/current-workflow-map.md` | Verified locally |
| PC-10 | Current database evidence | `evidence/database-source-map.md` | Verified locally |
| PC-11 | Scale and query evidence | `evidence/query-performance-gates.md` | External gate pending |
| PC-12 | Superficial exact-byte upload validation | `contracts/n8n-import-webhook.md` | Approved for implementation |
| PC-13 | Batch list/detail | `contracts/batch-status-contract.md` | Approved for implementation |
| PC-14 | Commercial queue and optimistic assignment | `contracts/app-write-model.md` | Approved for implementation |
| PC-15 | Append-only activities, notes, and audit | `contracts/app-write-model.md` | Approved for implementation |
| PC-16 | Sensitive field/URL/Markdown controls | `decisions/sensitive-content-policy.md` | Approved framework |
| PC-17 | UAT, security review, gradual rollout and rollback | `tasks.md` | Planned |

**Coverage:** 17 requirements mapped to contracts, decisions, evidence, and
atomic tasks. Performance and external integration evidence remain pending.

## Success Criteria

- [x] Repository authority and permanent producer boundaries are explicit.
- [x] Every contract has a versioned or executable verification direction.
- [x] `AGENTS.md` conflicts are resolved.
- [x] A feature task list records dependencies and external gates.
- [ ] Every external gate has a named accountable owner and target before use.
- [ ] Non-production contract/integration evidence passes.
- [ ] Production migration, activation, deployment, and rollout receive
      separate explicit approval.
