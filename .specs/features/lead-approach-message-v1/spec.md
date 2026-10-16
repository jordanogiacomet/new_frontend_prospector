# Lead approach message v1

## Problem statement

The manager currently has to translate the lead's strategic report into a
first-contact message by hand. Requiring one explicit problem prevented drafts
for reports whose useful context is an opportunity, differential, asset,
summary, or sector. The lead detail should provide an editable draft for every
identified company with an available report, using its best approved business
context without creating an outreach channel or exposing internal qualification
language to the recipient.

## Goals

- [x] Build one editable Portuguese approach draft for the current company.
- [x] Prefer an explicit problem when present, but also use approved
  opportunities, differentials, assets, signals, summaries, prose, or sector.
- [x] Build a neutral company-specific draft when an available report contains
  no customer-facing business fact.
- [x] Let the manager copy the reviewed text with clear accessible feedback.

## Out of scope

| Capability | Reason |
| --- | --- |
| Send by email, WhatsApp, CRM, n8n, or another provider | Outreach automation is not authorized by this feature. |
| Call an LLM or add a usage cost | The available sanitized report is sufficient for this local draft. |
| Save or audit draft edits | The user requested a lead-screen helper, not a new app-owned write flow. |
| Include internal score, priority, confidence, or recommendation tokens | These are internal decision aids, not customer-facing copy. |
| Present sector, missing contact channels, debt, or opportunity as a proven problem | Those facts do not prove a customer pain suitable for outreach. |

## P1 user story: review and copy a personalized draft

As a business manager, I want an editable first-contact draft in the lead
detail so that I can approach each company with relevant context and retain
human control of the final wording.

### Acceptance criteria

1. **LAM-01** — WHEN the lead has an identified company and an available
   approved report THEN the UI SHALL show an editable message containing the
   company identity and the highest-priority approved business context.
2. **LAM-02** — WHEN company or approved report context changes THEN the generated
   message SHALL change materially; WHEN polling returns the same source facts
   THEN the UI SHALL preserve the manager's local edits.
3. **LAM-03** — WHEN the manager copies the draft THEN the UI SHALL copy the
   exact edited text and announce success; WHEN copying fails THEN it SHALL
   show an actionable error without losing the draft.
4. **LAM-04** — WHEN the report is missing, unavailable, or omitted by policy,
   or the company cannot be identified, THEN the UI SHALL show the matching
   unavailable explanation and SHALL NOT render a draft or copy action.
5. **LAM-05** — WHEN the report contains internal decision fields such as
   score, priority, confidence, fit, or research value THEN the customer-facing
   draft SHALL NOT reproduce those fields.
6. **LAM-06** — WHEN the draft is displayed THEN the UI SHALL state that it is
   a human-reviewed draft and that Prospecta does not send it.
7. **LAM-07** — WHEN an available report has no explicit problem THEN the UI
   SHALL use an approved opportunity, differential, asset, signal, summary,
   prose, or sector; WHEN none is safe to use THEN it SHALL provide a neutral
   identity-based draft without internal qualification fields.

## Edge cases

- Whitespace and underscore-separated presentation values are normalized.
- An empty edited draft disables copying.
- Context priority is challenge/need, opportunity, differential/asset/signal,
  summary/context, safe prose, and sector.
- Unknown report labels and risk codes are not reinterpreted as customer pain;
  safe unlabeled prose may be used only as neutral report context.
- Report content is inserted only as text and never as Markdown or HTML.

## Requirement traceability

| Requirement | Implementation | Verification | Status |
| --- | --- | --- | --- |
| LAM-01 | Draft formatter + lead component | Formatter/component tests | Verified |
| LAM-02 | Source-aware local draft state | Component rerender tests | Verified |
| LAM-03 | Clipboard action and live feedback | Component interaction tests | Verified |
| LAM-04 | Explicit unavailable states | Component state tests | Verified |
| LAM-05 | Safe context allowlist/denylist | Formatter tests | Verified |
| LAM-06 | Review and no-send notice | Component/page tests | Verified |
| LAM-07 | Ordered report-context selection and neutral fallback | Formatter/component tests | Verified |

## Success criteria

- [x] All seven requirements are verified with synthetic tests.
- [x] Existing lead-detail behavior remains green.
- [x] Lint, strict typecheck, full tests, and production build pass.

## Validation — 2026-08-14

- Focused feature and lead-detail gate: 3 files, 31 tests passed.
- Full regression gate: 115 files, 2,108 tests passed.
- Full ESLint and strict TypeScript checks passed.
- Production build passed with all local Demo 2/Demo 3 bypass gates disabled
  for the command; `.env.local` was not changed.
- No API, database, n8n, provider, persistence, or send capability was added.

## Demo 3 deployment — 2026-08-17

- Immutable release `demo3-preprod-20260817-lead-approach-001` is active on
  the authorized local pre-production target.
- Fresh lint, strict typecheck, 115 files / 2,108 tests and sanitized production
  build passed before rollout.
- App and PostgreSQL pods are Ready with zero container restarts.
- Anonymous detail access returned `401`; authenticated page/API returned
  `200`, and published client assets contain the feature copy.
- No response body, producer value, message draft, contact, or credential was
  recorded as release evidence.

## Problem-specific refinement — 2026-08-17

- Superseded by the all-report correction below after owner feedback.
- Focused formatter and component gate: 2 files, 26 tests passed.
- Lead-detail integration gate: 3 files, 41 tests passed.
- Full regression gate: 115 files, 2,118 tests passed.
- Full ESLint, strict TypeScript, and sanitized production build passed.
- The draft now requires an explicit allowlisted problem field from the
  sanitized report; sector is supporting context only.
- Distinct company problems produce materially different messages.
- Generic opportunity, sector, qualification fields, unknown risk codes, and
  unavailable placeholders do not create a draft.
- No API, database, provider, n8n, persistence, or send capability was added.

## Problem-specific Demo 3 deployment — 2026-08-17

- Immutable release `demo3-preprod-20260817-lead-problem-001` is active on the
  authorized local pre-production target.
- Exact target and contact TLS preflights passed before mutation.
- App and PostgreSQL pods are Ready with zero container restarts.
- Anonymous access returned `401`; authenticated page, API, and lead detail
  returned `200`, and deployed detail assets contain the new problem-specific
  copy.
- No response body, identifier, producer value, credential, provider call, or
  producer write was recorded as release evidence.

## All-report correction — 2026-08-17

- Focused formatter/component gate: 2 files, 34 tests passed.
- Lead-detail integration gate: 3 files, 49 tests passed.
- Full regression gate: 115 files, 2,126 tests passed.
- Full ESLint, strict TypeScript, and sanitized production build passed.
- Every identified company with an available report now receives a draft.
  Explicit problems remain highest priority, followed by opportunity,
  differential/asset/signal, context/prose, and sector.
- Up to two approved report facts may shape the message. When no
  customer-facing fact is safe, the draft remains neutral and uses only the
  company identity; internal qualification fields are never copied.
- This correction is active on Demo 3 in immutable release
  `demo3-preprod-20260817-all-report-approach-001`.

## All-report Demo 3 deployment — 2026-08-17

- Exact target and contact TLS preflights passed before mutation.
- App and PostgreSQL pods are Ready with zero container restarts.
- Anonymous Leads access returned `401`; authenticated Leads/API returned
  `200`, and one value-safe non-problem report detail returned `200`.
- Published detail assets contain the all-report approach copy. Focused tests
  cover opportunity, multiple facts, sector, safe prose, and neutral fallback.
- No response body, identifier, producer value, credential, provider call,
  producer write, or message send was recorded as release evidence.
