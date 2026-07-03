# Prospecta — Prospecting Console Tasks

**Spec:** `.specs/features/prospecting-console/spec.md`  
**Design:** `.specs/features/prospecting-console/design.md`  
**Status:** READY FOR REVIEW — execution paused until this plan is presented  
**Baseline:** 31 Vitest files / 494 tests passing on 2026-07-03

## Planning Gate Result — 2026-07-03

- T001: complete.
- T002: complete.
- T003: complete.
- `pnpm lint`: passed with two pre-existing unused-variable warnings in
  `src/server/auth/auth.test.ts`.
- `pnpm typecheck`: passed.
- `pnpm test`: 31 files / 494 tests passed.
- `pnpm build`: passed; existing routes compiled.
- `git diff --check`: passed.
- Environment limitation: the login shell emits a pre-existing missing
  Snap/VS Code profile-path warning; it does not change command exit status.
- `test:integration`, `test:contract`, and `test:e2e` do not exist yet; their
  creation and execution are T009, T019, and T048.

## Execution Rules

- Execute in topological order and stop at each phase gate.
- No sub-agent or parallel-agent execution is authorized.
- Every code task includes its own tests; test work is never deferred.
- Use only synthetic data.
- Never call or change the current productive n8n workflow.
- Never write producer objects.
- Do not run a migration, n8n activation, deployment, or rollout against
  production without an identified target, credentials, owner, and explicit
  approval.
- Commit one task at a time only when the user requests commits.
- A pending external gate blocks only tasks that require it; continue other
  independent local tasks without fabricating the missing integration.

## Tool Profiles

| Profile | Use |
| --- | --- |
| `DOCS` | Filesystem patching plus `tlc-spec-driven` |
| `CORE` | Shell/filesystem plus `coding-guidelines` |
| `NAV` | `codenavi` for repository flow verification |
| `UI` | `coding-guidelines` plus `frontend-design` |
| `CURRENT-DOCS` | Official framework/library documentation when local code/types do not answer |
| `DB-TEST` | Disposable PostgreSQL only; never production |
| `N8N-TEST` | Identified non-production n8n endpoint only |

No project-specific MCP server is currently available. Official documentation
lookup is permitted where current APIs must be verified.

## Test Coverage and Gates

| Layer | Required test | Parallel-safe | Focused gate |
| --- | --- | --- | --- |
| Docs/contracts | Structural review | Yes | `git diff --check` plus scoped `rg` |
| Pure validators, crypto, mappers | Vitest unit | Yes | focused Vitest + typecheck |
| Auth and route handlers | Vitest integration with synthetic mocks | No | focused Vitest + typecheck |
| PostgreSQL repository/migration | Unit plus disposable PostgreSQL integration | No | focused Vitest + `test:integration` |
| React page/component | Vitest + React Testing Library | Yes | focused Vitest + typecheck |
| n8n protocol | HTTP contract tests against non-production | No | `test:contract` |
| User flows | Browser E2E with synthetic services/data | No | `test:e2e` |
| Phase/product | Full suite | No | lint + typecheck + test + build |

Gate aliases:

```text
DOC  = git diff --check
UNIT = pnpm vitest run <test-file> && pnpm typecheck
FULL = pnpm lint && pnpm typecheck && pnpm test && pnpm build
DB   = pnpm test:integration
CTR  = pnpm test:contract
E2E  = pnpm test:e2e
```

Every focused task records its exact passing count. Every phase requires at
least the prior global test count plus the task's new cases; silent test
deletion is a failure.

## External Gates

| Gate | Required input | Blocks |
| --- | --- | --- |
| X1 Identity | Exact IdP role claim, provider-role assignments, revocation policy | Production actor/permission activation |
| X2 App database | Named disposable/non-production target now; production target, roles, grants, backup owner later | DB integration; production commercial writes |
| X3 n8n ingress | Non-production URL, credentials, owner, deployment/rollback process | Separate workflow and live contract tests |
| X4 Producer facts | Batch/row/close read source and exact result-to-terminal mapping | Producer observation repository and truthful completion |
| X5 Performance | Production-like scale, latency/timeout/index budgets, approved plans | Queue/batch production enablement and guard removal |
| X6 Data policy | Exact field/JSON-path and hostname allowlists; LGPD owner | Production sensitive-content enablement |
| X7 Rollout | Deployment target, secret owners, monitoring, incident and rollback owners | Production release |

## Execution Plan

```text
Phase 0:
T001 → T002 → T003

Phase 1:
T003 → T004 → T006 → T007
T003 → T005 → T006
T004 → T008 → T010
T002 → T009 → T010

Phase 2:
T004 → T011
T004 → T012
T011 + T012 → T013
T008 + T009 → T014
T013 + T014 → T015
T007 + T015 → T016 → T017
T002 + T012 + X3 + X4 → T018 → T019

Phase 3:
T002 → T020
T010 → T021
T008 + T020 + X4 → T022
T020 + T021 + T022 → T023
T007 + T023 → T024
T007 + T023 → T025
T024 → T026
T025 → T027

Phase 4:
T002 → T028
T010 + T028 → T029
T010 + T028 → T030
T010 + T028 → T031
T010 → T032
T008 + T010 + T028 → T033
T007 + T033 → T034
T007 + T029 → T035
T007 + T029 → T036
T007 + T030 → T037
T007 + T031 → T038
T007 + T032 → T039
T034 + T035 → T040
T036 + T037 + T038 + T039 → T041

Phase 5:
T002 + T007 → T042
T042 → T043
T042 → T044
T008 + T042 + X6 → T045
T043 + T044 + T045 → T046

Phase 6:
T019 + T027 + T041 + T046 + X5 → T047
T017 + T027 + T041 + T046 → T048
T019 + T047 + T048 → T049
T049 + X7 → T050
T050 → T051
```

No task marked with an external gate may claim integration or production
completion until that gate is evidenced.

## Task Breakdown

### Phase 0 — Governance and plan

#### T001: Replace repository instructions with the Prospecta boundary

**What/where:** Make `AGENTS.md` authoritative for staged Prospecta work and
mark `AGENTS.next.md` superseded.  
**Depends on:** None. **Requirements:** PC-04, PC-17. **Tools:** DOCS.  
**Tests/gate:** Structural review / DOC.  
**Done when:** Upload/app writes are authorized only inside the permanent
producer boundary; production actions remain separately blocked.  
**Verify:** `rg -n "Permanent producer boundary|Production and rollout restrictions|superseded" AGENTS.md AGENTS.next.md`  
**Commit:** `docs(prospecta): authorize staged product boundary`

#### T002: Finalize contracts, decisions, and authorization state

**What/where:** Reconcile `spec.md`, `context.md`, `design.md`, `contracts/`,
and `decisions/` with repository authorization and external gates.  
**Depends on:** T001. **Requirements:** PC-01–PC-17. **Tools:** DOCS, NAV.  
**Tests/gate:** Structural review / DOC.  
**Done when:** HMAC, idempotency, correlation, completion, app ownership,
retention, permissions, and sensitive controls are unambiguous.  
**Verify:** `rg -n "APPROVED|External|HMAC|COMPLETED|append-only" .specs/features/prospecting-console`  
**Commit:** `docs(prospecta): finalize implementation contracts`

#### T003: Publish the atomic execution plan

**What/where:** Create this `tasks.md`.  
**Depends on:** T002. **Requirements:** PC-17. **Tools:** DOCS.  
**Tests/gate:** Granularity, dependency, and co-location review / DOC.  
**Done when:** Every deliverable has dependencies, tests, verification, a
commit label, and external blockers.  
**Verify:** `git diff --check && rg -n "^#### T[0-9]{3}" .specs/features/prospecting-console/tasks.md`  
**Commit:** `docs(prospecta): add atomic delivery plan`

**Phase 0 gate:** `FULL`. Expected baseline: at least 31 files / 494 tests.

### Phase 1 — Actor, permissions, database boundary, schema

#### T004: Expand and validate server environment

**What/where:** Add separate DB URLs, ingress/HMAC settings, upload limits,
URL hosts, role mapping, and feature flags in `src/server/env.ts`,
`.env.example`, and colocated tests.  
**Depends on:** T003. **Requirements:** PC-01, PC-04, PC-05. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 12 new cases / UNIT.  
**Done when:** Invalid URLs, public secret names, weak HMAC secrets, malformed
role maps, and unsafe hosts fail closed without echoing values.  
**Verify:** `pnpm vitest run src/server/env.test.ts && pnpm typecheck`  
**Commit:** `feat(prospecta): validate server integration environment`

#### T005: Define permission and role-bundle policy

**What/where:** Create `src/server/auth/permissions.ts` and tests for the exact
permission union and deny-by-default bundle mapping.  
**Depends on:** T003. **Requirements:** PC-05. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 10 new cases / UNIT.  
**Done when:** Unknown roles/permissions grant nothing and sensitive access is
an independent overlay.  
**Verify:** focused permission test and typecheck.  
**Commit:** `feat(prospecta): define permission policy`

#### T006: Retain the verified actor in server auth

**What/where:** Extend `src/server/auth/authorization.ts`, `config.ts`, and
`index.ts` with issuer, subject, organization, and permissions; update auth
tests.  
**Depends on:** T004, T005. **Requirements:** PC-05. **Tools:** CORE,
CURRENT-DOCS.  
**Tests/gate:** Auth integration, minimum 14 new/updated cases / UNIT.  
**Done when:** Only verified claims create an actor; refresh preserves
allowlisted values; missing/changed organization fails closed.  
**Verify:** `pnpm vitest run src/server/auth/auth.test.ts && pnpm typecheck`  
**Commit:** `feat(prospecta): retain authorized actor context`

#### T007: Enforce permissions and same-origin mutations

**What/where:** Replace the minimal API context in
`src/server/auth/require-api-session.ts` with `requirePermission` and add a
same-origin mutation guard plus tests.  
**Depends on:** T006. **Requirements:** PC-05. **Tools:** CORE.  
**Tests/gate:** Route/auth integration, minimum 16 new/updated cases / UNIT.  
**Done when:** `401/403` happens before body, DB, hash, or HTTP callbacks;
cross-origin mutations fail safely.  
**Verify:** focused guard tests and typecheck.  
**Commit:** `feat(prospecta): enforce actor permissions`

#### T008: Split producer-read and app-write PostgreSQL clients

**What/where:** Add `producer-client.ts` and `app-client.ts`; preserve existing
lead repository behavior; update DB client tests.  
**Depends on:** T004. **Requirements:** PC-04, PC-06. **Tools:** CORE.  
**Tests/gate:** Unit with mocked `pg`, minimum 12 new/updated cases / UNIT.  
**Done when:** Pools use distinct URLs, application names, limits, safe errors,
and no client module crosses ownership.  
**Verify:** focused DB tests and existing repository tests.  
**Commit:** `refactor(prospecta): isolate database connections`

#### T009: Define and prove the reversible app-owned schema migration

**What/where:** Add reviewed forward/rollback/grant SQL under `db/app/`, the
disposable DB harness, and apply/rollback tests for imports, workspaces,
activities, notes, and append-only audits.  
**Depends on:** T002, X2 disposable target. **Requirements:** PC-06, PC-14,
PC-15. **Tools:** CORE, DB-TEST.  
**Tests/gate:** SQL structural + PostgreSQL integration, minimum 12 cases / DB.  
**Done when:** Organization constraints, uniqueness, checks, indexes, no
producer FKs, append-only grants, and rollback order are explicit and execute
both directions on a disposable target.  
**Verify:** `pnpm test:integration` plus forbidden producer-reference `rg`.  
**Commit:** `feat(prospecta): define app-owned schema`

#### T010: Prove database role isolation in disposable PostgreSQL

**What/where:** Add producer-write/app-cross-schema denial and least-privilege
query tests to the disposable DB harness.  
**Depends on:** T008, T009, X2 disposable target. **Requirements:** PC-04,
PC-06. **Tools:** DB-TEST, CORE.  
**Tests/gate:** PostgreSQL integration, minimum 10 cases / DB + FULL.  
**Done when:** Both roles fail forbidden operations and can perform only their
allowlisted work. No production DSN is accepted.  
**Verify:** `pnpm test:integration && FULL`.  
**Commit:** `test(prospecta): prove database ownership boundary`

**Phase 1 gate:** `FULL && DB`. Record exact counts and any X1/X2 limitations.

### Phase 2 — Controlled upload and producer ingress

#### T011: Validate and hash exact CSV bytes

**What/where:** Add `src/server/imports/upload-file.ts` and tests for filename,
media type, 10 MiB limit, UTF-8, NUL, non-empty header, and SHA-256.  
**Depends on:** T004. **Requirements:** PC-12. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 18 cases / UNIT.  
**Done when:** Exact input bytes are unchanged and no business row/CNPJ logic
exists.  
**Verify:** focused upload-file tests and source scan for business parsing.  
**Commit:** `feat(prospecta): validate exact csv uploads`

#### T012: Implement HMAC v1 canonicalization and signing

**What/where:** Add `src/server/imports/hmac.ts`, golden vectors, malformed
input, clock, nonce, and constant-time verification tests.  
**Depends on:** T004. **Requirements:** PC-01, PC-02. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 20 cases / UNIT.  
**Done when:** Output exactly matches the contract and secrets/signatures never
enter errors or logs.  
**Verify:** focused HMAC tests and typecheck.  
**Commit:** `feat(prospecta): implement ingress hmac contract`

#### T013: Implement the typed n8n ingress client

**What/where:** Add `src/server/imports/ingress-client.ts` with injected fetch,
multipart request, HMAC headers, timeout, response Zod validation, and tests.  
**Depends on:** T011, T012. **Requirements:** PC-01, PC-02. **Tools:** CORE,
CURRENT-DOCS.  
**Tests/gate:** Unit/integration mock, minimum 18 cases / UNIT.  
**Done when:** Only validated correlated `202` is accepted; safe mappings cover
400/401/403/409/413/429/503/timeout.  
**Verify:** focused client tests and typecheck.  
**Commit:** `feat(prospecta): add producer ingress client`

#### T014: Persist idempotent app submissions and acceptance

**What/where:** Add the import repository under
`src/server/repositories/imports/` with transactional events and tests.  
**Depends on:** T008, T009. **Requirements:** PC-02, PC-06. **Tools:** CORE,
DB-TEST.  
**Tests/gate:** Unit + PostgreSQL integration, minimum 16 cases / UNIT + DB.  
**Done when:** Same org/key/hash returns the original record; conflicts return
409; acceptance and event commit atomically.  
**Verify:** focused repository tests and `pnpm test:integration`.  
**Commit:** `feat(prospecta): persist import submission facts`

#### T015: Orchestrate submission without automatic retry

**What/where:** Add `src/server/imports/submit-import.ts` and tests for actor,
hash, durable intent, one ingress call, acceptance, conflict, and unknown state.  
**Depends on:** T013, T014. **Requirements:** PC-02, PC-12. **Tools:** CORE.  
**Tests/gate:** Service unit, minimum 14 cases / UNIT.  
**Done when:** Persistence precedes producer call and no accepted/unknown path
automatically calls it again.  
**Verify:** focused service tests asserting exact call order/count.  
**Commit:** `feat(prospecta): orchestrate controlled import`

#### T016: Add `POST /api/imports`

**What/where:** Implement the raw-body upload route and route tests.  
**Depends on:** T007, T015. **Requirements:** PC-12. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 18 cases / UNIT.  
**Done when:** Auth/permission/origin run first; body is bounded; response is
safe/private and distinguishes recorded versus accepted `202`.  
**Verify:** focused route tests and typecheck.  
**Commit:** `feat(prospecta): expose controlled import endpoint`

#### T017: Build the controlled upload page

**What/where:** Add private import page/component with one-file selection,
client hints, stable UUID idempotency key, and loading/error/unknown/accepted
states.  
**Depends on:** T016. **Requirements:** PC-12. **Tools:** UI.  
**Tests/gate:** RTL, minimum 14 cases / UNIT.  
**Done when:** Browser calls only `/api/imports`, never n8n; no automatic retry
UI or row qualification logic exists.  
**Verify:** focused component/page tests plus source scan for n8n URLs.  
**Commit:** `feat(prospecta): add controlled import experience`

#### T018: Build the separate versioned n8n ingress artifact

**What/where:** Create sanitized, credential-free artifacts under
`integrations/n8n/prospecting-import-v1/`; do not touch `private-workflows/`.  
**Depends on:** T002, T012, X3, X4. **Requirements:** PC-01–PC-03. **Tools:**
N8N-TEST, CURRENT-DOCS.  
**Tests/gate:** Import/export validation and non-production smoke / CTR.  
**Done when:** The separate workflow verifies HMAC/hash/replay, persists one
acceptance, correlates rows, and returns early `202`; it is not activated in
production.  
**Verify:** artifact diff, credential scan, and non-production smoke.  
**Commit:** `feat(prospecta): add versioned n8n ingress`

#### T019: Execute ingress contract tests

**What/where:** Add `test:contract` and HTTP tests for all contract cases,
including completion correlation fixtures.  
**Depends on:** T018, X3. **Requirements:** PC-01–PC-03. **Tools:** N8N-TEST,
CORE.  
**Tests/gate:** Contract integration, minimum 24 cases / CTR + FULL.  
**Done when:** Golden HMAC, replay/conflict, timeout, redaction, correlation,
and closure cases pass against the named non-production endpoint.  
**Verify:** `pnpm test:contract && FULL`.  
**Commit:** `test(prospecta): verify n8n ingress contract`

**Phase 2 gate:** `FULL && DB && CTR`; CTR may remain explicitly blocked by X3.

### Phase 3 — Evidence-based batches

#### T020: Implement the batch status mapper

**What/where:** Add batch domain types and a pure evidence mapper with tests.  
**Depends on:** T002. **Requirements:** PC-03, PC-13. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 24 cases / UNIT.  
**Done when:** Every state/basis/count follows the contract; duplicates,
conflicts, excess terminals, missing close, and unavailable data fail closed.  
**Verify:** focused mapper tests and typecheck.  
**Commit:** `feat(prospecta): map evidence based batch status`

#### T021: Read app-owned submission list and detail

**What/where:** Add paginated app-submission repository functions and
PostgreSQL tests.  
**Depends on:** T010. **Requirements:** PC-13. **Tools:** CORE, DB-TEST.  
**Tests/gate:** Unit + integration, minimum 14 cases / UNIT + DB.  
**Done when:** Organization isolation, stable ordering, nullable acceptance,
and bounded pagination are proven.  
**Verify:** focused repository tests and DB gate.  
**Commit:** `feat(prospecta): read app submission facts`

#### T022: Read approved producer batch observations

**What/where:** Add producer observation repository using only X4-approved
views/fields and parameterized batch IDs.  
**Depends on:** T008, T020, X4. **Requirements:** PC-03, PC-13. **Tools:** CORE,
DB-TEST.  
**Tests/gate:** Unit + approved non-production integration, minimum 16 cases.  
**Done when:** Missing source is unavailable, not zero; no legacy event absence
creates completion.  
**Verify:** focused tests, SQL allowlist review, DB integration.  
**Commit:** `feat(prospecta): read producer batch observations`

#### T023: Compose the batch read service

**What/where:** Add list/detail composition under `src/server/imports/` with
tests for app facts plus nullable producer observations.  
**Depends on:** T020, T021, T022. **Requirements:** PC-03, PC-13. **Tools:**
CORE.  
**Tests/gate:** Service unit, minimum 14 cases / UNIT.  
**Done when:** Proven acceptance survives producer outage and status provenance
is preserved.  
**Verify:** focused service tests and typecheck.  
**Commit:** `feat(prospecta): compose batch read model`

#### T024: Add paginated `GET /api/imports`

**What/where:** Implement list validation/route/tests.  
**Depends on:** T007, T023. **Requirements:** PC-13. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 12 cases / UNIT.  
**Done when:** `imports:read`, org scope, pagination, safe errors, and no-store
are enforced.  
**Verify:** focused route tests.  
**Commit:** `feat(prospecta): expose batch list api`

#### T025: Add `GET /api/imports/:id`

**What/where:** Implement detail validation/route/tests.  
**Depends on:** T007, T023. **Requirements:** PC-13. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 12 cases / UNIT.  
**Done when:** Cross-org IDs fail closed and all counts/status bases remain
nullable/evidence-based.  
**Verify:** focused route tests.  
**Commit:** `feat(prospecta): expose batch detail api`

#### T026: Build the batch list page

**What/where:** Add private batch list UI with filters supported by evidence,
pagination, and loading/empty/error/unavailable states.  
**Depends on:** T024. **Requirements:** PC-13. **Tools:** UI.  
**Tests/gate:** RTL, minimum 12 cases / UNIT.  
**Done when:** Unknown metrics render unavailable, never zero/progress.  
**Verify:** focused page/component tests.  
**Commit:** `feat(prospecta): add batch list`

#### T027: Build the batch detail page

**What/where:** Add batch facts, provenance, count, and state presentation.  
**Depends on:** T025. **Requirements:** PC-13. **Tools:** UI.  
**Tests/gate:** RTL, minimum 14 cases / UNIT.  
**Done when:** `NO_UPDATE`, incomplete, source unavailable, and explicit
completion are distinct; raw telemetry is absent.  
**Verify:** focused page/component tests.  
**Commit:** `feat(prospecta): add batch detail`

**Phase 3 gate:** `FULL && DB`; producer integration remains blocked until X4.

### Phase 4 — Commercial workspace

#### T028: Define commercial types, validators, and transitions

**What/where:** Add commercial DTOs/Zod schemas and pure transition policy.  
**Depends on:** T002. **Requirements:** PC-14, PC-15. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 22 cases / UNIT.  
**Done when:** Stages, lengths, dates, actor-field rejection, and terminal
non-reopening are enforced.  
**Verify:** focused validator/transition tests.  
**Commit:** `feat(prospecta): define commercial domain`

#### T029: Implement transactional workspace mutations

**What/where:** Add workspace repository create/read/update with optimistic
version and audit in one transaction.  
**Depends on:** T010, T028. **Requirements:** PC-14, PC-15. **Tools:** CORE,
DB-TEST.  
**Tests/gate:** Unit + integration, minimum 20 cases / UNIT + DB.  
**Done when:** Cross-org, stale version, assignment conflict, invalid
transition, and audit rollback cases pass.  
**Verify:** focused repository tests and DB gate.  
**Commit:** `feat(prospecta): persist commercial workspaces`

#### T030: Implement append-only activity repository

**What/where:** Add paginated list/append activity functions and audit tests.  
**Depends on:** T010, T028. **Requirements:** PC-15. **Tools:** CORE, DB-TEST.  
**Tests/gate:** Unit + integration, minimum 12 cases.  
**Done when:** Actor/org/run attribution and immutable append behavior pass.  
**Verify:** focused tests and DB gate.  
**Commit:** `feat(prospecta): append commercial activities`

#### T031: Implement append-only note repository

**What/where:** Add paginated list/append note functions and audit tests.  
**Depends on:** T010, T028. **Requirements:** PC-15. **Tools:** CORE, DB-TEST.  
**Tests/gate:** Unit + integration, minimum 12 cases.  
**Done when:** Note bodies never enter audit/log metadata and no edit/delete
function exists.  
**Verify:** focused tests, DB gate, source scan.  
**Commit:** `feat(prospecta): append commercial notes`

#### T032: Implement the app audit reader

**What/where:** Add allowlisted, paginated commercial audit repository.  
**Depends on:** T010. **Requirements:** PC-15. **Tools:** CORE, DB-TEST.  
**Tests/gate:** Unit + integration, minimum 10 cases.  
**Done when:** Only approved metadata is returned and cross-org access fails.  
**Verify:** focused tests and DB gate.  
**Commit:** `feat(prospecta): read commercial audit events`

#### T033: Implement the commercial queue repository

**What/where:** Compose approved producer lead facts with app workspaces,
server-side pagination/filter/sort, and unavailable producer state.  
**Depends on:** T008, T010, T028. **Requirements:** PC-14. **Tools:** CORE,
DB-TEST.  
**Tests/gate:** Unit + integration, minimum 18 cases / UNIT + DB.  
**Done when:** No score/action recalculation occurs and exact totals remain
nullable when unavailable. Current guards remain until X5.  
**Verify:** focused queue tests and SQL review.  
**Commit:** `feat(prospecta): build commercial queue read model`

#### T034: Add `GET /api/work-queue`

**What/where:** Implement queue route/validation/tests.  
**Depends on:** T007, T033. **Requirements:** PC-14. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 12 cases / UNIT.  
**Done when:** `commercial:read`, org scope, pagination, and no-store pass.  
**Verify:** focused route tests.  
**Commit:** `feat(prospecta): expose commercial queue api`

#### T035: Add `POST /api/workspaces`

**What/where:** Implement workspace creation/claim route and tests.  
**Depends on:** T007, T029. **Requirements:** PC-14. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 14 cases / UNIT.  
**Done when:** Assignment requires `commercial:assign`; actor/org body fields
are rejected; producer remains untouched.  
**Verify:** focused route tests.  
**Commit:** `feat(prospecta): create commercial workspace`

#### T036: Add `GET/PATCH /api/workspaces/:id`

**What/where:** Implement detail/update route and optimistic-conflict tests.  
**Depends on:** T007, T029. **Requirements:** PC-14, PC-15. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 18 cases / UNIT.  
**Done when:** Read/write/assign permissions differ correctly and stale
versions return safe `409`.  
**Verify:** focused route tests.  
**Commit:** `feat(prospecta): manage commercial workspace`

#### T037: Add activity list/append API

**What/where:** Implement `GET/POST /api/workspaces/:id/activities` and tests.  
**Depends on:** T007, T030. **Requirements:** PC-15. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 14 cases / UNIT.  
**Done when:** Lists paginate and append is auth-first, append-only, and safely
validated.  
**Verify:** focused route tests.  
**Commit:** `feat(prospecta): expose commercial activities`

#### T038: Add note list/append API

**What/where:** Implement `GET/POST /api/workspaces/:id/notes` and tests.  
**Depends on:** T007, T031. **Requirements:** PC-15. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 14 cases / UNIT.  
**Done when:** Lists paginate; note text never appears in errors/logs; no
mutation route exists.  
**Verify:** focused route tests and source scan.  
**Commit:** `feat(prospecta): expose commercial notes`

#### T039: Add audit list API

**What/where:** Implement `GET /api/workspaces/:id/audit` and tests.  
**Depends on:** T007, T032. **Requirements:** PC-15. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 10 cases / UNIT.  
**Done when:** `audit:read`, org scope, pagination, and metadata allowlist pass.  
**Verify:** focused route tests.  
**Commit:** `feat(prospecta): expose commercial audit`

#### T040: Build the commercial queue page

**What/where:** Add queue filters/table/cards and business states.  
**Depends on:** T034, T035. **Requirements:** PC-14. **Tools:** UI.  
**Tests/gate:** RTL, minimum 16 cases / UNIT.  
**Done when:** Responsible, stage, next action/due date, and producer
recommendation are visibly separate; loading/empty/error/unavailable pass.  
**Verify:** focused UI tests.  
**Commit:** `feat(prospecta): add commercial queue`

#### T041: Build workspace detail and activity/note flow

**What/where:** Add workspace detail UI for optimistic edits, activities,
notes, and audit states.  
**Depends on:** T036, T037, T038, T039. **Requirements:** PC-14, PC-15.
**Tools:** UI.  
**Tests/gate:** RTL, minimum 20 cases / UNIT.  
**Done when:** Conflict refresh, permission denial, append success, empty,
loading, and error states pass with synthetic data.  
**Verify:** focused UI tests.  
**Commit:** `feat(prospecta): add commercial workspace detail`

**Phase 4 gate:** `FULL && DB`; keep production feature flag off pending X1,
X2, and X5.

### Phase 5 — Governed sensitive content

#### T042: Define the sensitive field/source allowlist mapper

**What/where:** Add permission-aware DTO policy for risk/signal/evidence/report
candidates; preserve explicit missing/withheld/unavailable states.  
**Depends on:** T002, T007. **Requirements:** PC-16. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 18 cases / UNIT.  
**Done when:** No permission or unknown source/path always withholds content;
contacts/CRM remain withheld.  
**Verify:** focused policy/mapper tests.  
**Commit:** `feat(prospecta): enforce sensitive field allowlist`

#### T043: Validate external evidence URLs

**What/where:** Add server URL policy with exact HTTPS host matching and tests.  
**Depends on:** T042. **Requirements:** PC-16. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 16 cases / UNIT.  
**Done when:** Credentials, non-HTTPS, Unicode confusion, ports, suffix tricks,
fragments/query leakage, and implicit subdomains fail closed.  
**Verify:** focused URL tests.  
**Commit:** `feat(prospecta): validate evidence urls`

#### T044: Sanitize and render approved report Markdown

**What/where:** Add the minimal justified Markdown/sanitization dependencies,
server policy, renderer, and malicious fixture tests.  
**Depends on:** T042. **Requirements:** PC-16. **Tools:** CORE, UI,
CURRENT-DOCS.  
**Tests/gate:** Unit + RTL, minimum 18 cases / UNIT.  
**Done when:** Active HTML/scripts/events are removed, links pass T043, and
plain missing/withheld states remain intact.  
**Verify:** focused sanitizer/renderer tests, dependency review, FULL.  
**Commit:** `feat(prospecta): render sanitized strategic reports`

#### T045: Read only approved sensitive producer fields

**What/where:** Add exact-run/CNPJ-bound repository queries for X6-approved
columns/JSON paths and permission-aware mapping.  
**Depends on:** T008, T042, X6. **Requirements:** PC-16. **Tools:** CORE,
DB-TEST.  
**Tests/gate:** Unit + approved non-production integration, minimum 16 cases.  
**Done when:** Raw payload/report JSON, ambiguous rows, contacts, and unknown
paths never leave the repository boundary.  
**Verify:** focused tests, SQL/field grant review, DB gate.  
**Commit:** `feat(prospecta): read allowlisted lead insights`

#### T046: Expose approved content on lead detail

**What/where:** Extend lead detail service/API/UI with `sensitive:read`,
allowlisted sections, safe links, and all explicit states.  
**Depends on:** T043, T044, T045. **Requirements:** PC-16. **Tools:** CORE, UI.  
**Tests/gate:** Route + RTL, minimum 20 cases / UNIT + FULL.  
**Done when:** Unauthorized responses contain no content; authorized synthetic
content is sanitized; contacts remain withheld.  
**Verify:** focused API/UI tests and sensitive-string scans.  
**Commit:** `feat(prospecta): expose governed lead content`

**Phase 5 gate:** `FULL && DB`; production flag stays off pending X6.

### Phase 6 — Evidence, UAT, security, rollout

#### T047: Record production-like query performance evidence

**What/where:** Execute approved safe plans and update
`evidence/query-performance-gates.md` with redacted results.  
**Depends on:** T019, T027, T041, T046, X5. **Requirements:** PC-11, PC-17.
**Tools:** DB-TEST, DOCS.  
**Tests/gate:** Approved performance probes + FULL.  
**Done when:** Every batch/queue/detail query has owner-approved scale,
latency, timeout, index, count, and concurrency evidence.  
**Verify:** evidence review; no parameters/rows/secrets committed.  
**Commit:** `docs(prospecta): record query performance evidence`

#### T048: Add synthetic end-to-end UAT flows

**What/where:** Add browser test harness and flows for login, upload,
batch state, queue, conflict, activities, notes, and sensitive denial/allow.  
**Depends on:** T017, T027, T041, T046. **Requirements:** PC-17. **Tools:** UI,
CORE.  
**Tests/gate:** E2E, minimum 12 flows / E2E + FULL.  
**Done when:** All critical business states use synthetic fixtures and no
browser request targets n8n/PostgreSQL.  
**Verify:** `pnpm test:e2e && FULL`.  
**Commit:** `test(prospecta): cover prospecting uat flows`

#### T049: Complete the security review

**What/where:** Add/execute abuse tests and update a redacted security review
for auth order, CSRF, HMAC replay, upload bounds, SSRF/XSS, SQL, tenant
isolation, logs, secrets, and grants.  
**Depends on:** T019, T047, T048. **Requirements:** PC-17. **Tools:** CORE,
DB-TEST, N8N-TEST.  
**Tests/gate:** Security suites + DB + CTR + E2E + FULL.  
**Done when:** No high/critical finding remains and residual risks have named
owners.  
**Verify:** all gates and credential/sensitive-data scans.  
**Commit:** `test(prospecta): complete security review`

#### T050: Prepare gradual rollout and rollback runbook

**What/where:** Document feature-flag sequence, migration/n8n/app order,
monitoring, pause conditions, rollback, and audit preservation.  
**Depends on:** T049, X7. **Requirements:** PC-17. **Tools:** DOCS.  
**Tests/gate:** Tabletop review + DOC.  
**Done when:** Each step has owner, target, success signal, stop condition, and
rollback; rollback never rewrites producer data or deletes audit.  
**Verify:** runbook review and `git diff --check`.  
**Commit:** `docs(prospecta): add rollout and rollback runbook`

#### T051: Run the final release gate

**What/where:** Execute all checks and record exact versions, counts,
limitations, pending external gates, and UAT/security decisions.  
**Depends on:** T050. **Requirements:** PC-17. **Tools:** all approved profiles.  
**Tests/gate:** `FULL && DB && CTR && E2E`.  
**Done when:** All applicable checks pass; production remains blocked unless
X1–X7 and explicit release approval are complete.  
**Verify:** archived command transcript without secrets/real data.  
**Commit:** `chore(prospecta): record release readiness`

## Diagram–Definition Cross-check

The dependency diagram and task bodies were compared directly:

| Tasks | Body dependencies represented in diagram | Status |
| --- | --- | --- |
| T001–T003 | None → T001 → T002 → T003 | ✅ |
| T004–T010 | T003 branches; T004+T005→T006→T007; T004→T008; T002→T009; T008+T009→T010 | ✅ |
| T011–T019 | T011/T012 branches → T013; T014; T013+T014→T015→T016→T017; external ingress branch T018→T019 | ✅ |
| T020–T027 | T020/T021/T022→T023→T024/T025→T026/T027 | ✅ |
| T028–T041 | T028 and T010 feed repositories; repositories feed routes; routes feed two UI tasks | ✅ |
| T042–T046 | T042→T043/T044/T045→T046 | ✅ |
| T047–T051 | Product slices + external evidence → performance/UAT → security → rollout → final | ✅ |

No task is marked parallel, and every external dependency in a task body is
shown as X1–X7.

## Test Co-location Validation

| Tasks | Layer | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T001–T003, T050 | Docs | Structural | DOC in same task | ✅ |
| T004–T005, T011–T012, T020, T028, T042–T043 | Pure policy/validator/mapper | Unit | Unit in same task | ✅ |
| T006–T007 | Auth | Integration | Auth/guard integration in same task | ✅ |
| T008, T014, T021–T023, T029–T033, T045 | DB/repository | Unit + disposable integration | Unit/integration in same task | ✅ |
| T009–T010 | Migration/roles | Disposable PostgreSQL integration | Integration in each task | ✅ |
| T013, T015 | Service/client | Unit with injected boundaries | Unit/mock integration in same task | ✅ |
| T016, T024–T025, T034–T039, T046 | Routes | Route integration | Route tests in same task | ✅ |
| T017, T026–T027, T040–T041, T044, T046 | React | RTL | RTL in same task | ✅ |
| T018–T019 | n8n protocol | Non-production contract | Smoke/contract in same task | ✅ |
| T047 | Performance | Approved production-like probes | Evidence in same task | ✅ |
| T048 | Product flow | Browser E2E | E2E in same task | ✅ |
| T049–T051 | Security/release | All applicable gates | All gates | ✅ |

## Granularity Check

- Each pure task creates one policy, validator, mapper, client, repository,
  service, endpoint/resource, page, or verification artifact.
- Implementation and its colocated test count as one atomic deliverable.
- Multi-method route tasks cover one REST resource and one repository contract.
- No task combines producer mutation with app behavior.
- Phase gates are verification steps, not deferred test tasks.

All tasks pass the granularity, dependency, and test co-location checks.
