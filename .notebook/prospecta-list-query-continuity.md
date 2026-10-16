# Consulta e retorno às listas
> Filtros rascunhados, recuperação de consultas vazias e página de origem.

Entry: `src/components/leads/lead-list-filters.tsx:LeadListFilters()`.

- Empresas e `work-queue/page.tsx:CommercialQueueFilters()` ligam o rascunho
  à URL inteira; navegação entre páginas/consultas descarta drafts anteriores.
- Aviso de filtros pendentes compara os valores semânticos; mudar somente a
  pontuação do CNPJ não indica uma nova consulta. Descarte restaura campos e
  erros sem navegação/GET.
- Validação dirige o foco ao primeiro campo inválido; a pipeline abre
  `Mais filtros` antes de focar um campo recolhido.
- Consulta vazia filtrada oferece limpeza explícita; página vazia com total
  confirmado conserva filtros no retorno à primeira página. Nenhuma navegação
  automática e nenhum total indisponível convertido em zero.
- `src/lib/navigation-return.ts:resolveBatchListReturnHref()` e
  `resolveOutsideAnalysisReturnHref()` aceitam só a própria lista e paginação
  aprovada. Detalhes sem origem válida mantêm o fallback da área.
- Os dois links de detalhe dos lotes (situação/Ver detalhes) e o detalhe Fora
  da análise carregam `returnTo` da paginação confirmada pelo servidor; esse
  parâmetro não segue para a API e não altera autorização de página/API.

Verification: `docs/prospecta-ux-list-continuity.md`.
Browser: `tests/browser/manager-import-analysis.mjs` — loopback e APIs sintéticas.

Deploy posterior autorizado: app-only Demo 3, revisão68 → 69; 22 checks HTTPS
passaram, configurações/gateway/PostgreSQL preservados. Release e rollback:
`docs/prospecta-ux-list-continuity-deploy.md`.

Updated: 2026-10-14
