# Contact Enrichment v1 Tasks

**Design:** `.specs/features/contact-enrichment-v1/design.md`

**Status:** Demo 3 PII-free deployment and synthetic activation verified;
contact exposure blocked

## Execution Plan

### Phase 1: Static specification

```text
T1 → T2 → T3
```

### Phase 2: Isolated artifact and validation

```text
T3 → T4 → T5
```

No task is parallelized: repository instructions require preserving an
already-dirty worktree, and the artifact, test, and final traceability depend
on one another.

### Phase 3: Approved PII-free Demo 3 backend

```text
T6 → T7 → T8 → T9 → T10 → T11
```

### Phase 4: Separately approved Demo 3 operation

```text
T11 → T12
```

## Task Breakdown

### T1: Write the feature specification

**What:** Define contact-enrichment goals, exclusions, requirements, and
unapproved runtime gates.

**Where:** `.specs/features/contact-enrichment-v1/spec.md`

**Depends on:** None

**Reuses:** `AGENTS.md` and
`.specs/features/prospecting-console/decisions/sensitive-content-policy.md`

**Requirement:** CE-01, CE-05, CE-06, CE-07, CE-08

**Tools:**

- MCP: none
- Skills: `codenavi`, `tlc-spec-driven`, `coding-guidelines`

**Done when:**

- [x] Prohibits a route, persistence, activation, external call, and queue UI
  change in this stage.
- [x] States the separate policy/identity/operations approvals needed for
  runtime work.
- [x] Makes idempotency and no-retry ownership testable without claiming n8n
  provides them.

**Tests:** none (specification-only)

**Gate:** static review

### T2: Write the static architecture design

**What:** Map existing import, callback, permission, audit, app-owned database,
and queue patterns to the future-only enrichment boundary.

**Where:** `.specs/features/contact-enrichment-v1/design.md`

**Depends on:** T1

**Reuses:** `src/server/imports/submit-import.ts:submitImport()`,
`src/app/api/imports/events/route.ts:POST()`,
`src/server/auth/authorization.ts:permissionsForIdentity()`, and
`src/app/(private)/work-queue/page.tsx:LeadEnrichmentAction()`

**Requirement:** CE-01, CE-02, CE-03, CE-04, CE-05, CE-06, CE-08

**Tools:**

- MCP: none
- Skills: `codenavi`, `tlc-spec-driven`, `coding-guidelines`

**Done when:**

- [x] Distinguishes the reference workflow from the v1 design.
- [x] Keeps CNPJ as validation/correlation only and requires a provider-accepted
  domain without a lookup fallback.
- [x] Defines the exact PII-free initial response and future callback.

**Tests:** none (design-only)

**Gate:** static review

### T3: Define the versioned contract

**What:** Add the machine-readable request, response, callback, authentication,
idempotency, timeout, audit, and PII contract.

**Where:** `.specs/features/contact-enrichment-v1/contracts/contact-enrichment-v1.md`

**Depends on:** T2

**Reuses:**
`.specs/features/prospecting-console/contracts/n8n-import-webhook.md` and
`.specs/features/prospecting-console/contracts/authorization-policy.md`

**Requirement:** CE-01, CE-02, CE-03, CE-04, CE-05, CE-06

**Tools:**

- MCP: none
- Skills: `tlc-spec-driven`, `coding-guidelines`

**Done when:**

- [x] Has exact field allowlists and safe status enums.
- [x] Recorded the callback route and durable app ledger as deferred in the
  original static phase; T6-T9 document their later explicit approval.
- [x] Forbids contact content and producer/database activity.

**Tests:** none (contract document; T4 verifies its machine-readable mirror)

**Gate:** static review

### T4: Add the inactive n8n artifact and its contract test

**What:** Add a secret-free n8n workflow export, machine-readable artifact
contract, operator README, and synthetic static test in one cohesive artifact
slice.

**Where:** `integrations/n8n/prospecting-contact-enrichment-v1/` and
`tests/contract/contact-enrichment-v1.contract.test.ts`

**Depends on:** T3

**Reuses:** `integrations/n8n/prospecting-import-v1/` layout and
`tests/contract/n8n-import-workflow-artifact.contract.test.ts` parser style.

**Requirement:** CE-01, CE-02, CE-03, CE-04, CE-05, CE-06, CE-07, CE-08

**Tools:**

- MCP: none
- Skills: `codenavi`, `coding-guidelines`

**Done when:**

- [x] Workflow is inactive with blank pin data, no database node, no producer
  path, no linked credentials, no secret, and no configured environment target.
- [x] Ingress and callback require unbound native `httpHeaderAuth` credentials;
  provider auth uses unbound generic `httpHeaderAuth`.
- [x] Response/callback schemas are PII-free; CNPJ is validated then removed;
  provider output is reduced to a safe withheld/unknown status.
- [x] Tests cover duplicate/idempotency ownership, failed authentication,
  no-retry timeout, invalid callback, and PII leakage.
- [x] Contract gate passes with 23 passed and 57 skipped tests, unless an
  unrelated existing test changes the baseline.

**Tests:** contract/static. A remote n8n contract run is intentionally omitted:
no non-production target, inspection source, credentials, or activation is
approved.

**Gate:** `node_modules/.bin/vitest run --config vitest.contract.config.ts`

### T5: Verify boundaries and update traceability

**What:** Run available repository gates, inspect the focused diff, and mark
requirements with verified evidence without touching the current queue action
or user-owned uncommitted files.

**Where:** The feature specification/task files only for status updates.

**Depends on:** T4

**Reuses:** `.specs/codebase/TESTING.md`

**Requirement:** CE-01 through CE-08

**Tools:**

- MCP: none
- Skills: `codenavi`, `tlc-spec-driven`, `coding-guidelines`

**Done when:**

- [x] Static contract suite passes: 23 passed, 57 skipped.
- [x] Lint, typecheck, unit tests, and build are attempted sequentially using
  repository-local binaries because `pnpm` is not installed in this environment.
- [x] Focused diff proves there is no new route, migration, environment
  setting, deployment change, or queue-action mutation.
- [x] Requirement statuses identify any check that could not run.

**Tests:** full static/build gate

**Gate:** `node_modules/.bin/eslint && node_modules/.bin/next typegen && node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json && node_modules/.bin/vitest run && node_modules/.bin/next build`

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | One feature specification | ✅ Granular |
| T2 | One architecture design | ✅ Granular |
| T3 | One versioned contract | ✅ Granular |
| T4 | One isolated n8n artifact slice plus its required co-located test | ✅ Cohesive |
| T5 | One verification/traceability pass | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | Start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |

## Test Co-location Validation

| Task | Changed layer | Matrix requirement | Task tests | Status |
| --- | --- | --- | --- | --- |
| T1 | Specification | none | none | ✅ Match |
| T2 | Design | none | none | ✅ Match |
| T3 | Contract documentation | none | none | ✅ Match |
| T4 | n8n artifact | unit plus contract against identified non-production target | static contract; remote target explicitly unavailable/unapproved | ✅ Scoped static preparation |
| T5 | Verification/traceability | build gate | full static/build gate | ✅ Match |

The T4 remote contract requirement cannot run without violating the requested
no-target/no-activation boundary. The local test validates the repository
artifact only and does not claim a remote contract pass.

## Phase 1 Historical Verification Record

| Check | Result |
| --- | --- |
| `node_modules/.bin/vitest run --config vitest.contract.config.ts` | Passed: 23 passed, 57 skipped. |
| `node_modules/.bin/eslint` | Passed. |
| `node_modules/.bin/next typegen && node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json` | Passed. |
| `node_modules/.bin/vitest run` | Passed: 1,881 passed in 207 files. |
| `node_modules/.bin/next build` | Blocked by pre-existing `.env.local`: `AUTH_DEV_BYPASS_ENABLED` is forbidden in production and `DEMO2_FULL_ACCESS_ENABLED` is limited to the approved Demo 2 runtime. |
| `git diff --check` | Passed. |

At that phase, no n8n target, Lusha credential, database, route, migration,
deployment, or workflow activation was used during verification.

## Demo 3 Runtime Task Breakdown

### T6: Record approved policy and runtime contract

**What:** Replace future-only language with the approved PII-free Demo 3 route,
permission, hash-only ledger, exact target, and zero-contact-retention limit.

**Where:** Feature spec, design, task plan, contract, and n8n README/contract.

**Depends on:** T5 and owner decisions dated 2026-07-31

**Requirement:** CE-09 through CE-12

**Done when:**

- [x] Exact non-production URL and `contacts:enrich` decision are recorded.
- [x] Contact PII retention is explicitly zero while policy remains unknown.
- [x] Operational actions remain separate from repository implementation.

**Tests:** static contract in T10

**Gate:** static review

### T7: Add permission and server-only environment contract

**What:** Add `contacts:enrich`, grant it only to the exact feature-gated Demo
3 actor, and validate the exact n8n target, timeouts, and distinct secrets.

**Where:** `src/server/auth/`, `src/server/env.ts`, `.env.example`, and tests.

**Depends on:** T6

**Requirement:** CE-09, CE-12

**Done when:**

- [x] `sensitive:read` never implies `contacts:enrich`.
- [x] Permission is absent when the contact feature or Demo 3 profile is off.
- [x] Unsafe URLs, public secret names, short/shared secrets, and incomplete
  enabled configuration fail closed.

**Tests:** unit, written RED first

**Gate:** focused Vitest

### T8: Add the app-owned PII-free ledger migration and repository

**What:** Add migration `009`, a hash-only request ledger, append-only events,
organization scoping, idempotency conflict handling, terminal callback replay,
and runtime grants without producer references.

**Where:** `db/app/009_*`, `src/server/contact-enrichment/`, packaging, and
repository/migration tests.

**Depends on:** T7

**Requirement:** CE-10, CE-11

**Done when:**

- [x] Intent and event commit together before dispatch.
- [x] Same key/input returns the original record; changed input conflicts.
- [x] Exact callback replay is a no-op; conflicting replay is rejected.
- [x] No CNPJ, domain, raw key, contact field, JSON payload, or producer FK is
  stored.

**Tests:** unit plus disposable PostgreSQL integration when configured

**Gate:** focused Vitest plus integration target when available

### T9: Implement the server-only client, service, and API routes

**What:** Implement one outbound attempt with timeout/no retry, authenticated
same-origin request handling, strict callback authentication/schema, and safe
response envelopes.

**Where:** `src/server/contact-enrichment/` and
`src/app/api/contact-enrichment/`.

**Depends on:** T8

**Requirement:** CE-09, CE-10, CE-11

**Done when:**

- [x] Permission and same origin run before body, hash, database, or n8n work.
- [x] Intent is durable before the only outbound call.
- [x] Timeout/invalid response becomes an honest unknown without retry.
- [x] Machine authentication precedes callback parsing/database work.
- [x] Safe responses contain no input or provider/contact value.

**Tests:** service/client/route unit tests, written RED first

**Gate:** focused Vitest

### T10: Package the exact Demo 3 boundary and inactive workflow

**What:** Configure the exact URL and callback route, keep credentials
server-only, package migration `009`, and update the separate n8n artifact
without activating or binding it.

**Where:** Demo 3 manifest/edge/deploy packaging, Docker migration package,
n8n artifact, and contract tests.

**Depends on:** T9

**Requirement:** CE-12

**Done when:**

- [x] Workflow remains `active: false`, secret-free, retry-free, and producer-free.
- [x] Demo 3 deployment requires distinct operator-supplied secrets.
- [x] Exact callback bypasses gateway Basic Auth only while the app validates
  its dedicated machine secret first.
- [x] No cluster, n8n, Lusha, or real database is contacted.

**Tests:** static contract

**Gate:** contract Vitest

### T11: Verify and close traceability

**What:** Run applicable focused and repository gates, inspect diffs for PII,
secrets, producer mutation, UI changes, and record limitations.

**Where:** Task/spec status and notebook pointers only after verification.

**Depends on:** T10

**Requirement:** CE-09 through CE-12

**Done when:**

- [x] Focused unit and contract tests pass.
- [x] Lint, typecheck, unit suite, and build are attempted sequentially.
- [x] PostgreSQL integration is run only against the approved disposable
  synthetic target when configured.
- [x] Queue action remains unchanged by this phase.

**Tests:** build gate

**Gate:** repository build gate

## Demo 3 Verification Record

| Check | Result |
| --- | --- |
| Focused contact-enrichment unit tests | Passed: 35 tests across contract, client, service, repository, request route, and callback route. |
| `node_modules/.bin/vitest run --config vitest.contract.config.ts` | Passed after workflow correction: 28 passed, 57 skipped remote checks. |
| `node_modules/.bin/eslint .` | Passed. |
| `node_modules/.bin/next typegen` | Passed. |
| `node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json` | Passed. |
| `node_modules/.bin/vitest run` | Passed: 1,928 passed in 90 files. |
| `node_modules/.bin/next build` with production-only demo flags disabled for the process | Passed; both contact routes compiled as dynamic server routes. |
| `node_modules/.bin/vitest run --config vitest.integration.config.ts` | Not run against PostgreSQL: failed closed because `PROSPECTA_APP_TEST_DATABASE_URL` is absent; 19 existing tests were skipped and no database was contacted. |
| `git diff --check` | Passed before final documentation update; repeated at close. |

The table above records the repository gate before operational activation.
Producer mutation, real-data tests, contact exposure, and queue-button wiring
did not occur.

### T12: Deploy, activate, and run synthetic Demo 3 UAT

**What:** After separate owner approval, deploy the immutable Demo 3 release,
apply migration `009`, bind three native n8n credentials outside Git, activate
only the new workflow, and exercise safe synthetic negative/idempotency cases.

**Where:** Exact Demo 3 app and n8n targets; repository evidence only after the
operation.

**Depends on:** T11 and explicit owner/operator authorization

**Requirement:** CE-01 through CE-06, CE-09 through CE-12

**Done when:**

- [x] Target preflight passes before cluster mutation and migration `009`
  applies only to the app-owned database.
- [x] The reference workflow remains inactive; the new workflow exposes only
  the exact authenticated path.
- [x] Missing/wrong authentication returns `403`; authenticated invalid input
  returns `400` before Lusha.
- [x] One corrected synthetic dispatch returns `202` and a PII-free terminal
  callback without exposing the provider response.
- [x] Identical replay returns `200`, changed-input conflict returns `409`, and
  neither causes another n8n/provider execution.
- [x] Final n8n execution/data-row counts for the new workflow are zero after
  exact cleanup of soft-deleted synthetic records.
- [x] No producer mutation, real data, contact exposure, or queue-button wiring
  occurs.

**Evidence:**
`.specs/features/contact-enrichment-v1/evidence/demo3-activation-2026-07-31.md`

**Gate:** exact-target postconditions plus full contract suite
