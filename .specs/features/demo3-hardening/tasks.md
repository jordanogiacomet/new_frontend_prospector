# Prospecta Demo 3 Hardening Tasks

**Design:** `.specs/features/demo3-hardening/design.md`
**Status:** IMPLEMENTED; DEMO 3 RELEASED

## Execution Map

```text
T01 -> T02 -> T03
  \      \-> T05 -> T06
   \-> T04
T07 -> T08 -> T09
T03 + T06 + T09 -> T10 -> T11 -> T12
```

## Tasks

### T01: Enforce lead permissions and redact audit identifiers

**Status:** Completed

**Where:** lead routes, detail mapper/types/components and co-located tests
**Depends on:** none
**Requirement:** D3-01
**Tests/Gate:** route, mapper, component unit tests; quick

**Done when:** actors without `leads:read` fail before data work and actors
without `audit:read` receive no source hash or idempotency key.

### T02: Correct assignment authorization

**Status:** Completed

**Where:** commercial workspace repository and route/integration tests
**Depends on:** none
**Requirement:** D3-01
**Tests/Gate:** unit plus disposable PostgreSQL integration when available; full

**Done when:** a writer may claim an unassigned workspace only for its own
subject; assigning another subject requires `commercial:assign`.

### T03: Correct workspace UI fact handling

**Status:** Completed

**Where:** workspace page and tests
**Depends on:** T02
**Requirement:** D3-02
**Tests/Gate:** component unit; quick

**Done when:** local time converts correctly, stale detail requests cannot win,
saving cannot discard edits, and append reloads canonical page 1.

### T04: Correct list/copy/navigation presentation defects

**Status:** Completed

**Where:** lead/import list pages, strategic report, metadata/navigation and tests
**Depends on:** T01
**Requirement:** D3-01, D3-02
**Tests/Gate:** component/page unit; quick

**Done when:** page-empty differs from dataset-empty, report copy is origin
neutral, metadata names Prospecta, and unavailable actions are permission-aware.

### T05: Correct batch evidence semantics and feature gate

**Status:** Completed

**Where:** batch mapper/service/repository and tests
**Depends on:** none
**Requirement:** D3-03
**Tests/Gate:** unit and applicable integration; full

**Done when:** distinct materialized runs conflict and a disabled observation
flag produces zero producer calls with nullable facts.

### T06: Bound/configure uploads and preserve ambiguous idempotency

**Status:** Completed

**Where:** import route/upload service/page and tests
**Depends on:** none
**Requirement:** D3-04
**Tests/Gate:** route/service/page unit; quick, then build

**Done when:** configured limits are enforced before expensive work, edge
packaging limits request size, and transport ambiguity preserves the key.

### T07: Remove free text from commercial audit metadata

**Status:** Completed

**Where:** workspace audit mapping, audit types/reader, migration and tests
**Depends on:** T02
**Requirement:** D3-05
**Tests/Gate:** unit plus disposable PostgreSQL integration; full

**Done when:** `next_action` text is absent from audit JSON and categorical
presence/change metadata remains useful.

### T08: Add audit authorization context

**Status:** Completed

**Where:** new app migration, route/service/repository context and tests
**Depends on:** T07
**Requirement:** D3-05
**Tests/Gate:** migration and repository integration; full

**Done when:** issuer, request correlation ID, and authorization basis are
stored for every new commercial mutation without sensitive request content.

### T09: Stabilize build and test gates

**Status:** Completed

**Where:** Vitest/TypeScript/package configuration and documentation
**Depends on:** none
**Requirement:** D3-06
**Tests/Gate:** lint, isolated typecheck, bounded unit suite, build

**Done when:** no gate shares mutable `.next` output concurrently and the full
unit suite completes without worker exhaustion.

### T10: Package isolated hardened Demo 3

**Status:** Completed

**Where:** new Demo 3 manifest, Docker/runtime and deploy script
**Depends on:** T03, T06, T09
**Requirement:** D3-07
**Tests/Gate:** script syntax, client dry-run, image build

**Done when:** namespace/release are distinct, access uses only the explicitly
approved Demo 3 NodePort, application runs non-root with limits and no
service-account token, and tags are immutable.

### T11: Add target preflight, smoke, and rollback

**Status:** Completed

**Where:** Demo 3 deploy script/runbook
**Depends on:** T10
**Requirement:** D3-07, D3-08
**Tests/Gate:** offline script tests plus live read-only preflight

**Done when:** context/server/cluster UID/namespace marker are exact, failed
preflight mutates nothing, and failed rollout/smoke selects the prior immutable
release.

### T12: Execute final release gate and conditional rollout

**Status:** Completed on 2026-07-17 with immutable release
`demo3-20260717-120127`. The post-reboot runtime passed the exact target
preflight, PostgreSQL initialized on a clean disposable PVC, both workloads
reached Ready with zero restarts, and HTTP/database/idempotency smoke checks
passed directly through NodePort `192.168.0.20:30100`.

**Where:** local toolchain and verified Kubernetes target
**Depends on:** T11
**Requirement:** D3-08
**Tests/Gate:** all repository gates, integration/contract when targets exist,
manifest dry-run, rollout, HTTP/browser smoke

**Done when:** results and limitations are recorded; rollout occurs only if the
target is healthy and proven non-production.

## Granularity Check

| Task | Deliverable | Status |
| --- | --- | --- |
| T01-T08 | One cohesive contract/policy correction each | OK |
| T09 | One deterministic gate profile | OK |
| T10-T12 | Packaging, operations, execution separated | OK |

## Dependency Cross-check

| Task | Depends on | Diagram | Status |
| --- | --- | --- | --- |
| T01/T02/T05/T06/T09 | none | roots | Match |
| T03 | T02 | T02 -> T03 | Match |
| T04 | T01 | T01 -> T04 | Match |
| T07 | T02 | T02 -> T07 | Match |
| T08 | T07 | T07 -> T08 | Match |
| T10 | T03, T06, T09 | join -> T10 | Match |
| T11 | T10 | T10 -> T11 | Match |
| T12 | T11 | T11 -> T12 | Match |

## Test Co-location Validation

| Tasks | Layer | Matrix requirement | Status |
| --- | --- | --- | --- |
| T01-T06 | route/service/UI | unit/route/component | Match |
| T02/T05/T07/T08 | repository/migration | unit + integration | Match |
| T09 | tooling | full build gate | Match |
| T10-T12 | Kubernetes | dry-run/build/smoke/UAT | Match |
