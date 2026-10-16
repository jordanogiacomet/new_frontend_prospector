# Manager UX review
> Rotina comercial visível, filtros explícitos e linguagem de negócio

Entry: `src/app/(private)/inicio/page.tsx:StartPage()`

- Início inclui `commercial:read` e `costs:read` independentemente de imports/leads.
  Atalhos e orientação acompanham as permissões; sem novas consultas.
- `src/app/(private)/private-navigation.tsx:PrivateNavigation()` — menu móvel
  recolhido; localização visível; descrição das áreas. Mudança de pathname
  fecha menu. Clique modificado preserva menu; área atual devolve foco ao botão.
- `src/components/leads/lead-list-filters.tsx:LeadListFilters()` — CNPJ/UF/prioridade
  rascunhados até submit único. Atalhos/chips usam somente URL aplicada.
  URL completa diferente limpa drafts/erros; voltar não ressuscita drafts antigos.
- `src/app/(private)/imports/batches/page.tsx` e detalhe — CTA identifica lista
  geral; não atribuir todos os resultados ao lote aberto.
- `src/app/(private)/costs/page.tsx:CostsTable()` — tabela responsiva e
  identificação recolhida; nenhuma nova fonte/campo de dados.
- UI comercial usa Plano de contatos; contrato/âncora `qualification-cadence`
  preservados. Contato registrado entra nas atividades; nota guarda contexto.
- Ausência de prazo (`null`) exibe Sem prazo definido; inválido/indisponível
  conserva a semântica existente. Relatórios mantêm estados separados.

Guide: `docs/prospecta-manager-guide.md`
Verification: `docs/prospecta-ux-manager-review.md`
Browser: `tests/browser/manager-import-analysis.mjs` — somente loopback,
identidade/APIs sintéticas e integrações externas bloqueadas.

Updated: 2026-10-14
