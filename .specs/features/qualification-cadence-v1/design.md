# Qualification cadence v1 — Design

**Spec**: `.specs/features/qualification-cadence-v1/spec.md`
**Status**: Implemented and validated locally

## Architecture

The existing commercial workspace remains the owner of the lead relationship.
A focused route and repository manage four app-owned scheduled-contact rows.
Starting or completing a contact also appends one existing `lead_activities`
row and its existing `ACTIVITY_APPENDED` audit event in the same transaction.
There is no timer worker, polling mutation, provider call or outreach transport.

Browser flow:

1. Workspace renders the cadence component.
2. `GET /api/workspaces/:id/qualification-cadence` returns `NOT_STARTED` or the
   four ordered contacts.
3. One same-origin `POST` starts the four rows or records the current result.
4. The repository locks the active workspace and current cadence rows, applies
   the fixed branch and returns the complete current projection.
5. The component replaces state only after a validated response and asks the
   workspace to refresh activity/audit history.

## Reuse

| Existing code | Use |
| --- | --- |
| `src/server/db/app-client.ts` | Parameterized app-owned query and transaction boundary. |
| `src/server/commercial/activity-repository.ts` | Match activity/audit columns and redaction contract. |
| `src/server/commercial/audit-context.ts` | Server-derived actor issuer, correlation and authorization basis. |
| `src/app/api/workspaces/[id]/activities/route.ts` | Auth, same-origin, feature and safe-error route pattern. |
| `src/app/(private)/workspaces/[id]/page.tsx` | Existing commercial permissions and activity/audit reload state. |
| `src/lib/formatters` | Brazilian date and time presentation. |

## Data model

`prospecting_app.lead_qualification_contacts` contains exactly four immutable
membership rows per started workspace:

- identity: contact UUID, organization, workspace and number 1–4;
- plan: scheduled timestamp;
- state: `PENDING`, `COMPLETED` or `CANCELLED`;
- result: canonical qualification outcome and completed activity UUID;
- ownership: created/updated actor and timestamps.

The optional free-text summary and channel live only in the linked append-only
activity, avoiding duplicated mutable content. Runtime grants allow select,
insert and updates only to planning/state/result columns; delete is revoked.

## API contract

`GET /api/workspaces/:id/qualification-cadence`

- `200 { data: QualificationCadenceDto }`
- `404` missing/cross-organization workspace

`POST /api/workspaces/:id/qualification-cadence`

- `{ action: "start", start_at, interval_days }`
- `{ action: "record_contact", contact_number, occurred_at, channel, outcome,
  summary?, next_contact_at? }`
- `201` started, `200` result recorded, `400` invalid, `409` stale/conflict

## State derivation

- no rows → `NOT_STARTED`;
- any completed `QUALIFIED` → `QUALIFIED`;
- any completed `NOT_INTERESTED` or `WRONG_CONTACT` → `STOPPED`;
- first pending row → `ACTIVE` with that number current;
- no pending row → `EXHAUSTED`.

Time alone never changes state. `FOLLOW_UP_LATER` moves only the next pending
row. Terminal outcomes cancel all later pending rows.

## UI direction

Use a refined operational ledger consistent with Prospecta's warm paper, dark
ink and restrained green. Four horizontal `<details>` rows form one continuous
list rather than four cards. Number, label, scheduled date and state remain
visible when collapsed. Only the current row opens by default and contains the
result form. Native details/summary preserves keyboard behavior and adapts to a
vertical record on narrow containers.

## Error handling

| Scenario | Server | UI |
| --- | --- | --- |
| Missing/cross-org workspace | Safe 404 | Cadence unavailable in this workspace. |
| Duplicate start/out-of-order result | Safe 409 | Reload confirmed cadence once; never retry mutation. |
| Invalid date/outcome combination | Safe 400 | Specific local form guidance where possible. |
| Database unavailable | Safe 503 | Keep last confirmed cadence and invite retry. |
| Read-only actor | GET allowed, mutation denied | Rows visible, forms absent. |

## Security and product boundaries

- Organization and actor are never accepted from request data.
- Summary content is excluded from audit metadata and API error details.
- No producer table, score, priority, action or recommendation is modified.
- No contact address, phone, e-mail, provider payload or message is stored.
- No automatic retry, background timer, webhook or outreach call exists.
