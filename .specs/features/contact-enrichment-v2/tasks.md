# Contact Enrichment v2 — tasks

| ID | Requirement | Task | Verification | Status |
|---|---|---|---|---|
| T01 | R1–R11 | Version policy, LIA, design, contracts and source evidence | Traceability review | Done |
| T02 | R4, R8 | Add v2 permissions/config gates and fail-closed environment validation | Unit tests | Done |
| T03 | R2, R6–R9 | Add app-owned migration 010 and rollback | PostgreSQL migration/role-isolation tests | Done |
| T04 | R2, R6–R8 | Add strict provider mappers, authenticated encryption and suppression fingerprints | Unit tests, excluded-field tests | Done |
| T05 | R3, R4, R7–R9 | Add preview/reveal/read/suppress services and private routes | Route/service/repository tests | Done |
| T06 | R3, R8, R9 | Add separate inactive n8n v2 workflow and contract artifacts | Contract tests, `active:false`, no secrets | Done |
| T07 | R10 | Connect queue action to Prospecta v2 API with domain confirmation and terminal states | Component/page tests | Done |
| T08 | R6, R7 | Add retention-erasure and rights-request operational path | Synthetic lifecycle tests | Done |
| T09 | R11 | Add Demo 3 real-data preflight and production rollout/rollback docs | Negative preflight tests | Done |
| T10 | AC1–AC9 | Run lint, typecheck, unit, contract, integration and build | Recorded evidence | Done |
| T11 | R2, R8, R10, AC7 | Prefill one valid unambiguous company domain from the exact read-only producer columns and retain manual confirmation fallback | Repository, PostgreSQL integration, component tests and Demo 3 safe UAT | Done |
| T12 | R2, R3, R9, R10 | Version company-name lookup, allowlist, billing disclosure and explicit confirmation contract | Spec/design/contract review | Done |
| T13 | R2, R6, R8, R9 | Add migration 011 for idempotent company search and encrypted app-owned matches | PostgreSQL migration, rollback and role-isolation tests | Done |
| T14 | R2–R4, R8, R9 | Add strict company-search contracts, client, repository, service and private/callback routes | Unit and route tests | Done |
| T15 | R2, R3, R8, R9 | Extend the inactive n8n v2 artifact with Companies Search and provider-company-ID preview | Synthetic workflow contract tests | Done |
| T16 | R3, R10 | Add no-domain queue fallback, billable-search disclosure and explicit company confirmation | Component/page tests | Done |
| T17 | AC1–AC9 | Run quality gates, migration checks, Demo 3 preflight and safe rollout without a real provider request | Recorded validation evidence | Done |
| T18 | R10, AC7 | Replace duplicated queue layouts with one responsive opportunity sheet and a full-width, structured contact workspace | Component/page tests and authenticated Demo 3 smoke | Done |
| T19 | R2, R3, R9, R10, AC7 | Version company search with queue city/UF/BR filters, Lusha Prospecting Companies and visual lead-reference comparison | Unit, component and synthetic workflow contract tests | Done |
| T20 | AC1–AC9 | Run release gates, replace only the inactive/approved Demo 3 workflow copy and roll out without a provider request | Preflight, zero-execution assertion and authenticated smoke | Done |
| T21 | R2, R3, R8, AC7 | Correct the Lusha Prospecting Companies provider adapter to use the documented minimum page size and country field | RED/GREEN workflow contract, full gates and guarded same-ID n8n replacement | Done |

No task commits independently because the worktree already contains uncommitted
owner changes. Atomic task boundaries are recorded here instead.
