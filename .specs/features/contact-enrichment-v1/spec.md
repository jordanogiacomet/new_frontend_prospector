# Contact Enrichment v1 Specification

**Status:** Demo 3 PII-free backend deployed and synthetic activation verified;
contact exposure remains blocked

## Approved Demo 3 Decisions (2026-07-31)

- The repository may implement a server-side request route, authenticated
  callback receiver, app-owned idempotency ledger, and reviewed migration for
  the exact Demo 3 local pre-production profile.
- The distinct capability is `contacts:enrich`. It is granted only to the
  existing shared `demo3-preproduction-user` actor while the Demo 3 gateway
  and feature flag are active. It is not implied by `sensitive:read`.
- The approved non-production n8n ingress is exactly
  `http://192.168.0.20:30098/webhook/prospecta/lusha/decision-makers`.
- The approved v1 fields and status contract remain PII-free. Because contact
  retention, opt-out, and do-not-call policy are not yet defined, the
  application stores no name, email, telephone, title, profile, contact ID,
  count, or raw Lusha value. Contact PII retention is therefore zero.
- The app-owned ledger may retain only organization-scoped opaque IDs, SHA-256
  comparison hashes, safe states, actor/machine categories, and timestamps.
  It follows the existing append-only audit preservation boundary; no
  automatic deletion policy is introduced in this phase.
- Repository implementation, the exact Demo 3 deployment/migration, three
  operator-managed credential bindings, n8n activation, and one synthetic
  Decision Makers request were separately approved and verified on
  2026-07-31. Real-data tests and any contact reveal, persistence, or exposure
  remain prohibited.

## Problem Statement

The commercial queue now makes the business need for contact enrichment
visible, but the action intentionally reports that recovery is unavailable.
Prospecta needs a reviewable integration boundary before any n8n or Lusha
connection can be approved. The boundary must protect contact PII, preserve
the producer-write prohibition, and avoid representing an unobserved provider
outcome as a successful enrichment.

## Goals

- [x] Document a versioned, server-only contact-enrichment contract without
  creating an application route or database record.
- [x] Provide a separate, inactive n8n artifact that accepts an authenticated
  request, returns a PII-free `202`, and describes a minimal authenticated
  callback.
- [x] Make policy, idempotency, timeout, audit, and PII restrictions testable
  using synthetic contract tests only.
- [x] Implement the approved Demo 3 server route and machine callback behind
  `contacts:enrich`, same-origin enforcement, feature gating, and server-only
  n8n configuration.
- [x] Persist a PII-free app-owned request ledger before one n8n dispatch and
  enforce organization-scoped idempotency and callback replay semantics.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Browser-to-n8n or browser-to-Lusha call | The browser may call only Prospecta pages and APIs. |
| Contact PII storage or response | Retention, opt-out, do-not-call, legal basis, and UI exposure remain undefined. |
| Returning contact name, email, telephone, title, profile, ID, or raw provider response | The sensitive-content policy withholds all contact content. |
| Lusha `contacts/enrich` reveal, selection, cost use, or returning provider contact content | Contact policy and exposure approvals are pending; the activated v1 workflow only derives a withheld/unknown status from Decision Makers. |
| Producer database read/write or productive workflow change | The producer boundary is permanent and the current workflow is immutable. |
| Automatic/background retry or manual reprocessing | Both require separate authorization and an evidence-based outcome contract. |
| Changing the commercial-queue button | Backend approval does not authorize presenting withheld provider output as recovered contacts. |
| Any target other than the exact Demo 3 profile | The 2026-07-31 operational approval does not authorize another environment, production, or real-data testing. |

---

## User Stories

### P1: Govern a future enrichment request

**User Story:** As a security and data-policy reviewer, I want a precise
request/callback contract so that a future implementation cannot silently
introduce a direct client integration or contact-data leakage.

**Why P1:** This is the prerequisite for all later enrichment work.

**Acceptance Criteria:**

1. WHEN a future server-side request is specified THEN it SHALL require a
   UUID `request_id`, an idempotency key, a canonical 14-digit
   `cnpj_normalizado`, a validated company domain, and the exact contract
   version.
2. WHEN the n8n ingress receives a valid request THEN it SHALL use an
   n8n-managed header-authentication credential and SHALL return `202` with
   only `contract_version`, `request_id`, and a safe status.
3. WHEN a request lacks a valid UUID, CNPJ, domain, idempotency key, or
   contract version THEN the workflow SHALL reject it before the provider node
   and SHALL not echo the rejected value.
4. WHEN the provider reaches a terminal observed outcome THEN the workflow
   SHALL send only the allowlisted callback fields to the future Prospecta
   receiver using a separately bound n8n header-authentication credential.

**Independent Test:** Static contract tests parse the artifact and verify
inbound validation, protected node configuration, exact response/callback
field allowlists, and no contact fields.

---

### P1: Preserve policy and operational truth

**User Story:** As a compliance owner, I want PII, idempotency, and timeout
limits stated at the integration boundary so that no state is invented or
exposed before approval.

**Why P1:** The received reference workflow returns contact preview content and
therefore cannot be used as the Prospecta runtime design.

**Acceptance Criteria:**

1. WHEN the workflow calls Lusha after activation approval THEN it SHALL use a native n8n generic
   header-authentication credential, never an environment-variable API key or
   a credential embedded in the repository artifact.
2. WHEN Lusha returns any contact payload THEN no name, email, telephone,
   contact ID, profile URL, title, or raw response SHALL be emitted to the
   initial response, callback, audit metadata, logs, or persisted execution
   data.
3. WHEN the provider request times out, is malformed, or has an unknown
   outcome THEN the specified state SHALL be `PROVIDER_OUTCOME_UNKNOWN` and
   the artifact SHALL not configure retry.
4. WHEN the same organization-scoped idempotency key is reused in the
   Prospecta route THEN the app-owned request ledger, not n8n, SHALL return
   the prior safe result for the same immutable input and SHALL reject a
   changed input with `409` before a provider call.
5. WHEN n8n receives an accidental duplicate delivery THEN it SHALL not be
   treated as evidence of idempotency; the Prospecta ledger SHALL protect the
   only application dispatch before n8n is called.

**Independent Test:** Synthetic tests assert the explicit app-owned
idempotency owner, no-retry configuration, `UNKNOWN` timeout semantics, and
PII denylist.

---

### P1: Keep preparation isolated

**User Story:** As the repository owner, I want the workflow artifact prepared
without changing current operations so that review can happen without
activation, deployment, secrets, or producer impact.

**Why P1:** The existing import workflow and its producer facts are immutable.

**Acceptance Criteria:**

1. WHEN the artifact is committed to the repository THEN it SHALL be a new
   directory under `integrations/n8n/`, with `active: false`, empty pinned data,
   stable import/webhook identifiers, and no target-specific version or
   credential binding.
2. WHEN the artifact is inspected THEN it SHALL contain no credential value,
   API key, bearer token, secret, production endpoint, database node, or
   producer SQL.
3. WHEN the commercial queue action is inspected THEN it SHALL still have no
   request path and shall continue to report that contact recovery is
   unavailable.

**Independent Test:** Static artifact tests verify isolation and the existing
component test retains the no-request behavior.

---

## Contract Facts and Constraints

### Version and transport

- Contract version: `prospecta-contact-enrichment-v1`.
- The browser is not a participant. A future Prospecta server route is the
  only permitted ingress caller.
- The Demo 3 n8n webhook target is the exact approved internal HTTP URL above.
  The exception is limited to this local profile and must never authorize an
  internet or production target.
- Both ingress and callback use manual bindings to native n8n
  `httpHeaderAuth` credentials. The repository carries neither credential nor
  secret material.

### Provider identity constraint

The supplied Lusha reference and current Lusha documentation identify a
company by domain or Lusha company ID for the Decision Makers endpoint. CNPJ
is therefore validated solely as a Prospecta correlation input and must be
discarded before the provider node. A future route must supply an approved
company domain; this specification does not authorize a CNPJ lookup, a company
search fallback, or any identity enrichment.

### PII boundary

- CNPJ is never placed in a log, response, callback, audit record, provider
  body, or persisted workflow output.
- Provider responses are used only transiently to derive an allowlisted status
  and `contact_count: null`; the count is intentionally unavailable rather
  than guessed.
- n8n execution persistence is disabled for successful, failed, and manual
  runs in the artifact. This reduces stored workflow data but does not replace
  the separate contact data policy or a production security review.
- The workflow does not contain a Lusha contact-reveal request and does not
  expose preview data. A later reveal design requires the approvals listed
  below.

### App-owned idempotency owner

The Prospecta service must durably record its intent in the app-owned
schema before one dispatch to n8n. It owns organization scoping, immutable
input comparison, duplicate return, `409` conflict, unknown outcomes, and any
allowlisted append-only audit. n8n has no app database node, ledger, cache, or
retry loop in this artifact and cannot supply that guarantee.

### Callback contract

The Demo 3 callback receiver may accept only:

```json
{
  "contract_version": "prospecta-contact-enrichment-v1",
  "request_id": "UUID",
  "status": "COMPLETED_WITHHELD | PROVIDER_OUTCOME_UNKNOWN",
  "occurred_at": "RFC 3339 timestamp",
  "contact_count": null
}
```

The receiver must first authenticate the machine credential, validate this
exact schema, correlate only an app-owned request for the configured
organization, reject invalid/replayed/conflicting callbacks safely, and record
only allowlisted non-PII metadata.

## Edge Cases

- WHEN inbound header authentication fails THEN n8n SHALL reject the request
  before validation or provider work.
- WHEN the callback credential is absent or its response is not a success THEN
  the workflow SHALL not retry automatically and the app result remains
  unknown until separately reconciled.
- WHEN the provider returns an error, malformed body, or times out THEN the
  initial `202` remains only a workflow-dispatch acknowledgement; the future
  callback status is `PROVIDER_OUTCOME_UNKNOWN` if a safe callback is possible.
- WHEN a provider response contains PII THEN the artifact SHALL reduce it to
  an allowlisted status without serializing fields from that response.
- WHEN a domain is unavailable THEN the app SHALL not dispatch to n8n;
  no CNPJ-based lookup fallback is implied.

## Requirement Traceability

| Requirement ID | Story | Planned artifact | Status |
| --- | --- | --- | --- |
| CE-01 | Govern request | Versioned request schema and validation | Verified (static + Demo 3 synthetic UAT) |
| CE-02 | Govern request | Authenticated, PII-free `202` | Verified (static + Demo 3 synthetic UAT) |
| CE-03 | Govern request | Authenticated minimal callback schema | Verified (static + Demo 3 synthetic UAT) |
| CE-04 | Preserve truth | Native n8n credentials, no secrets | Verified (static + operator-bound Demo 3 credentials) |
| CE-05 | Preserve truth | PII denylist and disabled execution retention | Verified with synthetic input; n8n soft-delete cleanup limitation recorded |
| CE-06 | Preserve truth | App-owned idempotency and no-retry contract | Verified (unit + Demo 3 duplicate/conflict UAT) |
| CE-07 | Isolate preparation | Inactive isolated n8n directory | Verified (static) |
| CE-08 | Isolate preparation | Synthetic contract tests and unchanged queue action | Verified (static) |
| CE-09 | Demo 3 runtime boundary | `contacts:enrich`, feature flag, same-origin route | Verified (unit/build) |
| CE-10 | Durable request truth | App-owned hash-only ledger and append-only events | Verified (unit/static SQL + Demo 3 migration/UAT) |
| CE-11 | Machine callback | Auth-first strict callback and replay conflict | Verified (unit + Demo 3 callback UAT) |
| CE-12 | Demo 3 packaging | Exact target, server-only secrets, inactive repository artifact | Verified (contract/build/deploy) |

## Success Criteria

- [x] The repository contains the reviewable, feature-gated, server-only Demo 3
  runtime contract and PII-free ledger implementation.
- [x] The n8n artifact is inactive, secret-free, producer-free, and PII-free.
- [x] Contract tests cover the stated negative cases using only synthetic
  identifiers.
- [x] The existing commercial-queue action makes no new request.

## Completed Demo 3 Operations and Remaining Approvals

Completed on 2026-07-31 for the exact local Demo 3 profile: accountable
operator identification, three distinct credentials outside Git, deployment,
migration `009`, workflow import/inspection/activation, and synthetic UAT. The
repository artifact remains inactive and credential-free.

Approvals still required:

1. Before exposing or storing any contact value, approve the LGPD/legal-basis,
   exact-field, retention/deletion, subject-rights, opt-out/do-not-call, UI,
   audit-redaction, pricing/quota, and vendor-processing policy.
2. Production continues to require an HTTPS target, individual identity,
   replay/rate-limit controls, production credentials, owner, migration plan,
   rollout, and rollback approval.
