# Prospecta Context

**Gathered:** 2026-07-03  
**Source:** user-provided discovery document  
**Spec:** `.specs/features/prospecting-console/spec.md`  
**Status:** AUTHORIZED IMPLEMENTATION CONTEXT

## Authorization Record

On 2026-07-03 the repository owner authorized planning and staged
implementation of Prospecta under the permanent producer boundary. This
authorizes repository changes, synthetic tests, local/disposable database work,
and preparation of a separate versioned n8n ingress.

It does not identify a production target or authorize a production migration,
n8n activation, secret change, deployment, or release. Those actions remain
external gates.

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
- The current form-trigger workflow is not an acceptable app ingress.

### Upload direction

- The proposed ingress is server-to-server and accepts the exact CSV rather
  than reproducing producer normalization.
- The app performs only superficial file checks.
- Upload correlation uses an app submission UUID, an idempotency key, a SHA-256
  file hash, and a versioned contract.
- The producer must acknowledge acceptance before expensive processing.
- Automatic retry is outside the first MVP.

### Data honesty

- Missing data is not zero.
- Missing events are not failures.
- Mutable projection rows are not immutable history.
- Batch completion must not be inferred without a producer contract.
- Report, evidence, contact, CRM, and URL content is withheld until semantically
  approved.

## External Decisions and Evidence Still Required

- Non-production and production targets/owners for the separately versioned
  n8n ingress; the current workflow will not be changed.
- Who owns the product, producer contract, security review, and LGPD policy.
- Exact producer terminal results and batch-completion evidence.
- Operations confirmation that the approved direct-forwarding, 10 MiB,
  in-memory request boundary and timeout envelope fit the target. Encrypted
  temporary object storage requires a later decision if they do not.
- App schema DDL, migration process, backup/retention, and database roles.
- Role names, permission assignments, and sensitive-content eligibility.
- Conflict policy when two sellers attempt to own or contact the same lead.
- Production-like query scale, indexes, latency budget, and freshness windows.

## Approved Implementation Defaults

- Browser-to-app upload uses one raw CSV body with a sanitized filename and
  UUID idempotency header; app-to-producer uses the multipart contract.
- Maximum file size is 10 MiB for implementation and tests.
- Exact bytes are kept only for the authenticated request and direct producer
  forwarding; PostgreSQL stores metadata only.
- HMAC uses the finalized canonical contract and a five-minute replay window.
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
- Current sanitized workflow:
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
