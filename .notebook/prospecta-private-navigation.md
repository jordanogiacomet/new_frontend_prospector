# Private Navigation
> Menu principal e entradas contextuais das páginas privadas

Entry: `src/app/(private)/layout.tsx:PrivateLayout()` → `src/app/(private)/private-navigation.tsx:PrivateNavigation()`

Menu global:
- `/leads` — lista; detalhe via `src/components/leads/lead-table.tsx`
- `/work-queue` — fila comercial
- `/imports` — envio; histórico via link contextual

Rotas contextuais:
- `/imports/batches` → detalhe em `src/app/(private)/imports/batches/page.tsx:BatchListTable()` usando `submissionId`; não usar `import_batch_id` do produtor como rota
- `/workspaces/[id]` → `src/app/(private)/work-queue/page.tsx:WorkspaceAction()`;
  existentes abrem detalhe, ausentes iniciam o registro comercial e abrem o retorno `201`

Validation: `src/app/(private)/layout.test.tsx`, `src/app/(private)/work-queue/page.test.tsx`, `src/app/(private)/imports/batches/page.test.tsx`

Updated: 2026-07-14
