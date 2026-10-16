# Qualification cadence v1 — Tasks

**Design**: `.specs/features/qualification-cadence-v1/design.md`
**Status**: Completed and published to authorized Demo 3 local pre-production

All tasks run sequentially in the primary agent because the worktree contains
the owner's uncommitted work and unsolicited delegation is disabled.

## Execution plan

`T1 → T2 → T3 → T4 → T5 → T6 → T7`

## Tasks

### T1: Add the app-owned cadence migration and packaging

**Status**: Completed.

- **Where**: `db/app/016_qualification_cadence_forward.sql`, rollback,
  `.dockerignore`, Demo 3 Dockerfile/script, migration/packaging tests.
- **Depends on**: none.
- **Done when**: four-row constraints, scoped foreign keys, restricted update
  grants, no delete grant and idempotent deployment packaging are verified.
- **Tests**: PostgreSQL integration plus contract.
- **Gate**: integration/contract focused.
- **Requirement**: QCAD-01, QCAD-02.

### T2: Define cadence DTOs and request validation

**Status**: Completed.

- **Where**: `src/types/commercial.ts`, `src/lib/validators/commercial.ts` and
  co-located validator tests.
- **Depends on**: T1.
- **Done when**: start/result unions, bounded dates/intervals, fourth-contact
  and outcome-specific refinements reject invalid input.
- **Tests**: unit.
- **Gate**: quick.
- **Requirement**: QCAD-05, QCAD-07.

### T3: Implement the transactional cadence repository

**Status**: Completed.

- **Where**: `src/server/commercial/qualification-cadence-repository.ts` and
  co-located unit/integration tests.
- **Depends on**: T2.
- **Done when**: organization-scoped read, one-time start, locked current-step
  completion, every branch, activity append and audit append pass.
- **Tests**: unit plus PostgreSQL integration.
- **Gate**: quick then integration.
- **Requirement**: QCAD-03, QCAD-04.

### T4: Add the authenticated cadence route

**Status**: Completed.

- **Where**: `src/app/api/workspaces/[id]/qualification-cadence/route.ts` and
  co-located route tests.
- **Depends on**: T3.
- **Done when**: auth precedes database work, reads and writes use distinct
  permissions, POST requires same origin and safe 400/404/409/503 envelopes.
- **Tests**: route unit.
- **Gate**: quick.
- **Requirement**: QCAD-05.

### T5: Build the four-row cadence component

**Status**: Completed.

- **Where**: `src/components/commercial/qualification-cadence.tsx` and
  co-located component tests.
- **Depends on**: T4.
- **Done when**: empty/start, four rows, current result form, every branch,
  read-only, loading/error/conflict and Brazilian dates are covered.
- **Tests**: component unit.
- **Gate**: quick.
- **Requirement**: QCAD-06, QCAD-07.

### T6: Integrate cadence with the workspace histories

**Status**: Completed.

- **Where**: workspace page and page tests.
- **Depends on**: T5.
- **Done when**: cadence renders in the lead workspace and successful cadence
  actions refresh activity and audit lists without changing producer facts.
- **Tests**: page component unit.
- **Gate**: quick.
- **Requirement**: QCAD-04, QCAD-06.

### T7: Run full validation and record durable knowledge

**Status**: Completed.

- **Where**: feature spec/tasks, `.notebook/INDEX.md`, commercial workspace note.
- **Depends on**: T6.
- **Done when**: lint, typecheck, full unit, PostgreSQL integration, contract and
  sanitized build pass; traceability and limitations are current.
- **Tests**: full release-quality gate.
- **Gate**: build.
- **Requirement**: QCAD-01..QCAD-07.

## Pre-approval checks

| Task | Atomic deliverable | Status |
| --- | --- | --- |
| T1 | Migration and its required packaging contract | Pass |
| T2 | Shared contract and validator | Pass |
| T3 | One repository | Pass |
| T4 | One route | Pass |
| T5 | One UI component | Pass |
| T6 | One page integration | Pass |
| T7 | One complete validation record | Pass |

| Task | Declared dependency | Diagram | Status |
| --- | --- | --- | --- |
| T1 | none | start | Match |
| T2 | T1 | T1 → T2 | Match |
| T3 | T2 | T2 → T3 | Match |
| T4 | T3 | T3 → T4 | Match |
| T5 | T4 | T4 → T5 | Match |
| T6 | T5 | T5 → T6 | Match |
| T7 | T6 | T6 → T7 | Match |

| Layer | Matrix requirement | Task coverage | Status |
| --- | --- | --- | --- |
| Migration/repository SQL | unit + PostgreSQL integration | T1, T3 | Match |
| Validator | unit | T2 | Match |
| Route | route unit | T4 | Match |
| React component/page | component unit | T5, T6 | Match |
| Kubernetes packaging | contract; rollout only when publishing | T1, T7 | Match |

## Validation evidence — 2026-08-18

- Lint: `eslint .` — pass.
- Type generation and strict typecheck: `next typegen`,
  `tsc --noEmit -p tsconfig.typecheck.json` — pass.
- Unit/component/route suite: 123 files, 2,259 tests — pass.
- Disposable PostgreSQL suite: 11 files, 106 tests — pass; includes three
  cadence repository tests and 44 app-schema migration tests.
- Contract suite: 10 files passed, 2 remote-only files skipped; 54 tests passed
  and 57 remote-only tests skipped.
- Sanitized production build: `next build` with local/demo bypass flags disabled
  — pass; route `/api/workspaces/[id]/qualification-cadence` included.
- The disposable PostgreSQL container and its synthetic fixtures were removed
  after local validation.
- Demo 3 release `demo3-preprod-20260818-qualification-cadence-001`: exact
  cluster/TLS preflight, immutable image rollout, app-owned migration `016`,
  table/index/grant postcondition, anonymous/authenticated route checks and one
  value-safe existing-workspace contract smoke — pass. Both workloads are
  Ready with zero restarts. No OpenAI, n8n, contact-provider or producer-write
  call occurred.
