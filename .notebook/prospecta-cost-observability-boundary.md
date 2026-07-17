# Cost Observability Boundary
> Custo LLM existe no produtor, mas é vedado na UI atual

Entry: `docs/db/schema.sql:public.company_validation_runs`

Source: `company_validation_runs` → `company_validation_runs_costed` →
`company_validation_cost_by_batch`.
- `llm_cost_usd(...)` usa `model_pricing` efetivo por data; `NULL` sem preço.
- Views atuais somam `COALESCE(..., 0)`; zero não prova custo conhecido.
- Observações podem repetir `lead_run_id`; sem semântica aprovada de deduplicação.

Boundary: `AGENTS.md` e
`.specs/features/prospecting-console/decisions/sensitive-content-policy.md`
now permit a narrowly scoped monetary DTO behind `costs:read`; tokens and all
other cost inputs remain withheld from browser responses.

Scope: agregados do produtor não têm organização. Só lotes correlacionados em
`src/server/imports/batch-read-service.ts` podem estabelecer escopo Prospecta.

Implementation: `src/server/costs/cost-read-service.ts` obtains only
organization-correlated import batches, then
`src/server/repositories/costs/cost-read-repository.ts` reads the approved
producer columns. `src/app/api/costs/route.ts` authorizes before configuration
or database work. The UI lives at `src/app/(private)/costs/page.tsx`.

Remaining gate: feature remains disabled until an approved disposable
producer-read integration verifies the query plan and source semantics. A
completed local Next build is also still required.

Pricing configuration: `public.model_pricing` is deliberately outside the
cost-reader allowlist. The producer read role returns PostgreSQL `42501` for a
presence-only pricing check; do not route around it through the app connection
or expose price rows. The producer owner can validate effective model/mode
coverage independently.

Demo 2 diagnostic (2026-07-15): the non-production `prospecting` target
already grants `prospecta_producer_read` exactly the columns used by
`src/server/repositories/costs/cost-read-repository.ts`, including the
server-only predicate fields. An `EXPLAIN` run under that role passed in a
read-only transaction. The Demo 2 Secret now carries
`FEATURE_COSTS_ENABLED=true` and the exact `local-development-user` allowlist;
the deployed `/api/costs` and `/costs` routes return `200` and the private
navigation shows `Custos`. No correlated cost runs currently exist, so the
safe visible state is `EMPTY`, not zero cost.

Development navigation: `src/app/(private)/layout.tsx:PrivateLayout()` passes
`showCosts` only when `actor.permissions` contains `costs:read`. With the
development bypass and Demo2 full access, `src/server/auth/authorization.ts:createDevelopmentAuthorization()` grants it only when demo data is off,
`FEATURE_COSTS_ENABLED` is true, and `COSTS_READ_SUBJECTS` includes the exact
`local-development-user` subject.

Spec: `.specs/features/cost-control/spec.md`

Updated: 2026-07-15
