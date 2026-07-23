# Demo 3 correlated lead visibility — 2026-07-23

## Scope

The owner authorized a Demo 3-only exception for producer terminal runs marked
as test data. The exception requires an app-owned import submission correlated
to the authenticated organization. It does not change producer facts, broaden
Demo 2, include CRM-owned outcomes or alter the current n8n workflow.

No real producer identifier, company value, row value or database-derived
count is recorded in this evidence.

## Implementation

- Exact Demo 3 runtime and shared actor are required.
- App-owned correlation is queried with the authenticated `organizationId`.
- Correlated batch IDs remain one bound PostgreSQL `text[]` parameter.
- List, detail and retained history share the same visibility options.
- Empty correlation and all other runtimes retain the production predicate.
- Migration `007` replay is forward-compatible with the later operational
  start event introduced by `008`.

## Gates

| Gate | Result |
| --- | --- |
| Lint | Passed without warnings |
| Typecheck | Passed |
| Unit/component/route | 78 files, 1,816 tests passed |
| Disposable PostgreSQL | 9 files, 91 tests passed |
| Local/static contract | 3 files, 18 tests passed |
| Remote v1 HTTP contract | 2 suites, 57 cases skipped; separate target remains unauthorized |
| Production build | Passed with safe process-only overrides |
| Diff check | Passed |

The focused PostgreSQL case used synthetic data in two disposable databases. It
proved a production-visible row and a same-organization correlated test row
were readable while an other-organization test row and an uncorrelated test
row remained hidden. The disposable container was removed after the gates.

## Rollout

- Preflight matched the authorized Kubernetes context, HTTPS API server,
  cluster UID and non-production namespace marker before each mutation.
- Candidate tag `demo3-preprod-20260723-correlated-leads-001` was published but
  never applied to the pods because migration replay failed closed.
- The prior release remained Ready throughout that failure.
- Commit `54ec775` added a failing regression test, made migration `007`
  forward-compatible and passed the complete disposable PostgreSQL suite.
- Immutable release `demo3-preprod-20260723-correlated-leads-002` then applied
  migrations `006`–`008` and completed the Deployment and StatefulSet rollout.

## Value-free runtime verification

- Authenticated import and lead APIs returned success.
- The authorized correlated submission was visible in lead list, detail and
  retained history without recording any producer value in repository
  evidence.
- Deployment and PostgreSQL StatefulSet were Ready with zero restarts.
- Application and database-proxy logs had no sanitized error matches.
- Edge log noise was authentication-only, with no upstream failure or 5xx.
- The app and n8n callback secrets still matched, and the exact callback URL
  remained `http://192.168.0.20:30100/api/imports/events`.
- n8n remained on its existing image digest and observed deployment generation.
