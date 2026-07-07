# Prospecta Context

**Gathered:** 2026-07-03  
**Source:** user-provided discovery document  
**Spec:** `.specs/features/prospecting-console/spec.md`  
**Status:** AUTHORIZED IMPLEMENTATION CONTEXT

## Authorization Record

On 2026-07-03 the repository owner authorized planning and staged
implementation of Prospecta under the permanent producer boundary. This
authorizes repository changes, synthetic tests, local/disposable database work,
and integration planning for the official versioned n8n ingress.

It does not identify a production target or authorize a production migration,
n8n activation, secret change, deployment, or release. Those actions remain
external gates.

On 2026-07-06 the owner further directed that Prospecta remain a simple
internal application now, while preserving a path to stronger production
controls later. For the identified internal target, missing HMAC/replay,
durable producer acceptance, exact workflow-version attestation, and batch
completion are accepted limitations rather than blockers for the upload
vertical slice. They must remain visible as limitations and must not be
represented as implemented security or producer progress.

## Feature Boundary

The proposed product extends the current read-only lead browser into a private
prospecting console. It may eventually add controlled batch ingress and
app-owned commercial organization data while preserving n8n as the immutable
qualification producer.

The existing lead browser remains reusable. New capabilities are implemented
behind explicit permissions and feature flags, with external dependencies kept
fail-closed.

## Decisions Expressed in Discovery

### Product and UX

- Working product name: **Prospecta — Console Interno de Prospecção**.
- The primary user is a business manager.
- The highest-value flow is “who should be approached now,” including owner,
  next action, due date, and recommendation context.
- The existing lead list, detail, and retained-history experience should remain
  as a legacy module.
- Broad dashboards, advanced tags, exports, multichannel automation, generated
  outreach, and bidirectional CRM integration are deferred.

### Producer boundary

- n8n remains the sole producer of score, priority, action, verdict, trust,
  enrichment, and qualification semantics.
- Producer decisions, runs, reports, cache, and CRM data are immutable to the
  app.
- Commercial state belongs only in an app-owned schema.
- The browser never calls n8n or PostgreSQL directly.
- The official current EmpresaAqui ingress is the webhook workflow
  `EmpresaAqui - Webhook Import v1 - StrictOneTokenDomainGate`, whose
  operational source of truth is
  `private-workflows/EmpresaAqui_Webhook_Import_v1.json`.
- The historical form-trigger export is not the current app ingress.

### Upload direction

- The integration direction is Browser → App API → official n8n webhook. The
  App API sends `multipart/form-data` server-side with the CSV in
  `arquivo_csv`; the frontend never receives or calls the n8n URL.
- The app performs only superficial file checks.
- The official workflow returns HTTP `202` with `accepted`, `message`,
  `import_batch_id`, `row_count`, and `source`.
- Current correlation is limited to associating the synchronous returned
  `import_batch_id` with the app-owned submission that made the request.
- The official export does not consume an app submission UUID, upload-level
  idempotency key, SHA-256, or contract-version field and does not persist
  durable acceptance before returning `202`.
- The current `202` is therefore a workflow acknowledgement, not proof of
  durable `ACCEPTED` state.
- Automatic retry is outside the first MVP.

### Data honesty

- Missing data is not zero.
- Missing events are not failures.
- Mutable projection rows are not immutable history.
- Batch completion must not be inferred without a producer contract.
- Report, evidence, contact, CRM, and URL content is withheld until semantically
  approved.

## Accepted Internal MVP Limitations

- The named target is behaviorally compatible with the reviewed workflow, but
  its exact remote workflow ID/version is not independently attested.
- HTTP and zero authentication headers are used only for this internal target.
- The workflow `202` is an acknowledgement, not durable acceptance.
- Producer upload replay prevention and reconciliation after an unknown
  outcome do not exist; Prospecta performs one call and never retries
  automatically.
- Producer failures do not have a stable safe envelope; Prospecta maps
  malformed, non-`202`, timeout, and unavailable responses to safe app-owned
  outcomes without exposing producer bodies.
- The 10 MiB producer compatibility bound is not stable evidence. Prospecta
  enforces its own limit, and a producer timeout remains an unknown outcome.
- Batch completion and exact counts remain unavailable until X4 facts exist.

These limitations allow T013–T017 implementation and internal UAT. They do not
authorize production or truthful batch-completion claims.

## External Decisions and Evidence Still Required for Production or Later Phases

- Webhook authentication, HMAC/replay controls, upload-level idempotency,
  exact-byte hash verification, durable acceptance, controlled errors, and
  timeout reconciliation.
- Who owns the product, producer contract, security review, and LGPD policy.
- Exact producer terminal results and batch-completion evidence.
- Operations confirmation that the approved direct-forwarding, 10 MiB,
  in-memory request boundary and timeout envelope fit the target. Encrypted
  temporary object storage requires a later decision if they do not.
- App schema DDL, migration process, backup/retention, and database roles.
- The future granular-authorization source, permission assignments, revocation
  behavior, and sensitive-content eligibility. Provider role claims are not a
  dependency of the current phase.
- Conflict policy when two sellers attempt to own or contact the same lead.
- Production-like query scale, indexes, latency budget, and freshness windows.

## Approved Implementation Defaults

- Private access currently requires OIDC authentication, exact issuer/subject,
  and the allowed organization. Provider role claims are ignored;
  `AUTH_ROLE_CLAIM` and `AUTH_ROLE_MAPPING` are deferred and not required at
  startup. Granular permissions remain an external gate.
- Browser-to-app upload remains an app-owned future contract. App-to-producer
  must match the official workflow's `multipart/form-data` request with one
  file in `arquivo_csv`; no additional field is currently consumed.
- Maximum file size is 10 MiB for implementation and tests.
- Exact bytes are kept only for the authenticated request and direct producer
  forwarding; PostgreSQL stores metadata only.
- HMAC remains deferred hardening: the official export does not validate it,
  and the optional server-only `N8N_HMAC_KEY_ID`/`N8N_HMAC_SECRET` settings
  are unused in this phase. The internal client sends zero authentication
  headers. A production client remains blocked until the remote endpoint
  implements and proves an approved server-to-server mechanism.
- Internal import pages and routes may authorize the existing verified
  issuer/subject/allowed-organization actor plus same-origin and the
  server-side import feature flag. This scoped exception grants no sensitive,
  commercial, assignment, or audit permission.
- `FEATURE_IMPORTS_ENABLED` remains `false` by default. It may be enabled only
  for the identified internal target after T013–T017 tests and controlled UAT;
  production enablement remains separately gated.
- App-owned schema name is `prospecting_app`.
- Commercial notes and activities are append-only in MVP 1.
- Workspace mutations use optimistic version checks.
- Producer recommendation and commercial stage remain distinct.
- Sensitive content is denied unless both `sensitive:read` and an exact
  server-side source/field allowlist permit it.
- Producer contacts remain withheld until opt-out/do-not-call and data-policy
  rules are approved.

## Specific References

- Current source documentation: `docs/db/schema.sql`.
- Official current EmpresaAqui ingress and operational contract source:
  `private-workflows/EmpresaAqui_Webhook_Import_v1.json`.
- Historical sanitized qualification workflow:
  `private-workflows/EmpresaAqui - CRM Runs Auditado v5.8.22 -
  StrictOneTokenDomainGate.sanitized.json`.
- Reusable legacy feature:
  `.specs/features/read-only-lead-browser/`.

## Deferred Ideas

- CRM synchronization.
- Notifications and commercial automations.
- Email sequences and AI-written messages.
- Analytics dashboard.
- Export.
- Reprocessing as a separately governed producer capability.
