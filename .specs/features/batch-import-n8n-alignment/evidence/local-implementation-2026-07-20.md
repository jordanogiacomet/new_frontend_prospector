# Evidência local consolidada — 22/07/2026

## Escopo executado

- artefato n8n v1 local, inativo e sem credencial/URL/identidade remota;
- aceitação produtora atômica, ledger, view read-only e rollback;
- contrato terminal `prospecta-producer-worker-v1` passável e fail-closed;
- fechamento explícito produtor separado dos terminais;
- cliente app v1 com bytes/hash/metadados exatos e uma única chamada;
- promoção app-owned para `DURABLE_ACCEPTED` após read-back produtor;
- leitura X4 em lote para até 100 IDs;
- harness remoto v1 exige HTTPS, inspeção hash-bound e SELECT produtor,
  sem variáveis manuais `...=verified`.
- cadeia de migração produtora consolidada nos pares canônicos
  `003_import_acceptance.sql` / `004_import_acceptance_rollback.sql` e
  `005_import_batch_close.sql` / `006_import_batch_close_rollback.sql`.

Nenhum workflow foi importado, publicado ou ativado. Nenhuma migração foi
aplicada fora dos dois bancos PostgreSQL locais descartáveis. Nenhum endpoint
remoto, cluster ou dado real foi usado.

## Gates

O binário `pnpm` não estava disponível no `PATH`; foram usados os scripts
equivalentes do `package.json` via `npm` e os binários já instalados em
`node_modules/.bin`. Nenhum pacote foi instalado.

| Gate | Resultado |
| --- | --- |
| `npm run lint` | passou sem warning |
| `npm run typecheck -- --pretty false` | passou |
| `npm test` | 74 arquivos, 1.744 testes passaram |
| `npm run test:integration` | 8 arquivos, 87 testes passaram, incluindo o orçamento `EXPLAIN` |
| contrato estático/local | 1 arquivo, 13 testes passaram |
| contratos HTTP remotos | 2 suites / 57 casos não executados por ausência de alvo |
| `npm run build` simples | recusou flags Demo 2 inseguras carregadas de `.env.local`; nenhuma alteração foi feita nesse arquivo |
| build com overrides seguros somente no processo | passou e gerou 23 rotas |
| `git diff --check` | passou |

Na execução inicial de 20/07, o primeiro gate de integração expôs uma asserção
antiga que procurava `actor_issuer`, `request_correlation_id` e
`authorization_basis` na atividade comercial. O contrato armazena esses campos
no evento de auditoria append-only. O teste foi corrigido para verificar a
tabela certa; o teste focado passou 7/7 e o gate integral subsequente passou
86/86.

Na consolidação de 22/07, a primeira invocação do gate PostgreSQL passou 45
casos e recusou 42 porque `PGUSER`/`PGPASSWORD` sintéticos não foram fornecidos
ao processo. Sem mudar código, o gate foi repetido com as credenciais do
container descartável e passou 87/87. O container, limitado a
`127.0.0.1:55432`, foi removido ao final.

## Provas sintéticas relevantes

- replay idêntico converge para uma aceitação; correlação conflitante falha;
- falha na linha N reverte lote, linhas e ledger;
- duas chamadas concorrentes iguais convergem;
- o papel produtor de leitura vê somente os cinco campos allowlisted e não
  consegue inserir no ledger;
- consulta por submissão possui orçamento sintético
  `EXPLAIN (ANALYZE, BUFFERS)` com custo total abaixo de 100;
- fechamento igual é idempotente e conflito falha fechado;
- fechamento não cria terminal nem muda score/decisão;
- reconciliação valida organização antes do produtor e promove app + evento em
  uma transação;
- timeout não dispara outro upload;
- a lista de 100 lotes usa uma consulta produtora parametrizada;
- dois `lead_run_id` materializados para a mesma linha ficam
  `INCONSISTENT`.

## Gates externos retidos

| Gate | Estado |
| --- | --- |
| OPEN-01 | falta URL HTTPS v1 não produtiva, workflow ID/version e inspeção autorizada |
| OPEN-02 | o gate exato existe, mas falta conectar o worker/subworkflow real que produz os sete campos terminais |
| OPEN-03 | falta runner aprovado para reconciliação tardia; só o read-back síncrono está implementado |
| OPEN-04 | falta dono e janela de `NO_UPDATE`; estado continua desabilitado |
| OPEN-05 | falta alvo/dono/credencial/aprovação para aplicar DDL produtor fora do banco descartável |

Para transformar ausência de evidência remota em falha explícita:

```sh
N8N_VERSIONED_CONTRACT_REQUIRED=true \
N8N_VERSIONED_CONTRACT_URL=<URL_HTTPS_NAO_PRODUTIVA_V1> \
N8N_VERSIONED_CONTRACT_PRODUCER_DATABASE_URL=<URL_POSTGRES_SELECT_ONLY> \
N8N_VERSIONED_CONTRACT_INSPECTION_FILE=<ARQUIVO_DE_INSPECAO_SANITIZADO> \
pnpm test:contract
```

## Consolidação das migrações

Os quatro arquivos duplicados foram comparados integralmente. A cadeia sem
sufixo foi mantida porque é a única referenciada por integração e preserva as
validações mais estritas de manifesto, `source_row`, conjunto durável de linhas,
revoke e DDL operator-owned. Os drafts `_v1` não continham regra necessária
exclusiva e foram removidos. Nenhum outro arquivo foi removido.

## Limitações

- Nenhum contrato HTTP remoto foi executado ou aprovado nesta consolidação.
- Nenhum workflow foi importado, publicado, ativado ou administrado.
- Nenhuma migração foi aplicada fora do PostgreSQL local descartável.
- Nenhum cluster, deploy, secret, configuração externa ou dado real foi usado.
- T13 permanece sem UAT fim a fim remoto e T14 permanece bloqueada.
