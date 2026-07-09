# Prospecta Kubernetes Demo Specification

## Problem Statement

The app is not complete, but the business needs a local Kubernetes demo that
shows the current Prospecta experience without depending on production
credentials, producer database availability, or the active n8n workflow. The
demo must stay clearly non-production and synthetic.

## Goals

- [x] Run Prospecta in the local Kubernetes cluster on this machine.
- [x] Show lead list, lead detail, retained history, import list, import detail,
      and CSV upload acknowledgement using synthetic/demo data.
- [x] Keep production-grade producer and sensitive-content boundaries intact
      outside the explicit demo flag.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Production rollout | Requires separate target, credentials, owner, and approval. |
| Real producer database integration | Requires non-production credentials supplied by the owner. |
| Real n8n activation or workflow edits | Permanently prohibited for the productive workflow. |
| Real sensitive evidence/report exposure | Deferred until approved policy and allowlists are complete. |

---

## User Stories

### P1: Local Kubernetes Presentation MVP

**User Story**: As a business manager, I want a local Prospecta URL that opens
directly into the product so that I can present the current workflow.

**Acceptance Criteria**:

1. WHEN the local NodePort URL is opened THEN the system SHALL show the private
   Prospecta shell with a synthetic authorized actor.
2. WHEN the lead list is loaded THEN the system SHALL show synthetic leads
   matching existing API contracts.
3. WHEN a lead is opened THEN the system SHALL show detail, history, facts,
   audit, and non-sensitive risk/signal text without malformed-response
   fallback.
4. WHEN imports are listed or a synthetic CSV is submitted THEN the system
   SHALL show an accepted demo response without writing to producer tables or
   calling the productive workflow.

**Independent Test**: Apply the Kubernetes manifest, open the NodePort URL, and
navigate through Leads, lead detail, Importacoes, and Importacoes registradas.

---

## Edge Cases

- WHEN `FEATURE_DEMO_DATA_ENABLED` is false THEN existing database-backed and
  producer-backed paths SHALL remain the default.
- WHEN demo upload receives invalid CSV input THEN existing upload validation
  SHALL still reject it.
- WHEN a batch/detail id is not one of the synthetic ids THEN API SHALL return
  the existing not-found shape.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| K8SDEMO-01 | P1: Local Kubernetes Presentation MVP | Execute | Verified |
| K8SDEMO-02 | P1: Synthetic lead data | Execute | Verified |
| K8SDEMO-03 | P1: Synthetic imports data/upload | Execute | Verified |
| K8SDEMO-04 | P1: Local Kubernetes manifest | Execute | Verified |
| K8SDEMO-05 | P1: Non-production safety boundary | Execute | Verified |

**Coverage:** 5 total, 5 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [x] `kubectl -n prospecta-demo get pods` shows the app pod Ready.
- [x] `http://192.168.0.20:30097/leads` renders synthetic lead rows.
- [x] Opening a synthetic lead detail does not fall back to unavailable state.
- [x] Import batch list/detail render synthetic batch facts.
- [x] No production migration, n8n activation, or real credential is required.
