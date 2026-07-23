# Alinhamento de Importação em Lotes com n8n — Especificação

**Status:** Início operacional, atualização visível e callback legado ativos no Demo 3
**Data:** 23/07/2026
**Contexto:** `.specs/features/batch-import-n8n-alignment/context.md`

## Problema

O Prospecta já registra a intenção de submissão antes de chamar o n8n, aplica
idempotência app-owned e faz uma única chamada com os bytes aceitos. Porém, o
contrato remoto atual devolve um acknowledgement depois de parsing e
normalização, em paralelo com a persistência e o processamento. Esse `202` não
prova aceitação durável do lote.

Há cinco desalinhamentos objetivos:

| Lacuna | Evidência atual | Efeito |
| --- | --- | --- |
| Resposta antecipada | O ramo de resposta atual não depende de um registro durável de aceitação. | O app só pode mostrar `SUBMITTED`. |
| Identificador incompatível | n8n usa `empresaqui_<ISO>`; o schema estruturado exige `ib_<64 hex>`. | A resposta não correlaciona com `lead_import_batches`. |
| Fatos estruturados ausentes | O workflow observado escreve tabelas legadas, não `lead_import_batches`, `lead_input_rows`, estados, decisões e fechamento. | Contagens e conclusão não são demonstráveis. |
| Promoção app-owned ausente | O schema do app prevê aceitação durável, mas não há serviço/repositório que a grave. | Campos de aceitação permanecem inativos. |
| Artefato versionado ausente | `integrations/n8n/prospecting-import-v1/` não existe e o export citado em `private-workflows/` não está no worktree. | Não há fonte revisável para evoluir e testar sem tocar no workflow atual. |

Além disso, a lista de lotes consulta observações produtoras individualmente
por submissão. Isso cria até 100 leituras produtoras por página e amplia o
impacto de uma fonte lenta ou indisponível.

## Escopo ativo simplificado em 22/07/2026

O owner priorizou o fluxo atual de 98 nós: enviar o CSV uma única vez, saber
quando esse workflow informou que iniciou e terminou o processamento e
reconsultar as telas visíveis sem recarregamento manual. As entregas ativas são
ALIGN-19–ALIGN-22. A
evolução separada v1, seus fatos X4 e OPEN-01–OPEN-05 permanecem preservados
como trabalho futuro, mas não são pré-requisito para exibir o relato legado de
encerramento. O workflow atual continua imutável.

## Objetivos

- [ ] Criar contrato e artefato de ingress separados, versionados e
      revisáveis, sem modificar o workflow produtivo atual.
- [ ] Garantir aceitação atômica e durável de lote e linhas antes do `202`.
- [ ] Correlacionar `submissionId`, SHA-256 e `import_batch_id` canônico sem
      expor esses campos indevidamente na UI.
- [ ] Registrar no app somente aceitação produtora validada.
- [ ] Permitir reconciliação somente leitura após resposta perdida, sem retry
      de upload.
- [ ] Produzir fatos estruturados de terminal e fechamento para derivar os
      estados do contrato de lote.
- [ ] Reduzir leitura de observações a uma consulta em lote por página.
- [ ] Validar tudo com dados sintéticos e evidência explícita do alvo
      não produtivo.
- [x] Receber o `BATCH_CLOSED` já emitido pelo workflow legado como relato
      app-owned de encerramento do loop, sem promovê-lo a fechamento produtor
      nem inventar contagens.
- [x] Registrar somente o primeiro `ACCEPTED_ROW` como início operacional
      app-owned, sem promovê-lo a aceite durável nem inventar contagens.
- [x] Reconsultar automaticamente lista, detalhe e histórico de leads a cada
      cinco segundos enquanto a página estiver visível.
- [x] Implantar a release imutável no Demo 3 e configurar URL/segredo comuns
      no app e no n8n sem editar o workflow atual.

## Fora de escopo

| Item | Motivo |
| --- | --- |
| Alterar ou ativar o workflow produtivo atual | Proibido pela fronteira permanente do produtor. |
| Reprocessar, reenviar ou tentar novamente automaticamente | Pode duplicar custo/efeito e não é autorizado. |
| Recalcular score, prioridade, ação ou veredito | Semântica pertence ao produtor. |
| Criar tabelas produtoras pelo papel do app | O app é somente leitura no produtor. |
| Usar histórico de execução do n8n como fonte de negócio | Pode ser podado e não substitui fatos produtores. |
| Habilitar em produção | Exige alvo, credenciais, dono, rollback e aprovação separados. |
| Copiar dados reais para teste/evidência | Vedado; testes usam somente dados sintéticos. |

---

## Histórias de usuário

### P1: Aceitação de lote confiável ⭐ MVP

**História:** Como gestor, quero saber quando um arquivo foi realmente aceito
para que “aceito” não signifique apenas que o n8n começou a ler o upload.

**Critérios de aceitação:**

1. QUANDO o app aceitar um upload, ENTÃO DEVE persistir a intenção app-owned
   antes de chamar o n8n.
2. QUANDO o novo ingress receber o arquivo e metadados de correlação, ENTÃO
   DEVE verificar tamanho, UTF-8, cabeçalho, SHA-256 e contrato antes de
   qualquer escrita produtora.
3. QUANDO o arquivo não contiver nenhuma linha de dados além do cabeçalho,
   ENTÃO o ingress DEVE rejeitá-lo sem criar um lote vazio.
4. QUANDO todas as linhas forem estruturalmente aceitas, ENTÃO uma única
   transação produtora DEVE registrar o lote canônico, todas as identidades de
   linha e a correlação com a submissão.
5. QUANDO essa transação não for confirmada, ENTÃO o ingress NÃO DEVE devolver
   `202 accepted: true`.
6. QUANDO a transação for confirmada, ENTÃO o `row_count` DEVE ser a contagem
   durável de linhas aceitas e o `import_batch_id` DEVE ser o canônico
   `ib_<64 hex>`.
7. QUANDO uma linha tiver CNPJ ou conteúdo comercial inválido, ENTÃO ela DEVE
   permanecer no conjunto aceito e terminar depois como `BLOCKED` ou `FAILED`
   segundo a regra produtora; não pode desaparecer da contagem.

**Teste independente:** Enviar um CSV sintético com linhas válidas e
business-invalid, confirmar o `202`, consultar a fonte produtora e provar que
todas as linhas aceitas existem sob o lote retornado.

### P1: Resultado desconhecido sem duplicar envio ⭐ MVP

**História:** Como gestor, quero que uma resposta perdida continue honesta e
possa ser reconciliada sem reenviar o arquivo.

**Critérios de aceitação:**

1. QUANDO a chamada ao ingress expirar ou perder a resposta, ENTÃO o app DEVE
   registrar `ACCEPTANCE_UNKNOWN` sem `import_batch_id` inventado.
2. QUANDO uma aceitação produtora correlacionada existir, ENTÃO um serviço de
   reconciliação DEVE lê-la por `submissionId`, validar SHA-256, lote e
   contagem, e persistir `DURABLE_ACCEPTED` mais evento append-only em uma
   transação app-owned.
3. QUANDO nenhuma aceitação existir, ENTÃO a reconciliação DEVE manter o estado
   anterior e não chamar n8n.
4. QUANDO houver conflito de hash, submissão, lote ou contagem, ENTÃO o app
   DEVE falhar fechado e registrar apenas metadados allowlisted de integridade.
5. QUANDO a mesma aceitação for observada novamente, ENTÃO a operação DEVE ser
   idempotente e não duplicar o evento de negócio.

**Teste independente:** Simular commit produtor seguido de perda de resposta,
executar reconciliação somente leitura e confirmar uma única promoção
app-owned sem segunda chamada ao n8n.

### P1: Acompanhamento honesto até o fechamento ⭐ MVP

**História:** Como gestor, quero acompanhar o lote até o fim sem ver conclusão
ou zeros que o produtor não comprovou.

**Critérios de aceitação:**

1. QUANDO uma linha iniciar processamento, ENTÃO sua identidade aceita DEVE ser
   preservada no estado estruturado.
2. QUANDO uma linha terminar, ENTÃO DEVE haver exatamente uma classe terminal
   aprovada: `MATERIALIZED`, `BLOCKED` ou `FAILED`.
3. QUANDO dois terminais diferentes ou dois runs materializados distintos
   competirem pela mesma linha, ENTÃO a observação DEVE ser `INCONSISTENT` e o
   app não pode escolher um.
4. QUANDO a orquestração do lote terminar, ENTÃO o produtor DEVE persistir um
   fechamento explícito; o fim de uma execução n8n não é suficiente.
5. QUANDO o lote fechar com todas as linhas terminais, ENTÃO o app DEVE derivar
   `COMPLETED`.
6. QUANDO o lote fechar faltando terminal, ENTÃO o app DEVE derivar
   `INCOMPLETE`.
7. QUANDO não houver fechamento, ENTÃO o app DEVE manter `PROCESSING` ou
   `NO_UPDATE`, nunca inferir falha/conclusão.

**Teste independente:** Exercitar lotes sintéticos completo, incompleto,
aberto, duplicado e conflitante e comparar a saída com o contrato de status.

### P1: Integração versionada e verificável ⭐ MVP

**História:** Como responsável técnico, quero uma fonte versionada e testes de
contrato para promover exatamente o artefato validado.

**Critérios de aceitação:**

1. QUANDO o novo workflow for desenvolvido, ENTÃO seu JSON, README, contrato e
   instruções de importação/rollback DEVEM existir sob
   `integrations/n8n/prospecting-import-v1/`.
2. QUANDO os testes rodarem, ENTÃO DEVEM verificar forma da requisição,
   validações seguras, correlação, aceitação durável, timing da resposta,
   conjunto X4 de observações e identidade remota do workflow.
3. QUANDO qualquer evidência remota estiver ausente, ENTÃO o gate DEVE falhar;
   variáveis de attestation não podem ser preenchidas por suposição.
4. QUANDO o alvo for o perfil LAN aprovado, ENTÃO o cliente DEVE enviar zero
   cabeçalhos de autenticação. Qualquer outro HTTP DEVE ser rejeitado.
5. QUANDO o alvo for produção, ENTÃO o rollout DEVE permanecer bloqueado até
   contrato HTTPS e autenticação/replay aprovados e testados remotamente.

**Teste independente:** Importar o artefato em instância n8n descartável,
publicá-lo somente no alvo de teste identificado e executar o contrato
sintético completo.

### P2: Leitura eficiente de lotes

**História:** Como gestor, quero que a lista de lotes permaneça responsiva
mesmo com uma página cheia.

**Critérios de aceitação:**

1. QUANDO uma página tiver até 100 submissões, ENTÃO o repositório DEVE buscar
   aceitações/observações em lote, sem uma consulta produtora por item.
2. QUANDO uma parte da fonte estiver indisponível ou inconsistente, ENTÃO cada
   lote DEVE preservar seu último fato independente e contagens produtoras
   `null`.
3. QUANDO o plano de consulta exceder o orçamento aprovado, ENTÃO a feature
   DEVE permanecer desabilitada no ambiente.

**Teste independente:** Medir uma página sintética de 100 lotes em PostgreSQL
descartável e provar quantidade de queries, paginação e comportamento parcial.

### P1: Encerramento simples informado pelo workflow legado

**História:** Como gestor, quero saber quando o workflow atual informou o fim
do processamento para não precisar acompanhar a execução manualmente.

**Critérios de aceitação:**

1. QUANDO o callback `BATCH_CLOSED` chegar, ENTÃO o app DEVE autenticar o
   segredo antes de ler o corpo ou acessar PostgreSQL.
2. QUANDO o lote não pertencer à organização configurada ou não corresponder
   a uma submissão reconhecida, ENTÃO o callback DEVE falhar fechado.
3. QUANDO o callback for válido, ENTÃO o app DEVE registrar um evento
   append-only com somente lote, horário e quantidade esperada allowlisted.
4. QUANDO o mesmo callback for reenviado, ENTÃO o replay idêntico DEVE ser
   aceito sem novo evento e o replay conflitante DEVE ser rejeitado.
5. QUANDO o evento existir, ENTÃO lista e detalhe DEVEM mostrar
   “Processamento encerrado” e o horário informado.
6. O relato legado NÃO DEVE alterar `BatchStatus`, produzir `COMPLETED`,
   preencher aceite/terminais ou substituir a fonte produtora X4.

**Teste independente:** Entregar um `BATCH_CLOSED` sintético autenticado,
confirmar um único evento app-owned e observar a apresentação mudar no próximo
refresh sem nenhuma escrita produtora.

### P1: Início operacional e resultados visíveis sem recarga manual

**História:** Como gestor, quero ver quando o workflow atual começou a processar
o arquivo e quero que as decisões produzidas apareçam nas telas abertas sem
precisar recarregar o navegador.

**Critérios de aceitação:**

1. QUANDO chegar o primeiro `ACCEPTED_ROW` autenticado e correlacionado, ENTÃO
   o app DEVE registrar um único evento append-only mínimo com lote e horário.
2. QUANDO chegarem os demais `ACCEPTED_ROW` do mesmo lote, ENTÃO o app DEVE
   tratá-los como replay sem criar novos eventos nem conflito de horário.
3. QUANDO o início operacional existir sem um fechamento posterior, ENTÃO
   lista e detalhe de lotes DEVEM mostrar somente “Processamento iniciado pelo
   workflow”.
4. O início operacional NÃO DEVE alterar `BatchStatus`, preencher
   `acceptedAt`, `rowCountAccepted`, terminais ou resultados.
5. ENQUANTO lista de leads, detalhe do lead ou histórico retido estiverem
   visíveis, ENTÃO o cliente DEVE repetir o GET privado sem cache a cada cinco
   segundos, sem sobrepor requisições.
6. QUANDO a página estiver oculta ou desmontada, ENTÃO o cliente NÃO DEVE
   iniciar nova consulta e DEVE cancelar a consulta pendente ao desmontar.
7. QUANDO a release for promovida ao Demo 3, ENTÃO app e n8n DEVEM usar o
   mesmo segredo server-only e o callback exato
   `http://192.168.0.20:30100/api/imports/events`, preservando o workflow
   atual.

**Teste independente:** Entregar dois `ACCEPTED_ROW` sintéticos do mesmo lote,
confirmar um único início app-owned com status contratual ainda `SUBMITTED`,
depois devolver uma nova decisão pelas APIs de leads e observá-la no próximo
poll visível.

## Casos de borda

- arquivo vazio, somente cabeçalho, UTF-8 inválido, aspas irrecuperáveis,
  campo multipart incorreto e arquivo acima do limite;
- hash declarado diferente dos bytes recebidos;
- mesma `submissionId` com outro hash;
- mesma chave app-owned com outro hash (`409` no app antes do n8n);
- dois `submissionId` que convergem para o mesmo lote canônico por replay
  funcional do mesmo arquivo/versões;
- resposta `202` perdida depois do commit produtor;
- resposta `202` recebida, mas a view de confirmação temporariamente
  indisponível;
- fechamento duplicado, fechamento sem todos os terminais e terminal após
  fechamento;
- linha aceita sem CNPJ válido;
- dois `lead_run_id` materializados para a mesma `source_row`;
- fonte produtora indisponível, lenta ou com fatos além de
  `rowCountAccepted`.

## Requisitos e rastreabilidade

| ID | Requisito | Prioridade | Status |
| --- | --- | --- | --- |
| ALIGN-01 | Ingress separado e artefato versionado; zero mudança no workflow produtivo | P1 | Artefato local inativo implementado; identidade remota pendente |
| ALIGN-02 | Intent app-owned antes de uma única chamada com bytes exatos | P1 | Já implementado; preservar |
| ALIGN-03 | Metadados versionados de correlação e verificação SHA-256 no ingress | P1 | Implementado localmente; execução n8n remota pendente |
| ALIGN-04 | Erros 4xx seguros antes de escrita para entrada inválida | P1 | Harness remoto implementado; comportamento remoto pendente |
| ALIGN-05 | `import_batch_id` canônico compatível com schema estruturado | P1 | Cadeia canônica consolidada e validada em PostgreSQL descartável |
| ALIGN-06 | Aceitação atômica de lote, linhas e correlação da submissão | P1 | Implementado, sem drafts duplicados, e validado em PostgreSQL descartável |
| ALIGN-07 | `202` somente após commit; `row_count` igual a linhas duráveis | P1 | Dependência estrutural implementada; timing remoto pendente |
| ALIGN-08 | Ledger/view produtor de aceitação consultável por submissão | P1 | Implementado e isolado por papel read-only local |
| ALIGN-09 | Promoção app-owned transacional para `DURABLE_ACCEPTED` | P1 | Implementado e validado localmente |
| ALIGN-10 | Timeout honesto e reconciliação sem chamada/retry do n8n | P1 | Reconciliação síncrona implementada; runner tardio bloqueado por OPEN-03 |
| ALIGN-11 | Processamento preserva identidade e produz terminal estruturado | P1 | Gate exato passável implementado; worker real bloqueado por OPEN-02 |
| ALIGN-12 | Fechamento produtor explícito separado de execução n8n | P1 | Função e ordem estrutural implementadas localmente |
| ALIGN-13 | Conclusão/incompletude conforme contrato, com conflitos fail-closed | P1 | Integridade local implementada; fim a fim bloqueado por OPEN-02 |
| ALIGN-14 | Observações/aceitações produtoras consultadas em lote | P2 | Implementado para até 100 IDs distintos |
| ALIGN-15 | Sem CSV, payload bruto, segredo ou erro produtor em logs/respostas | P1 | Gates estáticos/unitários implementados; cobertura remota pendente |
| ALIGN-16 | Contrato sintético comprova identidade, correlação, timing e X4 | P1 | 13 casos estáticos passam; 57 casos HTTP permanecem skipped sem evidência remota |
| ALIGN-17 | HTTP sem auth apenas no alvo LAN exato; produção bloqueada | P1 | Política existente; preservar |
| ALIGN-18 | Rollout/rollback imutável, sem apagar auditoria ou produtor | P1 | Release Demo 3 executada; rollback imutável registrado e não acionado |
| ALIGN-19 | Relato legado de encerramento autenticado, append-only e separado de `COMPLETED` | P1 | Ativo no Demo 3; callback autenticado alcança a rota |
| ALIGN-20 | Primeiro `ACCEPTED_ROW` vira início operacional app-owned, nunca aceite durável | P1 | Implementado, testado e ativo |
| ALIGN-21 | Lista, detalhe e histórico de leads atualizam por polling somente quando visíveis | P1 | Implementado, testado e ativo |
| ALIGN-22 | Demo 3 e n8n compartilham callback/segredo sem editar o workflow atual | P1 | Configurado e verificado no alvo local autorizado |

## Critérios de sucesso

- [ ] Nenhum `202` do endpoint versionado ocorre sem aceitação produtora
      durável do lote inteiro.
- [ ] Toda resposta aceita pode ser correlacionada à submissão e ao SHA-256
      sem consultar histórico de execução n8n.
- [ ] Um timeout pós-commit é recuperável sem segundo upload.
- [ ] `COMPLETED` e `INCOMPLETE` passam em todos os cenários sintéticos do
      contrato, inclusive conflitos.
- [ ] Uma página de 100 lotes usa número constante de consultas produtoras.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
      `pnpm test:integration` e `pnpm test:contract` passam nos alvos
      autorizados.
- [ ] Nenhum dado real aparece em fixture, log, screenshot ou evidência.
