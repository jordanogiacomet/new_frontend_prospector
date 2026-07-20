# Alinhamento de Importação em Lotes com n8n — Design

**Spec:** `.specs/features/batch-import-n8n-alignment/spec.md`
**Status:** Aprovado para implementação local; gates externos permanecem

## Arquitetura proposta

```text
Browser
  │ POST /api/imports
  ▼
Prospecta API
  ├─ 1. APP DB: intent + idempotência + evento (commit)
  └─ 2. POST multipart uma vez
       │ arquivo_csv = bytes exatos
       │ submission_id, idempotency_key, file_sha256, contract_version
       ▼
Novo ingress n8n versionado
  ├─ 3. validar transporte/hash e fazer parsing produtor
  ├─ 4. uma chamada SQL transacional
  │      ├─ lote canônico
  │      ├─ linhas aceitas
  │      ├─ estado inicial
  │      └─ ledger de correlação da submissão
  ├─ 5. responder 202 com o resultado commitado
  └─ 6. entregar linhas a worker produtor aprovado
         ├─ terminal por linha
         └─ fechamento explícito do lote

Prospecta GET/serviço de reconciliação
  ├─ PRODUCER DB SELECT: aceitação + observações por vários lotes
  └─ APP DB: promoção idempotente + evento de reconciliação
```

O fluxo usa a fronteira existente: o app nunca escreve no produtor e o n8n
nunca escreve no schema comercial app-owned.

## Reuso

| Elemento existente | Uso |
| --- | --- |
| `src/server/imports/upload-file.ts` | Validação superficial, bytes aceitos e SHA-256 app-owned. |
| `src/server/imports/submit-import.ts` | Intent antes da chamada, idempotência e outcome desconhecido. |
| `src/server/imports/ingress-client.ts` | Multipart server-only, timeout e parsing seguro da resposta. |
| `prospecting_app.import_submissions` | Correlação organizacional e campos já previstos de aceitação durável. |
| `RECONCILIATION_OBSERVED` | Evento app-owned allowlisted já previsto no schema. |
| `lead_claim_processing_empresaaqui_import(...)` | Canonicalização/replay de lote e linha; usar por função agregadora produtora, não pelo app. |
| `prospecta_import_batch_observations_v1` | Fatos X4 de linhas, terminais, legado e fechamento. |
| `deriveBatchSummary(...)` | Estado de lote fail-closed conforme contrato. |

## Contrato do ingress versionado

### Request

`multipart/form-data`:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `arquivo_csv` | binário | Exatamente os bytes aceitos pelo app; nunca normalizar antes do hash. |
| `submission_id` | UUID/texto opaco | Deve corresponder a um intent app-owned para o app promover a aceitação. |
| `idempotency_key` | texto opaco | Identidade funcional; não é autenticação/replay de segurança. |
| `file_sha256` | 64 hex | Recalculado no n8n sobre `arquivo_csv`; divergência rejeita o lote. |
| `contract_version` | literal | `prospecta-import-v1`; qualquer outro valor falha fechado. |

O filename e content type permanecem hints. Limite, UTF-8, conteúdo não vazio e
cabeçalhos mínimos são novamente verificados no ingress porque o endpoint LAN
não é autenticado.

### Response

Sucesso continua com exatamente cinco campos para limitar mudança no app:

```ts
type DurableAcceptanceResponse = {
  accepted: true;
  message: "Lote aceito para processamento.";
  import_batch_id: `ib_${string}`;
  row_count: number;
  source: "EmpresaAqui";
};
```

O parser exige HTTP `202`, JSON, chaves exatas, ID canônico e inteiro positivo.
Resposta extra, incompleta, 2xx diferente ou erro de parse é outcome
desconhecido no app.

Erros de entrada usam envelope curto 4xx com código allowlisted. Erros de banco
ou estado ambíguo não retornam SQL, stack, nome de tabela, payload produtor ou
execução n8n.

## Aceitação produtora

### Ledger

Uma tabela produtora dedicada, criada e aplicada somente pelo dono do produtor,
mantém uma linha por submissão:

```text
prospecta_import_acceptances
  submission_id       PK
  import_batch_id     FK produtor
  uploaded_file_sha256
  idempotency_key_hash
  contract_version
  accepted_row_count
  accepted_at
```

O app não recebe `idempotency_key_hash`. Uma view allowlisted expõe somente
`submission_id`, `import_batch_id`, `uploaded_file_sha256`,
`accepted_row_count` e `accepted_at` ao papel read-only.

Regras de replay:

- mesma submissão + mesmo hash/contrato retorna a aceitação original;
- mesma submissão + hash/contrato diferente falha;
- outra submissão do mesmo arquivo pode apontar ao mesmo lote canônico,
  preservando a idempotência natural já existente;
- replay nunca reinicia linha `COMPLETED`.

### Função transacional

`prospecta_accept_empresaqui_batch_v1(jsonb)` recebe metadados do arquivo e o
array de linhas produtoras. Em uma transação:

1. valida chaves, hash, contrato e identidades;
2. cria ou resolve o `lead_import_batches` canônico;
3. cria/confirma toda `lead_input_rows` por `source_row`;
4. prepara estado estruturado usando a função produtora existente;
5. confere que o conjunto durável corresponde ao conjunto aceito;
6. grava a correlação da submissão;
7. retorna um único objeto com ID, contagem e timestamp commitáveis.

Qualquer conflito aborta a unidade inteira. O Postgres node chama somente essa
função parametrizada; não monta SQL por interpolação.

## Ordem do workflow n8n

O novo JSON deve tornar a dependência estrutural, não confiar na posição visual
de ramos:

```text
Webhook
  → Validar metadados e binário
  → Verificar hash
  → Extract From File
  → Normalizar EmpresaAqui (produtor)
  → Agregar payload do lote
  → Postgres: aceitar lote
  → Preparar resposta única
  → Respond to Webhook
  → Reabrir/split das linhas aceitas
  → Worker produtor aprovado
  → Agregar resultados
  → Postgres: fechar lote
```

O nó de resposta trabalha sobre um único item agregado. O payload de linhas
segue internamente depois da resposta; não é enviado ao browser nem logado.

Se o worker falhar antes do fechamento, o lote permanece aberto. Um error
workflow pode alertar operação, mas seu histórico não se torna fato de negócio
e não dispara retry. O fechamento, quando executado, não inventa terminais:
linhas faltantes resultam em `INCOMPLETE` no leitor.

### Fundamentos específicos do n8n

- A documentação oficial recomenda posicionar `Respond to Webhook` depois dos
  nós cujos dados formarão a resposta e informa que o nó responde uma vez com
  o primeiro item. Por isso o design agrega o lote antes da resposta:
  <https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/>.
- A ordem entre ramos varia com a versão do workflow e pode depender da
  posição no canvas. Por isso o commit e a resposta têm dependência sequencial,
  não dois ramos paralelos:
  <https://docs.n8n.io/flow-logic/execution-order/>.
- O n8n separa URLs de teste e produção; o teste remoto deve usar somente o
  alvo explicitamente identificado e nunca publicar o workflow atual:
  <https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/workflow-development/>.
- Error workflows servem para reação operacional a falhas, mas não substituem
  terminais ou fechamento produtores:
  <https://docs.n8n.io/flow-logic/error-handling/>.
- Dados de execução podem ser podados, inclusive binários. Logo, histórico do
  n8n não é retenção nem fonte de status de lote:
  <https://docs.n8n.io/hosting/scaling/execution-data/>.

## Interface do worker produtor

OPEN-02 precisa fornecer uma interface versionada que:

- consuma `import_batch_id`, `source_row`, `input_row_id`, `lead_run_id`,
  `idempotency_key` e o payload normalizado produtor;
- preserve exatamente score, prioridade, ação, veredito, confiança e
  enriquecimento existentes;
- escreva os estados/decisões estruturados aprovados;
- retorne um resultado terminal mapeável ou um erro explícito;
- seja idempotente por linha;
- não dependa de alteração ou clonagem do workflow produtivo atual.

Sem essa interface, o artefato pode validar aceitação em ambiente isolado, mas
não pode ser promovido como importação fim a fim.

## Reconciliação app-owned

`reconcileImportAcceptance({ organizationId, submissionId })`:

1. carrega a submissão no app DB sob a organização verificada;
2. consulta a view produtora por `submission_id`;
3. compara SHA-256, ID canônico, timestamp e contagem;
4. em uma transação app-owned, atualiza:
   `status = DURABLE_ACCEPTED`, `durable_accepted_at`,
   `durable_accepted_row_count`, `import_batch_id` e
   `status_fact_source = durable_acceptance`;
5. inclui um único evento `RECONCILIATION_OBSERVED` com apenas fonte, status,
   `import_batch_id` e contagem.

O serviço é idempotente e não rebaixa fatos já confirmados. O primeiro uso é
síncrono após um `202`. Recuperação tardia de timeout fica atrás de OPEN-03;
até o runner ser aprovado, timeout permanece desconhecido.

## Leitura de status

O repositório produtor recebe todos os IDs da página em um array parametrizado
e retorna fatos agrupáveis:

```text
WHERE import_batch_id = ANY($1::text[])
```

Uma consulta separada em lote obtém aceitações por `submission_id`. O serviço
mantém:

- fato app-owned como base independente;
- aceitação validada como fonte de `rowCountAccepted`;
- X4 como fonte de atividade, terminais e fechamento;
- contagens `null` quando a fonte falha ou entra em conflito.

O algoritmo de integridade deve detectar mais de um `lead_run_id`
materializado por `source_row`, mesmo que todos mapeiem para
`MATERIALIZED`. Deduplicar apenas por classe terminal não é suficiente.

## Segurança e privacidade

- O perfil LAN HTTP envia zero auth headers, conforme autorização explícita.
- Metadados funcionais não são apresentados como autenticação ou proteção
  contra replay.
- URL e configuração permanecem server-only.
- O n8n não salva execução de sucesso com payload/binário quando a configuração
  operacional permitir; pruning continua obrigatório, mas não é fonte de
  retenção de negócio.
- CSV, linhas brutas, payloads normalizados, contatos, relatórios e erros de
  banco não entram em logs, eventos app-owned ou respostas.
- O app valida permissão antes de arquivo, hash, DB ou chamada produtora.
- Produção continua exigindo HTTPS e contrato remoto de autenticação/replay.

## Erros

| Situação | Ingress | App |
| --- | --- | --- |
| Multipart/campo/hash/UTF-8/header inválido | 4xx seguro, nenhuma escrita | Erro de validação/integração seguro |
| Conflito da mesma submissão | 409 seguro | Estado anterior preservado |
| Falha antes do commit | 5xx seguro | `ACCEPTANCE_UNKNOWN`, sem retry |
| Commit com resposta perdida | Cliente expira | Reconciliação pode confirmar depois |
| View produtora indisponível | Sem impacto no commit | Ack/estado anterior; contagens nulas |
| Worker falha após `202` | Lote permanece aberto | `PROCESSING`/`NO_UPDATE`, nunca “falhou” por ausência |
| Fechamento com linha faltante | Close durável | `INCOMPLETE` |

## Desempenho

- uma transação de aceitação por arquivo;
- uma consulta de aceitação e uma consulta X4 por página, não por lote;
- página limitada a 100;
- `EXPLAIN (ANALYZE, BUFFERS)` com dados sintéticos/disposable antes de grants;
- o limite de upload deve ser aplicado durante leitura, não apenas depois de
  materializar o arquivo inteiro;
- o timeout do app permanece configurável e o contrato remoto deve provar que
  o limite de 10 MiB é compatível ou reduzir o limite aprovado.

## Migração e rollback

1. Criar função, ledger e view em alvo produtor descartável por operador.
2. Conceder `SELECT` somente na view ao papel do app.
3. Importar o novo workflow em instância n8n não produtiva sem publicar o
   workflow atual.
4. Executar testes sintéticos e registrar IDs/versões remotos.
5. Configurar o app para o novo URL somente no alvo autorizado.
6. Rollback restaura a configuração imutável anterior e interrompe novas
   submissões; não apaga lote, linhas, terminais, aceitação nem auditoria.

Ativação, grants e migração em produção não fazem parte da execução deste
draft.
