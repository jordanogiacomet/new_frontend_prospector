# Prospecta K8s Demo Deploy
> Demo 2 sintética e Demo 3 preprod no cluster local

Entry: `k8s/prospecta-demo.yaml`
Image: `Dockerfile` -> `localhost:5000/prospecta/app:demo`

Flow: build image -> push local Docker registry -> `kubectl apply` -> NodePort
`192.168.0.20:30097`

Runtime:
- Namespace `prospecta-demo`
- Deployment `prospecta-demo`
- Service `prospecta-demo` NodePort `30097`
- Demo flags in ConfigMap, placeholders in Secret
- Commercial queue uses the explicit `FEATURE_COMMERCIAL_ENABLED=true` demo
  flag, synthetic queue data, and the demo-only `commercial:read` actor grant.

Rollout gotcha: the stable `localhost:5000/prospecta/app:demo` image tag and
`envFrom` ConfigMap values do not change the Deployment pod template. After
`docker push` and `kubectl apply`, run
`kubectl -n prospecta-demo rollout restart deployment/prospecta-demo` before
waiting for rollout so a pod pulls the new tag and reloads ConfigMap values.

Probe gotcha: `readinessProbe` and `livenessProbe` belong to the `prospecta`
container, which declares the `http` port. The PostgreSQL loopback proxy has
only `postgres-proxy`; attaching an HTTP probe to it leaves a rollout at `1/2`
with an invalid port error.

Runtime gotcha: a Next standalone `server.js` forces `NODE_ENV=production`.
The Demo 2 manifest therefore uses the server-only
`DEMO2_K8S_RUNTIME_ENABLED=true` ConfigMap gate together with the existing
Demo 2 full-access Secret flags. Do not add that gate to non-demo targets.

Auth/upload gotcha: `src/server/auth/require-api-session.ts:requireSameOrigin()`
accepts external `Host` origin because standalone Next sees internal
`0.0.0.0:3000` behind NodePort.

Import UI gotcha: `src/app/(private)/imports/page.tsx:createIdempotencyKey()`
must not assume `crypto.randomUUID()` exists on HTTP demo origins; it falls
back to `crypto.getRandomValues()`.

Demo 3 storage gotcha: `k8s/prospecta-demo3.yaml` mounts the NFS PVC at the
documented PostgreSQL 16 path but sets `PGDATA` to the child `pgdata`
directory. The NFS mount root rejects chmod from UID 70, while the child is
created and owned by PostgreSQL.

Demo 3 initialization gotcha: the app-role init script copied by
`k8s/Dockerfile.demo3-postgres` must belong to `postgres:postgres`; mode `0500`
alone makes it unreadable when the container runs as UID 70. The startup probe
checks the final runtime-role grant so liveness cannot interrupt a slow NFS
initialization or expose an incomplete database as Ready.

Demo 3 edge gotcha: all nginx temporary paths are redirected to the shared
`/tmp` EmptyDir in `k8s/demo3-nginx.conf`; otherwise nginx attempts to create
`/var/cache/nginx/fastcgi_temp` under its read-only root filesystem.

Demo 3 preprod:
- Entry: `scripts/deploy-demo3-k8s.mjs`
- Manifest: `k8s/prospecta-demo3.yaml`
- Frontend-only NodePort: `http://192.168.0.20:30100`
- Mandatory Basic Auth at `k8s/demo3-nginx.conf`; anonymous app paths return
  `401`, while `/healthz` remains available to probes
- Shared application actor exists only behind the gateway; demo data and both
  Demo 2 runtime gates must be disabled
- Producer connection: release-scoped Secret + loopback proxy -> approved
  `prospecta_producer_read` target; SELECT only
- Commercial/import writes: isolated `prospecta-demo3-postgres` ClusterIP/PVC
- Every release uses immutable app, edge, proxy, and PostgreSQL image tags

Preflight: exact context, HTTPS API server, kube-system UID, non-production
namespace labels, source Secret shape, producer endpoint, release tag, and
distinct credentials. Failed preflight mutates nothing.

App migration gotcha: `kubectl exec` does not forward the parent process stdin
unless `--stdin` is present. A `psql` child can therefore exit `0` without
executing a streamed migration. `scripts/deploy-demo3-k8s.mjs` now streams
app-owned migration `006` with `kubectl exec --stdin`, wraps it in
`--single-transaction`, and refuses the manifest rollout unless the old unique
index count is `0` and the canonical non-unique index count is `1`. Producer
migrations are not part of this mechanism.

NodePort smoke: direct HTTP only; proves anonymous `401`, authenticated page
and API success, real producer availability, and zero-restart readiness. The
owner accepts that Basic Auth credentials and response data are plaintext on
this exact local target; never reuse this profile for internet or production.

Release `demo3-preprod-20260720-import-ack-001`:
- target preflight passed before mutation
- immutable images rolled out and authenticated smoke passed
- one synthetic app-mediated import returned `202`, persisted a workflow
  acknowledgement, and exposed a correlated `import_batch_id` in detail
- the correlated producer source contained only
  `RETAINED_LEGACY_OBSERVATION`; status therefore remains `SUBMITTED` until the
  producer emits approved acceptance, terminal, and close facts

Release `demo3-preprod-20260720-import-status-001`:
- target preflight passed before mutation
- immutable images rolled out with one ready app pod, one ready PostgreSQL pod,
  and zero container restarts
- authenticated synthetic app submission returned `202`, persisted its
  workflow acknowledgement and correlated `import_batch_id`, and exposed a
  producer observation in detail
- list/detail clients refresh their private import APIs every five seconds
  while visible
- no durable acceptance, terminal count, or explicit close was observed during
  the UAT window, so the truthful batch state remained `SUBMITTED`

Release `demo3-preprod-20260722-batch-alignment-001`:
- exact target preflight passed before each mutation
- immutable app, PostgreSQL, edge, and proxy images rolled out successfully
- app-owned migration `006` replaced the legacy unique producer-batch index;
  independent verification returned legacy `0`, canonical `1`
- authenticated list/detail pages and GET APIs for leads, lead history,
  imports, workspaces, activities, notes, audit, work queue and costs passed
  without response bodies or identifiers being recorded; anonymous imports
  returned `401`
- no CSV was submitted, no n8n endpoint was called, and the configured ingress
  remained the approved legacy target rather than the inactive v1 artifact

Release `demo3-preprod-20260722-empty-observations-001`:
- diagnosed one legacy-acknowledged submission with no durable acceptance and
  no correlated producer facts, without recording its identifier or payload
- UI now distinguishes a healthy producer-source query from the presence of
  facts for a specific batch; unsupported counts remain unavailable
- focused 18/18, full 74 files / 1,745 unit tests, build, 87 PostgreSQL
  integration tests and 16 static contracts passed; 57 remote HTTP cases stayed
  skipped
- target page/API smoke and deployed-copy inspection passed; no upload or n8n
  call was performed

Release `demo3-preprod-20260731-contact-enrichment-v1-001`:
- exact target preflight passed before mutation; immutable app, edge, proxy,
  and PostgreSQL containers rolled out Ready with zero restarts
- app-owned migration `009` created only the PII-free contact-enrichment ledger
  and append-only events; runtime grants were re-verified
- app route negative smoke returned anonymous `401`, invalid authenticated
  input `400`, and incorrect callback authentication `401`
- the separate n8n workflow was activated on only its exact path; the received
  reference workflow remained inactive
- corrected synthetic UAT returned `202`, then an authenticated
  `PROVIDER_OUTCOME_UNKNOWN` callback; exact replay returned `200` and a
  changed-input conflict returned `409` without another dispatch
- n8n's soft-deleted synthetic execution rows were removed after evidence was
  recorded, leaving zero execution/data rows for the new workflow; app-owned
  ledger/audit history was preserved
- no real data, producer mutation, contact exposure, or queue-button wiring
  occurred

Release `demo3-preprod-20260806-leads-queue-parity-001`:
- exact target and contact TLS preflights passed before mutation
- immutable app, PostgreSQL, edge, and proxy images rolled out with one ready
  app pod, one ready PostgreSQL pod, and zero container restarts
- authenticated HTTPS comparison covered the complete current list and proved
  equal total, equal sequence, equal set, and unique membership
- no identifiers, database values, producer writes, n8n calls, contact calls,
  or response bodies were stored as repository evidence

Release `demo3-preprod-20260806-trust-status-labels-001`:
- exact target and contact TLS preflights passed before mutation
- immutable app, PostgreSQL, edge, and proxy images rolled out with one ready
  app pod, one ready PostgreSQL pod, and zero container restarts
- an authenticated, value-safe smoke confirmed that the current non-null trust
  statuses all use an approved category and that the Leads page no longer
  contains the neutral unmapped fallback
- no company identifiers, stored explanations, response bodies, producer
  writes, n8n calls, or contact calls were recorded as evidence

Release `demo3-preprod-20260806-company-location-search-001`:
- exact target and contact TLS preflights passed before mutation
- immutable app, PostgreSQL, edge and proxy images rolled out Ready with zero
  restarts; authenticated queue page and API smoke passed
- the approved v2 n8n workflow copy was exported for rollback, replaced under
  the same ID and republished with one webhook, 19 nodes, native credentials,
  disabled execution saving and zero executions
- an obsolete-contract request returned `400` before dispatch; no valid n8n or
  Lusha request, provider data, contact operation or producer write occurred

Rollback: Deployment revision rollback; preserve Demo 3 PVC and audit history;
never change producer contents.

Port `30099` cannot be used because it belongs to the existing SearXNG Service.

T15 packaging note:
- fresh/existing Demo 3 PostgreSQL packaging includes app-owned migration `007`
- app Secret rendering requires `N8N_IMPORT_EVENT_SECRET` (32+ bytes, distinct
  from `AUTH_SECRET`)
- nginx exempts only exact `/api/imports/events` from browser Basic Auth; the
  app machine-secret check remains mandatory
- this package change was validated statically but not deployed; do not mutate
  Demo 3 or n8n configuration without separate operational authorization

Contact v2 TLS edge package:
- `k8s/prospecta-demo3-contact-v2-tls.yaml` and
  `k8s/n8n-contact-v2-tls.yaml` use the existing `gitlab-nginx` HTTPS NodePort
  while preserving both legacy HTTP NodePorts
- only the internal request-edge listener `8081` fixes
  `X-Forwarded-Proto=https`; listener `8080` remains HTTP
- TLS Secrets and the app trust CA ConfigMap are external namespace resources;
  missing material must block rollout
- the package is repository-only and does not enable v2, publish n8n or mutate
  the cluster

Updated: 2026-08-06
