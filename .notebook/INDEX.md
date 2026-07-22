# .notebook
> Project intelligence — read before every mission

Last updated: 2026-07-22

- [prospecta-n8n-v7-4-lifecycle-events](prospecta-n8n-v7-4-lifecycle-events.md) — Export ativo não oferece worker reutilizável nem fatos X4 | gotcha | n8n, prospecta, imports
- [prospecta-n8n-contract](prospecta-n8n-contract.md) — Ingress v1 local, cadeia canônica e gates remotos retidos | flow | n8n, prospecta, imports
- [prospecta-batch-read-service](prospecta-batch-read-service.md) — Lotes usam uma leitura produtora para até 100 IDs | flow | prospecta, imports
- [prospecta-producer-history-grants](prospecta-producer-history-grants.md) — Histórico usa colunas concedidas ao papel read-only | gotcha | prospecta, producer, grants
- [prospecta-k8s-demo-deploy](prospecta-k8s-demo-deploy.md) — Demo 3 preprod; migração app-owned deve usar stdin e pós-condição | flow | prospecta, k8s, demo3
- [prospecta-import-submission-read](prospecta-import-submission-read.md) — Leituras app-owned e intenção durável da Demo 3 | flow | prospecta, imports, demo3
- [prospecta-local-reset-boundary](prospecta-local-reset-boundary.md) — Reset local preservando CRM e limites de ownership | gotcha | prospecta, database, crm, reset
- [prospecta-cost-observability-boundary](prospecta-cost-observability-boundary.md) — Custo LLM estimado, permitido somente por política e escopo estritos | domain | prospecta, cost, producer, policy

- [prospecta-private-navigation](prospecta-private-navigation.md) — Menu e entradas das rotas privadas | flow | prospecta, navigation, routes
- [prospecta-demo2-source-guard](prospecta-demo2-source-guard.md) — Demo list fails closed past 20 source rows | gotcha | prospecta, demo2, producer
- [prospecta-commercial-workspace](prospecta-commercial-workspace.md) — T029/T030/T031/T033/T035 commercial writes + audit + queue + create route | flow | prospecta, commercial
- [prospecta-producer-batch-observations](prospecta-producer-batch-observations.md) — X4 local producer observation source | flow | prospecta, imports, producer
- [prospecta-auth-boundary](prospecta-auth-boundary.md) — Auth-first org gate, OIDC roles deferred | flow | auth, prospecta
