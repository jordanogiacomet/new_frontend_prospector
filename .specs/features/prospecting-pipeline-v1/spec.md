# Pipeline de prospecção v1

**Status:** Aprovado para implementação em 2026-08-18

## Problema

O Prospecta já reúne análise, mensagem personalizada, fila comercial,
workspace, próxima ação, contatos profissionais e uma cadência de quatro
tentativas, mas essas partes ainda aparecem como operações separadas. O gestor
precisa enxergar cada empresa em uma sequência comercial única e saber, sem
reconstruir o contexto, qual é o próximo passo.

## Objetivos

- Transformar a atual Fila comercial na tela central **Pipeline de prospecção**.
- Organizar todas as empresas elegíveis nas fases comerciais que já podem ser
  comprovadas pelos dados atuais.
- Manter mensagem, responsável, próxima ação e acesso à qualificação no mesmo
  card da empresa.
- Explicar o próximo movimento em linguagem operacional, sem alterar nota,
  prioridade, recomendação ou relatório do produtor.
- Preservar autenticação, permissões, concorrência otimista e auditoria das
  mutações comerciais existentes.

## Fora de escopo

| Capacidade | Motivo |
| --- | --- |
| Envio automático de e-mail, WhatsApp ou ligação | Não existe transporte de abordagem aprovado. |
| Detecção automática de resposta | Não existe contrato de entrada aprovado com CRM ou mensageria. |
| Alterar nota, prioridade ou recomendação | São fatos do produtor e permanecem somente leitura. |
| Criar uma segunda fonte de etapa comercial | `lead_workspaces.commercial_stage` continua sendo a fonte app-owned. |
| Contagens globais inventadas | A visão deve declarar quando os números representam apenas a página carregada. |

## Fases de apresentação

As fases agrupam os estados existentes; não substituem nem renomeiam o valor
persistido.

| Fase da pipeline | Estado comercial comprovado |
| --- | --- |
| Novos | workspace ausente ou `NOT_STARTED` |
| Preparação | `ASSIGNED` |
| Em prospecção | `CONTACTED` ou `FOLLOW_UP` |
| Reunião | `MEETING` |
| Em espera | `PAUSED` |
| Encerrados | `CLOSED_WON` ou `CLOSED_LOST` |

## Histórias P1

### Visão única da pipeline

Como gestor comercial, quero ver os leads agrupados pela fase atual para
entender rapidamente volume, gargalos e empresas que exigem atenção.

Critérios de aceitação:

1. **PIPE-01** — QUANDO a pipeline carregar ENTÃO o sistema DEVE colocar cada
   empresa em exatamente uma das seis fases usando somente o workspace atual.
2. **PIPE-02** — QUANDO uma empresa ainda não tiver workspace ENTÃO o sistema
   DEVE apresentá-la em Novos e oferecer o início do acompanhamento existente.
3. **PIPE-03** — QUANDO dois estados persistidos forem agrupados na mesma fase
   ENTÃO o card DEVE continuar mostrando o estágio comercial exato.
4. **PIPE-04** — QUANDO os resultados forem paginados ENTÃO cada contagem de
   fase DEVE dizer que representa a página atual e a paginação DEVE continuar
   disponível.

Teste independente: abrir a rota atual da fila com empresas em estados
distintos e verificar uma única ocorrência de cada empresa na fase correta.

### Próximo passo acionável

Como gestor comercial, quero que cada card mostre o próximo movimento e os
recursos já disponíveis para continuar a prospecção.

Critérios de aceitação:

1. **PIPE-05** — QUANDO houver `next_action` ENTÃO o card DEVE priorizar essa
   ação e seu prazo, sem inventar outra orientação.
2. **PIPE-06** — QUANDO não houver próxima ação ENTÃO o card DEVE mostrar uma
   orientação curta derivada somente da fase e do estado da mensagem.
3. **PIPE-07** — QUANDO existir mensagem persistida ENTÃO a mesma mensagem
   editável e copiável DEVE permanecer disponível na pipeline.
4. **PIPE-08** — QUANDO existir workspace ENTÃO o card DEVE abrir o mesmo
   acompanhamento, incluindo a cadência de quatro contatos; abrir a pipeline
   não DEVE iniciar, concluir ou reagendar contato.
5. **PIPE-09** — QUANDO não houver workspace ENTÃO iniciar o acompanhamento
   DEVE continuar usando a rota, permissões e auditoria existentes.

Teste independente: verificar cards novos, com mensagem, com próxima ação e
com workspace, e confirmar que cada CTA leva ao fluxo atual correto.

### Operação segura

Como responsável pelo produto, quero que a pipeline seja uma apresentação do
estado comercial aprovado, não uma automação silenciosa.

Critérios de aceitação:

1. **PIPE-10** — A pipeline NÃO DEVE alterar automaticamente etapa comercial
   apenas por passagem de tempo, abertura de página ou geração de mensagem.
2. **PIPE-11** — Filtros atuais de CNPJ, UF, prioridade, etapa e responsável
   DEVEM continuar aplicáveis e visíveis.
3. **PIPE-12** — Estados de carregamento, vazio, fonte indisponível, acesso
   negado e erro DEVEM usar a linguagem da pipeline sem esconder a causa
   comercial segura.
4. **PIPE-13** — A navegação privada DEVE chamar a rota existente de
   **Pipeline de prospecção**, sem quebrar links salvos para `/work-queue`.

Teste independente: repetir os estados atuais da fila e confirmar os mesmos
contratos de acesso e consulta sob a nova apresentação.

### Movimentação pela qualificação

Como gestor comercial, quero que resultados claros atualizem a pipeline e que
resultados ambíguos me deem uma recomendação, para evitar trabalho repetitivo
sem perder decisões que exigem contexto.

Critérios de aceitação:

1. **PIPE-14** — QUANDO um dos três primeiros contatos terminar sem resposta
   ENTÃO o sistema DEVE mover o workspace para acompanhamento e registrar o
   próximo contato como próxima ação, com a data já programada.
2. **PIPE-15** — QUANDO o lead pedir contato mais tarde ENTÃO o sistema DEVE
   mover o workspace para acompanhamento e usar a data escolhida na próxima
   ação.
3. **PIPE-16** — QUANDO o lead for qualificado ENTÃO o sistema DEVE mover o
   workspace para reunião e recomendar o agendamento como próxima ação.
4. **PIPE-17** — QUANDO o lead informar que não tem interesse ENTÃO o sistema
   DEVE encerrar a oportunidade como perdida.
5. **PIPE-18** — QUANDO o lead responder sem um desfecho claro, houver outro
   retorno, o contato estiver incorreto ou a quarta tentativa terminar sem
   resposta ENTÃO o sistema DEVE conservar a etapa e registrar uma próxima
   ação curta para decisão humana.
6. **PIPE-19** — A atualização da cadência, a atividade, a ação da pipeline e
   seus eventos de auditoria DEVEM confirmar ou falhar na mesma transação.
7. **PIPE-20** — QUANDO a oportunidade já estiver encerrada ENTÃO o registro da
   cadência NÃO DEVE reabrir nem substituir o desfecho terminal.

## Casos de borda

- Empresa sem workspace e com mensagem pronta continua em Novos.
- `CLOSED_WON` e `CLOSED_LOST` compartilham Encerrados, mas conservam badges e
  resultados distintos.
- Filtro por estágio exato continua filtrando antes do agrupamento visual.
- Fonte produtora indisponível nunca vira pipeline vazia confirmada.
- Conflito otimista em uma alteração mantém o último estado confirmado e pede
  recarga; nenhuma mutação é repetida automaticamente.

## Rastreabilidade

| Requisito | Responsável de design | Estado |
| --- | --- | --- |
| PIPE-01–PIPE-04 | Agrupamento e resumo da pipeline | Verificado |
| PIPE-05–PIPE-09 | Card operacional e ações existentes | Verificado |
| PIPE-10–PIPE-12 | Contratos de estado e segurança | Verificado |
| PIPE-13 | Navegação privada | Verificado |
| PIPE-14–PIPE-20 | Política e transação da qualificação | Verificado |

**Cobertura:** 20 requisitos, 20 mapeados, 0 não mapeados.

**Evidência local:**
`.specs/features/prospecting-pipeline-v1/evidence/local-verification-2026-08-18.md`.

**Publicação Demo 3:**
`.specs/features/prospecting-pipeline-v1/evidence/demo3-deployment-2026-08-20.md`.

## Critérios de sucesso

- O gestor identifica a fase e a próxima ação de qualquer empresa visível sem
  abrir mais de uma tela.
- Nenhuma empresa aparece em duas fases na mesma resposta.
- Mensagem, workspace e cadência existentes continuam acessíveis.
- Nenhuma leitura da pipeline envia contato, chama provedor ou modifica estado.
- Lint, TypeScript estrito, testes e build de produção passam.
