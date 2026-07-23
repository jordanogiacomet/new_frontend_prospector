# Handoff

**Date:** 2026-07-23
**Feature:** Marcos operacionais e visibilidade correlacionada de leads
**Status:** Implementado, validado e ativo no Demo 3 autorizado

## Resultado

- A release imutável
  `demo3-preprod-20260723-correlated-leads-002` está ativa e Ready.
- Resultados `INSERIDO_VALIDATION` marcados como teste podem aparecer somente
  quando o lote está correlacionado a uma submissão app-owned da organização
  autenticada no perfil Demo 3 exato.
- Lotes de outra organização, lotes sem correlação e qualquer runtime fora do
  Demo 3 preservam o predicado de produção anterior.
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

- `2c9aaee` `fix(leads): scope Demo 3 test runs by submission`
- `54ec775` `fix(db): keep workflow start event on migration replay`
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
- `src/server/leads/lead-read-visibility.ts`
- `src/server/repositories/production-run-predicate.ts`
- repositories e rotas de lista, detalhe e histórico de leads
- páginas/componentes de leads e lotes com polling visível
- empacotamento e deploy imutável da Demo 3

## Gates

O binário `pnpm` não estava disponível; foram executados os scripts
equivalentes do `package.json` via `npm`, sem instalar dependências.

- `npm run lint`: passou sem warnings.
- `npm run typecheck`: passou.
- `npm test`: 78 arquivos / 1.816 testes passaram.
- `npm run build` com overrides seguros apenas no processo: passou, com 24
  rotas, incluindo `/api/imports/events`.
- integração PostgreSQL descartável: 9 arquivos / 91 testes passaram.
- `npm run test:contract`: 3 arquivos / 18 testes locais passaram; 2 suites /
  57 casos HTTP do ingress v1 ficaram skipped por falta de alvo v1 separado.
- `git diff --check`: passou.
- PostgreSQL sintético descartável removido após os testes.

## Operação e verificação

- O preflight confirmou o contexto, a API HTTPS, o UID do `kube-system` e o
  marcador não produtivo do namespace antes de qualquer mutação.
- Os índices app-owned das migrações `007` e `008` foram verificados.
- A aplicação ficou Ready sem reinícios.
- A primeira tag candidata de visibilidade foi publicada, mas não chegou aos
  pods: a reaplicação de `007` após `008` detectou corretamente uma constraint
  estreitada e abortou o deploy. O replay foi tornado forward-compatible,
  coberto por teste RED/GREEN e promovido sob uma nova tag imutável.
- O smoke autenticado e sem valores produtores confirmou a mesma regra em
  lista, detalhe e histórico para o lote autorizado.
- O Deployment e o StatefulSet estão `1/1`, sem reinícios. Os logs da aplicação
  e do proxy de banco não apresentaram erros; o único registro do edge foi
  ruído de autenticação de um probe local, sem falha upstream ou status 5xx.
- O Deployment n8n passou à revisão 16, permaneceu na versão 2.30.6 e manteve
  o mesmo digest de imagem anteriormente executado. A revisão 16 declara
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, necessário para os Code nodes lerem as
  duas variáveis do callback.
- Um probe autenticado a partir do pod n8n alcançou a aplicação: corpo inválido
  recebeu 400; um `ACCEPTED_ROW` sintético, válido porém não correlacionado,
  recebeu 404 e não escreveu dados.
- Páginas privadas e APIs de leads/importações responderam 200 no smoke.
- Um upload sintético posterior à revisão 16 foi enviado uma única vez,
  recebeu reconhecimento produtor correlacionado e registrou início
  operacional no Prospecta em aproximadamente cinco segundos. A execução n8n
  terminou com sucesso e o Prospecta registrou também o encerramento e a
  contagem informada pelo workflow, mantendo corretamente o status contratual
  `SUBMITTED`.
- O caminho de rollback imutável está preservado; não foi necessário acioná-lo.

## Limitação observada

O primeiro teste sintético, anterior à correção do sandbox, permanece
honestamente em `ACCEPTANCE_UNKNOWN` e não foi reenviado. Depois da revisão 16,
um novo CSV sintético foi submetido exatamente uma vez, recebeu
`PRODUCER_ACKNOWLEDGED` e gerou início e encerramento operacionais
correlacionados. A leitura idempotente posterior retornou `duplicate` sem nova
chamada ao produtor.

`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` permite que qualquer Code node desta
instância local leia as variáveis entregues ao pod. Isso é uma concessão
específica do alvo interno controlado e não deve ser copiada para produção ou
para uma instância com editores não confiáveis.

## Escopo ainda bloqueado

OPEN-01 a OPEN-05 continuam valendo somente para a arquitetura separada do
ingress v1/X4: alvo HTTPS versionado, worker terminal, reconciliação tardia,
freshness e DDL produtor externo. Eles não impedem os marcos operacionais
legados agora ativos e não autorizam representar o fluxo atual como aceitação
durável ou conclusão contratual.
