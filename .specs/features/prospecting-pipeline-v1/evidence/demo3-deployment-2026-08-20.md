# Pipeline de prospecção v1 — Publicação Demo 3

**Data:** 2026-08-20  
**Release:** `demo3-preprod-20260820-prospecting-pipeline-001`  
**Alvo autorizado:** Demo 3 local, namespace `prospecta-demo3`

## Preflight

- Contexto e API server coincidiram com o perfil configurado.
- O UID do cluster e o marcador de namespace não produtivo passaram nas
  verificações fail-closed do script.
- O material TLS existente foi validado.
- O preflight terminou antes de qualquer mutação.

## Rollout

- As quatro imagens imutáveis da release foram construídas e publicadas.
- As migrações app-owned aprovadas foram reaplicadas de forma idempotente.
- Deployment da aplicação e StatefulSet PostgreSQL concluíram o rollout em
  `1/1 Ready`.
- Aplicação, request edge, proxy PostgreSQL e PostgreSQL permaneceram com zero
  reinícios.
- Os quatro contêineres tiveram zero marcadores sanitizados de
  `error`/`exception`/`fatal`/`panic` na janela do rollout.

## Smoke seguro

- `/work-queue` anônimo: `401`.
- `/work-queue` autenticado: `200`.
- `/api/work-queue` autenticada: `200`.
- O HTML publicado contém o título “Pipeline de prospecção”.
- Nenhuma resposta, empresa, CNPJ, mensagem, credencial ou valor produtor foi
  registrada como evidência.

## Limites

O rollout não enviou mensagem, não chamou OpenAI, n8n ou provedor de contatos
e não escreveu em dados produtores. As mutações limitaram-se às imagens,
objetos release-scoped e banco app-owned do perfil Demo 3 autorizado.
