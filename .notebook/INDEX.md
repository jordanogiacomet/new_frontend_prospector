# .notebook
> Project intelligence — read before every mission

Last updated: 2026-10-16

- [prospecta-contact-enrichment-boundary](prospecta-contact-enrichment-boundary.md) — Contatos no detalhe por permissão; domínio manual ou confirmação por nome | flow | prospecta, contacts, n8n, apollo, policy
- [prospecta-commercial-workspace](prospecta-commercial-workspace.md) — Pipeline retirada; links antigos abrem Leads e histórico comercial é preservado | flow | prospecta, commercial, cadence, navigation

- [prospecta-import-company-notices](prospecta-import-company-notices.md) — Resultados atuais aprovados e avisos por empresa processada | flow | prospecta, imports, processing, feedback

- [prospecta-list-query-continuity](prospecta-list-query-continuity.md) — Rascunhos explícitos e retorno à página nas listas | flow | prospecta, ux, filters, navigation

- [prospecta-manager-ux-review](prospecta-manager-ux-review.md) — Início por permissão, menu móvel e filtros explícitos | flow | prospecta, manager, ux

- [prospecta-action-feedback](prospecta-action-feedback.md) — Aviso ocultável, rascunhos e recuperação GET sem repetir mutações incertas | flow | prospecta, ux, feedback

- [prospecta-company-assessment](prospecta-company-assessment.md) — Avaliação comercial atribuída à ação registrada, motivo/data e revisão sem CTA de contatos | domain | prospecta, leads, sales, assessment

- [prospecta-mvp-readiness](prospecta-mvp-readiness.md) — MVP para apresentação, gates locais e diferença entre consulta sintética e Demo 3 | flow | prospecta, mvp, demo3, verification

- [prospecta-manager-import-analysis](prospecta-manager-import-analysis.md) — Entrada guiada, revisão B/C e aceite desconhecido seguro; kubeconfig Demo 3 dedicado | flow | prospecta, manager, imports, leads, demo3

- [prospecta-frontend-operations](prospecta-frontend-operations.md) — Revisão resumida, prazos em São Paulo, contexto preservado e rascunhos protegidos | flow | prospecta, frontend, ux, navigation

- [prospecta-lead-list-eligibility](prospecta-lead-list-eligibility.md) — Processado não implica elegível; CRM/test markers filtram listas e detalhe fora da análise | domain | prospecta, leads, producer
- [prospecta-lead-presentation](prospecta-lead-presentation.md) — IA usa relatório sanitizado; fila B/C reutiliza rascunho app-owned | domain | prospecta, leads, commercial, approach, openai
- [prospecta-legacy-workflow-close-callback](prospecta-legacy-workflow-close-callback.md) — `ACCEPTED_ROW`/`BATCH_CLOSED` viram marcos app-owned; callback ativo no Demo 3 | flow | n8n, prospecta, imports
- [prospecta-n8n-v7-4-lifecycle-events](prospecta-n8n-v7-4-lifecycle-events.md) — Export ativo não oferece X4; n8n 2.30.6 exige liberação explícita de `$env` nos Code nodes | gotcha | n8n, prospecta, imports
- [prospecta-n8n-contract](prospecta-n8n-contract.md) — Ingress v1 local, cadeia canônica e gates remotos retidos | flow | n8n, prospecta, imports
- [prospecta-batch-read-service](prospecta-batch-read-service.md) — Lotes usam uma leitura produtora para até 100 IDs | flow | prospecta, imports
- [prospecta-producer-history-grants](prospecta-producer-history-grants.md) — Histórico usa colunas concedidas ao papel read-only | gotcha | prospecta, producer, grants
- [prospecta-k8s-demo-deploy](prospecta-k8s-demo-deploy.md) — Demo 3 preprod; migração app-owned deve usar stdin e pós-condição | flow | prospecta, k8s, demo3
- [prospecta-import-submission-read](prospecta-import-submission-read.md) — Leituras app-owned e intenção durável da Demo 3 | flow | prospecta, imports, demo3
- [prospecta-local-reset-boundary](prospecta-local-reset-boundary.md) — Reset local preservando CRM e limites de ownership | gotcha | prospecta, database, crm, reset
- [prospecta-cost-observability-boundary](prospecta-cost-observability-boundary.md) — Custo LLM estimado, permitido somente por política e escopo estritos | domain | prospecta, cost, producer, policy

- [prospecta-private-navigation](prospecta-private-navigation.md) — Menu e entradas das rotas privadas | flow | prospecta, navigation, routes
- [prospecta-demo2-source-guard](prospecta-demo2-source-guard.md) — Demo list fails closed past 20 source rows | gotcha | prospecta, demo2, producer
- [prospecta-producer-batch-observations](prospecta-producer-batch-observations.md) — X4 local producer observation source; source availability does not imply correlated facts | flow | prospecta, imports, producer
- [prospecta-auth-boundary](prospecta-auth-boundary.md) — Auth-first org gate, OIDC roles deferred | flow | auth, prospecta
