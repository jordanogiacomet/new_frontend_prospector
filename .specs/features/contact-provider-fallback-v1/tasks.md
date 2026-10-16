# Contact Provider Fallback v1 — Tasks

| Task | Requirements | Verification | Status |
| --- | --- | --- | --- |
| T1 Version spec/design and provider rules | CPF-01..CPF-08 | Traceability review | Done |
| T2 Add RED contract and policy tests | CPF-01..CPF-07 | Focused tests fail before implementation | Done |
| T3 Persist encrypted provider identity compatibly | CPF-04..CPF-06 | Unit/service/repository tests | Done |
| T4 Add Apollo search and reveal workflow branches | CPF-01..CPF-05, CPF-08 | Executable n8n contract tests | Done |
| T5 Bind an existing native Apollo credential safely | CPF-08 | Preparation contract and preflight | Done in repository; remote preflight belongs to T8 |
| T6 Update contact UI and transparency | CPF-05, CPF-07 | Component tests | Done |
| T7 Complete static, unit, contract and build gates | All | Repository quality gates | Done |
| T8 Guarded Demo 3 rollout and smoke | All | Preflight, replacement, readiness and synthetic UAT | Rolled out; provider-call UAT remains an explicit operator action |
| T9 Specify corporate-phone fallback and add RED tests | CPF-09..CPF-11 | Contract, policy, repository and component tests fail before implementation | Done |
| T10 Add encrypted request-scoped company-phone storage | CPF-10 | Unit and migration contract tests | Done |
| T11 Carry the exact-domain Apollo phone through an empty People result | CPF-09 | Executable n8n contract tests | Done |
| T12 Present the fallback separately without dial link or score effect | CPF-11 | Component tests | Done |
| T13 Run full gates and guarded Demo 3 rollout | CPF-09..CPF-11 | Lint, typecheck, unit, contract, build, preflight and readiness | Done |

## Dependencies

- T3 and T4 depend on T2.
- T5 depends on T4 and an operator-created n8n Header Auth credential named
  `Apollo API Demo3` with header `x-api-key` and domain restricted to
  `api.apollo.io`.
- T8 depends on T5 and never receives the Apollo key through repository files,
  shell history or application configuration.
- T10, T11 and T12 depend on T9. T13 depends on T10 through T12.
