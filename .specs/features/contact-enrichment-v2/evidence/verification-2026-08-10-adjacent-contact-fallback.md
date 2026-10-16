# Adjacent and generic contact fallback verification — 2026-08-10

Status: implemented and rolled out only to the approved Demo 3 profile.

## Verified behavior

- `priority-adjacent-generic-decision-makers-fallback-v1` uses the same single
  exact-company Decision Makers request, page 0 and size 100.
- The callback mapper places exact `contact-commercial-score-v1` aliases first,
  adjacent finance/accounting aliases second and uses the provider's first
  valid candidates only when neither relevant tier exists.
- Provider order is preserved inside each tier, generic contacts are not mixed
  into a relevant result and the callback remains capped at 10 candidates.
- Adjacent and generic candidates remain display/reveal fallbacks only. A unit
  case proves that CFO and treasury titles do not change the exact-profile
  commercial score.
- No callback field, route, repository, table, migration, permission, reveal
  behavior, provider selector or producer fact changed. There is still no
  provider table, retry, second page or second operation.

## Quality evidence

- Baseline: 18 focused unit/component tests and 13 focused contract tests
  passed before the change.
- RED: the old mapper failed both new executable selection cases; the old UI
  failed the revised copy/button assertions.
- GREEN: 19 focused unit/component tests and 14 focused contract tests passed.
- Lint, strict typecheck and production build passed.
- Full unit suite passed: 102 files and 1,992 tests.
- Contract suite: 46 local tests passed; 57 remote cases stayed explicitly
  skipped because their isolated targets were not configured.
- PostgreSQL integration failed closed before running tests because
  `PROSPECTA_APP_TEST_DATABASE_URL` was absent: six suites reported the missing
  disposable target and 19 cases remained skipped. No Demo 3 or producer
  database was substituted; this change has no database surface.

## Demo 3 rollout

- Published-state preflight passed. The guarded replacement exported the prior
  workflow in process memory, replaced only `PCEv2Demo3b8L3nR`, republished it
  and passed its postflight.
- Immutable release
  `demo3-preprod-20260810-adjacent-contact-fallback-001` rolled out with one
  ready app pod and one ready PostgreSQL pod.
- Authenticated HTTPS smoke found `Buscar decisores`, `cargos próximos` and the
  exact-only score disclosure in the deployed client assets.
- One reserved-domain synthetic request returned `202 PREVIEW_DISPATCHED` and
  reached `PREVIEW_EMPTY` with zero candidates. It made no retry and processed
  no real company/contact value.
- Final n8n aggregate state for the exact workflow was zero saved executions
  and zero active executions.
- No real-contact test, channel reveal, producer mutation, new provider secret,
  route, migration or storage change occurred.

## Provider reference

- Lusha Decision Makers documentation:
  https://docs.lusha.com/apis/openapi/decision-makers
