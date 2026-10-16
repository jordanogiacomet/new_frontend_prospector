# Pipeline de prospecção v1 — Tarefas

**Design:** `.specs/features/prospecting-pipeline-v1/design.md`  
**Status:** Concluído e verificado localmente

## Plano de execução

```text
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8
```

O trabalho será sequencial porque T2–T4 compartilham o contrato da cadência e
T5–T7 compartilham a apresentação/rotas de retorno. O agente principal executa
as tarefas porque a configuração deste repositório não autoriza subagentes.

## Tarefas

### T1 — Política da qualificação

**O quê:** criar a função pura que distingue automação, recomendação e estado
terminal preservado.  
**Onde:** `src/server/commercial/qualification-pipeline-policy.ts` e teste.  
**Depende de:** nada.  
**Reusa:** tipos e estágios em `src/types/commercial.ts`.  
**Requisitos:** PIPE-14–PIPE-18, PIPE-20.  
**Ferramentas:** repositório local; skills codenavi e coding-guidelines.  
**Testes:** unitários. **Gate:** quick.

### T2 — Transação da cadência

**O quê:** aplicar a decisão da política no workspace e auditar sob a transação
e locks existentes.  
**Onde:** repositório da cadência e testes unitários/PostgreSQL.  
**Depende de:** T1.  
**Reusa:** metadados/auditoria do workspace.  
**Requisitos:** PIPE-19, PIPE-20.  
**Ferramentas:** repositório local; skills codenavi e coding-guidelines.  
**Testes:** unitários + integração. **Gate:** integration.

### T3 — Contrato da mutação

**O quê:** retornar a ação da pipeline no `meta` seguro da rota da cadência.  
**Onde:** tipos comerciais, rota da cadência e teste da rota.  
**Depende de:** T2.  
**Reusa:** envelope `successResponse`.  
**Requisitos:** PIPE-14–PIPE-20.  
**Ferramentas:** repositório local; skills codenavi e coding-guidelines.  
**Testes:** rota/unitários. **Gate:** quick.

### T4 — Feedback no workspace

**O quê:** validar o novo `meta` e explicar automação/recomendação após salvar.  
**Onde:** componente de cadência e teste.  
**Depende de:** T3.  
**Reusa:** estado de mutação e callback de recarga existentes.  
**Requisitos:** PIPE-05, PIPE-14–PIPE-20.  
**Ferramentas:** repositório local; skills codenavi e coding-guidelines.  
**Testes:** componente/unitários. **Gate:** quick.

### T5 — Agrupamento da pipeline

**O quê:** definir as seis fases e garantir classificação exclusiva.  
**Onde:** `src/lib/commercial-pipeline.ts` e teste.  
**Depende de:** T4.  
**Reusa:** `CommercialStage` e `CommercialWorkQueueItem`.  
**Requisitos:** PIPE-01–PIPE-06.  
**Ferramentas:** repositório local; skills codenavi e coding-guidelines.  
**Testes:** unitários. **Gate:** quick.

### T6 — Tela da pipeline

**O quê:** agrupar os cards existentes, incluir resumo/âncoras e adaptar os
estados de tela para a linguagem da pipeline.  
**Onde:** página `/work-queue` e teste.  
**Depende de:** T5.  
**Reusa:** filtros, paginação, mensagem, contato e workspace atuais.  
**Requisitos:** PIPE-01–PIPE-12.  
**Ferramentas:** repositório local; skills codenavi e coding-guidelines.  
**Testes:** componente/unitários. **Gate:** quick.

### T7 — Navegação e retornos

**O quê:** apresentar “Pipeline de prospecção” na navegação e links que apontam
para a rota comercial existente.  
**Onde:** navegação privada, lead/workspace e testes correspondentes.  
**Depende de:** T6.  
**Reusa:** `/work-queue` e validação de `returnTo`.  
**Requisitos:** PIPE-13.  
**Ferramentas:** repositório local; skills codenavi e coding-guidelines.  
**Testes:** componente/unitários. **Gate:** quick.

### T8 — Validação e memória

**O quê:** executar gates completos, atualizar rastreabilidade e registrar o
fluxo descoberto.  
**Onde:** spec/tasks, `.notebook` e evidência local.  
**Depende de:** T7.  
**Requisitos:** PIPE-01–PIPE-20.  
**Ferramentas:** repositório local; skills tlc-spec-driven e codenavi.  
**Testes:** todos. **Gate:** build.

## Verificação de granularidade

| Tarefa | Escopo | Estado |
| --- | --- | --- |
| T1 | Uma política | OK |
| T2 | Uma transação/repositório | OK |
| T3 | Um contrato de rota | OK |
| T4 | Um componente | OK |
| T5 | Uma classificação | OK |
| T6 | Uma página | OK |
| T7 | Um conceito de navegação | OK |
| T8 | Um gate de feature | OK |

## Conferência de dependências

| Tarefa | Depende de | Diagrama | Estado |
| --- | --- | --- | --- |
| T1 | Nada | início | OK |
| T2 | T1 | T1 -> T2 | OK |
| T3 | T2 | T2 -> T3 | OK |
| T4 | T3 | T3 -> T4 | OK |
| T5 | T4 | T4 -> T5 | OK |
| T6 | T5 | T5 -> T6 | OK |
| T7 | T6 | T6 -> T7 | OK |
| T8 | T7 | T7 -> T8 | OK |

## Validação de testes co-localizados

| Tarefa | Camada | Matriz exige | Tarefa inclui | Estado |
| --- | --- | --- | --- | --- |
| T1 | Política | unitário | unitário | OK |
| T2 | Repositório SQL | unitário + PostgreSQL | ambos | OK |
| T3 | Rota | rota/unitário | rota/unitário | OK |
| T4 | Componente | componente/unitário | componente/unitário | OK |
| T5 | Política de apresentação | unitário | unitário | OK |
| T6 | Página React | componente/unitário | componente/unitário | OK |
| T7 | Componentes de navegação | componente/unitário | componente/unitário | OK |
| T8 | Feature completa | build | todos | OK |

## Nota de commits

O worktree compartilhado já contém alterações não isoladas nos mesmos arquivos
da funcionalidade. Para não capturar mudanças do usuário em commits atômicos,
os commits permanecem adiados; cada tarefa ainda será verificada separadamente.

## Resultado

| Tarefa | Estado | Evidência principal |
| --- | --- | --- |
| T1 | Concluída | Política pura e casos automáticos, ambíguos e terminais testados. |
| T2 | Concluída | Transação e auditoria aprovadas em PostgreSQL descartável. |
| T3 | Concluída | `meta.pipelineAction` validado na rota. |
| T4 | Concluída | Feedback acessível de automação/recomendação testado. |
| T5 | Concluída | Todos os estágios classificados uma única vez. |
| T6 | Concluída | Seis fases, contagens da página, cards, filtros e paginação testados. |
| T7 | Concluída | Navegação e retornos usam “Pipeline de prospecção”. |
| T8 | Concluída | Lint, tipos, testes, integração, contratos e build aprovados. |

Detalhes em
`.specs/features/prospecting-pipeline-v1/evidence/local-verification-2026-08-18.md`.
