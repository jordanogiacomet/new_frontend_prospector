# Handoff

**Date:** 2026-07-22T13:13:19-02:00
**Feature:** Importação pelo workflow atual com aviso de encerramento
**Status:** Implementação e gates locais completos; conexão externa não aplicada

## Resultado

- O upload existente continua enviando uma única vez os bytes aceitos ao
  workflow atual.
- O workflow ativo de 98 nós não foi editado, clonado, importado, ativado,
  chamado por administração nem reconfigurado. O export ignorado continua
  `active: true`, com 98 nós e SHA-256
  `26a2c00f30a58de01eae60802d470c6ba4d16d0e6e09e8340453c38aea142c23`.
- A aplicação recebe somente o `BATCH_CLOSED` que esse workflow já emite,
  autentica antes de ler corpo/banco, correlaciona com a submissão app-owned e
  grava um único evento append-only.
- Lista e detalhe atualizados pelo polling existente mostram
  **“Processamento encerrado”**, horário e linhas informadas pelo workflow.
- O relato não promove `BatchStatus` a `COMPLETED` e não inventa linhas
  aceitas, terminais, leads, bloqueios ou falhas.
- Migração `007`, segredo server-only e rota exata do gateway estão empacotados
  para uma futura release imutável da Demo 3.

## Commits criados

- `8a837cf` `feat(imports): persist legacy workflow close reports`
- `faf3534` `feat(imports): receive legacy workflow close callback`
- `d54de1e` `feat(imports): show workflow processing closure`
- `a96affd` `chore(demo3): package import close receiver`
- `d710a7a` `test(imports): register callback API surface`
- atualização atual de spec, evidência, state, handoff e notebook:
  `docs(imports): record legacy workflow closure`

## Arquivos consolidados

- `db/app/007_legacy_workflow_close_report_forward.sql` e rollback;
- `src/app/api/imports/events/route.ts` e teste;
- `src/server/repositories/imports/legacy-workflow-close-repository.ts`;
- leitura app-owned em `import-submissions-repository.ts` e composição em
  `batch-read-service.ts`;
- DTO `BatchSummary` e páginas de lista/detalhe de lotes;
- `.env.example`, `.env.demo3.example`, Dockerfile PostgreSQL, gateway nginx e
  deploy imutável da Demo 3;
- contratos estáticos e integração PostgreSQL sintética;
- spec, evidência, STATE, HANDOFF e notebook.

A cadeia produtora permanece canônica, sem drafts `_v1` duplicados:
`003_import_acceptance.sql` / `004_import_acceptance_rollback.sql` e
`005_import_batch_close.sql` / `006_import_batch_close_rollback.sql`.

## Checks executados

- `npm run lint`: passou sem warnings.
- `npm run typecheck`: passou.
- `npm test`: 76 arquivos / 1.774 testes passaram.
- `npm run build` com overrides seguros somente no processo: passou; 24 rotas,
  incluindo `/api/imports/events`.
- `npm run test:integration`: 8 arquivos / 88 testes passaram em PostgreSQL 16
  descartável, com bancos e dados sintéticos app/produtor.
- `npm run test:contract`: 3 arquivos / 18 testes locais passaram.
- Contratos HTTP remotos: 2 suites / 57 casos ficaram **skipped** por ausência
  de alvo autorizado; não foram aprovados.
- `git diff --check`: passou.
- Container descartável `prospecta-close-gate-20260722`: removido e confirmado
  ausente.

O binário `pnpm` não estava disponível; foram usados os scripts equivalentes
via `npm`, sem instalar ou atualizar dependências. `.env.local` não foi
alterado.

## Limitações e conexão pendente

Nada foi lançado nesta etapa: cluster, deployment, Secrets reais e ambiente
n8n permaneceram inalterados. Portanto, o código está pronto, mas a Demo 3
atual ainda não receberá callbacks reais.

Para conectar futuramente, um operador autorizado deve usar um segredo
aleatório de pelo menos 32 bytes e distinto dos demais:

- app Demo 3: `N8N_IMPORT_EVENT_SECRET`;
- n8n atual: `PROSPECTA_IMPORT_EVENT_SECRET` com o mesmo valor;
- n8n atual: `PROSPECTA_IMPORT_EVENT_URL` apontando para
  `http://192.168.0.20:30100/api/imports/events`.

Essa configuração reinicia workloads e expõe o segredo em HTTP no perfil LAN
aceito; exige autorização operacional separada. Como o callback atual possui
retry finito e `continueOnFail`, falha de entrega não pode ser inferida como
falha do lote e não dispara reenvio automático.

## OPEN-01 a OPEN-05

Estes bloqueadores permanecem somente para a evolução v1/X4 separada; não são
necessários para o relato simples T15:

- **OPEN-01:** identificar URL HTTPS v1 não produtiva, workflow ID/version e
  fonte de inspeção autorizada antes de contratos remotos.
- **OPEN-02:** aprovar worker produtor separado e adaptador terminal
  idempotente; o workflow atual não possui subworkflow reutilizável.
- **OPEN-03:** aprovar runner idempotente de reconciliação tardia; timeout nunca
  reenvia o upload.
- **OPEN-04:** nomear dono operacional e janela de freshness antes de habilitar
  `NO_UPDATE`.
- **OPEN-05:** identificar alvo produtor descartável externo, DB owner,
  credenciais, rollback owner e aprovação antes de DDL fora do harness local.
