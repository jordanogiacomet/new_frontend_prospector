# Handoff

**Date:** 2026-07-23
**Feature:** Marcos operacionais do workflow legado e atualização visível
**Status:** Implementado, validado e ativo no Demo 3 autorizado

## Resultado

- A release imutável
  `demo3-preprod-20260723-lifecycle-refresh-001` está ativa e Ready.
- O primeiro `ACCEPTED_ROW` autenticado e correlacionado grava um único evento
  app-owned `WORKFLOW_STARTED_REPORTED` e aparece como
  **“Processamento iniciado pelo workflow”**.
- `BATCH_CLOSED` continua gravando um único
  `WORKFLOW_CLOSED_REPORTED` e prevalece na UI como
  **“Processamento encerrado”**.
- Nenhum desses relatos altera `BatchStatus`, prova aceite durável ou inventa
  contagens, leads, falhas ou terminais.
- Lista, detalhe e histórico retido de leads repetem a leitura privada sem
  cache a cada cinco segundos somente enquanto visíveis, sem requisições
  sobrepostas e com cancelamento ao desmontar.
- O n8n usa a URL exata
  `http://192.168.0.20:30100/api/imports/events` e a mesma credencial
  server-only da aplicação por meio de Kubernetes Secrets.
- O workflow ativo permaneceu sem edição, clonagem, importação, ativação ou
  chamada administrativa. O export revisado continua com 98 nós e SHA-256
  `26a2c00f30a58de01eae60802d470c6ba4d16d0e6e09e8340453c38aea142c23`.

## Commits funcionais

- `0a590b7` `feat(leads): refresh visible lead data`
- `80d972f` `feat(imports): show workflow processing start`
- `859fcd0` `feat(imports): record workflow operational start`
- T15 anterior:
  `8a837cf`, `faf3534`, `d54de1e`, `a96affd` e `d710a7a`

## Arquivos centrais

- `db/app/007_legacy_workflow_close_report_forward.sql`
- `db/app/008_legacy_workflow_start_report_forward.sql`
- `src/app/api/imports/events/route.ts`
- `src/server/repositories/imports/legacy-workflow-start-repository.ts`
- `src/server/repositories/imports/legacy-workflow-close-repository.ts`
- `src/server/imports/batch-read-service.ts`
- páginas/componentes de leads e lotes com polling visível
- empacotamento e deploy imutável da Demo 3

## Gates

O binário `pnpm` não estava disponível; foram executados os scripts
equivalentes do `package.json` via `npm`, sem instalar dependências.

- `npm run lint`: passou sem warnings.
- `npm run typecheck`: passou.
- `npm test`: 77 arquivos / 1.800 testes passaram.
- `npm run build` com overrides seguros apenas no processo: passou, com 24
  rotas, incluindo `/api/imports/events`.
- integração PostgreSQL descartável: 8 arquivos / 89 testes passaram.
- `npm run test:contract`: 3 arquivos / 18 testes locais passaram; 2 suites /
  57 casos HTTP do ingress v1 ficaram skipped por falta de alvo v1 separado.
- `git diff --check`: passou.
- PostgreSQL sintético descartável
  `prospecta-lifecycle-gate-20260723`: removido após os testes.

## Operação e verificação

- O preflight confirmou o contexto, a API HTTPS, o UID do `kube-system` e o
  marcador não produtivo do namespace antes de qualquer mutação.
- Os índices app-owned das migrações `007` e `008` foram verificados.
- A aplicação ficou Ready sem reinícios.
- O Deployment n8n passou à revisão 15, permaneceu na versão 2.30.6 e manteve
  o mesmo digest de imagem anteriormente executado.
- Um probe autenticado a partir do pod n8n alcançou a aplicação: corpo inválido
  recebeu 400; um `ACCEPTED_ROW` sintético, válido porém não correlacionado,
  recebeu 404 e não escreveu dados.
- Páginas privadas e APIs de leads/importações responderam 200 no smoke.
- O caminho de rollback imutável está preservado; não foi necessário acioná-lo.

## Limitação observada

Foi feito exatamente um novo upload sintético pelo Prospecta. A chamada externa
ocorreu uma vez e o resultado durável ficou honestamente em
`ACCEPTANCE_UNKNOWN`. A leitura posterior com a mesma chave/arquivo devolveu o
registro original como duplicata app-owned e não chamou o n8n novamente.

Como não houve `import_batch_id` produtor correlacionado, não foi possível
provar um callback real desse upload sem inventar dados. A persistência
correlacionada está coberta pelos testes PostgreSQL; o probe de runtime comprova
autenticação, parsing e falha fechada. Não houve retry automático.

## Escopo ainda bloqueado

OPEN-01 a OPEN-05 continuam valendo somente para a arquitetura separada do
ingress v1/X4: alvo HTTPS versionado, worker terminal, reconciliação tardia,
freshness e DDL produtor externo. Eles não impedem os marcos operacionais
legados agora ativos e não autorizam representar o fluxo atual como aceitação
durável ou conclusão contratual.
