# Decision: Producer/App Boundary

**Status:** APPROVED — production grants and migration evidence pending  
**Decision owner:** Repository owner for architecture; database owner
unassigned  
**Date:** 2026-07-03

## Decision

n8n owns qualification inputs, processing, decisions, reports, cache, and
producer CRM snapshots. Prospecta owns authenticated submissions, commercial
organization state, and audit events.

The boundary is enforced with separate database roles:

- `PRODUCER_DATABASE_URL`: `SELECT` only on approved producer sources;
- `APP_DATABASE_URL`: controlled read/write only in the app-owned schema.

No application role receives mutation privileges on producer objects.

## Allowed Flows After Per-Environment Activation

```text
Browser → App API
App API → approved official EmpresaAqui n8n import webhook
n8n → producer PostgreSQL
App API → approved producer SELECTs
App API → app-owned schema reads/writes
```

## Permanently Disallowed Flows

```text
Browser → PostgreSQL
Browser → n8n
App → producer table/function mutations
App → scoring/enrichment/qualification recalculation
App → workflow administration
Commercial state → replacement of producer recommendation
```

## Data Semantics

- `finalScore`, `priority`, `finalAction`, `finalVerdict`, `icpScore`,
  `strategicAssetScore`, and `trustStatus` are producer facts.
- Commercial stage, assignment, next action, contact activity, outcome, and
  notes are app facts.
- UI labels must keep producer recommendation and commercial execution visibly
  separate.
- App audit rows may reference the observed `lead_run_id` but do not own it.
- Missing producer data remains missing.

## Consequences

### Positive

- Database grants provide a hard safety boundary.
- Commercial workflows can evolve without corrupting producer audit data.
- Qualification logic remains single-sourced.
- Incident scope and credential rotation are clearer.

### Cost

- Two connection pools and credential lifecycles are required.
- Cross-domain views need explicit service/repository composition.
- No cross-schema cascading foreign keys to producer history.
- Reconciliation and unavailable-source states must be designed.

## Approval Evidence

- Reviewed grants for both roles.
- Write-denial integration tests against producer objects.
- Cross-organization isolation tests.
- App-schema migration and rollback review.
- Producer source allowlist.
- Secret rotation and incident-response ownership.

Repository implementation and disposable PostgreSQL privilege tests may
proceed. No production role, grant, schema, or migration is implied by this
decision.
