# Outside Analysis Tasks

**Specification:** `.specs/features/outside-analysis/spec.md`
**Design:** Inline — endpoint e página separados, reutilizando os padrões atuais
**Status:** In Progress

## Execution Plan

```text
T1 ──→ T2 ──→ T3 ──┐
  ├──→ T5 ──────────┼──→ T6
T4 ─────────────────┘
T6 ──→ T7
T6 ──→ T8 ──→ T9 ──→ T10
```

## Task Breakdown

### T1: Definir contrato público

**What:** Criar query, DTO e mapper estritos para a visão fora da análise.
**Where:** `src/lib/validators/lead-query.ts`, `src/types/leads.ts`,
`src/server/mappers/outside-analysis-mapper.ts`
**Depends on:** None
**Reuses:** Paginação atual, `LeadSummary` e mappers deny-by-default.
**Requirements:** OA-03, OA-04
**Tests:** unit
**Gate:** quick
**Commit:** `feat(leads): define outside-analysis contract`

**Done when:**

- [x] A query aceita somente `page` e `pageSize`, com máximo 20.
- [x] O DTO contém apenas campos aprovados necessários à tabela.
- [x] O mapper preserva ação/motivo armazenados e nulidade.
- [x] Testes direcionados passam sem remoções.

### T2: Ler decisões atuais do CRM

**What:** Criar repositório SELECT-only para a projeção atual
`CRM_DECIDIU_E_SALVO`.
**Where:** `src/server/repositories/outside-analysis-repository.ts`,
`tests/integration/lead-correlated-visibility.test.ts`
**Depends on:** T1
**Reuses:** Integridade e visibilidade de
`src/server/repositories/lead-list-repository.ts`.
**Requirements:** OA-01, OA-02
**Tests:** unit plus PostgreSQL integration
**Gate:** full
**Commit:** `feat(leads): read current CRM decisions`

**Done when:**

- [x] O SQL exige projeção atual íntegra, proveniência exata e um terminal.
- [x] Somente `CRM_DECIDIU_E_SALVO` é selecionado.
- [x] Lotes correlacionados usam `ANY($n::text[])` parametrizado.
- [x] O guard de 1.000 projeções e a paginação falham de forma segura.
- [x] A integração prova mesma organização, outra organização e resultado
      público com dados sintéticos.

### T3: Expor endpoint autenticado

**What:** Criar `GET /api/leads/outside-analysis`.
**Where:** `src/app/api/leads/outside-analysis/route.ts`
**Depends on:** T1, T2
**Reuses:** `requirePermission`, `resolveLeadReadVisibility`,
`paginatedSuccessResponse` e `mapApiError`.
**Requirements:** OA-02, OA-03
**Tests:** route/unit
**Gate:** quick
**Commit:** `feat(leads): expose outside-analysis endpoint`

**Done when:**

- [x] `leads:read` é exigida antes de validação e consultas.
- [x] A organização autenticada resolve a visibilidade correlacionada.
- [x] Resposta e erros usam envelopes seguros e `private, no-store`.
- [x] Testes cobrem autenticação, validação, sucesso e falhas.

### T4: Criar navegação entre visões

**What:** Criar navegação por links para “Para análise” e “Fora da análise”.
**Where:** `src/components/leads/lead-view-navigation.tsx`
**Depends on:** None
**Reuses:** Linguagem visual e estados de foco do menu atual.
**Requirements:** OA-04
**Tests:** component/unit
**Gate:** quick
**Commit:** `feat(leads): add lead view navigation`

**Done when:**

- [x] Os dois links têm URLs estáveis e alvo mínimo de toque.
- [x] A visão atual usa `aria-current="page"`.
- [x] A navegação tem nome acessível e foco visível.

### T5: Apresentar tabela de decisões CRM

**What:** Criar tabela paginada com ação e motivo armazenados.
**Where:** `src/components/leads/outside-analysis-table.tsx`
**Depends on:** T1
**Reuses:** Formatação brasileira, rótulos seguros e paginação da lista atual.
**Requirements:** OA-04, OA-06
**Tests:** component/unit
**Gate:** quick
**Commit:** `feat(leads): show outside-analysis decisions`

**Done when:**

- [x] Todos os campos aprovados são apresentados e formatados.
- [x] Motivo ausente e ação desconhecida usam fallbacks seguros.
- [x] Não existe link “Abrir análise”.
- [x] A paginação preserva `pageSize` e seus limites.

### T6: Montar a aba fora da análise

**What:** Criar a página, integrar a navegação nas duas visões e ligar a API.
**Where:** `src/app/(private)/leads/outside-analysis/page.tsx`,
`src/app/(private)/leads/page.tsx`
**Depends on:** T3, T4, T5
**Reuses:** Polling e estados da lista atual.
**Requirements:** OA-04, OA-05, OA-06
**Tests:** component/unit
**Gate:** quick
**Commit:** `feat(leads): add outside-analysis view`

**Done when:**

- [x] A nova página trata loading, sucesso, vazio, erro e página inválida.
- [x] O polling ocorre a cada cinco segundos apenas quando visível, sem
      sobreposição, e é cancelado ao desmontar.
- [x] A lista atual também apresenta a navegação com a aba correta ativa.
- [x] A ordem devolvida pelo servidor não é recalculada no navegador.

### T7: Verificar e publicar Demo 3

**What:** Executar gates, atualizar rastreabilidade/notebook/estado e publicar
uma release imutável.
**Where:** Especificação, `.notebook/`, `.specs/project/STATE.md` e Demo 3.
**Depends on:** T6
**Reuses:** Processo de release `scripts/deploy-demo3-k8s.mjs`.
**Requirements:** OA-01–OA-06
**Tests:** build, full PostgreSQL integration, contract and authenticated smoke
**Gate:** build
**Commit:** `docs(prospecta): record outside-analysis rollout`

**Done when:**

- [ ] Todos os gates passam com contagens registradas.
- [ ] Rastreabilidade marca OA-01–OA-06 como verificados.
- [ ] Release imutável fica 1/1 na Demo 3.
- [ ] Smoke autenticado confirma rota e página sem registrar valores reais.

### T8: Ler uma decisão individual

**What:** Consultar uma empresa por CNPJ com a mesma projeção atual elegível da
lista e expor um endpoint GET autenticado.
**Where:** `src/server/repositories/outside-analysis-repository.ts`,
`src/app/api/leads/outside-analysis/[cnpj]/route.ts`
**Depends on:** T2, T3
**Reuses:** `buildEligibleCurrentCrmCte`, `leadDetailParamsSchema`,
`resolveLeadReadVisibility` e `mapApiError`.
**Requirements:** OA-08
**Tests:** repository/unit and route/unit
**Gate:** quick
**Commit:** `feat(leads): expose CRM decision detail`

**Done when:**

- [x] O SQL filtra o CNPJ por parâmetro e preserva os gates da lista.
- [x] Zero linhas retorna `null` e múltiplas linhas falham fechado.
- [x] A rota exige `leads:read` antes de validação e consultas.
- [x] Sucesso, 404, validação e falhas usam envelopes seguros e `no-store`.

### T9: Apresentar a página dedicada

**What:** Ligar cada linha da lista a uma página somente leitura da decisão.
**Where:** `src/components/leads/outside-analysis-table.tsx`,
`src/app/(private)/leads/outside-analysis/[cnpj]/page.tsx`
**Depends on:** T8
**Reuses:** formatadores brasileiros, rótulos seguros e linguagem visual da
lista.
**Requirements:** OA-07, OA-09
**Tests:** component/unit
**Gate:** quick
**Commit:** `feat(leads): add CRM decision page`

**Done when:**

- [x] A lista oferece “Ver decisão do CRM” e nunca “Abrir análise”.
- [x] A página mostra somente os campos aprovados e seus fallbacks.
- [x] Loading, não encontrado e indisponibilidade têm mensagens específicas.
- [x] Existe retorno claro à lista e nenhuma ação de escrita ou enriquecimento.

### T10: Verificar e publicar o detalhe na Demo 3

**What:** Executar gates, atualizar rastreabilidade/evidência e publicar uma
release imutável na Demo 3.
**Where:** Especificação, `.notebook/`, `.specs/project/STATE.md` e Demo 3.
**Depends on:** T9
**Reuses:** Processo de release `scripts/deploy-demo3-k8s.mjs`.
**Requirements:** OA-07–OA-09
**Tests:** lint, typecheck, full suite, build and authenticated smoke
**Gate:** build
**Commit:** `docs(prospecta): record CRM detail rollout`

**Done when:**

- [x] Todos os gates passam com contagens registradas.
- [x] Rastreabilidade marca OA-07–OA-09 como verificados.
- [x] Release imutável fica 1/1 na Demo 3.
- [x] Smoke autenticado confirma a lista, o link, a página e a API sem
      registrar valores reais.

## Diagram-Definition Cross-Check

| Task | Depends on | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | Root | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T1, T2 | T1 → T2 → T3 | ✅ |
| T4 | None | Root | ✅ |
| T5 | T1 | T1 → T5 | ✅ |
| T6 | T3, T4, T5 | T3/T4/T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T2, T3 | T6 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1 | Validator/mapper | unit | unit | ✅ |
| T2 | Repository SQL | unit + integration | unit + integration | ✅ |
| T3 | Route | route/unit | route/unit | ✅ |
| T4 | React component | component/unit | component/unit | ✅ |
| T5 | React component | component/unit | component/unit | ✅ |
| T6 | React page | component/unit | component/unit | ✅ |
| T7 | Release | full build + smoke | build/integration/contract/smoke | ✅ |
| T8 | Repository + route | unit + route/unit | unit + route/unit | ✅ |
| T9 | React component/page | component/unit | component/unit | ✅ |
| T10 | Release | full build + smoke | build/smoke | ✅ |
