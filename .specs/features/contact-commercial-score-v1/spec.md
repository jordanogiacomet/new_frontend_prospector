# Contact Commercial Score v1

## Problem Statement

The commercial queue already presents the immutable producer score and the
governed Lusha decision-maker preview, but it does not render the approved
LinkedIn profile or help the operator assess whether one of the requested
accounting profiles was found.

## Goals

- Render one factual, policy-approved LinkedIn profile link when Lusha supplies
  it.
- Calculate an on-demand commercial contact score without changing or
  persisting the producer score.
- Explain which priority profile and bonus produced the commercial score.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Producer score or recommendation mutation | Producer facts are immutable |
| Database persistence or a new API route | The approved Demo 3 behavior is a derived UI indicator |
| Automatic recalculation | The operator must trigger the calculation |
| Fabricated LinkedIn search links | Only the factual provider URL may be exposed |

## P1: Factual LinkedIn profile

As a commercial operator, I want to open the factual LinkedIn profile supplied
for a decision maker so that I can confirm professional context.

Acceptance criteria:

1. WHEN an available candidate has an approved LinkedIn URL THEN the UI SHALL
   render an external `Abrir LinkedIn` link with no opener or referrer.
2. WHEN an available candidate has no approved URL THEN the UI SHALL state
   `LinkedIn não informado` and SHALL NOT fabricate a search URL.
3. WHEN a candidate is suppressed or expired THEN the UI SHALL NOT expose its
   LinkedIn URL.

## P1: Commercial contact score

As a commercial operator, I want to recalculate a separate contact-based score
so that the presence of a priority accounting profile is visible without
changing the producer evaluation.

Acceptance criteria:

1. WHEN the operator requests recalculation THEN the UI SHALL use only
   available candidates and apply the highest matching bonus once.
2. WHEN the best title is Financial Director or Controller THEN the bonus SHALL
   be 15; Accounting Manager 12; Accounting Coordinator 10; Accounting
   Supervisor 8; Accounting or Fixed Assets Analyst/Assistant 5.
3. WHEN a priority title is found and the producer score is available THEN the
   commercial score SHALL equal `min(100, producer score + bonus)`.
4. WHEN no priority title is found THEN the UI SHALL state that the score was
   not changed.
5. WHEN the producer score is unavailable THEN the UI SHALL not invent a
   commercial score.
6. The UI SHALL label producer and commercial scores separately and explain
   that the producer score remains unchanged.

## Requirement Traceability

| Requirement | Status |
| --- | --- |
| CCS-01: Safe factual LinkedIn link | Verified |
| CCS-02: Versioned title-to-bonus rules | Verified |
| CCS-03: Highest bonus and cap at 100 | Verified |
| CCS-04: Honest empty/unavailable states | Verified |
| CCS-05: Producer score remains immutable | Verified |

## Success Criteria

- [x] Component and rule unit tests pass with synthetic contacts only.
- [x] No route, migration, n8n workflow or producer write is introduced.
- [x] Repository lint, typecheck, unit tests and production build pass.
