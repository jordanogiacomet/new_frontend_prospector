# Prospecta Demo 3 Hardening Specification

**Status:** RELEASED TO THE AUTHORIZED LOCAL KUBERNETES TARGET
**Date:** 2026-07-17

## Problem Statement

The current worktree contains most Prospecta MVP surfaces, but frontend,
backend, authorization, evidence semantics, release gates, and Kubernetes
packaging still have confirmed defects. Demo 3 must correct release-critical
behavior and run as an isolated local, synthetic, non-production release without
weakening permanent producer or data-governance boundaries.

## Goals

- [x] Correct confirmed P1 authorization and fact-integrity defects.
- [x] Make the automated release gates deterministic on the available host.
- [x] Package Demo 3 separately from Demo 2 with immutable identity, the
      explicitly approved LAN NodePort, least privilege, and rollback evidence.
- [x] Deploy only after the exact cluster and release target pass preflight.

## Out of Scope

| Capability | Reason |
| --- | --- |
| Production deployment or migration | Requires separate target, owner, credentials, review, and approval. |
| Producer writes, resets, or workflow edits | Permanent ownership boundary. |
| Real data in demo fixtures | Demo 3 is synthetic only. |
| Automatic import retry | Acceptance ambiguity must remain honest. |
| Invented OIDC role mapping | Requires identity-owner approval and a verified claim contract. |
| Removing producer query caps without evidence | Requires EXPLAIN/index evidence on a disposable target. |

## User Stories

### P1: Correct private business access

1. WHEN an actor lacks `leads:read` THEN lead APIs SHALL deny before any demo or
   producer work.
2. WHEN an actor lacks `audit:read` THEN the lead response SHALL omit internal
   audit identifiers.
3. WHEN a writer lacks `commercial:assign` THEN the actor SHALL only claim an
   unassigned workspace for itself.

### P1: Preserve truthful commercial and producer facts

1. WHEN a Brazilian user records a local activity time THEN the persisted UTC
   instant SHALL represent that local time exactly.
2. WHEN two distinct terminal outcomes exist for one accepted row THEN the batch
   SHALL report evidence conflict, never completion.
3. WHEN batch observation is disabled THEN no producer observation query SHALL
   run and counts SHALL remain unavailable rather than zero.

### P1: Keep imports bounded and honest

1. WHEN an upload exceeds the configured byte limit THEN it SHALL be rejected
   before hashing, persistence, or producer submission and without unbounded
   buffering at the deployment edge.
2. WHEN browser transport fails after POST begins THEN the UI SHALL preserve the
   idempotency key and communicate acceptance unknown.
3. WHEN Demo 3 cannot durably record an import THEN it SHALL not return 202.

### P1: Isolated local Demo 3 release

1. WHEN a release is prepared THEN Demo 3 SHALL use a distinct namespace,
   release identifier, immutable image tag, NodePort `30100` on the approved
   `192.168.0.20` target, and synthetic data.
2. WHEN cluster identity or health differs from the approved preflight THEN the
   deploy SHALL stop before mutation.
3. WHEN rollout or smoke fails THEN rollback SHALL restore the prior immutable
   release without deleting app audit or touching producer data.

## Edge Cases

- Out-of-order workspace responses never replace the current route state.
- Append on a non-first/full page reloads canonical page 1.
- Out-of-range pages are distinct from globally empty datasets.
- A non-demo strategic report is never labeled synthetic.
- HTTP n8n is accepted only for the exact approved internal target/profile.

## Requirement Traceability

| ID | Requirement | Status |
| --- | --- | --- |
| D3-01 | Lead/audit/assignment authorization | In Tasks |
| D3-02 | Frontend time, race, pagination, and copy correctness | In Tasks |
| D3-03 | Batch terminal and observation semantics | In Tasks |
| D3-04 | Bounded, configurable, honest upload | In Tasks |
| D3-05 | Audit metadata and context | In Tasks |
| D3-06 | Deterministic static/test/build gates | In Tasks |
| D3-07 | Isolated hardened Kubernetes release | In Tasks |
| D3-08 | Release evidence and rollback | In Tasks |

## Success Criteria

- All applicable lint, typecheck, unit, build, integration, contract, manifest,
  smoke, and UAT gates have recorded results.
- No P1 is silently waived; unfinished external gates are explicit blockers.
- Demo 2 is not overwritten and Demo 3 exposes its synthetic full-access
  profile only through the explicitly approved `192.168.0.20:30100` NodePort.
