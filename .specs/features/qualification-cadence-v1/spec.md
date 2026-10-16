# Qualification cadence v1

Status: implemented, validated and published to the authorized Demo 3 local
pre-production target on 2026-08-18. Production remains separately gated.

## Problem statement

The manager needs a consistent four-contact qualification sequence for each
commercial lead. Today activities and one next action can be recorded, but the
workspace does not show which qualification contact is current, when the next
one is due, or how a response changes the remaining sequence.

## Goals

- Create exactly four scheduled qualification contacts for one active lead
  workspace.
- Let the manager record what happened and advance, reschedule or stop the
  sequence through explicit business outcomes.
- Keep the sequence visible as four compact expandable rows with Brazilian
  dates and a clear current step.
- Persist only app-owned commercial state and append the corresponding activity
  plus audit event in the same transaction.

## Out of scope

| Capability | Reason |
| --- | --- |
| Automatic message sending | The approved commercial workspace is review-only and has no outreach transport. |
| Automatic detection of replies | No approved WhatsApp, e-mail or CRM inbound contract exists. |
| Producer score, priority or recommendation changes | Qualification cadence is separate app-owned commercial state. |
| Contact identity or new PII storage | The cadence records channel, outcome and optional activity summary only. |
| More or fewer than four contacts | The requested v1 sequence is exactly four contacts. |

## User stories

### P1: Start a four-contact cadence

As a commercial manager, I want to choose a start date and interval so that the
lead has four visible qualification contacts scheduled consistently.

Acceptance criteria:

1. WHEN an authorized manager starts a cadence THEN the system SHALL create
   exactly four organization-scoped contacts numbered 1 through 4.
2. WHEN an interval from 1 through 30 days is supplied THEN the system SHALL
   schedule each later contact by that many calendar days after the prior one.
3. WHEN a cadence already exists for the workspace THEN the system SHALL return
   a safe conflict and SHALL NOT create a second cadence.
4. WHEN the cadence starts THEN the same transaction SHALL append a commercial
   activity and its allowlisted audit event.

### P1: Record and branch on the contact result

As a commercial manager, I want to record what the lead did so that the next
qualification contact reflects the result.

Acceptance criteria:

1. WHEN the current contact receives `NO_RESPONSE`, `RESPONDED` or
   `OTHER_RESPONSE` THEN the system SHALL complete it and expose the next
   scheduled contact.
2. WHEN the current contact receives `FOLLOW_UP_LATER` THEN the system SHALL
   require a future contact date and reschedule the next contact to that date.
3. WHEN a contact receives `QUALIFIED` THEN the system SHALL mark the cadence
   qualified and cancel every remaining contact.
4. WHEN a contact receives `NOT_INTERESTED` or `WRONG_CONTACT` THEN the system
   SHALL stop the cadence and cancel every remaining contact.
5. WHEN the fourth contact completes without an earlier terminal outcome THEN
   the system SHALL mark the cadence exhausted.
6. WHEN a non-current, completed or cancelled contact is submitted THEN the
   system SHALL return a conflict without retrying or changing data.
7. WHEN a contact is completed THEN the same transaction SHALL append one
   channel-specific commercial activity and its allowlisted audit event; the
   optional summary SHALL NOT enter audit metadata.

### P1: Operate the cadence in the lead workspace

As a commercial manager, I want four compact contact rows so that I can see the
whole sequence without losing focus on the current action.

Acceptance criteria:

1. WHEN no cadence exists THEN the workspace SHALL explain the feature and show
   start date plus interval controls only to commercial writers.
2. WHEN a cadence exists THEN the workspace SHALL show four numbered rows with
   scheduled date, state and expandable details.
3. WHEN a contact is current THEN its expanded content SHALL offer channel,
   outcome, occurrence time and optional summary controls to commercial
   writers.
4. WHEN `FOLLOW_UP_LATER` is selected before the fourth contact THEN the form
   SHALL require the new date before submission.
5. WHEN the actor is read-only THEN the cadence SHALL remain visible without
   mutation controls.
6. WHEN cadence loading or mutation fails THEN the workspace SHALL retain its
   current data and show safe business copy without internal details.

## Fixed branching rules

| Recorded outcome | Cadence behavior |
| --- | --- |
| No response | Complete current contact and advance. |
| Responded | Complete current contact and advance. |
| Asked to talk later | Complete current contact, advance and move the next date. |
| Qualified | Complete current contact and cancel the remaining sequence. |
| Not interested | Complete current contact and cancel the remaining sequence. |
| Wrong contact | Complete current contact and cancel the remaining sequence. |
| Other response | Require a summary, complete current contact and advance. |

## Requirements

- `QCAD-01` — Cadence storage SHALL be app-owned, organization-scoped, linked
  only to an active app workspace and immutable in membership after creation.
- `QCAD-02` — A workspace SHALL have zero or exactly four contacts with unique
  positions 1 through 4 and no runtime delete permission.
- `QCAD-03` — The server SHALL enforce the fixed branching table under a
  workspace/contact lock and SHALL fail stale or out-of-order writes with 409.
- `QCAD-04` — Every start or completion transaction SHALL append a commercial
  activity and allowlisted audit event without copying summary text into audit.
- `QCAD-05` — The API SHALL require commercial read/write permissions,
  same-origin mutation, feature enablement and server-derived organization and
  actor identity.
- `QCAD-06` — The UI SHALL expose four responsive, keyboard-accessible,
  expandable rows and Brazilian date/time presentation.
- `QCAD-07` — Cadence state SHALL remain visibly separate from producer facts,
  qualification scores and outreach delivery.

## Edge cases

- A missing or cross-organization workspace returns the same safe not-found
  result.
- A fourth contact cannot use `FOLLOW_UP_LATER` because v1 has no fifth slot.
- `OTHER_RESPONSE` requires a non-empty summary; other outcomes may omit it.
- Scheduled dates may become overdue and remain factual; the system never marks
  a contact completed based only on time.
- Database or network failure leaves the last confirmed UI state intact and is
  never retried automatically.

## Traceability

| Requirement | Design | Task | Status |
| --- | --- | --- | --- |
| QCAD-01, QCAD-02 | App-owned four-row storage | T1 | Pass |
| QCAD-03, QCAD-04 | Transactional repository | T3 | Pass |
| QCAD-05 | Validator and route boundary | T2, T4 | Pass |
| QCAD-06 | Cadence component and workspace integration | T5, T6 | Pass |
| QCAD-07 | Copy, DTO and no-outreach boundary | T2, T5 | Pass |

## Success criteria

- [x] A manager can start one four-contact cadence in under one minute.
- [x] Each allowed result produces the exact documented next state.
- [x] Completed contacts appear in the existing activity and audit histories.
- [x] Read-only, loading, empty, conflict and error states are usable.
- [x] Lint, typecheck, unit, PostgreSQL integration, contract and build gates pass.
