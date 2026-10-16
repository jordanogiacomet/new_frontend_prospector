# Commercial queue approach v1 — Tasks

**Design**: `.specs/features/commercial-queue-approach-v1/design.md`
**Status**: Baseline and extension tasks complete and deployed to Demo 3

All tasks are sequential in the primary agent. The shared worktree is already
dirty, and repository instructions do not authorize unsolicited sub-agents or
taking ownership of unrelated changes.

## Execution plan

```text
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9 -> T10 -> T11
```

| Task | Deliverable | Depends on | Tests / gate | Requirements | Status |
| --- | --- | --- | --- | --- | --- |
| T1 | Add migration 015 and rollback for the app-owned draft claim/cache | None | PostgreSQL integration / integration | CQA-04, CQA-05 | Complete — 22 passed |
| T2 | Add the claim/list/complete/fail cache repository | T1 | Unit + PostgreSQL integration / integration | CQA-04..CQA-07 | Complete — 5 unit + 2 integration passed |
| T3 | Add cached preparation service and integrate the protected route | T2 | Service + route unit / quick | CQA-03, CQA-05..CQA-07 | Complete — 12 passed |
| T4 | Decorate authorized work-queue items with draft state and capability meta | T3 | Repository + route unit/integration / integration | CQA-01, CQA-02, CQA-06, CQA-09 | Complete — 71 unit/route + cache integration passed |
| T5 | Add sequential automatic preparation and editable/copy UI to queue cards | T4 | Component/page unit / quick | CQA-01, CQA-02, CQA-08 | Complete — 31 passed |
| T6 | Add default-off environment flag and Demo 3 migration/config packaging | T5 | Environment + contract unit / contract | CQA-10 | Complete — 116 unit/route + 1 contract passed |
| T7 | Update project notes/traceability and run the complete local quality gate | T6 | lint, typecheck, test, integration where available, contract, build | CQA-01..CQA-10 | Complete — all local gates passed |
| T8 | Add cache-only approach GET and lead hydration | T7 | Route + component unit / quick | CQA-11..CQA-13 | Complete locally — focused tests passed |
| T9 | Expose persisted queue states for every priority while leaving absent non-B/C items ineligible | T8 | Repository + page unit / quick | CQA-11, CQA-12, CQA-14 | Complete locally — focused tests passed |
| T10 | Present the same cached draft in the commercial workspace without automatic generation | T9 | Component + page unit / quick | CQA-11, CQA-13 | Complete locally — focused tests passed |
| T11 | Update traceability/notebook and run the complete local quality gate | T10 | lint, typecheck, test, integration where applicable, contract, build | CQA-11..CQA-14 | Complete locally — all applicable gates passed |

## Task granularity check

| Task | Cohesive owner | Result |
| --- | --- | --- |
| T1 | One schema migration pair | Pass |
| T2 | One cache repository contract | Pass |
| T3 | One cached-generation flow and owning endpoint | Pass |
| T4 | One queue response decoration | Pass |
| T5 | One queue interaction/presentation | Pass |
| T6 | One release configuration surface | Pass |
| T7 | One verification/debrief deliverable | Pass |

## Diagram-definition cross-check

| Task | Declared dependency | Diagram | Result |
| --- | --- | --- | --- |
| T1 | None | Start | Match |
| T2 | T1 | T1 -> T2 | Match |
| T3 | T2 | T2 -> T3 | Match |
| T4 | T3 | T3 -> T4 | Match |
| T5 | T4 | T4 -> T5 | Match |
| T6 | T5 | T5 -> T6 | Match |
| T7 | T6 | T6 -> T7 | Match |

## Test co-location validation

| Task | Layer | Matrix requires | Planned | Result |
| --- | --- | --- | --- | --- |
| T1 | App schema | PostgreSQL integration | Integration | Match |
| T2 | Repository SQL | Unit + PostgreSQL integration | Unit + integration | Match |
| T3 | Service and route | Unit/route | Unit/route | Match |
| T4 | Repository and route | Unit + integration/route | Unit + integration/route | Match |
| T5 | React behavior | Component/unit | Component/unit | Match |
| T6 | Env and Kubernetes packaging | Unit + contract | Unit + contract | Match |
| T7 | Release-quality verification | Build/static/all tests | Full gate | Match |

## Tool and skill selection

- Local filesystem inspection, `apply_patch`, Vitest, PostgreSQL integration,
  ESLint, TypeScript and Next build.
- Official OpenAI documentation only for the existing Responses/model contract.
- `codenavi`, `coding-guidelines`, `tlc-spec-driven` and `openai-docs`.

No atomic commits will be created because all relevant source areas already
contain the owner's uncommitted work; verification evidence will be recorded
without staging or committing unrelated changes.

## Final verification — 2026-08-17

- ESLint: passed.
- Strict TypeScript (`next typegen` + `tsc --noEmit`): passed.
- Unit/component/route suite: 119 files, 2,175 tests passed.
- Disposable PostgreSQL integration: 10 files, 103 tests passed.
- Local contract suite: 10 files and 54 tests passed; 2 files and 57 remote
  cases skipped because no controlled remote target was supplied.
- Production Next.js build: passed.
- Demo 3 local configuration validation: passed with no cluster mutation.
- No OpenAI request, producer write, n8n call or outreach action was performed
  by these local checks.

## Demo 3 deployment — 2026-08-17

- Release: `demo3-preprod-20260817-commercial-queue-approach-001`.
- The first image-build attempt stopped before cluster mutation because
  `.dockerignore` excluded migration `015`; a regression contract was added,
  the one-line allowlist was fixed and both PostgreSQL packaging contracts
  passed before retry.
- Exact target and contact-TLS preflights passed again after the correction.
- Immutable app, PostgreSQL, request-edge and loopback-proxy images were
  published and rolled out.
- App and PostgreSQL pods are Ready with zero container restarts.
- Postflight confirmed the app-owned table/index and runtime `SELECT`, `INSERT`
  and `UPDATE` grants without `DELETE`.
- Queue smoke returned anonymous `401`, authenticated `200` and enabled
  auto-generation capability without retaining response data.
- Rollout/postflight made no OpenAI request, n8n call, producer write or
  outreach action.

## Shared-presentation extension verification — 2026-08-17

- Focused route, repository, lead, queue and workspace coverage: 6 files and
  139 tests passed.
- Full ESLint and strict TypeScript passed.
- Unit/component/route suite: 120 files and 2,186 tests passed.
- Local contract suite: 10 files and 54 tests passed; 2 remote files and 57
  cases were skipped because no controlled remote target was supplied.
- Sanitized production build passed with all Demo runtime flags disabled in
  the process environment; `.env.local` was not inspected or changed.
- No integration suite was required because this extension changes no schema,
  migration SQL or query contract; the existing cache query is exercised by
  repository and route coverage.
- No OpenAI request, producer write, n8n call, outreach action or deployment
  was performed during this extension.

## Shared-presentation extension deployment — 2026-08-17

- Release: `demo3-preprod-20260817-shared-approach-001`.
- Local configuration validation and exact-target/contact-TLS preflights passed
  before mutation.
- Immutable app, PostgreSQL, request-edge and loopback-proxy images were built,
  published and rolled out; app and PostgreSQL are `1/1` Ready with zero
  container restarts.
- Authenticated queue and cache-only lead reads both returned `200`; one
  existing ready draft was compared entirely in memory and matched exactly
  without retaining its CNPJ, run identifier or message.
- The app, request-edge and PostgreSQL rollout window had zero sanitized error
  markers.
- Deployment and postflight made no OpenAI POST, n8n call, producer write or
  outreach action.
