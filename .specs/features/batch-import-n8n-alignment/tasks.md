# Alinhamento de Importação em Lotes com n8n — Tasks

**Design:** `.specs/features/batch-import-n8n-alignment/design.md`
**Status:** Em execução local

## Plano de execução

```text
T01 → T02
T02 → T03 → T04
T02 → T05
T04 + T05 → T06 → T11
T04 → T07 → T08 → T09 → T10
T06 + T10 + T11 → T12 → T13 → T14
```

- T03/T04: primitivas produtoras e teste de integração.
- T05/T06: app, aceitação durável e reconciliação.
- T07–T10: artefato n8n, aceitação, processamento e fechamento.
- T11: leitura em lote e integridade.
- T12–T14: contrato, UAT e rollout.

## Fases e gates

| Fase | Resultado | Gate para avançar |
| --- | --- | --- |
| A — Contrato | Semântica e alvo de teste aprovados | OPEN-01 e OPEN-02 resolvidos |
| B — Produtor | Função/ledger/view validados em PostgreSQL descartável | OPEN-05, integração e role isolation |
| C — App | Cliente/reconciliação/status passam localmente | lint, typecheck, unit, build |
| D — n8n | JSON versionado passa contrato sintético | identidade remota e timing comprovados |
| E — UAT | Lote completo/incompleto/timeout verificados | aprovação do dono operacional |
| F — Rollout | Troca imutável no alvo autorizado | aprovação separada; produção continua fora de escopo |

## Breakdown

### T01: Congelar o contrato local e os gates externos

**What:** Aprovar a semântica local, escolher o path lógico do artefato e
atualizar os contratos existentes sem atribuir garantias ao workflow atual.
OPEN-01–OPEN-05 continuam gates para execução externa.

**Where:** `context.md`, `spec.md`,
`.specs/features/prospecting-console/contracts/n8n-import-webhook.md`,
`.specs/features/prospecting-console/contracts/batch-status-contract.md`.

**Depends on:** None
**Reuses:** contratos e evidências atuais.
**Requirement:** ALIGN-01, ALIGN-07, ALIGN-10, ALIGN-17, ALIGN-18

**Done when:**

- [x] Path lógico local está definido sem configurar alvo remoto.
- [x] Interface do worker produtor está nomeada e versionada.
- [x] `NO_UPDATE` e reconciliação tardia permanecem desabilitados enquanto
      seus responsáveis não forem definidos.
- [x] Contratos distinguem explicitamente endpoint atual e endpoint
      versionado.
- [x] Nenhum texto afirma que o workflow atual oferece aceitação durável.

**Tests:** revisão de contrato
**Gate:** aprovação humana registrada no spec; OPEN-01–OPEN-05 retidos

**Status:** Completed locally on 20/07/2026. No remote target, workflow,
database, deployment, or environment configuration was changed.

### T02: Criar harness estático para artefato n8n versionado

**What:** Criar diretório, README, schema/validador de export e teste que falha
enquanto o JSON não cumpre path, nós, conexões, ausência de credenciais e ordem
de aceitação/resposta.

**Where:** `integrations/n8n/prospecting-import-v1/`,
`tests/contract/n8n-import-workflow-artifact.contract.test.ts`.

**Depends on:** T01
**Reuses:** inspeção estática do contrato atual, convenções Vitest.
**Requirement:** ALIGN-01, ALIGN-15, ALIGN-16

**Done when:**

- [ ] O artefato tem identidade local versionada, README e rollback.
- [ ] O teste prova que `Respond to Webhook` depende do nó de aceitação.
- [ ] O teste rejeita credenciais/URLs/secrets embutidos e referências ao
      workflow produtivo.
- [ ] O teste prova campos multipart e resposta allowlisted.

**Tests:** contract estático
**Gate:** `pnpm test:contract`

### T03: Implementar aceitação produtora atômica

**What:** Fornecer migração e rollback operator-owned para ledger, função
`prospecta_accept_empresaqui_batch_v1` e constraints de replay/conflito.

**Where:** novos arquivos sequenciais em `db/producer/`.

**Depends on:** T02
**Reuses:** `lead_claim_processing_empresaaqui_import`,
`lead_import_batches`, `lead_input_rows` e tipos estruturados existentes.
**Requirement:** ALIGN-03, ALIGN-05, ALIGN-06, ALIGN-08, ALIGN-15

**Done when:**

- [ ] Uma transação cria/confirma lote, todas as linhas e ledger.
- [ ] O ID retornado é canônico e a contagem corresponde às linhas duráveis.
- [ ] Replay igual retorna o original; conflito de submissão/hash aborta.
- [ ] Não existe `CASCADE`, CSV bruto, SQL dinâmico ou grant ao papel app
      write.
- [ ] Rollback remove somente objetos novos após preflight seguro.

**Tests:** PostgreSQL integration
**Gate:** revisão do dono do produtor antes de qualquer execução

### T04: Expor aceitação somente leitura e provar isolamento

**What:** Criar view allowlisted por submissão, índices aprovados e testes de
role isolation/concorrência/atomicidade.

**Where:** `db/producer/`, `tests/integration/`.

**Depends on:** T03
**Reuses:** cliente produtor read-only e harness PostgreSQL descartável.
**Requirement:** ALIGN-06, ALIGN-08, ALIGN-15

**Done when:**

- [ ] A view expõe somente os cinco campos descritos no design.
- [ ] O papel app consegue `SELECT` e falha em toda mutação.
- [ ] Falha na linha N reverte lote, linhas e ledger.
- [ ] Duas chamadas concorrentes iguais convergem; chamadas conflitantes
      falham fechado.
- [ ] `EXPLAIN` e orçamento de consulta são registrados sem dados reais.

**Tests:** PostgreSQL integration + role isolation
**Gate:** `pnpm test:integration`

### T05: Estender o cliente app para o contrato versionado

**What:** Enviar os metadados multipart, manter bytes exatos e aceitar somente
o novo shape/ID canônico, sem auth no perfil LAN.

**Where:** `src/server/imports/ingress-client.ts`,
`src/server/imports/ingress-client.test.ts`,
`src/server/imports/submit-import.ts` e teste co-localizado.

**Depends on:** T02
**Reuses:** timeout, URL policy, parser seguro e upload validado.
**Requirement:** ALIGN-02, ALIGN-03, ALIGN-07, ALIGN-10, ALIGN-15, ALIGN-17

**Done when:**

- [ ] O form contém arquivo e quatro metadados; os bytes são idênticos.
- [ ] Nenhum cabeçalho HMAC/auth é emitido no perfil interno.
- [ ] `202` malformado, ID temporal, campo extra e erro viram outcome
      desconhecido.
- [ ] Há exatamente uma chamada e nenhuma tentativa automática.
- [ ] Testes confirmam que o hash vem dos bytes transmitidos.

**Tests:** unit
**Gate:** `pnpm test src/server/imports/ingress-client.test.ts src/server/imports/submit-import.test.ts`

### T06: Persistir e reconciliar aceitação no app

**What:** Adicionar repositório/serviço que confirma a view produtora e promove
aceitação mais evento em transação app-owned.

**Where:** `src/server/repositories/imports/`,
`src/server/imports/import-acceptance-reconciliation.ts` e testes
co-localizados.

**Depends on:** T04, T05
**Reuses:** campos `durable_accepted_*`, status `DURABLE_ACCEPTED` e evento
`RECONCILIATION_OBSERVED`.
**Requirement:** ALIGN-08, ALIGN-09, ALIGN-10, ALIGN-15

**Done when:**

- [ ] Organização é verificada antes da consulta produtora.
- [ ] Hash, ID, timestamp e contagem são validados.
- [ ] Atualização/evento são atômicos, idempotentes e não rebaixam status.
- [ ] Sucesso do ingress tenta read-back; falha da view preserva
      acknowledgement sem promoção.
- [ ] Timeout não chama o n8n e permanece desconhecido até trigger aprovado.

**Tests:** unit + PostgreSQL integration
**Gate:** `pnpm test` e `pnpm test:integration`

### T07: Montar o ingresso n8n até a aceitação

**What:** Implementar no JSON versionado o caminho webhook, validação, hash,
extração, normalização produtora, agregação e chamada parametrizada à função de
aceitação.

**Where:** `integrations/n8n/prospecting-import-v1/*.json`, README e testes
estáticos.

**Depends on:** T04
**Reuses:** opções EmpresaAqui observadas (`;`, UTF-8, cabeçalho, relax quotes)
e aliases produtores aprovados.
**Requirement:** ALIGN-01, ALIGN-03, ALIGN-04, ALIGN-05, ALIGN-06, ALIGN-15

**Done when:**

- [ ] Arquivo inválido falha antes de qualquer Postgres node de escrita.
- [ ] Todas as linhas aceitas mantêm `source_row`.
- [ ] Uma única chamada SQL recebe o lote agregado.
- [ ] SQL usa parâmetros; export não contém credenciais ou dados pinados.
- [ ] Fixtures são exclusivamente sintéticas.

**Tests:** contract estático + teste manual em n8n descartável
**Gate:** nenhum publish/activation nesta tarefa

### T08: Colocar o `202` depois do commit

**What:** Conectar a resposta única ao resultado da função de aceitação e
manter as linhas disponíveis para o processamento posterior.

**Where:** mesmo artefato n8n versionado e contrato remoto.

**Depends on:** T07
**Reuses:** `Respond to Webhook` e aggregate/split do n8n.
**Requirement:** ALIGN-07, ALIGN-15, ALIGN-16

**Done when:**

- [ ] O grafo não possui caminho de `202` que contorne a aceitação.
- [ ] A resposta contém exatamente os cinco campos.
- [ ] Uma falha/rollback produtor nunca gera `accepted: true`.
- [ ] Evidência sintética prova `accepted_at <= response_received_at`.
- [ ] A resposta não contém linhas ou payload interno.

**Tests:** static contract + remote contract
**Gate:** alvo não produtivo identificado e workflow ID/version verificados

### T09: Integrar o worker terminal

**What:** Depois da resposta, entregar cada linha ao worker produtor aprovado
e persistir um resultado terminal estruturado.

**Where:** artefato n8n versionado e contrato do worker produtor.

**Depends on:** T08, OPEN-02
**Reuses:** `lead_processing_state`, `lead_decisions` e view X4.
**Requirement:** ALIGN-11, ALIGN-13, ALIGN-15

**Done when:**

- [ ] Uma linha gera no máximo um terminal aprovado.
- [ ] Business-invalid termina explicitamente sem sumir da aceitação.
- [ ] Falha conhecida vira `FAILED`; crash deixa a linha sem terminal
      inventado.
- [ ] Replay da mesma linha não reinicia um terminal já persistido.
- [ ] O app não altera score/recomendação nem dispara reprocessamento.

**Tests:** n8n contract + PostgreSQL integration
**Gate:** bloqueado até OPEN-02 ser aprovado

### T10: Persistir fechamento explícito do lote

**What:** Adicionar função produtora de fechamento e conectar o caminho `done`
da orquestração, sem criar ou corrigir terminais.

**Where:** novo arquivo sequencial em `db/producer/`, rollback correspondente
e artefato n8n versionado.

**Depends on:** T09
**Reuses:** chaves de manifest já lidas pela view X4.
**Requirement:** ALIGN-12, ALIGN-13, ALIGN-15

**Done when:**

- [ ] O close persiste timestamp, razão allowlisted e versão do contrato.
- [ ] Chamadas iguais são idempotentes; metadados conflitantes falham fechado.
- [ ] O close não cria terminal nem altera score, decisão ou estado comercial.
- [ ] Fechamento com linha faltante permanece observável como `INCOMPLETE`.
- [ ] Crash antes do close mantém o lote aberto.

**Tests:** PostgreSQL integration + n8n contract
**Gate:** revisão do dono do produtor; nenhuma aplicação produtiva

### T11: Corrigir integridade e leitura em lote

**What:** Detectar runs materializados conflitantes por linha e substituir o
N+1 por consultas produtoras em lote.

**Where:** `src/server/repositories/imports/producer-batch-observations-repository.ts`,
`src/server/imports/batch-read-service.ts` e testes co-localizados.

**Depends on:** T06
**Reuses:** mapper de status e paginação existentes.
**Requirement:** ALIGN-13, ALIGN-14, ALIGN-15

**Done when:**

- [ ] Dois `lead_run_id` distintos na mesma linha produzem
      `INCONSISTENT`.
- [ ] A página faz quantidade constante de consultas produtoras.
- [ ] Falha parcial preserva estado independente e zera nenhuma métrica.
- [ ] Testes cobrem 100 lotes, duplicidade, conflito e fonte indisponível.

**Tests:** unit + PostgreSQL integration
**Gate:** `pnpm test` e plano de consulta aprovado

### T12: Reescrever o contrato remoto para o endpoint versionado

**What:** Separar testes de regressão do endpoint atual dos testes do novo
contrato e eliminar attestations manuais sem evidência.

**Where:** `tests/contract/n8n-import-webhook.contract.test.ts` e novos helpers
em `tests/contract/`.

**Depends on:** T06, T10, T11
**Reuses:** harness de 43 casos, resumo sanitizado e fixtures sintéticas.
**Requirement:** ALIGN-04, ALIGN-07, ALIGN-10, ALIGN-13, ALIGN-16, ALIGN-17

**Done when:**

- [ ] Casos atuais permanecem documentados como baseline, não como alvo.
- [ ] Novo contrato testa validação, hash, replay, timeout, correlação,
      aceitação, X4, close e conflitos.
- [ ] ID/version remotos são obtidos por inspeção autorizada.
- [ ] O teste nunca imprime corpo, CSV, SQL ou dados produtores.
- [ ] Exato 10 MiB possui resultado estável ou o limite aprovado é reduzido.

**Tests:** contract
**Gate:** `pnpm test:contract`

### T13: Executar UAT sintético fim a fim

**What:** Exercitar os estados de lote e registrar somente evidência sanitizada
de comandos, contagens e limitações.

**Where:** novo documento de evidência na feature, sem screenshots/dados reais.

**Depends on:** T12
**Reuses:** scripts Demo 3 apenas se o preflight identificar o alvo autorizado.
**Requirement:** ALIGN-10, ALIGN-12, ALIGN-13, ALIGN-16

**Done when:**

- [ ] SUBMITTED, ACCEPTED, PROCESSING, COMPLETED, INCOMPLETE e timeout
      pós-commit são verificados.
- [ ] Nenhuma execução usa CSV ou valor real.
- [ ] Pre/post counts provam que o app não alterou produtor diretamente.
- [ ] Lint, typecheck, unit, build, integration e contract passam
      sequencialmente.

**Tests:** full gate
**Gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, depois
`pnpm test:integration` e `pnpm test:contract`

### T14: Preparar cutover e rollback do alvo autorizado

**What:** Criar release imutável, preflight, mudança de URL/flag e rollback que
restaura o release anterior sem apagar fatos.

**Where:** especificação/release evidence e scripts de deploy existentes,
somente após aprovação.

**Depends on:** T13
**Reuses:** preflight e release imutável Demo 3.
**Requirement:** ALIGN-01, ALIGN-17, ALIGN-18

**Done when:**

- [ ] Alvo, namespace, workflow ID/version, dono e janela estão registrados.
- [ ] Rollback apenas desabilita novas submissões/restaura configuração.
- [ ] Auditoria app-owned e fatos produtores são preservados.
- [ ] Produção permanece explicitamente bloqueada.

**Tests:** preflight + smoke sintético
**Gate:** aprovação operacional separada; nenhuma mutação neste draft

## Granularidade

| Task | Unidade entregável | Status |
| --- | --- | --- |
| T01 | Contrato aprovado | Granular |
| T02 | Harness estático do artefato | Granular |
| T03 | Primitiva de aceitação produtora | Granular |
| T04 | Fonte read-only e isolamento | Granular |
| T05 | Cliente de ingress v1 | Granular |
| T06 | Reconciliação app-owned | Granular |
| T07 | Caminho n8n até aceitação | Granular |
| T08 | Ordem commit → resposta | Granular |
| T09 | Worker terminal | Granular, bloqueado por uma interface externa |
| T10 | Fechamento explícito | Granular |
| T11 | Leitura de status em lote | Granular |
| T12 | Contrato remoto | Granular |
| T13 | UAT sintético | Granular |
| T14 | Cutover/rollback | Granular e separado da implementação |

## Diagram-definition cross-check

| Task | Dependência no corpo | Diagrama | Status |
| --- | --- | --- | --- |
| T01 | None | Start | Match |
| T02 | T01 | T01 → T02 | Match |
| T03 | T02 | T02 → T03 | Match |
| T04 | T03 | T03 → T04 | Match |
| T05 | T02 | T02 → T05 | Match |
| T06 | T04, T05 | T04/T05 → T06 | Match |
| T07 | T04 | T04 → T07 | Match |
| T08 | T07 | T07 → T08 | Match |
| T09 | T08, OPEN-02 | T08 → T09 | Match; gate externo anotado |
| T10 | T09 | T09 → T10 | Match |
| T11 | T06 | T06 → T11 | Match |
| T12 | T06, T10, T11 | Todos convergem em T12 | Match |
| T13 | T12 | T12 → T13 | Match |
| T14 | T13 | T13 → T14 | Match |

## Validação de testes co-localizados

| Task | Camada | Convenção | Teste |
| --- | --- | --- | --- |
| T02 | Artefato/contrato | `tests/contract` | Vitest contract |
| T03–T04 | Producer DDL | `tests/integration` | PostgreSQL disposable |
| T05 | Cliente/serviço | teste ao lado do módulo | Vitest unit |
| T06 | Repo/serviço | teste ao lado + integration | Vitest unit/PostgreSQL |
| T07–T10 | n8n/producer | contract estático/remoto + integration | Vitest contract/PostgreSQL |
| T11 | Repo/mapper | teste ao lado + integration | Vitest unit/PostgreSQL |
| T12 | Integração remota | `tests/contract` | Vitest contract |
| T13 | Sistema | evidência sanitizada | full gate/UAT |

## Ferramentas na execução futura

- usar `codenavi` para navegação focada e memória do repositório;
- usar `coding-guidelines` em toda alteração de TypeScript/SQL/teste;
- editar JSON do workflow somente como artefato separado, validado por teste;
- não usar agentes paralelos sem instrução explícita;
- não executar migração, grant, ativação ou deploy sem os gates humanos
  descritos acima.
