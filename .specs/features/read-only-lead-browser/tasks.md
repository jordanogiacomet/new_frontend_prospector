# Read-only Lead Browser Tasks

**Design:** `.specs/features/read-only-lead-browser/design.md`  
**Phase:** Tasks  
**Status:** RLB-T036 COMPLETE — minimal batch mapper implemented; RLB-T037–RLB-T040 blocked
**Plan origin:** Fresh plan created for `read-only-lead-browser`; it does not continue or reuse any prior T01/T02 plan.

## Execution Rules

- Execute only tasks explicitly authorized by the user. `RLB-T001` is approved; no later task is authorized by that approval.
- `RLB-T001` through `RLB-T005` are mandatory approval/evidence gates. Code bootstrap begins only after all five pass.
- Every implementation task includes its tests; there are no deferred “write tests later” tasks.
- Use one atomic commit per task when execution is eventually approved.
- Run no production migration and make no n8n call/change.
- Use synthetic data for all implementation tests, fixtures, seeds, and screenshots. Evidence gates may use authorized aggregate production/production-like reads but commit no raw records or payloads.
- Tasks marked **Parallel-ready** may overlap technically, but no sub-agent delegation is authorized by this plan. Parallel agents require an explicit future user request.
- RLB-T035A partially supersedes RLB-T004 only for RLB-T036. RLB-T037–RLB-T040
  remain blocked and must not execute without separate approval.
- Report/evidence content retrieval and rendering remain disabled. RLB-T004
  approved a deny-by-default policy but no current semantic field/content
  allowlist; only withheld/omitted states may be implemented without a separate
  content-owner approval.
- RLB-T005 approves exact totals only behind the 20-current-row and
  six-terminal-history-row fail-closed guards. Broad filters, JSON controls,
  alternate sorts, and every unlisted query control remain absent.

## Tool Profiles for Future Execution

The user authorized `DB-READ` for `RLB-T002` on 2026-06-30 through the local
DB-READ profile. After the grants were corrected, the revised audit ran with
forced read-only transactions and aggregate `SELECT` queries only across all
six targets. It approved a bounded production-like current read contract and
did not inspect or commit raw business content. This authorization does not
extend to `RLB-T005` or implementation profiles.

| Profile | Tools and skills | Intended use |
| --- | --- | --- |
| `DOCS` | Filesystem patching; `tlc-spec-driven` | Approval and plan/status updates |
| `CORE` | Filesystem/shell; `coding-guidelines` | TypeScript, server, validators, mappers, routes |
| `UI` | Filesystem/shell; `coding-guidelines`, `frontend-design` | User-facing pages and components |
| `CURRENT-DOCS` | Official framework/auth/library documentation through available docs/web tools | Verify current APIs during bootstrap/auth work |
| `DB-READ` | PostgreSQL client using separately authorized read-only credentials | Aggregate production/production-like contract and query evidence; non-production integration verification; never application writes |

No specialized MCP server was discovered in the current session. Before execution, ask: **Which approved tool profiles and connected MCPs should be used for each task?**

## Test Coverage and Gate Matrix

The repository has no `.specs/codebase/TESTING.md` or package scripts. This matrix derives from the explicit project testing instructions and becomes the provisional contract until `RLB-T007` establishes actual scripts.

| Code layer | Required test | Parallel-safe | Focused gate |
| --- | --- | --- | --- |
| Planning/docs | None; structural review | Yes | `rg` scope/coverage checks |
| Scaffold/config | Build or config smoke test | No | `pnpm lint && pnpm typecheck && pnpm build` |
| Pure validators/formatters/labels/mappers | Vitest unit | Yes | `pnpm vitest run <test-file> && pnpm typecheck` |
| Database client/repository | Unit with injected executor; approved non-production integration where available | No for DB integration | Focused Vitest + `pnpm typecheck` |
| Auth/route handler | Vitest integration with synthetic mocks/session fixtures | No | Focused Vitest + `pnpm typecheck` |
| React component/page | Vitest + React Testing Library | Yes if no shared browser state | Focused Vitest + `pnpm typecheck` |
| Final product | Full suite | No | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |

If the approved test stack or scripts differ, update this document before implementation.

## Execution Plan

### Phase 0 — Approval and evidence gates

```text
RLB-T001 → RLB-T002 → RLB-T003 → RLB-T004 → RLB-T005
```

### Phase 1 — Greenfield foundation

```text
RLB-T005 → RLB-T006 → RLB-T007
                         ├─→ RLB-T008 → RLB-T009
                         ├─→ RLB-T010 ─┬→ RLB-T011
                         │             └→ RLB-T012 ─┬→ RLB-T014
                         │                           ├→ RLB-T015
                         │                           └→ RLB-T016
                         └─→ RLB-T013
```

`RLB-T008`, `RLB-T010`, and `RLB-T013` are parallel-ready after `RLB-T007`. `RLB-T011` and `RLB-T012` are parallel-ready after `RLB-T010`. Mapper tasks are parallel-ready after their shared dependencies.

### Phase 2 — Authentication/private boundary

```text
RLB-T003 + RLB-T005 + RLB-T007 + RLB-T008 → RLB-T017
RLB-T017 → RLB-T018
RLB-T017 → RLB-T019
RLB-T017 → RLB-T020
```

The login page, private layout, and API guard are parallel-ready after server auth configuration.

### Phase 3 — Lead list vertical slice

```text
RLB-T009 + RLB-T011 + RLB-T014 → RLB-T021
RLB-T013 + RLB-T020 + RLB-T021 → RLB-T022
RLB-T011 + RLB-T012 + RLB-T019 → RLB-T023
RLB-T010 + RLB-T012 → RLB-T024
RLB-T018 + RLB-T019 + RLB-T022 + RLB-T023 + RLB-T024 → RLB-T025
```

### Phase 4 — Lead detail vertical slice

```text
RLB-T009 + RLB-T011 + RLB-T015 → RLB-T026
RLB-T013 + RLB-T020 + RLB-T026 → RLB-T027
RLB-T007 + RLB-T015 → RLB-T028
RLB-T010 + RLB-T012 → RLB-T029
RLB-T010 + RLB-T012 + RLB-T028 → RLB-T030
RLB-T010 + RLB-T012 → RLB-T031
RLB-T019 + RLB-T027 + RLB-T028 + RLB-T029 + RLB-T030 + RLB-T031 → RLB-T032
```

UI component tasks `RLB-T028` through `RLB-T031` are parallel-ready when their dependencies pass.

### Phase 5 — History, conditional on approval

```text
RLB-T004 + RLB-T009 + RLB-T011 + RLB-T016 → RLB-T033
RLB-T013 + RLB-T020 + RLB-T033 → RLB-T034
RLB-T012 + RLB-T032 + RLB-T034 → RLB-T035
RLB-T035 → RLB-T035A
```

### Phase 6 — Batch/source mapper only

**Partially enabled by RLB-T035A.** RLB-T036 is executable against the minimal
aggregate contract. RLB-T037–RLB-T040 remain blocked.

```text
RLB-T035A + RLB-T010 + RLB-T012 → RLB-T036
RLB-T036 ──X RLB-T037 ──X RLB-T038/RLB-T039 ──X RLB-T040
```

The blocked edge requires a separate repository/API/UI contract approval.

### Phase 7 — Final verification

```text
RLB-T025 + RLB-T032 + RLB-T035
  + (RLB-T040 only if P2 approved)
  → RLB-T041
```

## Task Breakdown

### RLB-T001: Approve read-only scope and MVP wording

**What:** Approve the strictly read-only boundary and the description “a browser for eligible, readable, retained decisions,” explicitly rejecting authoritative-inventory wording.  
**Where:** `.specs/features/read-only-lead-browser/spec.md`, `context.md`, `design.md`  
**Depends on:** None  
**Reuses:** `AGENTS.md`, `docs/db/schema.sql`  
**Requirements:** RLB-02, RLB-06, RLB-11, RLB-12, RLB-14, RLB-16  
**Tools:** `DOCS`  
**Tests:** None — documentation gate  
**Gate:** Structural/scope review  
**Done when:**

- [x] Reviewer accepts that `lead_decisions` is only a provisional candidate until evidence gates pass.
- [x] Reviewer accepts that absence from the browser does not prove absence of producer analysis.
- [x] Reviewer accepts projection/event/batch-progress exclusions.
- [x] The scope remains authenticated, server-only, GET-only PostgreSQL reads.
- [x] CSV upload, n8n calls/changes, import creation, retry/idempotency behavior, reprocessing, export, human-review writes, migrations, and producer changes remain excluded.

**Approval:** Approved on 2026-06-30. The MVP wording is “a browser for eligible, readable, retained decisions”; authoritative-inventory and complete-audit-trail claims remain prohibited.

**Verify:** `rg -n "eligible, readable, retained|authoritative inventory|GET-only|Can implementation start" .specs/features/read-only-lead-browser/{spec,context,design}.md`  
**Commit:** `docs(read-only-leads): approve bounded read-only MVP`

### RLB-T002: Run and approve the actual read-source contract audit

**What:** Use authorized read-only aggregate queries over production or a
production-like copy to identify and measure the actual populated read-source
contract. For the connected target, audit `company_validations`,
`company_validation_runs`, `company_strategic_research_reports`,
`lead_import_batches`, `vw_dashboard_empresaqui`, and
`vw_company_validation_runs_latest_per_company`; do not assume
`lead_decisions` is populated.
**Where:** Redacted aggregate findings and approved contract decisions in `.specs/features/read-only-lead-browser/context.md`; query text/results remain outside the repository if policy requires  
**Depends on:** RLB-T001  
**Reuses:** Source discovery, source map, and DDL constraints
**Requirements:** RLB-02, RLB-05, RLB-06, RLB-13, RLB-16, RLB-18  
**Tools:** `DB-READ`, `DOCS`  
**Tests:** None — evidence gate  
**Gate:** All database activity uses authorized read-only credentials and aggregate `SELECT` queries; no raw payload or business record is committed  
**Execution status:** **COMPLETE (revised rerun, 2026-06-30).** The loaded
profile connected to database `prospecting` as `rlb_readonly`. The audit opened
explicit read-only transactions; `transaction_read_only` was `on`. `SELECT`
was available and `INSERT`, `UPDATE`, and `DELETE` were absent on all six
targets. Aggregate evidence approves `company_validations` plus an exact
terminal `company_validation_runs` relationship as the bounded current read
model. It rejects authoritative/real-production coverage and disables
batch/source because lineage does not match. `RLB-T003` was completed on
2026-07-01.
**Done when:**

- [x] The original `lead_decisions` audit recorded an exact zero-row result and
  rejected coverage rather than treating undefined rates as passing.
- [x] Source discovery identified likely alternative sources using metadata and
  catalog estimates only.
- [x] Exact row counts are obtained for every revised audit target under
  approved read-only grants.
- [x] `company_validations` null/default/domain behavior and current-row
  semantics are quantified.
- [x] The relationship from `company_validations` to terminal
  `company_validation_runs` rows is quantified, including 0/1/many matches,
  stored action coverage, time variation, and whether operational rows can be
  excluded deterministically.
- [x] History is explicitly approved as retained-only from a stable business
  row contract or disabled as unavailable.
- [x] Strategic report exact-run relationship, multiplicity, integrity, and
  structural availability are measured without querying or committing content.
- [x] Batch/source metadata semantics are measured without treating replay
  counters as progress.
- [x] Comparison-view ordering, joins, null coercions, and row cardinality are
  compared with direct source tables.
- [x] No raw lead, contact, report, evidence, input snapshot, strategic content,
  identifying sample, or credential is queried or committed.

**Verify:** Review authorization, DB role/transaction mode, exact aggregate
counts, relationship cardinalities, denominator definitions, stratification,
coverage calculations, and redaction; `git diff --check`
**Commit:** `docs(read-only-leads): record aggregate contract evidence`

### RLB-T003: Approve production scope and authentication model

**What:** Approve the production row predicate, readable-field contract, domain/confidence mappings, identity provider, exact organization authorization rule, database grants, and test database strategy.  
**Where:** `.specs/features/read-only-lead-browser/context.md`, `design.md`  
**Depends on:** RLB-T002  
**Reuses:** Approval table in `context.md`  
**Requirements:** RLB-01, RLB-02, RLB-05, RLB-10, RLB-13, RLB-15, RLB-16  
**Tools:** `DOCS`  
**Tests:** None — decision gate  
**Gate:** No unresolved production-scope, readability, authorization, grants, or test-environment decision remains  
**Execution status:** **COMPLETE (2026-07-01).** The approval record selects
server-only Auth.js with the organization-managed OIDC provider, exact
issuer/`org_id` single-organization authorization, a fail-closed non-test
terminal-row predicate, the readable-field and domain contracts, a 100%
initial production readability threshold with zero unclassified candidates,
column-level read-only grants, explicit secret owners, and synthetic-only
disposable PostgreSQL testing. No auth or application code was implemented.
**Done when:**

- [x] Authentication provider and exact organization authorization are approved.
- [x] Production modes, time/version scope, eligibility/readability predicate, and accepted coverage threshold are approved.
- [x] Action/priority/verdict/trust domains and low-confidence mappings are approved with neutral unknown handling.
- [x] Least-privilege deployed database grants and secret ownership are approved.
- [x] Test database strategy and package/tool profiles are approved without production data.

**Verify:** Review the approval table for an explicit decision and evidence reference for each item; `git diff --check`  
**Commit:** `docs(read-only-leads): approve production and auth scope`

### RLB-T004: Approve history, sensitive-content, and batch semantics

**What:** Decide retained-history wording and limitations, report/evidence semantic content policy, and batch/source enablement or explicit deferral.  
**Where:** `.specs/features/read-only-lead-browser/context.md`, `design.md`, `tasks.md`  
**Depends on:** RLB-T003  
**Reuses:** Contract-audit results from RLB-T002  
**Requirements:** RLB-04, RLB-06, RLB-07, RLB-12, RLB-14, RLB-18  
**Tools:** `DOCS`  
**Tests:** None — policy/semantics gate  
**Gate:** Each conditional area has an explicit enabled-with-policy or deferred decision  
**Execution status:** **COMPLETE (2026-07-01).** Retention completeness is
classified as incomplete/unknown. Retained-only history is approved with
“Histórico disponível” or “Análises retidas encontradas” and the mandatory
warning that older analyses may not be present. A deny-by-default semantic
privacy policy is approved, but no current report/evidence content is
allowlisted; uncertain content is omitted and contact snapshots remain
deferred. Batch/source screens and routes are deferred because audited lineage
is absent and counters can imply import progress. No UI or route was
implemented.

**Done when:**

- [x] Retention evidence is classified as proven complete or incomplete/unknown.
- [x] Unless completeness is proven, history uses “Histórico disponível” or “Análises retidas encontradas” and states that older analyses may not be present.
- [x] Report/evidence policy addresses semantic PII, confidential business content, field allowlisting, redaction/omission, URL safety, authorization, and logging.
- [x] The policy explicitly states that XSS sanitization is not privacy approval and defaults uncertain content to omission.
- [x] Contact snapshots remain deferred unless separately approved under the same privacy boundary.
- [x] Batch/source screens are explicitly deferred unless reviewers establish that their semantics cannot reasonably be mistaken for import progress.

**Verify:** Policy/semantics review plus `rg -n "Histórico disponível|Análises retidas encontradas|older analyses|mais antigas|semantic PII|confidential|batch/source" .specs/features/read-only-lead-browser/{spec,context,design,tasks}.md`  
**Commit:** `docs(read-only-leads): approve retained-content semantics`

### RLB-T005: Approve realistic query and performance constraints

**What:** Test representative list/detail/history query shapes against authorized production or production-like scale and approve a bounded capability matrix.  
**Where:** Redacted findings and enabled/disabled query controls in `.specs/features/read-only-lead-browser/context.md`, `design.md`  
**Depends on:** RLB-T004  
**Reuses:** Approved production/readability predicate from RLB-T003  
**Requirements:** RLB-02, RLB-03, RLB-10, RLB-17  
**Tools:** `DB-READ`, `DOCS`  
**Tests:** None — evidence gate  
**Gate:** Read-only realistic plan/cost review; no raw parameter values or payloads committed  
**Execution status:** **COMPLETE (2026-07-01).** The authorized read-only audit
reviewed the exact production predicate and production-like surrogate at 20
current projections/240 run rows, separate list/history counts, exact detail
and history, representative selective/unselective filters, every proposed
sort, structural/computed JSON work, two concurrent sessions, timeouts, pool
budget, and production headroom. The approved envelope uses hard fail-closed
cardinality ceilings, exact CNPJ plus single exact UF/priority filters, fixed
date/ID ordering, and no JSON/name/date/alternate-sort capability. No
application bootstrap or route/UI implementation was performed.
**Done when:**

- [x] Latest-per-CNPJ data query behavior is reviewed with realistic cardinality and representative selective/unselective parameters.
- [x] Exact count queries are reviewed independently; exact totals are omitted if their cost is not approved.
- [x] JSON extraction/projection cost is measured for every proposed selected or filtered path.
- [x] Each proposed filter and sort has an explicit index/predicate compatibility decision.
- [x] Broad name search, broad date ranges, computed JSON filters, and expensive sorts are omitted or bounded unless evidence supports them.
- [x] Statement timeout, pool sizing, expected concurrency, and production headroom risks are assessed.
- [x] The approved capability matrix identifies enabled, narrowed, and deferred controls and is reflected in the API/design contract.
- [x] Design/tasks status changes to `Approved` only after T001–T005 pass; bootstrap remains separately authorized.

**Verify:** Review sanitized plans/metrics and capability matrix; confirm unsupported controls are absent from enabled tasks/contracts; `git diff --check`  
**Commit:** `docs(read-only-leads): approve query capability envelope`

### RLB-T006: Bootstrap the Next.js project

**What:** Create the root Next.js App Router/TypeScript/Tailwind/ESLint scaffold with package name `read-only-lead-browser`.  
**Where:** Repository root, `src/app/`  
**Depends on:** RLB-T005  
**Reuses:** Repository conventions in `AGENTS.md`  
**Requirements:** RLB-11  
**Tools:** `CORE`, `CURRENT-DOCS`  
**Tests:** Scaffold smoke  
**Gate:** Build  
**Done when:**

- [x] `pnpm` project exists at repository root, not a nested project.
- [x] TypeScript strict mode and App Router are enabled.
- [x] No example API, n8n, CSV, database, or mutation behavior is added.
- [x] Baseline lint and build pass with zero tests removed.

**Verify:** `pnpm lint && pnpm build`; expected exit code `0`  
**Commit:** `chore(read-only-leads): bootstrap Next.js application`

### RLB-T007: Establish the test and quality toolchain

**What:** Add `typecheck`/`test` scripts and minimal Vitest/React Testing Library configuration.  
**Where:** `package.json`, test config/setup files  
**Depends on:** RLB-T006  
**Reuses:** Testing matrix in `design.md`  
**Requirements:** RLB-15  
**Tools:** `CORE`, `CURRENT-DOCS`  
**Tests:** Config smoke  
**Gate:** Full baseline  
**Done when:**

- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` scripts exist.
- [x] One synthetic smoke test proves the runner/configuration.
- [x] Test discovery excludes production dumps, real data, and build output.
- [x] All four commands pass; at least 1 smoke test passes.

**Verify:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; expected at least `1` passing test  
**Commit:** `test(read-only-leads): establish quality toolchain`

### RLB-T008: Define environment validation and placeholders

**What:** Define server environment validation and safe placeholder documentation without real credentials or n8n variables.  
**Where:** `.env.example`, `src/server/env.ts`, `.gitignore` if required  
**Depends on:** RLB-T007  
**Reuses:** Approved auth provider and AGENTS environment rules  
**Requirements:** RLB-01, RLB-10, RLB-11  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Done when:**

- [x] `DATABASE_URL` and approved auth variables validate server-side.
- [x] `.env.example` contains placeholders only and no n8n setting.
- [x] Client environment exports contain no database/auth secrets.
- [x] At least 4 tests cover missing, malformed, valid, and client-safe cases.

**Verify:** `pnpm vitest run src/server/env.test.ts && pnpm typecheck`; at least `4` tests pass  
**Commit:** `feat(read-only-leads): validate server environment`

### RLB-T009: Create the server-only PostgreSQL client

**What:** Implement a minimal typed query executor with server-only guard, timeout, and clean pool lifecycle.  
**Where:** `src/server/db/client.ts` and co-located test  
**Depends on:** RLB-T008  
**Reuses:** Validated server environment  
**Requirements:** RLB-10, RLB-11  
**Tools:** `CORE`, `CURRENT-DOCS`  
**Tests:** Unit; non-production connection smoke if approved  
**Gate:** Focused unit + typecheck  
**Done when:**

- [x] Client cannot be imported into a client bundle.
- [x] Query values remain separate from SQL text.
- [x] Statement timeout and safe connection errors are configured.
- [x] No migration/write helper is exposed.
- [x] At least 4 unit tests pass; optional synthetic DB smoke never uses production.

**Verify:** `pnpm vitest run src/server/db/client.test.ts && pnpm typecheck`; at least `4` tests pass  
**Commit:** `feat(read-only-leads): add server-only database client`

### RLB-T010: Define read-only domain DTO types

**What:** Define the approved `LeadSummary`, `LeadDetail`, `LeadHistoryItem`, supporting types, and conditional `BatchSourceSummary`.  
**Where:** `src/types/leads.ts`, conditional `src/types/imports.ts`  
**Depends on:** RLB-T007  
**Reuses:** DTO contracts in `design.md`  
**Requirements:** RLB-04, RLB-05, RLB-12, RLB-14  
**Tools:** `CORE`  
**Tests:** Compile-time/typecheck  
**Gate:** Typecheck  
**Done when:**

- [x] DTOs contain no `any` and preserve explicit nulls.
- [x] No raw payload/input/CRM/report JSON type is browser-facing.
- [x] Audit identifiers retain stable names.
- [x] `pnpm typecheck` passes.

**Verify:** `pnpm typecheck`; expected exit code `0`  
**Commit:** `feat(read-only-leads): define read-only DTO contracts`

### RLB-T011: Implement request validators

**What:** Implement Zod schemas only for the query controls enabled by the approved capability matrix, plus history/batch controls only when their gates are enabled.  
**Where:** `src/lib/validators/lead-query.ts` and co-located tests  
**Depends on:** RLB-T010  
**Reuses:** Validation rules in `design.md`  
**Requirements:** RLB-03, RLB-09, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Done when:**

- [x] Valid defaults and all approved bounds are implemented.
- [x] Any `sort`/`direction` input and every unknown/repeated input fails before repositories.
- [x] Page/page-size, exact CNPJ, exact UF, and exact approved-priority rules match the contract.
- [x] Deferred filters/sorts are absent rather than accepted and ignored.
- [x] At least 25 focused tests pass with no previous test-count reduction.

**Verify:** `pnpm vitest run src/lib/validators/lead-query.test.ts && pnpm typecheck`; at least `25` tests pass  
**Commit:** `feat(read-only-leads): validate read query inputs`

### RLB-T012: Implement Brazilian formatters and domain labels

**What:** Implement null-safe CNPJ/date/currency/score formatting and approved action/status/priority/confidence labels.  
**Where:** `src/lib/formatters/`, `src/lib/lead-labels.ts` with tests  
**Depends on:** RLB-T010  
**Reuses:** Approved maps from RLB-T003  
**Requirements:** RLB-05, RLB-08, RLB-13, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Done when:**

- [x] Dates use `pt-BR` and `America/Sao_Paulo`.
- [x] Currency formatting is called only for numeric contracts.
- [x] Null/unknown values use neutral labels.
- [x] Low confidence is derived only from approved stored values.
- [x] At least 20 tests pass with no previous test-count reduction.

**Verify:** `pnpm vitest run src/lib/formatters src/lib/lead-labels.test.ts && pnpm typecheck`; at least `20` tests pass  
**Commit:** `feat(read-only-leads): add business formatters and labels`

### RLB-T013: Implement safe API error mapping

**What:** Define response envelope helpers and map validation/auth/not-found/database/unexpected errors to the approved safe catalog.  
**Where:** `src/server/api/errors.ts` and co-located tests  
**Depends on:** RLB-T007  
**Reuses:** API error catalog in `design.md`  
**Requirements:** RLB-09, RLB-10, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Done when:**

- [x] No stack, SQL, connection string, raw cause, or payload enters responses.
- [x] Field details are allowed only for validation errors.
- [x] A safe correlation ID can be logged without sensitive data.
- [x] At least 8 error-path tests pass.

**Verify:** `pnpm vitest run src/server/api/errors.test.ts && pnpm typecheck`; at least `8` tests pass  
**Commit:** `feat(read-only-leads): map safe API errors`

### RLB-T014: Implement `LeadSummary` mapper

**What:** Map a latest-decision database row to `LeadSummary` with null-safe names and confidence handling.  
**Where:** `src/server/mappers/lead-summary-mapper.ts` and tests  
**Depends on:** RLB-T010, RLB-T012  
**Reuses:** `LeadSummary` field map  
**Requirements:** RLB-02, RLB-05, RLB-12, RLB-13, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Done when:**

- [x] Required audit fields are preserved exactly.
- [x] Missing names/status/score remain null/unknown.
- [x] No default-zero or raw payload pass-through occurs.
- [x] At least 10 complete/null/unknown tests pass.

**Verify:** `pnpm vitest run src/server/mappers/lead-summary-mapper.test.ts && pnpm typecheck`; at least `10` tests pass  
**Commit:** `feat(read-only-leads): map lead summaries safely`

### RLB-T015: Implement `LeadDetail` mapper

**What:** Map allowlisted scalar decision fields to `LeadDetail` and set
risk/signal/evidence/report sections to their approved unavailable or
`omitted_by_policy` states without accepting JSON/content inputs.
**Where:** `src/server/mappers/lead-detail-mapper.ts` and tests  
**Depends on:** RLB-T010, RLB-T012  
**Reuses:** `LeadDetail` field map  
**Requirements:** RLB-04, RLB-05, RLB-07, RLB-12, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Done when:**

- [x] No JSON collection or computed JSON value is accepted as mapper input.
- [x] Missing scalar values remain null and stored numeric scalars remain
  bounded without a JSON fallback.
- [x] Report/evidence content is not an accepted mapper input under the current
  empty semantic allowlist; both map to `omitted_by_policy`.
- [x] Tests prove XSS-safe or structurally valid content does not bypass the
  privacy omission policy.
- [x] Raw/input/external snapshots never appear.
- [x] At least 18 mapper tests pass.

**Verify:** `pnpm vitest run src/server/mappers/lead-detail-mapper.test.ts && pnpm typecheck`; at least `18` tests pass  
**Commit:** `feat(read-only-leads): map lead detail safely`

### RLB-T016: Implement `LeadHistoryItem` mapper

**What:** Map approved native terminal-run columns into distinct history items with an exact row-identity current marker.
**Where:** `src/types/leads.ts`, `src/server/mappers/lead-history-mapper.ts` and tests
**Depends on:** RLB-T010, RLB-T012  
**Reuses:** `LeadHistoryItem` field map  
**Requirements:** RLB-05, RLB-06, RLB-12, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The mapper uses only native
`company_validation_runs` columns, preserves the exact terminal row `id` and
`lead_run_id`, and marks the current item only by the exact row identity.
Fields absent from the approved history read model are not fabricated from
`NULL` aliases, projection values, or inference.
**Done when:**

- [x] Native terminal-row and run IDs are never replaced or collapsed.
- [x] Nullable native values remain null without projection or supersession inference.
- [x] Current marker uses the exact terminal-row ID.
- [x] At least 8 history mapping tests pass.

**Verify:** `pnpm vitest run src/server/mappers/lead-history-mapper.test.ts && pnpm typecheck`; at least `8` tests pass  
**Commit:** `feat(read-only-leads): map lead history safely`

### RLB-T017: Configure server authentication and authorization

**What:** Configure the approved provider, secure server session, and exact single-organization authorization rule.  
**Where:** `src/server/auth/` and provider route/config files  
**Depends on:** RLB-T003, RLB-T005, RLB-T007, RLB-T008  
**Reuses:** Approved identity decisions  
**Requirements:** RLB-01, RLB-10, RLB-15  
**Tools:** `CORE`, `CURRENT-DOCS`  
**Tests:** Integration with synthetic identity claims  
**Gate:** Focused auth tests + typecheck  
**Done when:**

- [x] Missing, expired, unauthorized-org, and authorized sessions are distinguished.
- [x] Cookies/session settings use approved secure defaults.
- [x] Provider secrets remain server-only.
- [x] At least 6 auth tests pass.

**Verify:** `pnpm vitest run src/server/auth && pnpm typecheck`; at least `6` tests pass  
**Commit:** `feat(read-only-leads): configure private authentication`

### RLB-T018: Build the login screen

**What:** Build the provider login screen and safe login/error states with no private data preview.  
**Where:** `src/app/login/page.tsx` and component test  
**Depends on:** RLB-T017  
**Reuses:** Approved auth actions  
**Requirements:** RLB-01, RLB-15  
**Tools:** `UI`  
**Tests:** Component  
**Gate:** Focused component + typecheck  
**Done when:**

- [x] Login triggers only the approved provider flow.
- [x] Authenticated users redirect to `/leads`.
- [x] Errors disclose no provider/internal details.
- [x] At least 4 component states pass.

**Verify:** `pnpm vitest run src/app/login && pnpm typecheck`; at least `4` tests pass  
**Commit:** `feat(read-only-leads): build private login screen`

### RLB-T019: Build the private application shell

**What:** Create the authenticated private layout, navigation, session display, and sign-out entry.  
**Where:** `src/app/(private)/layout.tsx` and test  
**Depends on:** RLB-T017  
**Reuses:** Server auth guard and shared UI primitives  
**Requirements:** RLB-01, RLB-10, RLB-15  
**Tools:** `UI`  
**Tests:** Component/integration  
**Gate:** Focused component + typecheck  
**Done when:**

- [x] Unauthenticated rendering returns no child/private content.
- [x] Unauthorized organization receives access denied.
- [x] Private pages opt out of shared caching.
- [x] At least 4 session-state tests pass.

**Verify:** `pnpm vitest run 'src/app/(private)/layout.test.tsx' && pnpm typecheck`; at least `4` tests pass  
**Commit:** `feat(read-only-leads): add authenticated application shell`

### RLB-T020: Implement the API authorization guard

**What:** Provide a reusable API guard that returns safe `401`/`403` responses before validation or repository access.  
**Where:** `src/server/auth/require-api-session.ts` and tests  
**Depends on:** RLB-T017  
**Reuses:** Safe API errors  
**Requirements:** RLB-01, RLB-09, RLB-10, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit/integration  
**Gate:** Focused auth tests + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The server-only guard maps
missing/expired sessions to safe `401`, denied sessions to safe `403`, and
returns only a minimal authorization proof before protected continuation.
**Done when:**

- [x] Repository callbacks are not invoked for unauthorized requests.
- [x] Authorized identity is returned in a narrow server-only type.
- [x] Responses contain no claims/provider details.
- [x] At least 5 guard tests pass.

**Verify:** `pnpm vitest run src/server/auth/require-api-session.test.ts && pnpm typecheck`; at least `5` tests pass  
**Commit:** `feat(read-only-leads): guard private APIs`

### RLB-T021: Implement the lead list repository

**What:** Implement the exact current-projection/terminal relation, fixed
date/ID ordering, exact CNPJ plus single exact UF/priority filters, guarded
counts, and page-size-20 pagination using parameterized SELECTs.
**Where:** `src/server/repositories/lead-list-repository.ts` and tests  
**Depends on:** RLB-T009, RLB-T011, RLB-T014  
**Reuses:** Approved production predicate and latest-selection design  
**Requirements:** RLB-02, RLB-03, RLB-05, RLB-10, RLB-12, RLB-15, RLB-17  
**Tools:** `CORE`, optional `DB-READ` for approved synthetic integration  
**Tests:** Repository unit plus approved non-production integration  
**Gate:** Focused repository tests + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The server-only repository
guards the unfiltered projection cardinality, selects the exact eligible
terminal relation, and applies only parameterized exact filters sequentially.
**Done when:**

- [x] Ranking precedes business filters.
- [x] SQL identifiers come only from allowlisted maps.
- [x] The unfiltered source guard fails closed above 20 current rows; exact
  count/data predicates match and execute sequentially.
- [x] SQL contains no deferred broad filter, expensive sort, or unapproved JSON predicate.
- [x] Query timeout, two-connection global pool budget, fixed ordering, and
  hard cardinality constraints match the approved evidence envelope.
- [x] Null scores remain null and sort predictably.
- [x] At least 14 tests cover ordering, filters, pagination, escaping, and injection attempts.

**Verify:** `pnpm vitest run src/server/repositories/lead-list-repository.test.ts && pnpm typecheck`; at least `14` tests pass  
**Commit:** `feat(read-only-leads): query latest leads read-only`

### RLB-T022: Implement `GET /api/leads`

**What:** Add the authenticated validated paginated lead-list route with safe envelopes and no-store headers.  
**Where:** `src/app/api/leads/route.ts` and tests  
**Depends on:** RLB-T013, RLB-T020, RLB-T021  
**Reuses:** Query validator, repository, error mapper  
**Requirements:** RLB-01, RLB-03, RLB-09, RLB-10, RLB-15  
**Tools:** `CORE`  
**Tests:** Route integration with synthetic mocks  
**Gate:** Focused route tests + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The authenticated GET-only
route validates the approved exact filters, returns exact pagination metadata,
and maps failures through the safe no-store API envelope.
**Done when:**

- [x] Only GET is implemented.
- [x] Auth runs before validation/repository access.
- [x] Success metadata and all safe error paths match the contract.
- [x] The approved exact total and derived total pages are preserved.
- [x] Private/no-store headers are present.
- [x] At least 10 route tests pass.

**Verify:** `pnpm vitest run src/app/api/leads/route.test.ts && pnpm typecheck`; at least `10` tests pass  
**Commit:** `feat(read-only-leads): expose lead list API`

### RLB-T023: Build lead list filter controls

**What:** Build URL-backed exact CNPJ, exact UF, and exact priority controls
that reset page on criteria changes; sorting is fixed and has no UI control.
**Where:** `src/components/leads/lead-list-filters.tsx` and tests  
**Depends on:** RLB-T011, RLB-T012, RLB-T019  
**Reuses:** Query parameter names and label maps  
**Requirements:** RLB-03, RLB-08, RLB-13, RLB-15  
**Tools:** `UI`  
**Tests:** Component  
**Gate:** Focused component + typecheck  
**Done when:**

- [x] Controls expose only supported filters/sorts.
- [x] No deferred broad or expensive query control is rendered.
- [x] Active filters are visible and clearable.
- [x] Filter changes reset `page=1`; no name search or sort/direction control exists.
- [x] Unknown current values render neutrally.
- [x] At least 8 interaction tests pass.

**Verify:** `pnpm vitest run src/components/leads/lead-list-filters.test.tsx && pnpm typecheck`; at least `8` tests pass  
**Commit:** `feat(read-only-leads): build lead list filters`

### RLB-T024: Build the lead results table

**What:** Build the responsive business table with exact-run detail links, null states, badges, and pagination controls.  
**Where:** `src/components/leads/lead-table.tsx` and tests  
**Depends on:** RLB-T010, RLB-T012  
**Reuses:** `LeadSummary`, formatters, labels  
**Requirements:** RLB-05, RLB-08, RLB-12, RLB-13, RLB-15  
**Tools:** `UI`  
**Tests:** Component  
**Gate:** Focused component + typecheck  
**Done when:**

- [x] Required business columns render with Brazilian formatting.
- [x] Null is never shown as zero.
- [x] Detail links preserve CNPJ and `leadRunId`.
- [x] Badges have neutral unknown fallback.
- [x] At least 8 display/navigation tests pass.

**Verify:** `pnpm vitest run src/components/leads/lead-table.test.tsx && pnpm typecheck`; at least `8` tests pass  
**Commit:** `feat(read-only-leads): build lead results table`

### RLB-T025: Assemble the lead list page and states

**What:** Assemble authenticated list data loading, controls, table, skeleton, no-data, no-match, and safe error states.  
**Where:** `src/app/(private)/leads/page.tsx`, route-level loading/error files as needed, with tests  
**Depends on:** RLB-T018, RLB-T019, RLB-T022, RLB-T023, RLB-T024  
**Reuses:** Private shell and lead components  
**Requirements:** RLB-01, RLB-02, RLB-03, RLB-05, RLB-09, RLB-15  
**Tools:** `UI`  
**Tests:** Page/component  
**Gate:** Focused page tests + lint + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The authenticated private
experience requests only the current URL-bounded API page and presents
distinct loading, empty, no-match, populated, and safe error states.
**Done when:**

- [x] Loading, no data, no matching filters, API error, and populated states are distinct.
- [x] Filters remain in the URL and error details remain safe.
- [x] No full-dataset client filtering/sorting occurs.
- [x] Scope copy describes eligible, readable, retained decisions and does not imply an authoritative inventory.
- [x] At least 7 page-state tests pass.

**Verify:** `pnpm vitest run 'src/app/(private)/leads' && pnpm lint && pnpm typecheck`; at least `7` tests pass  
**Commit:** `feat(read-only-leads): assemble lead list experience`

### RLB-T026: Implement the lead detail repository

**What:** Query one exact/latest decision and return the approved
`omitted_by_policy` report/evidence states without querying content tables.
**Where:** `src/server/repositories/lead-detail-repository.ts` and tests  
**Depends on:** RLB-T009, RLB-T011, RLB-T015  
**Reuses:** Approved production/report predicates and detail mapper  
**Requirements:** RLB-04, RLB-05, RLB-07, RLB-10, RLB-12, RLB-15, RLB-18  
**Tools:** `CORE`, optional `DB-READ` for approved synthetic integration  
**Tests:** Repository unit plus approved non-production integration  
**Gate:** Focused repository tests + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The server-only repository
selects one CNPJ-bound current decision, optionally requires its exact run, and
returns report/evidence only as `omitted_by_policy` without querying content.
**Done when:**

- [x] Default and exact-`leadRunId` selection are CNPJ-bound.
- [x] No report/evidence content column or table is selected under the current
  empty semantic allowlist.
- [x] Report/evidence states are `omitted_by_policy`; no absence, integrity, or
  multiplicity claim is inferred without a query.
- [x] Optional contact join remains disabled unless PII approval exists.
- [x] At least 14 repository tests pass.

**Verify:** `pnpm vitest run src/server/repositories/lead-detail-repository.test.ts && pnpm typecheck`; at least `14` tests pass  
**Commit:** `feat(read-only-leads): query lead detail read-only`

### RLB-T027: Implement `GET /api/leads/:cnpj`

**What:** Add the authenticated validated detail route with optional exact `leadRunId`.  
**Where:** `src/app/api/leads/[cnpj]/route.ts` and tests  
**Depends on:** RLB-T013, RLB-T020, RLB-T026  
**Reuses:** CNPJ/run validators, repository, safe errors  
**Requirements:** RLB-01, RLB-04, RLB-09, RLB-10, RLB-15  
**Tools:** `CORE`  
**Tests:** Route integration  
**Gate:** Focused route tests + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The authenticated GET-only
route validates the exact CNPJ and optional run selector, returns the mapped
policy-gated detail, and maps missing or mismatched selections to the same safe
private/no-store response.
**Done when:**

- [x] Invalid CNPJ/run returns safe `400`.
- [x] Missing or mismatched lead returns safe `404`.
- [x] Success returns only `LeadDetail`.
- [x] GET response is private/no-store.
- [x] At least 9 route tests pass.

**Verify:** `pnpm vitest run 'src/app/api/leads/[cnpj]/route.test.ts' && pnpm typecheck`; at least `9` tests pass  
**Commit:** `feat(read-only-leads): expose lead detail API`

### RLB-T028: Build the policy-gated strategic report state

**What:** Render the approved withheld/omitted report state. Markdown and
evidence links remain outside this task while the semantic allowlist is empty.
**Where:** `src/components/leads/strategic-report.tsx` and tests  
**Depends on:** RLB-T007, RLB-T015  
**Reuses:** `StrategicReport` contract and URL policy  
**Requirements:** RLB-05, RLB-07, RLB-15, RLB-18  
**Tools:** `UI`, `CURRENT-DOCS`  
**Tests:** Component/security  
**Gate:** Focused component + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The report component presents
policy omission, missing, and unavailable as distinct accessible states while
accepting no Markdown, HTML, evidence text, or evidence URL content.
**Done when:**

- [x] No Markdown, raw HTML, evidence text, or evidence URL input is accepted or
  rendered.
- [x] The `omitted_by_policy` state is distinct from missing and unavailable.
- [x] Tests prove XSS sanitization is not treated as privacy approval.
- [x] At least 6 policy-state tests pass.

**Verify:** `pnpm vitest run src/components/leads/strategic-report.test.tsx && pnpm typecheck`; at least `6` tests pass
**Commit:** `feat(read-only-leads): show withheld strategic report state`

### RLB-T029: Build the lead identity and recommendation summary

**What:** Build the detail header and stored recommendation/score/priority/trust summary with unavailable and confidence states.  
**Where:** `src/components/leads/lead-detail-summary.tsx` and tests  
**Depends on:** RLB-T010, RLB-T012  
**Reuses:** `LeadDetail`, formatters, label maps  
**Requirements:** RLB-04, RLB-05, RLB-08, RLB-13, RLB-15  
**Tools:** `UI`  
**Tests:** Component  
**Gate:** Focused component + typecheck  
**Done when:**

- [x] Stored values render without recalculation.
- [x] Missing score/action/reason remain unavailable.
- [x] Low and unknown confidence are visually distinct.
- [x] At least 7 component tests pass.

**Verify:** `pnpm vitest run src/components/leads/lead-detail-summary.test.tsx && pnpm typecheck`; at least `7` tests pass  
**Commit:** `feat(read-only-leads): build lead decision summary`

### RLB-T030: Build lead facts, risks, signals, and evidence sections

**What:** Build the company/fiscal/commercial facts and the approved null-aware
insight collection states without accepting risk, signal, or evidence content
while the semantic allowlist remains empty.
**Where:** `src/components/leads/lead-insights.tsx` and tests  
**Depends on:** RLB-T010, RLB-T012, RLB-T028  
**Reuses:** `LeadDetail` and safe evidence presentation  
**Requirements:** RLB-04, RLB-05, RLB-07, RLB-08, RLB-15, RLB-18  
**Tools:** `UI`  
**Tests:** Component  
**Gate:** Focused component + typecheck  
**Done when:**

- [x] Missing, explicit-empty, unavailable, and policy-omitted collections use
  different business copy.
- [x] Text revenue/employee values are not falsely formatted as numbers.
- [x] No risk, signal, evidence text, or evidence URL input is accepted or
  rendered while the semantic allowlist remains empty.
- [x] Runtime malformed or unapproved extras are ignored; evidence remains
  non-clickable and uses a clear withheld state.
- [x] At least 10 complete/null/empty/malformed tests pass.

**Verify:** `pnpm vitest run src/components/leads/lead-insights.test.tsx && pnpm typecheck`; at least `10` tests pass  
**Commit:** `feat(read-only-leads): build lead insight sections`

### RLB-T031: Build the lead audit section

**What:** Build a collapsed advanced audit section for exact decision/run/batch/source/hash/version/provenance fields.  
**Where:** `src/components/leads/lead-audit.tsx` and tests  
**Depends on:** RLB-T010, RLB-T012  
**Reuses:** `LeadAudit` contract  
**Requirements:** RLB-05, RLB-12, RLB-15  
**Tools:** `UI`  
**Tests:** Component  
**Gate:** Focused component + typecheck  
**Done when:**

- [x] All approved audit identifiers are preserved and labeled in Portuguese.
- [x] No raw JSON or technical error is exposed.
- [x] Null optional fields show unavailable.
- [x] At least 6 audit tests pass.

**Verify:** `pnpm vitest run src/components/leads/lead-audit.test.tsx && pnpm typecheck`; at least `6` tests pass  
**Commit:** `feat(read-only-leads): build lead audit details`

### RLB-T032: Assemble the lead detail page and states

**What:** Assemble exact-run detail loading, not-found, API-error, unavailable-data, and populated states.  
**Where:** `src/app/(private)/leads/[cnpj]/page.tsx`, loading/error files as needed, with tests  
**Depends on:** RLB-T019, RLB-T027, RLB-T028, RLB-T029, RLB-T030, RLB-T031  
**Reuses:** Detail components and private shell  
**Requirements:** RLB-01, RLB-04, RLB-05, RLB-07, RLB-09, RLB-12, RLB-13, RLB-15  
**Tools:** `UI`  
**Tests:** Page/component  
**Gate:** Focused page tests + lint + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The authenticated detail page
preserves exact CNPJ/run selection through the application API and safely
assembles loading, not-found, unavailable, error, stale, missing/withheld
content, nullable, and populated states.
**Done when:**

- [x] CNPJ and optional run stay in the request contract.
- [x] Loading, not-found, error, missing/withheld report/evidence, stale, and complete states render safely.
- [x] No raw payload or client database access exists.
- [x] At least 9 page-state tests pass.

**Verify:** `pnpm vitest run 'src/app/(private)/leads/[cnpj]' && pnpm lint && pnpm typecheck`; at least `9` tests pass  
**Commit:** `feat(read-only-leads): assemble lead detail experience`

### RLB-T033: Implement the lead history repository

**What:** Query paginated distinct completed/superseded decisions for a CNPJ with current-decision marking and no event fallback.  
**Where:** `src/server/repositories/lead-history-repository.ts` and tests  
**Depends on:** RLB-T004, RLB-T009, RLB-T011, RLB-T016  
**Reuses:** Approved history gate and mapper  
**Requirements:** RLB-05, RLB-06, RLB-10, RLB-12, RLB-15  
**Tools:** `CORE`, optional `DB-READ` for approved synthetic integration  
**Tests:** Repository unit plus approved non-production integration  
**Gate:** Focused repository tests + typecheck  
**Execution status:** **COMPLETE (2026-07-02).** The server-only repository
returns exact-CNPJ retained terminal rows in deterministic pages, marks the
current item by the exact terminal decision ID, and fails closed above the
six-row history ceiling without event, processing-view, or JSON fallback.
**Done when:**

- [x] Exact decision/run rows remain distinct.
- [x] Superseded rows remain visible and current item is exact.
- [x] Count/pagination are deterministic.
- [x] No processing table/view is queried.
- [x] Metadata identifies retained-only history unless completeness was proven.
- [x] At least 10 repository tests pass.

**Verify:** `pnpm vitest run src/server/repositories/lead-history-repository.test.ts && pnpm typecheck`; at least `10` tests pass  
**Commit:** `feat(read-only-leads): query lead history read-only`

### RLB-T034: Implement `GET /api/leads/:cnpj/history`

**What:** Add the authenticated validated paginated history route or approved unavailable behavior.  
**Where:** `src/app/api/leads/[cnpj]/history/route.ts` and tests  
**Depends on:** RLB-T013, RLB-T020, RLB-T033  
**Reuses:** History validator, repository, safe errors  
**Requirements:** RLB-01, RLB-06, RLB-09, RLB-10, RLB-15  
**Tools:** `CORE`  
**Tests:** Route integration  
**Gate:** Focused route tests + typecheck  
**Execution status:** **COMPLETE (2026-07-03).** The authenticated GET-only
route validates normalized CNPJ and bounded pagination before repository
access, preserves retained-only metadata exactly, and maps availability,
database, and unexpected failures to private no-store safe responses.
**Done when:**

- [x] GET only, auth-first, bounded pagination.
- [x] Availability/completeness metadata matches approved policy.
- [x] Unless completeness is proven, metadata includes the approved retained-history label and mandatory older-analysis caveat.
- [x] Errors expose no event/retention internals.
- [x] At least 8 route tests pass.

**Verify:** `pnpm vitest run 'src/app/api/leads/[cnpj]/history/route.test.ts' && pnpm typecheck`; at least `8` tests pass  
**Commit:** `feat(read-only-leads): expose lead history API`

### RLB-T035: Build the history/audit UI

**What:** Add reverse-chronological exact-run retained history with current/superseded labels and unavailable/incomplete states.  
**Where:** `src/components/leads/lead-history.tsx` and detail-page integration test  
**Depends on:** RLB-T012, RLB-T032, RLB-T034  
**Reuses:** `LeadHistoryItem`, exact-run detail links  
**Requirements:** RLB-05, RLB-06, RLB-08, RLB-12, RLB-15  
**Tools:** `UI`  
**Tests:** Component/page integration  
**Gate:** Focused component + typecheck  
**Execution status:** **COMPLETE (2026-07-03).** The detail page now loads
retained-only decision history exclusively through the authenticated history
API, preserves response order and exact-run links, and presents current,
superseded, nullable, empty, unavailable, unexpected-error, and malformed
states without event or retry fallbacks.
**Done when:**

- [x] Each item links to its own `leadRunId`.
- [x] Current/superseded and null values are clear.
- [x] No event/retry timeline is presented.
- [x] It uses “Histórico disponível” or “Análises retidas encontradas” and states that older analyses may not be present unless completeness is proven.
- [x] It never claims to be every analysis ever produced or a complete audit trail without proof.
- [x] At least 8 history-state tests pass.

**Verify:** `pnpm vitest run src/components/leads/lead-history.test.tsx && pnpm typecheck`; at least `8` tests pass  
**Commit:** `feat(read-only-leads): build lead decision history`

### RLB-T035A: Align the producer provenance contract

**What:** Approve the current producer's production predicate, run/batch
identity formats, terminal aggregate source, and the narrow RLB-T036 release.
**Where:** `.specs/features/read-only-lead-browser/{spec,context,design,tasks}.md`
**Depends on:** RLB-T035
**Reuses:** RLB-T003/RLB-T004 decisions and aggregate producer evidence
**Requirements:** RLB-04, RLB-05, RLB-12, RLB-14, RLB-18
**Tools:** `DOCS`
**Tests:** None — documentation gate
**Gate:** Structural/scope review
**Execution status:** **COMPLETE (2026-07-03).** The gate accepts null or exact
`SR_<source_row>` provenance, 8/64-hex run IDs, opaque
`empresaqui_<timestamp ISO>` batch IDs, and terminal-run aggregates without
`lead_import_batches`. Only RLB-T036 is released.
**Done when:**

- [x] Explicit test/audit identifiers remain excluded.
- [x] Exact accepted run and batch identities are documented.
- [x] Raw workflow exports and CSVs remain outside Git.
- [x] RLB-T036 is executable and RLB-T037–RLB-T040 remain blocked.

**Verify:** Contract review plus `git diff --check`
**Commit:** `docs(read-only-leads): align producer provenance contract`

### RLB-T036: Implement `BatchSourceSummary` mapper

**What:** Map only approved terminal-decision aggregate metadata without
progress inference.
**Where:** `src/types/imports.ts`, `src/server/mappers/batch-source-mapper.ts`
and tests
**Depends on:** RLB-T035A, RLB-T010, RLB-T012
**Reuses:** RLB-T035A minimal DTO field map
**Requirements:** RLB-05, RLB-12, RLB-14, RLB-15  
**Tools:** `CORE`  
**Tests:** Unit  
**Gate:** Focused unit + typecheck  
**Execution status:** **COMPLETE (2026-07-03).** The five-field DTO and mapper
preserve the opaque batch ID, normalize aggregate `run_created_at` bounds to
ISO, retain real zero counts, reject invalid values safely, and expose no
operational or progress metadata. All 15 focused mapper tests and typecheck
pass.
**Done when:**

- [x] Only the five approved DTO fields exist.
- [x] Dates are ISO values derived from aggregate `run_created_at` columns.
- [x] Zero counts remain valid; negative/fractional counts fail safely.
- [x] Batch IDs are preserved exactly and operational metadata is absent.
- [x] At least 8 mapper tests pass.

**Verify:** `pnpm vitest run src/server/mappers/batch-source-mapper.test.ts && pnpm typecheck`; at least `8` tests pass
**Commit:** `feat(read-only-leads): map batch source metadata`

### RLB-T037: Implement the batch/source repository — conditional P2

**What:** Query paginated batch metadata and eligible decision aggregates using SELECT-only parameterized SQL.  
**Where:** `src/server/repositories/batch-source-repository.ts` and tests  
**Depends on:** RLB-T009, RLB-T011, RLB-T036  
**Reuses:** Approved batch predicate and mapper  
**Requirements:** RLB-03, RLB-10, RLB-12, RLB-14, RLB-15  
**Tools:** `CORE`, optional `DB-READ` for approved synthetic integration  
**Tests:** Repository unit plus approved non-production integration  
**Gate:** Focused repository tests + typecheck  
**Execution status:** **BLOCKED by RLB-T035A.** No repository source/query
contract is approved; RLB-T036 does not authorize this task.
**Done when:**

- [ ] A separate approval defines an aggregate query over eligible terminal
  decisions without `lead_import_batches`.
- [ ] No progress percentage or legacy flow view exists.
- [ ] Count/data predicates and sorting are deterministic.
- [ ] At least 10 repository tests pass.

**Verify:** `pnpm vitest run src/server/repositories/batch-source-repository.test.ts && pnpm typecheck`; at least `10` tests pass  
**Commit:** `feat(read-only-leads): query batch source metadata`

### RLB-T038: Implement `GET /api/imports` — conditional P2

**What:** Add authenticated validated pagination for batch/source summaries.  
**Where:** `src/app/api/imports/route.ts` and tests  
**Depends on:** RLB-T013, RLB-T020, RLB-T037  
**Reuses:** Batch validator/repository/error mapper  
**Requirements:** RLB-01, RLB-03, RLB-09, RLB-10, RLB-14, RLB-15  
**Tools:** `CORE`  
**Tests:** Route integration  
**Gate:** Focused route tests + typecheck  
**Execution status:** **BLOCKED by RLB-T035A.** RLB-T036 does not authorize an
API surface.
**Done when:**

- [ ] Only GET exists; no body/import trigger is accepted.
- [ ] Pagination/filters/sorts are bounded.
- [ ] Response contains no raw manifest/file hash/progress.
- [ ] At least 8 route tests pass.

**Verify:** `pnpm vitest run src/app/api/imports/route.test.ts && pnpm typecheck`; at least `8` tests pass  
**Commit:** `feat(read-only-leads): expose batch source list API`

### RLB-T039: Implement `GET /api/imports/:id` — conditional P2

**What:** Add authenticated exact batch metadata lookup with safe not-found handling.  
**Where:** `src/app/api/imports/[id]/route.ts` and tests  
**Depends on:** RLB-T013, RLB-T020, RLB-T037  
**Reuses:** Batch ID validator/repository/error mapper  
**Requirements:** RLB-01, RLB-09, RLB-10, RLB-14, RLB-15  
**Tools:** `CORE`  
**Tests:** Route integration  
**Gate:** Focused route tests + typecheck  
**Execution status:** **BLOCKED by RLB-T035A.** RLB-T036 does not authorize an
API surface.
**Done when:**

- [ ] Invalid ID returns `400`; absent ID returns safe `404`.
- [ ] Only GET exists and no producer operation is possible.
- [ ] Response includes a filtered lead-list link contract only.
- [ ] At least 6 route tests pass.

**Verify:** `pnpm vitest run 'src/app/api/imports/[id]/route.test.ts' && pnpm typecheck`; at least `6` tests pass  
**Commit:** `feat(read-only-leads): expose batch source detail API`

### RLB-T040: Build the batch/source UI — conditional P2

**What:** Build batch metadata list/detail views and link to filtered leads without progress semantics.  
**Where:** `src/app/(private)/imports/`, `src/components/imports/` with tests  
**Depends on:** RLB-T012, RLB-T019, RLB-T038, RLB-T039  
**Reuses:** Private shell and `BatchSourceSummary`  
**Requirements:** RLB-05, RLB-08, RLB-12, RLB-14, RLB-15  
**Tools:** `UI`  
**Tests:** Component/page  
**Gate:** Focused UI + lint + typecheck  
**Execution status:** **BLOCKED by RLB-T035A.** RLB-T036 does not authorize a
batch/source screen or navigation.
**Done when:**

- [ ] Expected/null counts and persisted-decision labels are exact.
- [ ] No upload, trigger, retry, polling, or progress control exists.
- [ ] An approval review confirms the screen cannot reasonably be mistaken for import progress; otherwise this task remains deferred.
- [ ] Loading, empty, no-match, not-found, and API-error states exist.
- [ ] At least 9 UI tests pass.

**Verify:** `pnpm vitest run 'src/app/(private)/imports' src/components/imports && pnpm lint && pnpm typecheck`; at least `9` tests pass  
**Commit:** `feat(read-only-leads): build batch source browser`

### RLB-T041: Run final verification and scope audit

**What:** Run all quality gates and audit auth, API validation, server-only DB access, sensitive data, UI states, and prohibited capabilities.  
**Where:** Whole repository; testing notes in task status/PR summary  
**Depends on:** RLB-T025, RLB-T032, RLB-T035; RLB-T040 only if P2 approved  
**Reuses:** Definition of done and requirement traceability  
**Requirements:** RLB-01 through RLB-18  
**Tools:** `CORE`, `DOCS`; `UI` for visual state review  
**Tests:** Full suite and manual security/scope review  
**Gate:** Full  
**Done when:**

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] Test count is at least the prior recorded baseline; no silent deletions.
- [ ] Auth failures, validation, null states, content safety, and safe errors are verified.
- [ ] Enabled query controls match the approved performance capability matrix and no deferred broad/expensive control appears.
- [ ] Retained-history wording and report/evidence redaction/omission policy are verified independently from XSS safety.
- [ ] Static audit finds no client DB secret/import, n8n call/config, CSV upload, import POST, reprocess, export, lead write, or production migration.
- [ ] Screenshots, if produced, contain synthetic data only.
- [ ] Every enabled requirement is `Verified`; conditional deferred requirements are labeled `Deferred`, not falsely complete.

**Verify:**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
rg -n -i "n8n|webhook|csv upload|reprocess|POST /api/imports|DATABASE_URL" src package.json .env.example
```

Review each match; expected prohibited implementation count is `0`.  
**Commit:** `chore(read-only-leads): verify read-only MVP`

## Requirement-to-Task Traceability

| Requirement | Tasks |
| --- | --- |
| RLB-01 Authentication/private access | T003, T008, T017–T020, T022, T025, T027, T032, T034, T038–T041 |
| RLB-02 Latest decision selection | T001–T003, T005, T014, T021, T025, T041 |
| RLB-03 Server filtering/sorting/pagination | T005, T011, T021–T025, T037–T041 |
| RLB-04 Safe lead detail | T004, T010, T015, T026–T032, T041 |
| RLB-05 Null/empty/unavailable integrity | T002, T010, T012, T014–T016, T021, T024–T041 |
| RLB-06 Safe history | T001–T004, T016, T033–T035, T041 |
| RLB-07 Markdown/URL safety | T004, T015, T026, T028, T030, T032, T041 |
| RLB-08 Brazilian formatting | T012, T023–T025, T029–T032, T035, T040–T041 |
| RLB-09 API envelopes/errors | T011, T013, T020, T022, T025, T027, T032, T034, T038–T041 |
| RLB-10 Server-only read security | T003, T008–T009, T013, T017, T019–T022, T026–T027, T033–T034, T037–T041 |
| RLB-11 No n8n/write/migration | T001, T006, T008–T009, T041 |
| RLB-12 Audit identity | T001, T010, T014–T016, T021, T024, T026, T031–T041 |
| RLB-13 Low-confidence mapping | T002–T003, T012, T014, T023–T025, T029, T032, T041 |
| RLB-14 Conditional batch/source | T001, T004, T036–T041 |
| RLB-15 Test strategy | T002–T003, T006–T041 |
| RLB-16 Production data contract and coverage audit | T001–T003, T041 |
| RLB-17 Query/performance evidence envelope | T005, T011, T021–T025, T037–T041 |
| RLB-18 Semantic report/evidence privacy | T002, T004, T015, T026, T028, T030, T032, T041 |

## Task Granularity Check

| Task | Single deliverable | Status |
| --- | --- | --- |
| T001 | Read-only scope/MVP wording approval | ✅ |
| T002 | Aggregate production contract audit | ✅ |
| T003 | Production/auth scope approval | ✅ |
| T004 | History/content/batch semantics approval | ✅ |
| T005 | Query/performance capability approval | ✅ |
| T006 | Application scaffold | ✅ cohesive scaffold |
| T007 | Test/quality toolchain | ✅ cohesive configuration |
| T008 | Environment contract | ✅ |
| T009 | Database client | ✅ |
| T010 | Domain DTO module | ✅ |
| T011 | Query validator module | ✅ |
| T012 | Formatting/label utility layer | ✅ cohesive pure utilities |
| T013 | API error mapper | ✅ |
| T014 | Summary mapper | ✅ |
| T015 | Detail mapper | ✅ |
| T016 | History mapper | ✅ |
| T017 | Server auth configuration | ✅ |
| T018 | Login screen | ✅ |
| T019 | Private layout | ✅ |
| T020 | API auth guard | ✅ |
| T021 | List repository | ✅ |
| T022 | One list endpoint | ✅ |
| T023 | Filter component | ✅ |
| T024 | Results table component | ✅ |
| T025 | List-page orchestration | ✅ |
| T026 | Detail repository | ✅ |
| T027 | One detail endpoint | ✅ |
| T028 | Report renderer component | ✅ |
| T029 | Detail summary component | ✅ |
| T030 | Insight component | ✅ |
| T031 | Audit component | ✅ |
| T032 | Detail-page orchestration | ✅ |
| T033 | History repository | ✅ |
| T034 | One history endpoint | ✅ |
| T035 | History component/integration | ✅ |
| T036 | Batch mapper | ✅ |
| T037 | Batch repository | ✅ |
| T038 | One batch-list endpoint | ✅ |
| T039 | One batch-detail endpoint | ✅ |
| T040 | Conditional batch screen slice | ✅ cohesive conditional UI |
| T041 | Final verification gate | ✅ |

## Diagram–Definition Cross-Check

| Task | Depends on in task | Diagram shows | Status |
| --- | --- | --- | --- |
| T001 | None | Start | ✅ |
| T002 | T001 | T001 → T002 | ✅ |
| T003 | T002 | T002 → T003 | ✅ |
| T004 | T003 | T003 → T004 | ✅ |
| T005 | T004 | T004 → T005 | ✅ |
| T006 | T005 | T005 → T006 | ✅ |
| T007 | T006 | T006 → T007 | ✅ |
| T008 | T007 | T007 → T008 | ✅ |
| T009 | T008 | T008 → T009 | ✅ |
| T010 | T007 | T007 → T010 | ✅ |
| T011 | T010 | T010 → T011 | ✅ |
| T012 | T010 | T010 → T012 | ✅ |
| T013 | T007 | T007 → T013 | ✅ |
| T014 | T010, T012 | T010/T012 → T014 | ✅ |
| T015 | T010, T012 | T010/T012 → T015 | ✅ |
| T016 | T010, T012 | T010/T012 → T016 | ✅ |
| T017 | T003, T005, T007, T008 | T003/T005/T007/T008 → T017 | ✅ |
| T018 | T017 | T017 → T018 | ✅ |
| T019 | T017 | T017 → T019 | ✅ |
| T020 | T017 | T017 → T020 | ✅ |
| T021 | T009, T011, T014 | T009/T011/T014 → T021 | ✅ |
| T022 | T013, T020, T021 | T013/T020/T021 → T022 | ✅ |
| T023 | T011, T012, T019 | T011/T012/T019 → T023 | ✅ |
| T024 | T010, T012 | T010/T012 → T024 | ✅ |
| T025 | T018, T019, T022, T023, T024 | All five → T025 | ✅ |
| T026 | T009, T011, T015 | T009/T011/T015 → T026 | ✅ |
| T027 | T013, T020, T026 | T013/T020/T026 → T027 | ✅ |
| T028 | T007, T015 | T007/T015 → T028 | ✅ |
| T029 | T010, T012 | T010/T012 → T029 | ✅ |
| T030 | T010, T012, T028 | T010/T012/T028 → T030 | ✅ |
| T031 | T010, T012 | T010/T012 → T031 | ✅ |
| T032 | T019, T027–T031 | All six → T032 | ✅ |
| T033 | T004, T009, T011, T016 | All four → T033 | ✅ |
| T034 | T013, T020, T033 | All three → T034 | ✅ |
| T035 | T012, T032, T034 | All three → T035 | ✅ |
| T036 | T004, T010, T012 | All three → T036 | ✅ |
| T037 | T009, T011, T036 | All three → T037 | ✅ |
| T038 | T013, T020, T037 | All three → T038 | ✅ |
| T039 | T013, T020, T037 | All three → T039 | ✅ |
| T040 | T012, T019, T038, T039 | All four → T040 | ✅ |
| T041 | T025, T032, T035; T040 if enabled | Same final gate | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task includes | Status |
| --- | --- | --- | --- | --- |
| T001–T005 | Docs/evidence | Structural review | Scope, contract, policy, and performance gates | ✅ |
| T006 | Scaffold | Build smoke | Lint + build | ✅ |
| T007 | Test config | Config smoke | Full baseline + smoke test | ✅ |
| T008 | Config/env | Unit | 4+ env tests | ✅ |
| T009 | DB client | Unit/integration | 4+ unit; approved smoke | ✅ |
| T010 | Types | Typecheck | Typecheck | ✅ |
| T011 | Validators | Unit | 25+ unit tests | ✅ |
| T012 | Formatters/labels | Unit | 20+ unit tests | ✅ |
| T013 | Error mapper | Unit | 8+ unit tests | ✅ |
| T014 | Summary mapper | Unit | 10+ unit tests | ✅ |
| T015 | Detail mapper | Unit | 18+ unit tests | ✅ |
| T016 | History mapper | Unit | 8+ unit tests | ✅ |
| T017 | Auth server | Integration | 6+ auth tests | ✅ |
| T018 | Login UI | Component | 4+ component tests | ✅ |
| T019 | Private layout | Component/integration | 4+ session tests | ✅ |
| T020 | API guard | Unit/integration | 5+ guard tests | ✅ |
| T021 | List repository | Unit/integration | 14+ repository tests | ✅ |
| T022 | List API | Route integration | 10+ route tests | ✅ |
| T023 | Filters UI | Component | 8+ interaction tests | ✅ |
| T024 | Table UI | Component | 8+ display tests | ✅ |
| T025 | List page | Page/component | 7+ state tests | ✅ |
| T026 | Detail repository | Unit/integration | 14+ repository tests | ✅ |
| T027 | Detail API | Route integration | 9+ route tests | ✅ |
| T028 | Report renderer | Component/security | 10+ safety tests | ✅ |
| T029 | Detail summary | Component | 7+ component tests | ✅ |
| T030 | Insights UI | Component | 10+ state tests | ✅ |
| T031 | Audit UI | Component | 6+ component tests | ✅ |
| T032 | Detail page | Page/component | 9+ state tests | ✅ |
| T033 | History repository | Unit/integration | 10+ repository tests | ✅ |
| T034 | History API | Route integration | 8+ route tests | ✅ |
| T035 | History UI | Component/integration | 8+ state tests | ✅ |
| T036 | Batch mapper | Unit | 7+ unit tests | ✅ |
| T037 | Batch repository | Unit/integration | 10+ repository tests | ✅ |
| T038 | Batch list API | Route integration | 8+ route tests | ✅ |
| T039 | Batch detail API | Route integration | 6+ route tests | ✅ |
| T040 | Batch UI | Component/page | 9+ state tests | ✅ |
| T041 | Whole product | Full suite | Full gates + scope audit | ✅ |

All three mandatory pre-approval checks pass: task granularity, dependency-diagram consistency, and test co-location.

## Stop Condition

This document completes the Tasks phase only. No implementation, page, route,
dependency installation, n8n action, write, or migration is authorized.
`RLB-T001` through `RLB-T004` are complete. RLB-T004 approved retained-only
history wording and the sensitive-content policy while deferring current
report/evidence exposure, contact snapshots, and batch/source screens/routes.
RLB-T005 subsequently approved the bounded query envelope. RLB-T001 through
RLB-T005 are complete and the design/task plan is approved. Bootstrap remains
the separate RLB-T006 task and was not started.
