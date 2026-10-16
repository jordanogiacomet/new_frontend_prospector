# Tarefas — MVP apresentável

| Tarefa | Ownership / arquivos | Done quando | Gate | Estado |
| --- | --- | --- | --- | --- |
| T1 Importação e análise | import_lead_readiness: importações, lista/detalhe/histórico de leads | MR-02–03: lacunas concretas corrigidas, auth-first no client, 401/403 e resposta malformada seguros | Vitest co-localizado | Concluído: 204 testes em 8 arquivos |
| T2 Comercial | commercial_readiness: fila/workspaces/cadência e testes | MR-04: estado e auditoria visíveis canônicos após confirmação, sem perder rascunho | Vitest co-localizado | Concluído: 115 testes em 4 arquivos no fechamento focal |
| T3 Percurso e custos | principal: Início/Ajuda/custos e testes | MR-01/03: orientação até pipeline; custos sem GET quando negado e recuperação de sessão | Vitest co-localizado | Concluído: 37 testes em 3 arquivos |
| T4 Roteiro e navegador | presentation_validation: tests/browser, docs/prospecta-demo3-presentation.md | MR-05–06: roteiro de apresentação e UAT sintético ampliado | Sintaxe e UAT loopback | Concluído: 184 verificações em 4 viewports |
| T5 Base e fechamento | principal: README, gates, evidência, tarefas foundation e memória | MR-06–07: comandos reproduzíveis, gates completos e limites claros | lint/typecheck/test/test:scripts/test:contract/build/UAT | Concluído: 2.494 testes/138 arquivos, lint/typecheck/build, 16 scripts, 76 contratos, 49 PostgreSQL, 184 checks browser e 31 checks standalone passaram |

T1–T4 têm ownership separado. T5 depende dos fixes finais. Não concorrer
typegen/build/dev pela pasta `.next`.

O pedido seguinte de motivos confirmados Lusha/Apollo é rastreado em
`.specs/features/contact-search-feedback-v1/`; integra esta entrega sem
habilitar provedores. O pedido posterior autoriza concluir o front e publicar
uma release da aplicação no Demo 3 HTTPS; n8n não integra esse deploy.

| T6 Publicação | principal: packaging017, preflight, release imutável e postflight | MR-08: HTTPS autenticado e workloads Ready, sem mutação produtora ou n8n | preflight/rollout/smoke | Concluído: demo3-preprod-20261006-mvp-feedback-001, 26 checks HTTPS passaram |
