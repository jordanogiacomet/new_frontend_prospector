# Outside-analysis detail verification — 2026-08-13

## Scope

Verified OA-07–OA-09 for a dedicated, read-only CRM-decision detail. The
implementation reuses the existing producer eligibility CTE and approved DTO;
it adds no producer field, write, analysis action, contact action or external
integration.

## Local gates

- Focused Vitest: 6 files, 175 tests passed.
- ESLint: passed with no warnings.
- Next route type generation and strict TypeScript: passed.
- Full Vitest: 109 files, 2,057 tests passed.
- Production Next build: passed; both
  `/leads/outside-analysis/[cnpj]` and
  `/api/leads/outside-analysis/[cnpj]` were emitted as dynamic routes.
- `git diff --check`: passed.

The disposable PostgreSQL variables
`PROSPECTA_APP_TEST_DATABASE_URL` and
`PROSPECTA_PRODUCER_TEST_DATABASE_URL` were unset. No integration test was
pointed at real producer data. SQL eligibility, bound parameters, correlated
visibility, zero/one/multiple-row behavior and the 1,000-projection guard were
verified with synthetic unit tests.

## Demo 3 rollout

- Immutable release:
  `demo3-preprod-20260813-outside-analysis-detail-001`.
- Exact target and contact TLS preflights passed before mutation.
- Deployment ready: 1/1; PostgreSQL ready: 1/1; total container restarts: 0.
- Anonymous list API returned 401.
- Authenticated list API returned 200 and had at least one current eligible
  row; no row value was printed or persisted as evidence.
- The first eligible CNPJ was held only in process memory. Its detail API and
  page returned 200.
- The detail response contained exactly the ten approved DTO fields and the
  same CNPJ as the selected list row.
- The rendered page shell contained its return navigation.
- An invalid CNPJ returned 400 before repository access.

No response body, company identifier, company name, action, reason, producer
value, credential or secret was recorded. The rollout made no n8n/provider
call and no producer mutation.
