# Controle de Custos por Run e Lote — Tasks

**Design:** `.specs/features/cost-control/design.md`
**Status:** Implemented locally — final build validation incomplete

## Execution plan

```text
T1 ──┬──→ T2 ──→ T3 ──→ T5
     └──→ T4 ──────────→ T5
```

T2 e T4 podem ser executadas em paralelo após T1. Não compartilham arquivos.

## Task breakdown

### T1: Aprovar e aplicar o limite de acesso a custos

**What:** Formalizar a exceção de política e adicionar `costs:read`, flag
server-only e lista de sujeitos permitidos que nunca confia em permissões
recebidas no JWT.

**Where:** `AGENTS.md`, políticas/especificação de fonte Prospecta,
`.env.example`, `src/server/env.ts`, `src/server/auth/*` e seus testes.

**Depends on:** None
**Reuses:** `FEATURE_SENSITIVE_CONTENT_ENABLED`, `requirePermission`, actor
verificado e testes de autenticação.
**Requirement:** COST-02, COST-03, COST-06

**Done when:**

- [ ] Somente sujeitos allowlisted server-side recebem `costs:read`.
- [ ] Flag e lista ausentes negam por padrão; valores públicos são rejeitados.
- [ ] A política permite somente o DTO monetário definido no design e mantém
      tokens/modelos/uso vedados.
- [ ] Testes cobrem negação, concessão e ausência de permissões injetadas.

**Tests:** unit
**Gate:** `pnpm lint && pnpm typecheck && pnpm test`

**Status:** Completed 15/07/2026. Focused auth/env tests, `npx --yes pnpm@10 lint`, and `npx --yes pnpm@10 typecheck` passed. The feature-wide test/build gate remains T5.

### T2: Criar leitura e agregação segura de custos

**What:** Implementar o serviço e o repositório que correlacionam lotes da
organização, classificam cada run e calculam cobertura/subtotal sem retornar
campos técnicos.

**Where:** `src/types/costs.ts`, `src/server/costs/`,
`src/server/repositories/costs/`,
`src/server/repositories/imports/import-submissions-repository.ts` e testes
co-localizados.

**Depends on:** T1
**Reuses:** app/producer clients, predicado de run produtivo e repositório de
submissões.
**Requirement:** COST-01, COST-03, COST-04, COST-05, COST-06

**Done when:**

- [ ] A consulta é somente leitura, parametrizada e limitada a lotes da
      organização.
- [ ] Duplicidade, zero e ausência resultam em estado não disponível e não
      participam do subtotal.
- [ ] O DTO não contém tokens, modelos, preços unitários, uso bruto ou IDs n8n.
- [ ] Testes sintéticos cobrem escopo, paginação, nulos, duplicidade e erro de
      fonte.

**Tests:** unit
**Gate:** `pnpm lint && pnpm typecheck && pnpm test`

**Status:** Completed 15/07/2026. RED: three focused files failed while modules/function were absent. GREEN: 70 focused tests passed. `npx --yes pnpm@10 lint` passed with two existing warnings in `src/server/auth/auth.test.ts`; the feature-wide typecheck/test/build gate remains T5.

### T3: Expor a consulta privada de custos

**What:** Criar `GET /api/costs` com autorização antes de configuração,
validação ou repositório e envelope paginado sem cache.

**Where:** `src/app/api/costs/route.ts` e teste co-localizado.

**Depends on:** T1, T2
**Reuses:** rota de fila comercial, `requirePermission` e `mapApiError`.
**Requirement:** COST-02, COST-03, COST-04, COST-05, COST-06

**Done when:**

- [ ] Somente GET é exportado.
- [ ] `costs:read`, flag, query, organização e serviço são aplicados na ordem
      definida pelo design.
- [ ] Respostas e erros usam `Cache-Control: private, no-store`.
- [ ] Testes cobrem autorização prévia, flag, consulta inválida, resposta,
      indisponibilidade e não-vazamento.

**Tests:** unit
**Gate:** `pnpm lint && pnpm typecheck && pnpm test`

**Status:** Completed 15/07/2026. RED: route module absent. GREEN: 23 focused route tests passed. The feature-wide lint/typecheck/test/build gate remains T5.

### T4: Formatar valores estimados em USD sem perda de precisão

**What:** Adicionar formatter de decimal USD para valores monetários do DTO.

**Where:** `src/lib/formatters/index.ts` e teste co-localizado.

**Depends on:** T1
**Reuses:** `UNAVAILABLE_LABEL` e convenções dos formatters existentes.
**Requirement:** COST-03, COST-05, COST-06

**Done when:**

- [ ] Texto decimal válido de até oito casas é exibido em `pt-BR` e USD sem
      conversão por ponto flutuante.
- [ ] Nulo, negativo ou formato inválido não viram zero.
- [ ] Testes cobrem valor pequeno, agrupamento, zero explícito e indisponível.

**Tests:** unit
**Gate:** `pnpm lint && pnpm typecheck && pnpm test`

**Status:** Completed 15/07/2026. RED: 12 formatter expectations failed before implementation; GREEN: 38 focused formatter tests passed. `npx --yes pnpm@10 lint` and `npx --yes pnpm@10 typecheck` passed.

### T5: Disponibilizar a tela privada de custos

**What:** Criar a página de custos e a entrada de navegação condicionada à
permissão, apresentando resumo, cobertura, runs paginados e estados seguros.

**Where:** `src/app/(private)/costs/page.tsx`,
`src/app/(private)/private-navigation.tsx`, layout e testes co-localizados.

**Depends on:** T3, T4
**Reuses:** página de lotes e navegação privada.
**Requirement:** COST-03, COST-04, COST-05, COST-06

**Done when:**

- [ ] A navegação só mostra “Custos” para `costs:read`.
- [ ] A tela distingue total confirmado, subtotal parcial, desconhecido,
      vazio, indisponível e erro.
- [ ] A tela valida o envelope em runtime e não exibe campos vedados.
- [ ] Testes cobrem navegação, carregamento, estados e renderização decimal.

**Tests:** unit
**Gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

**Status:** Completed 15/07/2026. RED: missing page/navigation checks failed.
GREEN: 20 focused page/layout tests passed. Lint and typecheck passed. The
build compiled successfully, but stopped during the framework type-check stage
without a final result or `BUILD_ID`; it is not approved as passing.

## Task granularity check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | Um limite de autorização/política | ✅ Granular |
| T2 | Um serviço de leitura de custos e seu contrato | ✅ Granular |
| T3 | Um endpoint GET | ✅ Granular |
| T4 | Um formatter | ✅ Granular |
| T5 | Uma tela privada e sua entrada de navegação | ✅ Granular |

## Diagram-definition cross-check

| Task | Depends on (body) | Diagram | Status |
| --- | --- | --- | --- |
| T1 | None | Start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1, T2 | T1 → T2 → T3 | ✅ Match |
| T4 | T1 | T1 → T4 | ✅ Match |
| T5 | T3, T4 | T3/T4 → T5 | ✅ Match |

## Test co-location validation

| Task | Layer | Existing convention | Task tests | Status |
| --- | --- | --- | --- | --- |
| T1 | Env/auth/policy | Vitest co-localizado | Unit | ✅ OK |
| T2 | Repository/service/types | Vitest co-localizado | Unit | ✅ OK |
| T3 | Route | Vitest co-localizado | Unit | ✅ OK |
| T4 | Formatter | Vitest co-localizado | Unit | ✅ OK |
| T5 | Client page/navigation | Testing Library + Vitest | Unit | ✅ OK |

## Execution notes

- Use `codenavi` for focused repository navigation and `coding-guidelines` for
  every implementation task.
- No diagram skill is installed; no diagram is needed for this linear flow.
- Worktree already contains unrelated user changes. Do not stage or commit
  files during this feature without a clean, reviewed staging set.
- Validation recorded 15/07/2026: `npx --yes pnpm@10 lint` and
  `npx --yes pnpm@10 typecheck` passed. `npx --yes pnpm@10 test` completed
  without a runner summary in this shell. The direct Next build compiled, then
  ended at `type-checking` without a final result; keep the flag disabled until
  that gate and the approved disposable producer-read integration checks pass.
