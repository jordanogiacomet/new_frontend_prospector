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
| T22 | R2, R3, R8, R10, AC7 | Broaden the single company-name query to Brazil, prioritize local matches and preserve the provider's first result as fallback | Executable workflow contract, component copy test, full gates and guarded same-ID replacement | Done |
| T23 | R2, R3, R8, R10, AC7, AC10 | Version `priority-profile-search-v1`, its exact-company/title-filter contract, billing disclosure and no-fallback semantics | Spec/design/contract traceability review | Done |
| T24 | R2, R3, R8, R9, AC1, AC10 | Replace the generic Decision Makers preview branch with one strict Contacts Prospecting priority-profile request | RED/GREEN executable workflow contract and safe callback tests | Done |
| T25 | R10, AC7, AC10 | Share the title-alias taxonomy with the workflow contract and correct the query/billing/empty-result UI copy | Unit and component tests | Done |
| T26 | AC1–AC10 | Run full gates and replace only the approved Demo 3 v2 copy without a real provider request | Preflight, zero-execution assertion and authenticated smoke | Done |
| T27 | R2, R3, R10, AC10 | Record the Demo 3 Contacts Prospecting `403` and approve a one-call Decision Makers compatibility fallback | Synthetic no-PII probe and contract review | Done |
| T28 | R2, R3, R8, R9, AC1, AC10 | Request one exact-company sample of up to 100 Decision Makers and locally retain at most 10 shared priority-title matches | RED/GREEN executable workflow contract | Done |
| T29 | R10, AC7, AC10 | Replace search-credit copy with honest free-sample and non-exhaustive-result copy | Component RED/GREEN tests | Done |
| T30 | AC1–AC10 | Run gates and replace only the approved Demo 3 v2 workflow with rollback protection | Preflight, synthetic probe and zero-execution assertion | Done |
| T31 | R2, R3, R10, AC10 | Version exact, adjacent and generic Decision Makers fallback tiers while keeping exact-only commercial scoring | Spec and contract traceability review | Done |
| T32 | R2, R3, R8, R9, AC1, AC10 | Rank exact and adjacent candidates, then use first valid generic candidates only when no relevant tier exists | RED/GREEN executable workflow contract | Done |
| T33 | R10, AC7, AC10 | Explain fallback tiers and exact-only scoring in the queue UI | Component RED/GREEN tests | Done |
| T34 | AC1–AC10 | Run full gates and replace only the approved Demo 3 v2 workflow with rollback protection | Preflight, synthetic probe and zero-execution assertion | Done |
| T35 | R2, R3, R6–R10, AC11 | Version the exact-domain corporate-phone last fallback and its display-only policy | Spec and contract traceability review | Done |
| T36 | R2, R6–R9, AC1, AC2, AC11 | Add migration 012 and encrypted request-scoped phone persistence with suppression check and retention erasure | Unit, migration and role-isolation tests | Done |
| T37 | R2, R3, R8, R9, AC1, AC11 | Carry one sanitized Apollo organization phone only through an empty Apollo People result | RED/GREEN executable workflow contract | Done |
| T38 | R3, R10, AC7, AC11 | Present the phone separately with unknown contactability, no dial link and no score action | Component RED/GREEN tests | Done |
| T39 | AC1–AC11 | Run full gates and guarded Demo 3 app/workflow rollout without a provider request | Preflight, migration, readiness and zero-call assertion | Done |

No task commits independently because the worktree already contains uncommitted
owner changes. Atomic task boundaries are recorded here instead.
