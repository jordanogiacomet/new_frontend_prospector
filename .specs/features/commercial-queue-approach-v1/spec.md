# Commercial queue approach v1

**Status**: The B/C automatic-preparation baseline is deployed to the
authorized Demo 3 local pre-production profile as release
`demo3-preprod-20260817-commercial-queue-approach-001`. The shared-presentation
extension was published as
`demo3-preprod-20260817-shared-approach-001`, so one persisted message is shown
consistently in the lead, its commercial workspace and the queue, including
messages generated manually for companies below priority C.

## Problem statement

The lead detail can generate a report-grounded Apollo Gestão approach message,
but the manager still has to open each company and explicitly request it. The
commercial queue should make that draft ready for the currently listed
priority-B and priority-C companies without charging again on every refresh.

## Goals

- Prepare one AI approach draft when an eligible company first appears in the
  commercial queue.
- Treat the currently approved exact producer priorities `B` and `C` as the
  owner-defined “nota C mínima” set.
- Persist and reuse the draft by organization, CNPJ, producer run and generator
  version.
- Keep the draft editable and copyable while never sending it.
- Prevent concurrent requests from producing more than one provider call for
  the same cache identity.

## Out of scope

| Capability | Reason |
| --- | --- |
| Background generation for companies never loaded in the queue | No worker or scheduled-job authority was requested. |
| Automatic email, WhatsApp, CRM or n8n outreach | The owner authorized draft preparation, not sending. |
| Re-ranking or changing producer priority | `priority` remains an immutable producer fact. |
| Automatic drafts for `D`, `E` or `R` | They remain below the owner-defined C-minimum threshold; a manager may still generate one manually from the lead. |
| Storing strategic reports or raw provider responses | The app-owned cache stores only the validated final draft. |

## P1 user stories

### Ready-to-review queue draft

As a business manager, I want each priority-B or priority-C company in the
visible queue page to receive a report-grounded message automatically so that I
can review and copy it without opening every lead.

### Cost-safe reuse

As the product owner, I want one durable draft per report/generator version so
that refreshes and concurrent browser sessions do not repeat provider charges.

## Acceptance criteria

1. **CQA-01** — WHEN a queue item has the exact producer priority `B` or `C`
   and no current draft THEN the browser SHALL request automatic preparation
   through the authenticated Prospecta route.
2. **CQA-02** — WHEN a queue item has priority `D`, `E`, `R`, null or an unknown
   value THEN the UI SHALL NOT request automatic preparation.
3. **CQA-03** — BEFORE any app read/write, producer read or provider call, the
   generation route SHALL require `leads:read`, `sensitive:read`, same-origin
   and the existing server-only AI configuration gate.
4. **CQA-04** — The server SHALL cache only the validated message, scoped by
   organization, normalized CNPJ, observed `lead_run_id` and generator version.
5. **CQA-05** — WHEN two requests race for the same cache identity THEN one
   durable claim SHALL own generation and all other requests SHALL reuse the
   ready result or report that preparation is in progress without calling the
   provider.
6. **CQA-06** — WHEN a current ready draft exists THEN queue reads and the lead
   route SHALL return it without another provider call.
7. **CQA-07** — WHEN generation fails THEN the current queue SHALL show a safe
   unavailable state; a later page visit MAY claim a new attempt only after the
   recorded retry time, with no retry inside the failed provider request.
8. **CQA-08** — WHEN a ready draft is displayed THEN the manager SHALL be able
   to edit and copy the exact text, and the UI SHALL state that Prospecta does
   not send the message.
9. **CQA-09** — Queue draft content SHALL be returned only when the actor also
   has `leads:read` and `sensitive:read`; all private responses SHALL remain
   `private, no-store`.
10. **CQA-10** — Automatic queue preparation SHALL have its own server-only
    feature flag, disabled by default, in addition to the existing AI gate.
11. **CQA-11** — WHEN a current ready draft exists for the selected company
    run THEN the lead, its commercial workspace and the queue SHALL show that
    exact persisted message, regardless of producer priority.
12. **CQA-12** — WHEN the manager manually generates a message from any lead
    THEN the validated result SHALL be persisted under the same cache identity
    used by the queue, without changing queue membership or producer priority.
13. **CQA-13** — Reading a lead or workspace SHALL hydrate an existing cache
    state without invoking the provider or creating a draft.
14. **CQA-14** — A queue item below priority C with no current draft SHALL keep
    `approachDraft` null and SHALL NOT be selected for automatic generation;
    once a manual draft exists, that same item SHALL expose its persisted
    state and message on the next queue read.

## Edge cases

- An active claim is shown as preparing; an expired claim is claimable again.
- A failed claim remains unavailable until its retry time and then becomes
  missing/claimable on a later queue read.
- A changed producer run or generator version creates a distinct cache identity.
- Demo fixtures do not create persistent drafts or automatic provider calls.
- Provider, database and validation failures never expose prompts, reports,
  credentials, models or upstream bodies.

## Requirement traceability

| Requirement | Design owner | Status |
| --- | --- | --- |
| CQA-01, CQA-02, CQA-08 | Queue component | Verified |
| CQA-03, CQA-06, CQA-07 | Approach route/service | Verified |
| CQA-04, CQA-05 | App migration/cache repository | Verified |
| CQA-09 | Work-queue route/repository | Verified |
| CQA-10 | Environment and Demo 3 packaging | Verified |
| CQA-11, CQA-13 | Lead/workspace cache hydration | Verified locally |
| CQA-12, CQA-14 | Shared cache and work-queue decoration | Verified locally |

**Coverage**: 14 total, 14 mapped, 0 unmapped.

## Success criteria

- [x] Every visible priority-B/C queue item reaches ready, preparing or safe
  unavailable state without a manual generation click.
- [x] Reloading a ready item performs zero additional provider calls.
- [x] Concurrent cache claims permit at most one provider call per identity.
- [x] Synthetic unit, route, component and PostgreSQL migration/repository tests
  pass with lint, strict typecheck and production build.
- [x] A ready persisted message hydrates in the lead and commercial workspace
  without a provider-generating request.
- [x] A manually generated lower-priority message appears in the queue while an
  absent lower-priority draft remains ineligible for automatic generation.
