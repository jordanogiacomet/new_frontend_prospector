# Handoff

**Date:** 2026-07-22T11:39:23-02:00
**Feature:** Batch import/n8n alignment
**Task:** Consolidated locally and released in the authorized Demo 3 app target

## Completed ✓

- Canonical producer chain retained as
  `003_import_acceptance.sql` / `004_import_acceptance_rollback.sql` and
  `005_import_batch_close.sql` / `006_import_batch_close_rollback.sql`; the
  alternate `_v1` drafts were removed only after full semantic comparison.
- Inactive n8n v1 artifact, exact multipart/hash contract,
  commit-before-`202`, fail-closed worker gate and explicit close remain
  versioned without remote identity, credentials, publication or activation.
- Versioned ingress client, app-owned durable reconciliation, batched producer
  reads for 100 IDs and visible-page status refresh are consolidated.
- Demo 3 release `demo3-preprod-20260722-batch-alignment-001` passed the exact
  cluster preflight and rolled out immutable app, PostgreSQL, edge and proxy
  images at `http://192.168.0.20:30100`.
- The persistent app-owned database received migration `006` transactionally.
  Independent verification reported legacy unique index `0` and canonical
  non-unique index `1`.
- Authenticated route/API smoke passed for leads, lead detail/history, imports,
  batch detail, work queue, workspace detail/activities/notes/audit and costs;
  anonymous imports returned `401`; no response bodies or real values were
  recorded.
- `.env.demo3.local` permissions were restricted from `0644` to `0600` without
  changing its values or versioning the file.
- The current 98-node n8n workflow was only inspected statically from the
  ignored local export. It was not modified, cloned, called or administered.

## Commits

- `5aa6683` `feat(producer): add durable import acceptance lifecycle`
- `db05960` `feat(imports): reconcile durable producer acceptance`
- `acc24bc` `feat(imports): submit versioned ingress correlation`
- `9e88705` `feat(n8n): complete versioned batch ingress artifact`
- `8d17afe` `test(n8n): add evidence-bound versioned contract`
- `f4422d0` `perf(imports): batch producer observation reads`
- `0cb440c` `feat(imports): refresh batch status while visible`
- `b78caaa` `test(commercial): assert request context on audit event`
- `efc873e` `docs(imports): record local batch alignment evidence`
- `af9fbf9` `docs(n8n): record current workflow integration review`
- `5d4b60d` `fix(demo3): apply app reconciliation migration safely`
- `37e8ca1` `fix(demo3): stream and verify app migrations`
- Current documentation/evidence/notebook update:
  `docs(demo3): record batch-alignment app release`.

## Checks

- `npm run lint`: passed without warnings.
- `npm run typecheck -- --pretty false`: passed.
- `npm test`: 74 files / 1,744 tests passed.
- Safe process-only `npm run build`: passed, 23 routes generated. A first
  attempt correctly rejected `AUTH_DEV_BYPASS_ENABLED` inherited from
  `.env.local`; that file was not changed.
- `npm run test:integration`: 8 files / 87 tests passed against synthetic
  PostgreSQL on `127.0.0.1:55432`; disposable containers were removed.
- `npm run test:contract`: 2 local files / 16 tests passed; 2 remote suites /
  57 HTTP cases skipped.
- Demo 3 preflight, immutable rollout, migration postcondition and authenticated
  list/detail route/API smoke passed.

## Limitations

- This was an application/schema-app-owned Demo 3 release, not an n8n v1
  cutover. `N8N_IMPORT_URL` remains the approved legacy target.
- No CSV was submitted or resubmitted during this release; no remote n8n
  contract was executed.
- No producer DDL was applied outside disposable synthetic PostgreSQL.
- No production migration, deployment, workflow activation, secret change,
  producer write, retry or rollout occurred.
- Plain HTTP plus shared Basic Auth remains an accepted limitation only for
  this exact single-tester LAN target.

## Pending / Blockers

- **OPEN-01:** identify and authorize a separate non-production HTTPS v1 URL,
  workflow ID/version and hash-bound inspection source before remote contracts.
- **OPEN-02:** approve and provide a separate producer worker plus idempotent
  terminal adapter that emits `prospecta-producer-worker-v1`; the current
  workflow has no reusable subworkflow entry and cannot be cloned or changed.
- **OPEN-03:** approve an idempotent late-reconciliation runner; timeout remains
  `ACCEPTANCE_UNKNOWN` and never triggers another upload.
- **OPEN-04:** name the operational owner and evidence-based freshness window
  before enabling `NO_UPDATE`.
- **OPEN-05:** identify the external disposable producer target, DB owner,
  credentials, rollback owner and approval before any producer DDL outside the
  local synthetic harness.

## Context

- Branch: `master`.
- Demo 3 is healthy on the authorized local target with the updated app code.
- Remote HTTP suites are skipped, never approved by absence of execution.
- The ignored current-workflow export remains uncommitted and no credential
  reference values were copied into versioned artifacts.
