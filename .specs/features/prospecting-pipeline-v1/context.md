# Pipeline de prospecção v1 — Contexto

**Coletado:** 2026-08-18  
**Spec:** `.specs/features/prospecting-pipeline-v1/spec.md`  
**Status:** Pronto para design

## Limite da funcionalidade

A rota comercial atual passa a apresentar uma pipeline única construída com
os fatos produtores e estados app-owned já existentes. A cadência pode mover o
workspace somente quando o resultado registrado pelo gestor tiver um próximo
estado inequívoco; os demais casos geram recomendação persistida como próxima
ação. Não há detecção nem envio automático.

## Decisões de implementação

### Automação versus recomendação

- O usuário pediu automação para casos claros e recomendação para casos
  confusos.
- Sem resposta nos contatos 1–3 e pedido de contato posterior avançam para
  acompanhamento com a próxima tentativa e data já registradas.
- Qualificado avança para reunião e cria a ação de agendamento.
- Sem interesse encerra como perdido.
- Respondeu, outro retorno, contato incorreto e quarta tentativa sem resposta
  conservam a etapa e criam uma ação explícita para revisão humana.
- Uma etapa terminal nunca é reaberta por resultado da cadência.

### Forma da pipeline

- Seis fases operacionais: Novos, Preparação, Em prospecção, Reunião, Em espera
  e Encerrados.
- Cada fase agrupa, mas não substitui, o estágio comercial persistido.
- A visão mantém os cards ricos existentes para não esconder mensagem,
  próxima ação, contato profissional ou entrada do workspace.
- Contagens representam somente a página carregada e devem dizer isso.

### Critério de segurança

- Atualização automática e recomendação persistida entram na mesma transação
  app-owned do contato, atividade e auditoria.
- A leitura da pipeline não produz mutações, chamadas externas nem mensagens.

### Discrição do agente

- Hierarquia, densidade, textos auxiliares e responsividade podem seguir os
  padrões operacionais já usados no app.
- A rota `/work-queue` permanece para compatibilidade, mesmo com o novo nome.

## Referências específicas

- A experiência deve reaproveitar a mensagem compartilhada entre lead, fila e
  workspace e a cadência de quatro contatos já publicada.

## Ideias adiadas

- Arrastar cards entre colunas.
- Entrada automática de respostas por CRM, e-mail ou WhatsApp.
- Contagens históricas e conversão agregada além da página atual.
