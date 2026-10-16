# Pipeline de prospecção v1 — Design

**Spec:** `.specs/features/prospecting-pipeline-v1/spec.md`  
**Contexto:** `.specs/features/prospecting-pipeline-v1/context.md`  
**Status:** Aprovado para execução

## Visão de arquitetura

O work queue continua sendo a leitura única de empresas elegíveis. A página
agrupa seus itens em fases de apresentação sem mudar a consulta. Ao registrar
um contato, uma política pura classifica o resultado como automático ou
recomendado; o repositório aplica a atualização do workspace sob o mesmo lock e
na mesma transação da cadência, atividade e auditoria. O componente exibe o que
aconteceu e a recarga já existente traz o workspace canônico.

Fluxo:

```text
GET work queue -> fatos produtores + workspace + mensagem -> agrupamento UI

POST contato da cadência
  -> lock workspace + contatos
  -> registrar atividade e resultado
  -> política de pipeline
       claro: atualizar etapa/desfecho/próxima ação
       ambíguo: conservar etapa e registrar recomendação na próxima ação
       terminal: conservar workspace
  -> auditoria da atividade + auditoria do workspace
  -> commit único -> retorno com ação aplicada
```

## Reuso

| Código existente | Uso |
| --- | --- |
| `src/server/commercial/qualification-cadence-repository.ts` | Lock, transação, atividade, contato e auditoria atuais. |
| `src/server/commercial/workspace-repository.ts` | Formato seguro de estado e metadados de auditoria. |
| `src/server/commercial/transition-policy.ts` | Estados terminais; a política da cadência é separada porque nasce de um resultado explícito. |
| `src/app/(private)/work-queue/page.tsx` | Filtros, paginação, mensagem, contato profissional e ações atuais. |
| `src/components/commercial/qualification-cadence.tsx` | Registro humano dos resultados e recarga do workspace. |
| `src/app/(private)/private-navigation.tsx` | Mantém a rota e troca apenas o nome comercial. |

## Componentes

### Política de resultado da qualificação

- **Local:** `src/server/commercial/qualification-pipeline-policy.ts`
- **Interface:** recebe estágio atual, resultado/número do contato e projeção
  atualizada da cadência; retorna estado desejado e `automatic`,
  `recommendation` ou `unchanged`.
- **Regra:** não acessa banco, relógio ou rede; textos de próxima ação são
  constantes de negócio testáveis.

### Persistência transacional

- **Local:** `src/server/commercial/qualification-cadence-repository.ts`
- Amplia a linha do workspace com etapa, desfecho, próxima ação e versão.
- Aplica somente a diferença calculada pela política, incrementa versão e
  adiciona um evento de workspace sem copiar texto livre para o audit metadata.
- Retorna `pipelineAction` junto da cadência; terminal nunca muda.

### Contrato e feedback

- **Locais:** rota da cadência, tipos comerciais e componente de cadência.
- O `meta` da mutação informa apenas tipo da ação e estágio resultante.
- O componente diferencia “pipeline atualizada automaticamente”, “próxima
  ação recomendada” e “workspace encerrado preservado”.

### Apresentação da pipeline

- **Local:** `src/app/(private)/work-queue/page.tsx`
- Seis seções em ordem, resumo com contagens da página e âncoras.
- Cada empresa aparece uma vez e preserva o card existente completo.
- Filtros e paginação continuam antes/depois do agrupamento.

## Modelo de decisão

| Resultado | Ação |
| --- | --- |
| Sem resposta, contatos 1–3 | `FOLLOW_UP`, próxima tentativa/data |
| Falar mais tarde | `FOLLOW_UP`, próxima tentativa/data escolhida |
| Qualificado | `MEETING`, ação “Agendar reunião de diagnóstico” |
| Sem interesse | `CLOSED_LOST`, resultado `LOST`, sem próxima ação |
| Respondeu | Manter etapa; recomendar revisão da resposta |
| Outro retorno | Manter etapa; recomendar revisão do retorno |
| Contato incorreto | Manter etapa; recomendar localizar outro decisor |
| Sem resposta no 4º contato | Manter etapa; recomendar pausar ou encerrar |
| Workspace terminal | Não alterar etapa, desfecho ou próxima ação |

## Erros e concorrência

| Cenário | Tratamento |
| --- | --- |
| Contato fora de ordem | `409` existente, nenhuma mutação. |
| Falha ao atualizar workspace/auditoria | Rollback de toda a transação. |
| Resposta do servidor inválida | UI conserva o último estado confirmado. |
| Fonte produtora indisponível | Pipeline indisponível, nunca vazia confirmada. |
| Página recarregada | Nenhuma automação é reexecutada; a mutação depende de POST explícito. |

## Decisões técnicas

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Persistência da recomendação | `next_action` existente | Faz a recomendação aparecer na pipeline sem criar nova fonte de estado. |
| Automação | Mesma transação da cadência | Evita contato salvo com etapa desatualizada. |
| Layout | Fases verticais com resumo navegável | Preserva os cards ricos e funciona em telas estreitas sem quadro horizontal ilegível. |
| Endpoint | Manter `/work-queue` | Compatibilidade com links e retornos existentes. |
| Dependências | Nenhuma nova | Os padrões atuais cobrem política, persistência e UI. |
