# Prospecta — Prospecting Console Tasks

**Spec:** `.specs/features/prospecting-console/spec.md`  
**Design:** `.specs/features/prospecting-console/design.md`  
**Status:** IN PROGRESS — database boundary, app-owned schema migration, and
role isolation consolidated through T010; the acknowledgement-only internal
upload slice is unblocked for T013–T017

**Historical baseline:** 31 Vitest files / 494 tests passing on 2026-07-03

## Planning Gate Result — 2026-07-03

- T001: complete.
- T002: complete.
- T003: complete.
- T004: corrected locally on 2026-07-06 to require the official
  `empresaqui/import` URL, keep HMAC optional/unused, and preserve disabled
  import controls; final phase gate recorded below.
- T005: complete per the implementation progress reported by the repository
  owner.
- T006: complete per the implementation progress reported by the repository
  owner.
- T007: actor-aware permission and same-origin guards implemented locally on
  2026-07-06; complete only after the final phase gate recorded below.
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
- The 2026-07-06 documentation review did not rerun implementation gates and
  does not fabricate updated test counts.
- Static mapping of
  `private-workflows/EmpresaAqui_Webhook_Import_v1.json` was recorded at this
  gate; the later partial runtime evidence is recorded below.

## T004/T007 Correction Gate — 2026-07-06

- T004: complete after correction to the official n8n URL forms and
  optional/unused deferred HMAC settings.
- T005 remains as dormant permission vocabulary; it does not grant runtime
  access in the current phase.
- T006 now retains verified identity/organization with empty permissions and
  ignores provider roles and stale token permissions.
- T007 keeps actor-aware auth-first and reusable same-origin enforcement;
  current lead GETs require authenticated allowed-organization sessions rather
  than granular permissions.
- Focused gate: 7 files / 176 tests passed.
- `pnpm lint`: passed with the same two pre-existing unused-variable warnings
  in `src/server/auth/auth.test.ts`.
- `pnpm typecheck`: passed.
- `pnpm test`: 32 files / 595 tests passed.
- `pnpm build`: compiled and passed TypeScript but initially stopped during
  page-data collection because the untouched `.env.local` contains an old
  n8n path. A rerun with a process-only synthetic
  `N8N_IMPORT_URL=https://build-placeholder.example.com/webhook/empresaqui/import`
  passed completely; `.env.local` was not inspected or changed.
- `git diff --check`: passed after the implementation and documentation
  updates.
- At this correction gate, T018 had only static mapping and T019 plus the app
  import slice remained blocked. The later internal-profile decision supersedes
  that implementation blocker.

## Role-claim Deferral Gate — 2026-07-06

- `AUTH_ROLE_CLAIM` and `AUTH_ROLE_MAPPING` were removed from required/parsed
  runtime configuration and remain commented as deferred in `.env.example`.
- OIDC authorization uses verified issuer, subject, and allowed organization
  only. Provider roles and stale token permissions are ignored; actor
  permissions remain empty.
- Current lead GET routes remain private and auth-first through
  `requireApiSession`; granular permission checks remain blocked by X1.
- Focused env/auth gate: 3 files / 104 tests passed.
- `pnpm lint`: passed with the same two pre-existing unused-variable warnings
  in `src/server/auth/auth.test.ts`.
- `pnpm typecheck`: passed.
- `pnpm test`: 32 files / 598 tests passed.
- `pnpm build`: plain run failed during page-data collection because the
  untouched `.env.local` contains an unapproved `N8N_IMPORT_URL`; rerun with a
  process-only synthetic
  `N8N_IMPORT_URL=https://build-placeholder.example.com/webhook/empresaqui/import`
  passed.
- No n8n, import route/client, database, migration, or feature-flag activation
  was introduced.

## Private Access Consolidation Gate — 2026-07-06

- Current private pages are limited to the authenticated lead surface:
  `(private)/layout.tsx`, `/leads`, and `/leads/[cnpj]`. The server layout
  redirects missing/expired sessions to `/login` and renders a safe access
  denial state for unauthorized sessions without private children or identity
  details.
- Current private APIs are limited to `GET /api/leads`,
  `GET /api/leads/:cnpj`, and `GET /api/leads/:cnpj/history`. Each route uses
  `requireApiSession` before validation or repository work, returns `401` for
  unauthenticated sessions, returns `403` for denied sessions, and keeps
  `Cache-Control: private, no-store` on success and errors.
- `AUTH_ALLOWED_ORG_ID` remains enforced by the server authorization policy,
  OIDC sign-in, JWT refresh, session mapping, and retained-session
  classification. Provider role claims and stale token permissions remain
  ignored; actor permissions remain empty.
- Feature flags remain disabled server-side placeholders for unreleased
  capabilities. The environment parser now rejects `NEXT_PUBLIC_FEATURE_*`
  exposure, and a synthetic app-surface test keeps `/api/imports`,
  work-queue/workspace routes, and import/commercial private pages absent.
- Focused private-access gate: 7 files / 158 tests passed.
- `pnpm lint`: passed with the same two pre-existing unused-variable warnings
  in `src/server/auth/auth.test.ts`.
- `pnpm typecheck`: passed.
- `pnpm test`: 32 files / 599 tests passed.
- `pnpm build`: passed with a process-only synthetic
  `N8N_IMPORT_URL=https://build-placeholder.example.com/webhook/empresaqui/import`;
  `.env.local` was not inspected or changed.
- `git diff --check`: passed.
- No `/api/imports`, n8n client/call, database change, migration, granular
  role authorization, feature activation, or real data was introduced.

## T008 Database Boundary Gate — 2026-07-06

- T008 is complete for local/synthetic repository implementation: producer
  reads use `src/server/db/producer-client.ts` with
  `PRODUCER_DATABASE_URL`, `application_name=prospecta-producer-read`, and
  bounded pool/timeouts; app-owned access uses
  `src/server/db/app-client.ts` with `APP_DATABASE_URL`,
  `application_name=prospecta-app-write`, and the same safe limits.
- The former generic `src/server/db/client.ts` was removed so current modules
  must choose producer-read or app-owned ownership explicitly.
- Lead list, detail, and history repositories now import only the
  producer-read client. Their SQL, DTO mapping, nullable behavior, guards, and
  API-facing behavior were preserved by the existing repository tests.
- Focused gate:
  `pnpm vitest run src/server/db/producer-client.test.ts src/server/db/app-client.test.ts src/server/repositories/lead-list-repository.test.ts src/server/repositories/lead-detail-repository.test.ts src/server/repositories/lead-history-repository.test.ts`
  passed: 5 files / 66 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with the same two pre-existing unused-variable warnings
  in `src/server/auth/auth.test.ts`.
- `pnpm test`: passed: 33 files / 606 tests.
- `pnpm build`: passed with process-only synthetic
  `N8N_IMPORT_URL=https://build-placeholder.example.com/webhook/empresaqui/import`;
  `.env.local` was not inspected or changed.
- `git diff --check`: passed.
- Limitation: no real PostgreSQL role/grant integration was executed; that
  remains T009/T010 with disposable PostgreSQL target X2. `test:integration`
  still does not exist in `package.json`.
- The login shell still emits the pre-existing missing Snap/VS Code
  profile-path warning; it did not change command exit status.
- No `/api/imports`, n8n client/call, migration, producer write, real database
  connection, production target, feature activation, or real data was used or
  introduced.

## T009 App Schema Migration Gate — 2026-07-06

- T009 is complete for the authorized local/disposable X2 target. The migration
  artifacts are reviewed SQL files under `db/app/`: forward, rollback, and
  grants/role assumptions.
- Forward migration creates the app-owned `prospecting_app` schema with:
  `import_submissions`, `import_submission_events`, `lead_workspaces`,
  `lead_activities`, `lead_notes`, and `commercial_audit_events`.
- The schema enforces organization scope on every table, checked bounded text,
  CNPJ/hash/status/stage/content-type constraints, app-scoped foreign keys with
  `RESTRICT` and no cascade, organization-scoped import idempotency uniqueness,
  organization-scoped producer batch uniqueness, active workspace uniqueness,
  and read/write indexes for imports, workspaces, activities, notes, and audit.
- Append-only design is enforced for `import_submission_events`,
  `lead_activities`, `lead_notes`, and `commercial_audit_events` through
  mutation-rejecting triggers. The grants file gives the assumed runtime role
  `SELECT, INSERT` only on those append-only tables and grants no producer
  object access.
- Rollback was verified through the integration suite and drops only the
  objects created by the forward migration, without `CASCADE`.
- Target validation:
  `PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test`
  passed the localhost/database guard before DB tests. Authentication used
  process-only `PGUSER=postgres` and redacted `PGPASSWORD`; no `.env.local`,
  `APP_DATABASE_URL`, or `PRODUCER_DATABASE_URL` was used for migration tests.
- RED check:
  `PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test pnpm test:integration`
  failed before SQL existed with `ENOENT` for
  `db/app/001_app_schema_forward.sql`, proving the harness required the
  migration artifact.
- Initial DB run without credentials reached localhost PostgreSQL but failed
  with SCRAM authentication, then the provided X2 password was used only as a
  process variable. A grouped grants assertion then failed at 15/16 tests and
  was corrected by making append-only table grants explicit per table.
- Final DB gate:
  `PGUSER=postgres PGPASSWORD=<redacted> PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test pnpm test:integration`
  passed: 1 file / 16 tests.
- Final rollback residue check:
  `PGUSER=postgres PGPASSWORD=<redacted> psql -h localhost -p 5432 -d prospecta_t009_test -tAc "select to_regnamespace('prospecting_app') is null as schema_removed"`
  returned `t`.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with the same two pre-existing unused-variable warnings
  in `src/server/auth/auth.test.ts`.
- `pnpm test`: passed: 33 files / 606 tests.
- `pnpm build`: passed with process-only synthetic server env values; Next.js
  reported `.env.local` presence during build loading, but the migration and
  integration gate did not use `.env.local`.
- Forbidden SQL reference scan:
  `rg -n "REFERENCES\\s+(public|producer|company_|crm|n8n)|company_validations|company_validation_runs|company_strategic_research_reports|PRODUCER_DATABASE_URL|APP_DATABASE_URL|N8N|webhook" db/app`
  returned no matches.
- `git diff --check`: passed.
- Limitation: the disposable DB proof used the local `postgres` login because
  T010 role-isolation roles are not provisioned yet. T010 remains responsible
  for proving least-privilege producer/app role denial. No production
  migration, producer table, n8n workflow, app import route, repository
  implementation, feature activation, real CSV, or real data was used.

## T010 Database Role Isolation Gate — 2026-07-06

- T010 is complete for the authorized local/disposable X2 target. The
  integration harness now creates and removes the synthetic roles
  `prospecta_app_rw` and `prospecta_t010_producer_read`, the synthetic schema
  `prospecta_t010_producer_like`, and the synthetic table
  `prospecta_t010_producer_like.approved_leads`.
- The disposable setup grants only `CONNECT` on
  `prospecta_t009_test` to the synthetic roles, applies the app-owned
  migration and grants, and grants the producer-read role `USAGE` plus
  `SELECT` only on the producer-like allowlisted table.
- The app-owned grants now include the minimum required `EXECUTE` on
  `prospecting_app.text_is_present(text, integer)` and
  `prospecting_app.jsonb_has_only_keys(jsonb, text[])` so runtime inserts can
  satisfy schema constraints after `PUBLIC` function execution is revoked.
  `reject_append_only_mutation()` remains ungranted for direct execution.
- Role-isolation coverage proves:
  app role `SELECT/INSERT/UPDATE` on mutable app-owned tables and denied
  `DELETE`; app role `SELECT/INSERT` on append-only tables with denied
  `UPDATE/DELETE` by privilege; append-only triggers still deny elevated owner
  `UPDATE/DELETE`; producer-read role can `SELECT` only the synthetic
  producer-like allowlist and cannot `INSERT/UPDATE/DELETE` producer-like
  rows; producer-read cannot access or write app-owned objects; app role cannot
  access or mutate producer-like objects.
- DSN guard coverage accepts only
  `postgresql://localhost:5432/prospecta_t009_test` without query/hash and
  rejects tested non-X2 protocol, host, port, database, query, and fragment
  variants.
- Target validation before integration tests:
  `PGUSER=postgres PGPASSWORD=12345 PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test node -e '<X2 URL guard>'`
  returned `X2 target validated: localhost:5432/prospecta_t009_test`.
- Focused role-isolation gate:
  `PGUSER=postgres PGPASSWORD=12345 PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test pnpm vitest run --config vitest.integration.config.ts tests/integration/app-schema-migration.test.ts -t "database role isolation|disposable database URL guard"`
  passed: 1 file / 11 tests, with 16 unrelated migration tests skipped.
- Full DB gate:
  `PGUSER=postgres PGPASSWORD=12345 PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test pnpm test:integration`
  passed: 1 file / 27 tests.
- Cleanup residue check:
  `PGUSER=postgres PGPASSWORD=12345 psql -h localhost -p 5432 -d prospecta_t009_test -tAc "select to_regnamespace('prospecting_app') is null as app_schema_removed, to_regnamespace('prospecta_t010_producer_like') is null as producer_like_removed, not exists (select 1 from pg_roles where rolname in ('prospecta_app_rw', 'prospecta_t010_producer_read')) as roles_removed"`
  returned `t|t|t`.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with the same two pre-existing unused-variable warnings
  in `src/server/auth/auth.test.ts`.
- `pnpm test`: passed: 33 files / 606 tests.
- `pnpm build`: passed with process-only synthetic server env values and
  `N8N_IMPORT_URL=https://build-placeholder.example.com/webhook/empresaqui/import`;
  Next.js reported `.env.local` presence during build loading, but the command
  supplied synthetic process values and no `.env.local`, real
  `APP_DATABASE_URL`, or real `PRODUCER_DATABASE_URL` was used for T010.
- Forbidden SQL reference scan:
  `rg -n "REFERENCES\\s+(public|producer|company_|crm|n8n)|company_validations|company_validation_runs|company_strategic_research_reports|PRODUCER_DATABASE_URL|APP_DATABASE_URL|N8N|webhook" db/app`
  returned no matches.
- Real-producer grant/object scan:
  `rg -n "CREATE\\s+(SCHEMA|TABLE)\\s+(company_|public\\.|producer\\.)|GRANT\\s+[^;]*(company_validations|company_validation_runs|company_strategic_research_reports|public\\.|producer\\.)|REFERENCES\\s+(company_|public\\.|producer\\.)" db/app tests/integration/app-schema-migration.test.ts`
  returned no matches.
- Import/n8n implementation scan over changed DB integration artifacts:
  `rg -n "/api/imports|arquivo_csv|ingress-client|submit-import|upload-file|fetch\\(|N8N_IMPORT_URL" db/app tests/integration/app-schema-migration.test.ts`
  returned no matches.
- `git diff --check`: passed.
- Limitations: this is a local disposable PostgreSQL proof only. Production
  targets, production grants, backup/restore ownership, and rollout remain
  externally gated. The producer source is synthetic and no real producer
  schema, table, grant, row, workflow, CSV, credential, or production data was
  touched.
- No T011 upload validation, `/api/imports`, n8n client/call/workflow,
  commercial repository, feature activation, producer write, production
  migration, deployment, or rollout was introduced.

## Execution Rules

- Execute in topological order and stop at each phase gate.
- For the internal upload slice, use the scoped Phase 2 internal gate; pending
  T018/T019 hardening evidence does not block T013–T017.
- No sub-agent or parallel-agent execution is authorized.
- Every code task includes its own tests; test work is never deferred.
- Use only synthetic data.
- Treat `private-workflows/EmpresaAqui_Webhook_Import_v1.json` as the official
  current ingress contract source; never change, call, import, or activate it
  as part of documentation work.
- Never call or change a production n8n workflow.
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
| X1 Identity | Approved granular-authorization source, permission assignments, organization binding, revocation policy, and security tests | Production imports and every sensitive/commercial/audit capability; the scoped internal import route may use the verified allowed-organization actor |
| X2 App database | Named disposable/non-production target now; production target, roles, grants, backup owner later | DB integration; production commercial writes |
| X3 n8n ingress | Named non-production deployment, URL, authentication profile decision, owner, safe test window, and rollback process | Satisfied for internal acknowledgement-only implementation; exact identity/security gaps still block production |
| X4 Producer facts | Batch/row/close read source and exact result-to-terminal mapping | Producer observation repository and truthful acceptance/processing/completion; not the internal upload acknowledgement |
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
T002 → T018
T018 + X3 → T019 (X4 applies only to completion cases)
T004 + observed T019 compatibility → T011
T004 + observed target security profile → T012
T011 + T012 + observed request/response contract → T013
T008 + T009 → T014
T013 + T014 → T015
T007 + T015 → T016 → T017

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

**What/where:** Add separate DB URLs, the required official ingress URL,
optional/deferred HMAC settings, upload limits, URL hosts, and feature flags
in `src/server/env.ts`,
`.env.example`, and colocated tests.  
**Depends on:** T003. **Requirements:** PC-01, PC-04, PC-05. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 12 new cases / UNIT.  
**Done when:** Missing/invalid/unofficial URLs, public secret names, malformed
optional HMAC values, and unsafe hosts fail closed without echoing values;
absent HMAC and role settings remain valid, role settings are ignored, and
imports remain disabled.
**Verify:** `pnpm vitest run src/server/env.test.ts && pnpm typecheck`  
**Commit:** `feat(prospecta): validate server integration environment`

#### T005: Define the deferred permission vocabulary

**What/where:** Create `src/server/auth/permissions.ts` and tests for the exact
permission union and dormant deny-by-default helpers.
**Depends on:** T003. **Requirements:** PC-05. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 10 new cases / UNIT.  
**Done when:** The vocabulary grants nothing through the current OIDC flow;
unknown values remain denied and any future activation requires X1.
**Verify:** focused permission test and typecheck.  
**Commit:** `feat(prospecta): define permission policy`

#### T006: Retain the verified actor in server auth

**What/where:** Extend `src/server/auth/authorization.ts`, `config.ts`, and
`index.ts` with issuer, subject, organization, and an empty deferred
permissions slot; update auth tests.
**Depends on:** T004, T005. **Requirements:** PC-05. **Tools:** CORE,
CURRENT-DOCS.  
**Tests/gate:** Auth integration, minimum 14 new/updated cases / UNIT.  
**Done when:** Only verified identity/organization claims create an actor;
provider roles and stale permissions are ignored; refresh preserves identity
only; missing/changed organization fails closed.
**Verify:** `pnpm vitest run src/server/auth/auth.test.ts && pnpm typecheck`  
**Commit:** `feat(prospecta): retain authorized actor context`

#### T007: Enforce authenticated actor and same-origin mutations

**What/where:** Replace the minimal API context in
`src/server/auth/require-api-session.ts` with actor-aware session context, keep
deny-by-default `requirePermission` dormant, and add a same-origin mutation
guard plus tests.
**Depends on:** T006. **Requirements:** PC-05. **Tools:** CORE.  
**Tests/gate:** Route/auth integration, minimum 16 new/updated cases / UNIT.  
**Done when:** The server context retains the actor; current lead GETs require
an authenticated allowed-organization session without provider roles;
`401/403` happens before body, DB, hash, or HTTP callbacks; and missing,
malformed, or cross-origin mutation origins fail safely without actor
exposure. Granular route authorization remains blocked by X1.
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

**Status:** COMPLETE LOCALLY on 2026-07-06 by explicit owner decision to
execute this isolated validator despite T019 remaining pending. This exception
now contributes to the approved internal T013–T017 path.

**What/where:** Add `src/server/imports/upload-file.ts` and tests for filename,
media type, 10 MiB limit, UTF-8, NUL, non-empty header, and SHA-256.

**Depends on:** T004 and observed T019 compatibility evidence. T019 completion
is not required for the internal profile. **Requirements:** PC-12. **Tools:**
CORE.

**Tests/gate:** Unit, minimum 18 cases / UNIT.

**Done when:** Exact input bytes are unchanged, the app limits are compatible
with the tested official endpoint, and no business row/CNPJ logic exists. The
hash remains an app audit fact unless the producer contract is changed and
tested to verify it.

**Verify:** focused upload-file tests and source scan for business parsing.

**Recorded gate:** 40 colocated upload-file cases passed; exact bytes and
SHA-256 are retained without row/CNPJ/business parsing. The app environment
also accepts the approved internal HTTP n8n URL while keeping it server-only.

**Commit:** `feat(prospecta): validate exact csv uploads`

#### T012: Decide and, when applicable, implement server-to-server authentication

**Status:** `NOT APPLICABLE` for the approved internal non-production profile
on 2026-07-06; `PENDING` for production.

**Decision evidence:** The official export and the authorized target implement
no credential, HMAC, canonical request, timestamp, nonce, replay store,
constant-time comparison, authentication error contract, or official test
vectors. The runtime endpoint accepted a synthetic request with no
credentials. Client-calculated headers or environment placeholders would not
create remote authentication.

**Internal disposition:** Do not implement cryptographic authentication for
this profile. A future T013 client must send zero authentication headers.
T013 and later import tasks may proceed using safe generic outcomes and
acknowledgement-only semantics. T012 does not invent workflow identity/version,
safe producer errors, durable acceptance, persistence ordering, timeout
reconciliation, size compatibility, or X4 facts.

**Production disposition:** Keep T012 pending until an approved, remotely
verifiable contract defines the algorithm, canonical format, key ID,
timestamp, clock tolerance, nonce, replay storage/expiry, constant-time
comparison, error codes, and official test vectors. Then add only that tested
support under `src/server/imports/`, with at least 20 colocated tests and no
route, UI, persistence, or complete ingress client.

**Tests/gate:** Documentation/evidence review for the internal decision; zero
new T012 unit tests because no authentication implementation exists. The
future production implementation retains the minimum 20-case UNIT gate.

**Done when:** The internal profile is recorded without fabricated security,
and production remains explicitly blocked on a verifiable authentication
contract.

**Verify:** scoped contract/evidence scan, existing focused tests, full gates,
and `git diff --check`.

**Recorded gate:** Focused environment/upload tests passed: 2 files / 90
tests. `pnpm lint` passed with zero errors and the same two pre-existing
unused-variable warnings in `src/server/auth/auth.test.ts`; `pnpm typecheck`
passed; `pnpm test` passed: 34 files / 648 tests; `pnpm build` passed with
synthetic process-only server settings; `git diff --check` passed. No T012
authentication source or unit test was added because the target has no
verifiable authentication contract.

**Commit:** `feat(prospecta): implement ingress hmac contract`

#### T013: Implement the typed n8n ingress client

**Status:** COMPLETE LOCALLY for the approved internal profile on 2026-07-06;
production variant pending.

**What/where:** Add `src/server/imports/ingress-client.ts` with injected fetch, multipart
`arquivo_csv`, zero authentication headers for the scoped internal profile,
timeout, exact official response validation, and tests.

**Depends on:** T011, T012, and the observed T018/T019 request/response
behavior. T019 completion is not required for the internal profile.
**Requirements:** PC-01, PC-02. **Tools:** CORE, CURRENT-DOCS.

**Tests/gate:** Unit/integration mock, minimum 18 cases / UNIT.

**Done when:** Only the tested `202` fields `accepted`, `message`,
`import_batch_id`, `row_count`, and `source` are recognized; acknowledgement
is distinct from durable acceptance; the client emits zero authentication
headers; once the producer call begins, malformed, non-`202`, unavailable, and
timeout outcomes map to unknown without producer bodies or automatic retry.

**Verify:** focused client tests and typecheck.

**Recorded gate:** The server-only client uses only the validated
`N8N_IMPORT_URL`, injects `fetch`, sends one `POST` with only multipart
`arquivo_csv`, preserves validated bytes/filename/media type, emits no manual
`Content-Type` or authentication headers, ignores deferred HMAC placeholders,
and performs no retry. Its discriminated result retains either the exact
validated five-field workflow acknowledgement or a detail-free `unknown`;
neither result claims durable acceptance.

The focused gate passed: 1 file / 41 tests. `pnpm typecheck` passed.
`pnpm lint` passed with zero errors and the same two pre-existing
unused-variable warnings in `src/server/auth/auth.test.ts`. `pnpm test`
passed: 35 files / 689 tests. `pnpm build` passed with synthetic process-only
server settings and imports disabled; `.env.local` was not inspected or
changed. `git diff --check` passed. No contract test, real endpoint call,
credential, production action, persistence, route, UI, workflow change, or
commit was performed. HTTPS, remotely verified authentication/replay,
producer idempotency, durable acceptance, timeout reconciliation, controlled
producer errors, and exact deployed workflow identity remain pending for
production.

**Commit:** `feat(prospecta): add producer ingress client`

#### T014: Persist idempotent app submissions and producer acknowledgement

**Status:** COMPLETE LOCALLY on 2026-07-07 for the approved disposable
PostgreSQL target.

**What/where:** Add the import repository under
`src/server/repositories/imports/` with transactional events and tests.

**Depends on:** T008, T009. **Requirements:** PC-02, PC-06. **Tools:** CORE,
DB-TEST.

**Tests/gate:** Unit + PostgreSQL integration, minimum 16 cases / UNIT + DB.

**Done when:** Same org/key/hash returns the original record; conflicts return
409; app intent and returned `import_batch_id` acknowledgement are retained
without relabeling them durable producer acceptance.

**Verify:** focused repository tests and `pnpm test:integration`.

**Recorded gate:** The app-owned repository now exposes
`recordImportSubmissionIntent` and `recordProducerAcknowledgement` under
`src/server/repositories/imports/`. It uses only `APP_DATABASE_URL` through the
app client, inserts submission intent plus append-only event transactionally,
and updates acknowledgement plus append-only event transactionally. Same
organization + idempotency key + file hash returns the original app record;
same organization + key with a different hash returns a safe
`IMPORT_IDEMPOTENCY_CONFLICT` result mappable to `409`; the same key in another
organization is independent. The acknowledgement persistence retains
`import_batch_id` and observed `row_count` under workflow acknowledgement
semantics only; it does not expose or invent `acceptedAt`, `schemaVersion`,
`producerBatchId`, `rowCountAccepted`, durable `ACCEPTED`, processing,
completion, retry, reprocessing, route, UI, or n8n calls.

Focused repository gate:
`pnpm vitest run src/server/repositories/imports/import-submissions-repository.test.ts`
passed: 1 file / 27 tests. Focused app-client + repository gate:
`pnpm vitest run src/server/repositories/imports/import-submissions-repository.test.ts src/server/db/app-client.test.ts`
passed: 2 files / 36 tests.

Disposable PostgreSQL gate:
`PGUSER=postgres PGPASSWORD=<redacted> PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test pnpm test:integration`
passed: 1 file / 31 tests. Cleanup residue check:
`PGPASSWORD=<redacted> psql -h localhost -p 5432 -U postgres -d prospecta_t009_test -tAc "select to_regnamespace('prospecting_app') is null as app_schema_removed, to_regnamespace('prospecta_t010_producer_like') is null as producer_like_removed, not exists (select 1 from pg_roles where rolname in ('prospecta_app_rw', 'prospecta_t010_producer_read')) as roles_removed"`
returned `t|t|t`.

`pnpm typecheck`: passed. `pnpm lint`: passed with the same two pre-existing
unused-variable warnings in `src/server/auth/auth.test.ts`. `pnpm test`:
passed: 36 files / 719 tests. `pnpm build`: passed with synthetic process-only
server settings and imports disabled; `.env.local` was not inspected or
changed. `git diff --check`: passed. Source scans over the implementation
found no `PRODUCER_DATABASE_URL`, producer client, fetch/n8n path, retry,
reprocess, raw CSV/body persistence, or logging path. No production target,
real CSV, external call, n8n endpoint call, migration outside the disposable
target, deploy, credential change, or commit was performed.

**Commit:** `feat(prospecta): persist import submission facts`

#### T015: Orchestrate submission without automatic retry

**Status:** COMPLETE LOCALLY on 2026-07-07 for the acknowledgement-only
internal profile.

**What/where:** Add `src/server/imports/submit-import.ts` and tests for actor,
hash, durable intent, one ingress call, acknowledgement, conflict, and unknown
state.

**Depends on:** T013, T014. **Requirements:** PC-02, PC-12. **Tools:** CORE.

**Tests/gate:** Service unit, minimum 14 cases / UNIT.

**Done when:** Persistence precedes producer call; acknowledgement is not
promoted to durable `ACCEPTED`; no acknowledged/unknown path automatically
calls the producer again.

**Verify:** focused service tests asserting exact call order/count.

**Recorded gate:** The import service now lives in
`src/server/imports/submit-import.ts` and accepts only a verified actor,
organization, idempotency key, upload file, and injected ingress client
dependency. It validates and hashes bytes with `validateAndHashUploadFile`
before persistence, records intent with `recordImportSubmissionIntent` before
the ingress call, returns the repository's safe `IMPORT_IDEMPOTENCY_CONFLICT`
result for same-org/key/different-hash without calling ingress, and returns
same-key/hash duplicates without calling ingress. New submissions call
`submitToN8nIngress` exactly once. Validated acknowledgements are persisted
with `recordProducerAcknowledgement`; unknown ingress outcomes are persisted
with the new app-owned `recordProducerOutcomeUnknown` status/event. The
service preserves `import_batch_id` and observed `row_count` only as workflow
acknowledgement facts and does not expose or invent `ACCEPTED`,
`DURABLE_ACCEPTED`, `COMPLETED`, `PROCESSING`, `producerBatchId`,
`rowCountAccepted`, retry, reprocessing, HMAC, route, UI, direct `fetch`, raw
producer bodies, CSV bytes, SQL parameters, secrets, stack traces, producer
database access, or producer client use.

Focused service gate:
`pnpm vitest run src/server/imports/submit-import.test.ts` passed: 1 file / 19
tests. Focused repository gate, required because unknown persistence was added:
`pnpm vitest run src/server/repositories/imports/import-submissions-repository.test.ts`
passed: 1 file / 33 tests.

`pnpm typecheck`: passed. `pnpm lint`: passed with zero errors and the same
two pre-existing unused-variable warnings in `src/server/auth/auth.test.ts`.
`pnpm test`: passed: 37 files / 744 tests. `pnpm build`: passed with
synthetic process-only server settings and imports disabled; Next.js reported
`.env.local` presence during build loading, but `.env.local` was not inspected
or changed. `git diff --check`: passed before this evidence update.
`pnpm test:contract` was intentionally not run for T015.

No production target, real CSV, real data, real credential, external n8n call,
contract test, production migration, deployment, feature activation, workflow
change, producer write, or commit was performed.

**Commit:** `feat(prospecta): orchestrate controlled import`

#### T016: Add `POST /api/imports`

**Status:** COMPLETE LOCALLY on 2026-07-07 for the acknowledgement-only
internal profile.

**What/where:** Implement the raw-body upload route and route tests.

**Depends on:** T007, T015. **Requirements:** PC-12. **Tools:** CORE.

**Tests/gate:** Route integration, minimum 18 cases / UNIT.

**Done when:** Verified allowed-organization actor, internal import feature
flag, and same-origin checks run first; body is bounded; response is
safe/private and distinguishes app submission, workflow acknowledgement,
durable acceptance, and unknown outcome. Production later replaces the scoped
internal authorization exception with `imports:create`.

**Verify:** focused route tests and typecheck.

**Recorded gate:** The route now lives at `src/app/api/imports/route.ts` and
exports only `POST`. It requires `requireApiSession`, `requireSameOrigin`, and
`FEATURE_IMPORTS_ENABLED=true` before reading multipart body bytes or calling
the import service. It uses the verified actor organization and subject, reads
the app idempotency key from the server-side `Idempotency-Key` header, accepts
exactly one multipart file in `arquivo_csv`, and calls `submitImport` once for
a valid request. Successful submitted and duplicate app records return safe
`202` envelopes with app submission status, workflow acknowledgement or
unknown outcome, and `durableAcceptance: null`; idempotency conflicts return a
safe `409` envelope. Upload validation, malformed multipart, feature-disabled,
auth, origin, and unexpected failures are mapped to safe private no-store
responses without raw producer bodies, CSV bytes, SQL parameters, secrets,
stacks, n8n URLs, actor identifiers, organization identifiers, file hashes, or
idempotency keys.

Focused route gate:
`pnpm vitest run src/app/api/imports/route.test.ts` passed: 1 file / 25 tests.
The affected surface/service guard gate:
`pnpm vitest run src/app/api/imports/route.test.ts 'src/app/(private)/layout.test.tsx' src/server/imports/submit-import.test.ts`
passed: 3 files / 51 tests.

`pnpm typecheck`: passed. `pnpm lint`: passed with zero errors and the same
two pre-existing unused-variable warnings in `src/server/auth/auth.test.ts`.
`pnpm test`: passed: 38 files / 769 tests. `pnpm build`: passed with
synthetic process-only server settings and imports disabled; Next.js reported
`.env.local` presence during build loading, but `.env.local` was not inspected
or changed. `git diff --check`: passed before this evidence update.
`pnpm test:contract` was intentionally not run for T016.

No UI, `GET /api/imports`, batch list/detail, HMAC, signature, timestamp,
nonce, replay control, retry, reprocessing, direct route `fetch`,
browser-to-n8n call, producer database/client access, real n8n endpoint call,
external call, real CSV, real data, real credential, production migration,
deployment, workflow change, feature activation, or commit was performed.

**Commit:** `feat(prospecta): expose controlled import endpoint`

#### T017: Build the controlled upload page

**Status:** COMPLETE LOCALLY on 2026-07-07 for the acknowledgement-only
internal profile.

**What/where:** Add private import page/component with one-file selection,
client hints, stable UUID idempotency key, and
loading/error/unknown/acknowledged states.

**Depends on:** T016. **Requirements:** PC-12. **Tools:** UI.

**Tests/gate:** RTL, minimum 14 cases / UNIT.

**Done when:** Browser calls only `/api/imports`, never n8n; no automatic retry
UI or row qualification logic exists; copy says acknowledged or unknown and
never claims durable acceptance, processing, or completion.

**Verify:** focused component/page tests plus source scan for n8n URLs.

**Recorded gate:** The private upload surface now lives at
`src/app/(private)/imports/page.tsx` and is reached through the existing
private layout. The private shell navigation was split into
`src/app/(private)/private-navigation.tsx` so `/imports` and `/leads` can be
marked current without weakening the server-side layout authorization.

The page accepts exactly one `.csv` file, keeps a stable browser-generated UUID
idempotency key for the current attempt, posts only `multipart/form-data` to
`/api/imports` with field `arquivo_csv` and header `Idempotency-Key`, and
requires an explicit `Nova tentativa` action before generating a new key. The
UI covers idle, selected, loading, acknowledged, unknown, conflict,
validation, access, and generic states with concise business copy. It does not
show n8n URLs, secrets, hashes, idempotency keys, raw CSV content, producer
payloads, stack traces, SQL, durable acceptance, processing, completion, batch
list/detail, or imported-lead claims.

Focused RTL gate:
`pnpm vitest run 'src/app/(private)/imports/page.test.tsx'`
passed: 1 file / 17 tests. Affected surface tests were updated for the newly
authorized private route and the pre-existing server-only service guard.

Final T017 gates:
`pnpm typecheck` passed.
`pnpm lint` passed with the same two pre-existing unused-variable warnings in
`src/server/auth/auth.test.ts`.
`pnpm test` passed: 39 files / 787 tests.
`pnpm build` passed with process-only synthetic server settings and imports
disabled. Next.js reported `.env.local` as a detected environment file during
build loading; it was not opened or changed by this task.
`git diff --check` passed.

Focused executable-UI source scan:
`rg -n "N8N_IMPORT_URL|webhook|192\\.168\\.0\\.20|n8n|HMAC|signature|canonical|timestamp|nonce|replay|retry|reprocess|method:\\s*['\\\"]GET['\\\"]|cnpj|finalScore|score|qualifica|file\\.text|arrayBuffer|FileReader|console\\." 'src/app/(private)/imports/page.tsx' 'src/app/(private)/private-navigation.tsx'`
returned no matches.

`pnpm test:contract` was intentionally not run. No `GET /api/imports`, batch
list/detail, HMAC, signature, timestamp, nonce, replay control, retry,
reprocessing, browser-to-n8n call, real n8n endpoint call, external call,
workflow change, producer write, real CSV, real data, real credential,
production migration, deployment, feature activation, commit, or production
action was performed.

**Commit:** `feat(prospecta): add controlled import experience`

#### T018: Map and validate the official n8n ingress

**Status:** IN PROGRESS — static map and partial non-production runtime
validation recorded; workflow identity/version and the remaining T019 evidence
gaps are pending. A 2026-07-07 parse of the read-only official export confirms
local `id` `6HM8Era5svuUN24x`, local `versionId`
`4be457b8-ccd1-47f9-9d0e-a1fbb38edc7e`, `active: false`, 69 nodes, and 75
directed connection edges; those local export facts still do not prove the
same workflow/version is deployed in the named target.

**What/where:** Treat
`private-workflows/EmpresaAqui_Webhook_Import_v1.json` as read-only source of
truth; maintain `contracts/n8n-import-webhook.md` and
`evidence/current-workflow-map.md` with its nodes, request, binary extraction,
response, producer writes, guarantees, and gaps. Do not create a replacement
workflow under `integrations/` and do not change `private-workflows/`.

**Depends on:** T002. **Requirements:** PC-01–PC-03, PC-09, PC-12. **Tools:**
DOCS, N8N-TEST.

**Tests/gate:** Static JSON/contract review now; deployment identity/version
validation and non-production smoke after X3 / DOC + CTR.

**Done when:** Static mapping matches the official file, every difference from
the previous proposal is explicit, gaps have owners/dispositions, and the same
workflow/version is proven in a named non-production target. Static inspection
alone does not complete T018.

**Verify:** JSON parse plus scoped contract/evidence review, then recorded
non-production import/version/smoke evidence without real data or credentials.

**Commit:** `docs(prospecta): map official n8n ingress`

#### T019: Prepare and execute official ingress contract tests

**Status:** PENDING — partially executed against the named internal
non-production endpoint; the latest run passed 29 of 43 cases and the
remaining evidence gaps still block completion.

**What/where:** Add `test:contract` and synthetic HTTP tests for the exact
official path, multipart field/binary, CSV extraction options, five-field
`202`, response timing, producer correlation, repeated-request behavior,
security controls after resolution, safe failures, and any approved completion
facts.

**Depends on:** T018, X3, X4 for completion cases. **Requirements:** PC-01–PC-03.

**Tools:** N8N-TEST, CORE.

**Tests/gate:** Contract integration, minimum 24 cases / CTR + FULL.

**Done when:** The applicable suite passes against the named non-production
deployment of the official workflow; acknowledgement versus durable
acceptance, timeout, redaction, repeated request, `import_batch_id`/row/run
correlation, and approved closure cases are evidenced. Absence of
authentication/replay is the expected result only for the explicitly liberal
internal profile; production security remains a separate failing/blocking
gate. Unimplemented completion or other applicable behavior is not waived.

T019 completion is a hardening/batch-evidence gate, not a dependency for the
approved acknowledgement-only internal T013–T017 slice.

**Verify:** `pnpm test:contract && FULL`, with target/version and redacted
results recorded.

**Commit:** `test(prospecta): verify official n8n ingress contract`

**Phase 2 internal upload gate:** focused T013–T017 tests plus `FULL && DB`,
followed by controlled synthetic UAT before enabling the internal feature
flag. The known failing CTR cases must remain recorded but do not block this
acknowledgement-only slice.

**Phase 2 production/batch gate:** `FULL && DB && CTR`; CTR remains incomplete
because of the recorded T019 gaps, with completion cases additionally blocked
by X4.

### Phase 3 — Evidence-based batches

#### T020: Implement the batch status mapper

**Status:** COMPLETE LOCALLY on 2026-07-07 for the pure mapper slice; producer
observation repositories and X4 completion proof remain pending.

**What/where:** Add batch domain types and a pure evidence mapper with tests.  
**Depends on:** T002. **Requirements:** PC-03, PC-13. **Tools:** CORE.  
**Tests/gate:** Unit, minimum 24 cases / UNIT.  
**Done when:** Every state/basis/count follows the contract; duplicates,
conflicts, excess terminals, missing close, and unavailable data fail closed.  
**Verify:** focused mapper tests and typecheck.  

**Recorded gate:** Batch status domain types were added to `src/types/imports.ts`
and the pure mapper was added at `src/server/mappers/batch-status-mapper.ts`.
The mapper accepts named app submission, acknowledgement/correlation, durable
acceptance, approved producer observation, explicit close, terminal outcome,
retained legacy observation, and freshness facts. It returns the contract
`BatchSummary` with approved status/status-basis/observation-basis codes only.

The mapper keeps acknowledgement and retained legacy observations from proving
durable acceptance, processing, or completion. Producer-derived counts stay
`null` when facts are absent, unavailable, inconsistent, or lack durable
acceptance; confirmed zero is emitted only from an explicit available
observation source. Duplicate accepted rows and duplicate same-class terminal
events are deduplicated. Excess accepted/terminal identities and conflicting
terminal outcomes fail closed to the last independently proven acceptance
status with `INCONSISTENT` observation status. `COMPLETED` requires durable
acceptance, explicit close, and exactly one terminal outcome for every accepted
row; explicit close with missing rows or terminals maps to `INCOMPLETE`. Stale
accepted/processing observations map to `NO_UPDATE` only through the provided
freshness policy and never through a hidden timer.

Focused mapper gate:
`pnpm vitest run src/server/mappers/batch-status-mapper.test.ts` passed: 1 file
/ 32 tests.

`pnpm lint`: passed with zero errors and the same two pre-existing
unused-variable warnings in `src/server/auth/auth.test.ts`. `pnpm typecheck`:
passed. `pnpm test`: passed: 40 files / 819 tests. `pnpm build`: passed with
synthetic process-only server settings and Prospecta features disabled; Next.js
reported `.env.local` presence during build loading, but `.env.local` was not
inspected or changed. `git diff --check`: passed. Scoped source scan
`rg -n "n8n|fetch\\s*\\(|Date\\.now|setTimeout|setInterval|PRODUCER_DATABASE_URL|APP_DATABASE_URL|\\b(SELECT|INSERT|UPDATE|DELETE|UPSERT|MERGE)\\b|recordProducer|producer.*mutat|mutat.*producer" src/server/mappers/batch-status-mapper.ts src/types/imports.ts`
returned no matches. No n8n call, fetch, SQL, database read/write, producer
mutation, route, UI, workflow artifact, real data, external call, or production
action was performed. T021, T022, T023, and X4 remain pending.

**Commit:** `feat(prospecta): map evidence based batch status`

#### T021: Read app-owned submission list and detail

**Status:** COMPLETE LOCALLY on 2026-07-07 for the approved disposable
PostgreSQL target.

**What/where:** Add paginated app-submission repository functions and
PostgreSQL tests.  
**Depends on:** T010. **Requirements:** PC-13. **Tools:** CORE, DB-TEST.  
**Tests/gate:** Unit + integration, minimum 14 cases / UNIT + DB.  
**Done when:** Organization isolation, stable ordering, nullable acceptance,
and bounded pagination are proven.  
**Verify:** focused repository tests and DB gate.  

**Recorded gate:** The import submissions repository now exposes
`listImportSubmissions` and `getImportSubmissionDetail` under
`src/server/repositories/imports/import-submissions-repository.ts`. The read
functions use only the app-owned client with `APP_DATABASE_URL`, scope every
query by caller-supplied verified organization input, use parameterized SQL
against `prospecting_app.import_submissions`, and keep pagination server-side
with bounded page/pageSize and stable `submitted_at DESC, submission_id DESC`
ordering.

The public read model returns app submission facts, workflow acknowledgement
facts, nullable durable acceptance facts, and safe `not_found`; it does not
return idempotency keys, file hashes, raw CSV, producer payloads, processing,
completion, or producer observations. Workflow acknowledgement remains
separate from durable acceptance and does not become `ACCEPTED`.

Focused repository gate:
`pnpm vitest run src/server/repositories/imports/import-submissions-repository.test.ts`
passed: 1 file / 51 tests. Focused disposable PostgreSQL repository gate:
`PGUSER=postgres PGPASSWORD=<redacted> PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test pnpm vitest run --config vitest.integration.config.ts tests/integration/app-schema-migration.test.ts -t "import submission repository integration"`
passed: 1 file / 7 tests, 27 skipped. Full disposable PostgreSQL gate:
`PGUSER=postgres PGPASSWORD=<redacted> PROSPECTA_APP_TEST_DATABASE_URL=postgresql://localhost:5432/prospecta_t009_test pnpm test:integration`
passed: 1 file / 34 tests. Cleanup residue check returned `t|t|t`.

`pnpm typecheck`: passed. `pnpm lint`: passed with the same two pre-existing
unused-variable warnings in `src/server/auth/auth.test.ts`. `pnpm test`:
passed: 40 files / 837 tests. `pnpm build`: passed with process-only
synthetic server settings and Prospecta features disabled; Next.js reported
`.env.local` presence during build loading, but `.env.local` was not inspected
or changed. `git diff --check`: passed. Scoped source scans over the T021
repository implementation returned no matches for n8n/fetch, producer database
access, or producer-table mutation patterns.

No route, UI, T022 producer observation repository, T023 batch composition,
n8n call, producer database read, producer mutation, workflow artifact,
production migration, real CSV, real data, deployment, feature activation, or
commit was performed. X4 and the producer completion evidence remain pending.

**Commit:** `feat(prospecta): read app submission facts`

#### T022: Read approved producer batch observations

**Status:** COMPLETE LOCALLY on 2026-07-07 for the approved local/non-production
X4 producer observation source.

**What/where:** Add producer observation repository using only X4-approved
views/fields and parameterized batch IDs.  
**Depends on:** T008, T020, X4. **Requirements:** PC-03, PC-13. **Tools:** CORE,
DB-TEST.  
**Tests/gate:** Unit + approved non-production integration, minimum 16 cases.  
**Done when:** Missing source is unavailable, not zero; no legacy event absence
creates completion.  
**Verify:** focused tests, SQL allowlist review, DB integration.  

**Recorded gate:** X4 local/non-production evidence was added at
`.specs/features/prospecting-console/evidence/x4-producer-batch-observations.md`.
The approved producer-owned read source is
`public.prospecta_import_batch_observations_v1`, with exact approved fields,
row identity through `source_row`, explicit close through
`fact_type = 'BATCH_CLOSED'` and `closed_at`, and exact terminal mapping for
`LEAD_DECISION_SAVED`, `PRE_VALIDATION_BLOCKED`, `CRM_REJECTED`, and
`PROCESSING_FAILED`. Unknown producer results remain non-terminal.

Producer-owned source DDL was added under `db/producer/` as an adapter view
over the structured `docs/db/schema.sql` objects and is not an app-owned
migration. The T022 repository was added at
`src/server/repositories/imports/producer-batch-observations-repository.ts`.
It reads only the approved view via `src/server/db/producer-client.ts`, uses
parameterized `import_batch_id`, validates invalid input before database work,
returns `availability: "UNAVAILABLE"` on producer-source failure, preserves
empty accepted-row facts as empty observation facts rather than confirmed zero,
deduplicates accepted rows and terminal outcomes, and keeps retained legacy
observations informational only.

Focused unit gate:
`pnpm vitest run src/server/repositories/imports/producer-batch-observations-repository.test.ts`
passed: 1 file / 18 tests. Disposable PostgreSQL focused gate:
`PROSPECTA_PRODUCER_TEST_DATABASE_URL=postgresql://postgres@localhost:55432/prospecta_t022_producer_test pnpm vitest run --config vitest.integration.config.ts tests/integration/producer-batch-observations.test.ts`
passed: 1 file / 5 tests against a temporary local cluster created with
`initdb`/`pg_ctl`. Full disposable PostgreSQL gate:
`PGUSER=postgres PGPASSWORD=<synthetic> PROSPECTA_APP_TEST_DATABASE_URL=postgresql://postgres@localhost:55432/prospecta_t009_test PROSPECTA_PRODUCER_TEST_DATABASE_URL=postgresql://postgres@localhost:55432/prospecta_t022_producer_test pnpm test:integration`
passed: 2 files / 39 tests.

`pnpm lint`: passed with the same two pre-existing unused-variable warnings in
`src/server/auth/auth.test.ts`. `pnpm typecheck`: passed. `pnpm test`: passed:
41 files / 855 tests. `pnpm build`: passed with process-only synthetic server
settings and Prospecta features disabled; Next.js reported `.env.local`
presence during build loading, but `.env.local` was not inspected or changed.

No route, UI, T023 batch composition, n8n call, fetch, app database use by the
T022 repository, producer mutation by the repository, production migration,
real CSV, real data, deployment, workflow artifact, or feature activation was
performed. Production X4 rollout, grants, and target creation remain separate
approval items.

**Commit:** `feat(prospecta): read producer batch observations`

#### T023: Compose the batch read service

**Status:** COMPLETE LOCALLY on 2026-07-07 for the server-only composition
service slice.

**What/where:** Add list/detail composition under `src/server/imports/` with
tests for app facts plus nullable producer observations.  
**Depends on:** T020, T021, T022. **Requirements:** PC-03, PC-13. **Tools:**
CORE.  
**Tests/gate:** Service unit, minimum 14 cases / UNIT.  
**Done when:** Proven acceptance survives producer outage and status provenance
is preserved.  
**Verify:** focused service tests and typecheck.  

**Recorded gate:** The batch read composition service was added at
`src/server/imports/batch-read-service.ts` with list/detail functions for
future API use. It reads app-owned submission facts only through
`listImportSubmissions` and `getImportSubmissionDetail`, reads producer
observations only through `readProducerBatchObservations`, and uses
`mapBatchStatus` as the sole status/count derivation path.

The service validates organization, pagination, and detail identifiers before
repository work. It maps app submissions, workflow acknowledgements, nullable
durable acceptance, and nullable producer observations into the T020 mapper
input without promoting acknowledgement to durable acceptance. Producer reads
run only when a correlated `workflowAcknowledgement.import_batch_id` exists.
Producer unavailability preserves durable `ACCEPTED` facts while keeping
producer-derived counts `null`; inconsistent producer evidence fails closed
through the mapper. No freshness policy is invented.

Focused service gate:
`pnpm vitest run src/server/imports/batch-read-service.test.ts` passed: 1 file
/ 26 tests.

`pnpm lint`: passed with zero errors and the same two pre-existing
unused-variable warnings in `src/server/auth/auth.test.ts`. `pnpm typecheck`:
passed. `pnpm test`: passed: 42 files / 881 tests. `pnpm build`: passed with
synthetic process-only server settings; Next.js reported `.env.local`
presence during build loading, but `.env.local` was not inspected or changed.
`git diff --check`: passed. Scoped source scan over the T023 service returned
no matches for n8n/fetch, route/UI APIs, direct app/producer DB clients,
database URLs, app/producer SQL objects, or SQL mutation/read keywords. Scoped
usage scan confirmed the service imports the T021 app-owned repository, T022
producer observation repository, and T020 mapper.

No route, UI, page, n8n call, fetch, app-schema write, producer write, direct
producer read outside T022, workflow artifact, production migration, real CSV,
real data, deployment, feature activation, or commit was performed. T024,
T025, routes, and UI remain pending.

**Commit:** `feat(prospecta): compose batch read model`

#### T024: Add paginated `GET /api/imports`

**Status:** COMPLETE LOCALLY on 2026-07-08 for the scoped internal import-read
MVP policy.

**What/where:** Implement list validation/route/tests.  
**Depends on:** T007, T023. **Requirements:** PC-13. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 12 cases / UNIT.  
**Done when:** `imports:read`, org scope, pagination, safe errors, and no-store
are enforced.  
**Verify:** focused route tests.  

**Recorded gate:** `GET /api/imports` now shares
`src/app/api/imports/route.ts` with the existing `POST` handler and calls only
`listImportBatches` from the T023 service. The route requires
`requireApiSession` and `FEATURE_IMPORTS_ENABLED` before query validation or
batch service work, uses only the verified actor organization, validates the
list query to `page` and `pageSize`, rejects unknown/repeated/deferred
parameters, and returns the approved `{ data, meta }` envelope with nullable
`total`. Responses use `Cache-Control: private, no-store` on success and safe
errors. The current internal MVP keeps the scoped allowed-organization actor
plus feature-flag policy; production `imports:read` remains deferred to the
granular authorization gate.

Focused route gate:
`pnpm vitest run src/app/api/imports/route.test.ts` passed: 1 file / 44 tests,
including 19 new GET cases.

`pnpm lint`: passed with the same two pre-existing unused-variable warnings in
`src/server/auth/auth.test.ts`. `pnpm typecheck`: passed. `pnpm test` passed:
42 files / 900 tests. `pnpm build`: passed; Next.js detected `.env.local`
during build loading, but `.env.local` was not inspected or changed.
`git diff --check`: passed.

No `GET /api/imports/:id`, UI, T025, T026, n8n call, fetch, external request,
producer mutation, direct database access in the route, real CSV, real data,
credential change, production migration, deployment, workflow change, feature
activation, retry, or reprocessing was performed. The login shell still emits
the pre-existing missing Snap/VS Code profile-path warning; it did not change
command exit status.

**Commit:** `feat(prospecta): expose batch list api`

#### T025: Add `GET /api/imports/:id`

**Status:** COMPLETE LOCALLY on 2026-07-08 for the scoped internal import-read
MVP policy.

**What/where:** Implement detail validation/route/tests.  
**Depends on:** T007, T023. **Requirements:** PC-13. **Tools:** CORE.  
**Tests/gate:** Route integration, minimum 12 cases / UNIT.  
**Done when:** Cross-org IDs fail closed and all counts/status bases remain
nullable/evidence-based.  
**Verify:** focused route tests.  

**Recorded gate:** `GET /api/imports/:id` now lives at
`src/app/api/imports/[id]/route.ts` and calls only `getImportBatchDetail` from
the T023 service. The route requires `requireApiSession` and
`FEATURE_IMPORTS_ENABLED` before validating the path parameter or doing service
work, validates `id` as the app submission UUID, uses only the verified actor
organization, and maps missing or cross-organization records to a safe closed
`404`. Successful responses use the approved `{ data }` envelope and preserve
the service-provided nullable counts, status basis, observation status, and
observation basis without recomputing them. Success and errors use
`Cache-Control: private, no-store`.

RED check:
`pnpm vitest run 'src/app/api/imports/[id]/route.test.ts'` failed before the
route existed with the expected missing `./route` import.

Focused route gate:
`pnpm vitest run 'src/app/api/imports/[id]/route.test.ts'` passed: 1 file / 18
tests. Focused import route coexistence gate:
`pnpm vitest run src/app/api/imports/route.test.ts 'src/app/api/imports/[id]/route.test.ts'`
passed: 2 files / 62 tests. The private surface guard was updated only to
authorize the new T025 API route; affected route/surface gate:
`pnpm vitest run src/app/api/imports/route.test.ts 'src/app/api/imports/[id]/route.test.ts' 'src/app/(private)/layout.test.tsx'`
passed: 3 files / 70 tests.

`pnpm lint`: passed with the same two pre-existing unused-variable warnings in
`src/server/auth/auth.test.ts`. `pnpm typecheck`: passed. The first
`pnpm test` run failed only because the existing private-surface allowlist did
not yet include `api/imports/[id]/route.ts`; after updating that guard,
`pnpm test` passed: 43 files / 918 tests. `pnpm build` passed and the Next.js
route output included `/api/imports/[id]`; Next.js detected `.env.local`
during build loading, but `.env.local` was not inspected or changed.
`git diff --check`: passed.

No list behavior change beyond coexistence, UI, T026, T027, n8n call, fetch,
external request, direct database access in the route, producer mutation, real
CSV, real data, credential change, production migration, deployment, workflow
change, feature activation, retry, or reprocessing was performed.

**Commit:** `feat(prospecta): expose batch detail api`

#### T026: Build the batch list page

**Status:** COMPLETE LOCALLY on 2026-07-08 for the private batch list UI.

**What/where:** Add private batch list UI with filters supported by evidence,
pagination, and loading/empty/error/unavailable states.  
**Depends on:** T024. **Requirements:** PC-13. **Tools:** UI.  
**Tests/gate:** RTL, minimum 12 cases / UNIT.  
**Done when:** Unknown metrics render unavailable, never zero/progress.  
**Verify:** focused page/component tests.  

**Recorded gate:** The private batch list page now lives at
`src/app/(private)/imports/batches/page.tsx` and is linked from the existing
private import upload page without replacing that T017 flow. It uses only
`GET /api/imports` with supported `page` and `pageSize` query parameters,
sanitizes unsupported URL query text out of the API request, and never calls
`GET /api/imports/:id`, n8n, external endpoints, mutation methods, retry, or
reprocessing actions.

The UI renders loading, empty, safe generic error, API-unavailable, row-level
observation-unavailable, known-total pagination, nullable-total pagination,
status/basis labels, Brazilian dates, and nullable count metrics. Unknown
`rowCountAccepted`, `terminalCount`, `blockedCount`, `failedCount`, and
`leadCount` render as unavailable through `Não disponível`; explicit numeric
zero remains visible only when returned by the API. The page does not expose
app submission UUIDs, actor or organization internals, hashes, idempotency
keys, SQL, producer payloads, n8n URLs, or workflow technical details.

Focused RTL gate:
`pnpm vitest run 'src/app/(private)/imports/batches/page.test.tsx'` passed:
1 file / 14 tests. Affected private UI surface gate:
`pnpm vitest run 'src/app/(private)/imports/batches/page.test.tsx' 'src/app/(private)/imports/page.test.tsx' 'src/app/(private)/layout.test.tsx'`
passed: 3 files / 39 tests.

`pnpm lint`: passed with the same two pre-existing unused-variable warnings in
`src/server/auth/auth.test.ts`. `pnpm typecheck`: passed. `pnpm test` passed:
44 files / 932 tests. `pnpm build`: passed; Next.js detected `.env.local`
during build loading and listed `/imports/batches`, but `.env.local` was not
inspected or changed. `git diff --check`: passed.

No T027 detail page, `GET /api/imports/:id` browser call, client-only producer
filter, n8n call, external fetch, database change, producer mutation, raw CSV,
real data, credential change, production migration, deployment, workflow
change, feature activation, export, analytics, CRM, retry, or reprocessing was
performed.

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
| T011–T019 | T002→T018; T018+X3→T019 with X4 only for completion; T011+T012+observed contract→T013; T014; T013+T014→T015→T016→T017 | ✅ |
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
| T004–T005, T011, T020, T028, T042–T043 | Pure policy/validator/mapper | Unit | Unit in same task | ✅ |
| T012 internal decision | Contract/evidence disposition | Structural | No crypto code or fabricated unit vectors | ✅ |
| T006–T007 | Auth | Integration | Auth/guard integration in same task | ✅ |
| T008, T014, T021–T023, T029–T033, T045 | DB/repository | Unit + disposable integration | Unit/integration in same task | ✅ |
| T009–T010 | Migration/roles | Disposable PostgreSQL integration | Integration in each task | ✅ |
| T013, T015 | Service/client | Unit with injected boundaries | Unit/mock integration in same task | ✅ |
| T016, T024–T025, T034–T039, T046 | Routes | Route integration | Route tests in same task | ✅ |
| T017, T026–T027, T040–T041, T044, T046 | React | RTL | RTL in same task | ✅ |
| T018–T019 | Official n8n protocol | Static map plus non-production contract | Mapping/smoke in T018 and executable HTTP suite in T019 | ✅ |
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
