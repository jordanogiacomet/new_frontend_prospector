# Private Navigation
> Menu principal e entradas contextuais das páginas privadas

Entry: `src/app/(private)/layout.tsx:PrivateLayout()` → `src/app/(private)/private-navigation.tsx:PrivateNavigation()`

Menu global:
- `/inicio` — atalhos por permissão; sem acesso às áreas atuais, oferece Ajuda
- `/leads` — lista; detalhe via `src/components/leads/lead-table.tsx`
- `/imports` — envio; histórico via link contextual
- `/costs` — custos estimados, apenas com `costs:read`
- `/ajuda` — guia privado

Rotas contextuais:
- `/imports/batches` → detalhe em `src/app/(private)/imports/batches/page.tsx:BatchListTable()` usando `submissionId`; não usar `import_batch_id` do produtor como rota
- `/leads/[cnpj]` → Contatos profissionais usa o componente governado de busca,
  confirmação e revelação. O atalho Encontrar contatos exige `contacts:enrich`
  e `contacts:read`; o bloco informa acesso negado quando faltam permissões.
- `/work-queue` foi retirado da navegação e redireciona a `/leads`; CNPJ válido
  de links antigos é preservado. Nenhum GET da fila ocorre nessa entrada.
- `/workspaces/[id]` conserva acompanhamentos existentes, atividades, notas e
  auditoria por endereço direto; o retorno agora aponta a Leads.
- `src/lib/navigation-return.ts:resolveLeadListReturnHref()` preserva consultas
  válidas de Leads, converte filtros produtores permitidos de retornos antigos
  da fila e descarta filtros comerciais. Destinos externos ou consultas inválidas
  usam o CNPJ validado da empresa ou `/leads`.

Validation: `src/app/(private)/layout.test.tsx`,
`src/app/(private)/inicio/page.test.tsx`, `src/app/(private)/ajuda/page.test.tsx`,
`src/app/(private)/work-queue/page.test.tsx`, `src/lib/navigation-return.test.ts`,
`tests/browser/manager-import-analysis.mjs`

Updated: 2026-10-16
