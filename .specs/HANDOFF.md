# Handoff

**Date:** 2026-07-22T10:17:44-02:00
**Feature:** Batch import/n8n alignment
**Task:** Local implementation consolidated; remote T13/T14 remain blocked

## Completed ✓

- Canonical producer chain: `003_import_acceptance.sql`,
  `004_import_acceptance_rollback.sql`, `005_import_batch_close.sql`, and
  `006_import_batch_close_rollback.sql`; duplicate `_v1` drafts removed after
  full comparison.
- Inactive n8n v1 artifact, exact multipart/hash contract, commit-before-202
  structure, fail-closed worker gate, and explicit close.
- Versioned ingress client, app-owned durable reconciliation, batched producer
  reads for 100 IDs, and visible-page refresh.
- Gates: lint and typecheck passed; 74 unit files / 1,744 tests passed; build
  passed with process-only safe overrides and 23 routes; 8 PostgreSQL files /
  87 tests passed; 13 static contracts passed; 57 HTTP cases skipped.
- Disposable PostgreSQL container removed. No external target was changed.

## Commits

- `5aa6683` `feat(producer): add durable import acceptance lifecycle`
- `db05960` `feat(imports): reconcile durable producer acceptance`
- `acc24bc` `feat(imports): submit versioned ingress correlation`
- `9e88705` `feat(n8n): complete versioned batch ingress artifact`
- `8d17afe` `test(n8n): add evidence-bound versioned contract`
- `f4422d0` `perf(imports): batch producer observation reads`
- `0cb440c` `feat(imports): refresh batch status while visible`
- `b78caaa` `test(commercial): assert request context on audit event`
- Documentation, evidence, notebook, and this handoff are versioned in the
  final documentation commit of this session.

## Pending / Blockers

- **OPEN-01:** authorized separate HTTPS v1 URL plus remote identity evidence.
- **OPEN-02:** approved real `prospecta-producer-worker-v1` implementation.
- **OPEN-03:** approved late-reconciliation runner; never retry uploads.
- **OPEN-04:** operational owner and `NO_UPDATE` freshness window.
- **OPEN-05:** external disposable target, DB owner, credentials, rollback
  owner, and approval for producer DDL.

## Context

- Branch: `master`
- Production, rollout, cluster, n8n administration, and real data remain out of
  scope.
- Remote HTTP suites are skipped, not approved.
