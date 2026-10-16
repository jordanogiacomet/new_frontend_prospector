# Prospecta K8s Demo Deploy
> Demo 2 sintética e Demo 3 preprod no cluster local

Release `demo3-preprod-20261016-direct-contacts-001`:
- owner requested deploy, then specified Demo HTTPS `192.168.0.20:30443`
- exact target preflight passed; isolated verified app image, guarded image-only
  patch revision73 → 74; app `1/1` Ready, all containers ready, zero restarts
- gateway password, settings, flags, TLS, edge/proxy and PostgreSQL template
  preserved; no migration, provider/n8n call or app data mutation
- 22 HTTPS checks passed; retired `/work-queue` uses a verified exact `/leads`
  meta refresh with HTTP200 due Next streaming; raw status307 is not guaranteed
- first preflight API503 caused no mutation; subsequent sequential reads passed
- evidence and prior-image rollback: `docs/prospecta-direct-contacts-deploy.md`

Local packaging refinement (2026-10-14): migration 019 adds only scoped
CSV row receipts in `prospecting_app.import_received_companies`, with no
company names or CNPJ. The existing append-only trigger and runtime
SELECT/INSERT grants protect those facts; rollback locks and refuses a
populated table. Fresh PostgreSQL images and existing-database migration
lists include 019, while deployment verification and the startup probe check
the active trigger and mutation denial. The migration, grants, verification
SQL and probe SQL passed on disposable synthetic PostgreSQL 16; the focused
receipt integration suite passed nine tests, and the packaging contracts
passed eleven tests across two files. No real target or cluster was changed.

Local packaging refinement (2026-10-13): migration 018 permits contact-preview
`NO_RELEVANT_MATCHES`; rollback preserves diagnostics/governance events and
refuses to remove support after that fact is recorded. Replaying migration 017
after 018 would reinstall the old validator and reject those retained facts.
`scripts/deploy-demo3-k8s.mjs:applyExistingAppMigrations()` skips that historical
validator when the installed definition already supports the new code, always
applies 018, and verifies columns, validated constraints and stage restrictions
before the manifest. An incomplete schema fails closed and requires explicit
repair. No cluster mutation was performed for this local refinement.

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
- AI approach generation is packaged disabled by default. When explicitly
  enabled, `OPENAI_API_KEY` and `OPENAI_APPROACH_MODEL` come only from the
  release Secret; the ConfigMap exposes only the feature flag and timeout.
  The model must support Structured Outputs.

Preflight: exact context, HTTPS API server, kube-system UID, non-production
namespace labels, source Secret shape, producer endpoint, release tag, and
distinct credentials. Failed preflight mutates nothing.

App migration gotcha: `kubectl exec` does not forward the parent process stdin
unless `--stdin` is present. A `psql` child can therefore exit `0` without
executing a streamed migration. `scripts/deploy-demo3-k8s.mjs` now streams
app-owned migrations with `kubectl exec --stdin` and `psql --file=-`, wraps them in
`--single-transaction` with `ON_ERROR_STOP=1`, and refuses the manifest rollout unless the old unique
index count is `0` and the canonical non-unique index count is `1`. Producer
migrations are not part of this mechanism.
`--file=-` explicitly supplies the stdin script required by PostgreSQL 16's
[`--single-transaction` contract](https://www.postgresql.org/docs/16/app-psql.html).
The migration-packaging contract verifies these flags within the same invocation.

PostgreSQL image gotcha: every migration copied by
`k8s/Dockerfile.demo3-postgres` must also have an explicit `!db/app/...` entry
in `.dockerignore`; otherwise BuildKit excludes the file before evaluating the
Dockerfile. The packaging contract must assert both sides for each new
migration.

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

Release `demo3-preprod-20260810-company-search-fallback-001`:
- exact target and contact TLS preflights passed before mutation
- immutable app, edge and proxy images rolled out with all containers ready and
  zero restarts; anonymous/authenticated and invalid-input smoke passed
- the same approved v2 workflow ID now queries once by name plus Brazil,
  prioritizes local matches and preserves the provider's first valid result as
  fallback; one webhook and zero execution rows were verified after rollout
- no provider request, real contact operation, migration or producer write was
performed during rollout

Release `demo3-preprod-20260810-priority-profile-search-001`:
- exact cluster, namespace, n8n ownership and release preflights passed before
  mutation; the prior published workflow was held in memory for automatic
  rollback while the fixed workflow ID was replaced and republished
- the approved v2 workflow retained 19 nodes and one webhook, now with one
  exact-company Contacts Prospecting request containing the shared priority
  title aliases; the legacy Decision Makers node is absent
- immutable app, PostgreSQL, edge and proxy images rolled out with one ready
  app pod, one ready PostgreSQL pod and zero container restarts; authenticated
  smoke found the updated action and billing disclosure
- postflight found zero saved and zero active n8n executions; no contact
  request, Lusha credit, producer write, route, migration or storage change was
  made by the rollout

Release `demo3-preprod-20260810-decision-makers-fallback-001`:
- exact app and published-workflow preflights passed; only the fixed v2
  workflow ID was replaced with prior-export rollback protection
- the approved credential accepted a Decision Makers request for a reserved
  synthetic domain with HTTP 200 and zero contacts after Contacts Prospecting
  had returned 403; no contact value or provider body was logged
- immutable app, PostgreSQL, edge and proxy images rolled out Ready with zero
  restarts; anonymous/authenticated smoke returned 401/200 and found the
  free-sample copy in deployed client assets
- one synthetic Prospecta request reached `PREVIEW_EMPTY` with zero candidates;
  postflight found 19 workflow nodes, one webhook and zero saved/active
  executions

Release `demo3-preprod-20260810-adjacent-contact-fallback-001`:
- exact app and published-workflow preflights passed; only the fixed v2
  workflow ID was replaced with prior-export rollback protection
- immutable images rolled out Ready at the HTTPS Demo 3 edge; authenticated
  deployed assets contain the three-tier fallback and exact-only score copy
- one reserved-domain synthetic request reached `PREVIEW_EMPTY` with zero
  candidates; final n8n aggregate state was zero saved and zero active
  executions

Release `demo3-preprod-20260806-company-location-search-001`:
- exact target and contact TLS preflights passed before mutation
- immutable app, PostgreSQL, edge and proxy images rolled out Ready with zero
  restarts; authenticated queue page and API smoke passed
- the approved v2 n8n workflow copy was exported for rollback, replaced under
  the same ID and republished with one webhook, 19 nodes, native credentials,
  disabled execution saving and zero executions
- an obsolete-contract request returned `400` before dispatch; no valid n8n or
  Lusha request, provider data, contact operation or producer write occurred

Release `demo3-preprod-20260813-outside-analysis-detail-001`:
- exact target and contact TLS preflights passed before mutation
- immutable app, PostgreSQL, edge and proxy images rolled out with one ready
  app pod, one ready PostgreSQL pod and zero container restarts
- value-free authenticated smoke confirmed anonymous `401`, list/API/page
  `200`, exact detail DTO allowlist and invalid-CNPJ `400`
- no producer write, schema change, n8n/provider call, contact operation or
  real producer value was recorded as evidence

Release `demo3-preprod-20260814-priority-d-001`:
- exact target and contact TLS preflights passed before mutation
- immutable app, PostgreSQL, edge and proxy images rolled out with one ready
  app pod, one ready PostgreSQL pod and zero container restarts
- authenticated, value-safe smoke confirmed that Leads and Fila comercial both
  accept the exact `D` filter and return only matching priority values
- the change is presentation and filtering only; it did not recalculate a
  producer fact or call n8n, Lusha, Apollo or another provider

Release `demo3-preprod-20260814-all-current-001`:
- the owner explicitly requested deployment of the complete current worktree;
  exact target and contact TLS preflights passed before mutation
- lint, typecheck, 113 files / 2,092 unit tests, 9 files / 99 disposable
  PostgreSQL integration tests, 53 local contract tests and the production
  build passed; 57 remote contract cases remained skipped
- immutable app, PostgreSQL, edge and proxy images rolled out with one ready
  app pod, one ready PostgreSQL pod and zero container restarts
- anonymous outside-analysis access returned `401`; authenticated page and API
  smoke returned `200` without recording response bodies or producer values
- decision reasons now mechanically present uppercase underscore terms with
  spaces, normal casing and bounded Portuguese orthography/acronym labels; API
  and producer values remain unchanged
- only app-owned idempotent migrations were applied; no producer write, n8n
  workflow change or provider call was performed

Release `demo3-preprod-20260817-lead-approach-001`:
- exact target and contact TLS preflights passed before mutation
- lint, typecheck, 115 files / 2,108 tests and a sanitized production build
  passed before rollout
- immutable app, PostgreSQL, edge and proxy images rolled out with one ready
  app pod, one ready PostgreSQL pod and zero container restarts
- anonymous lead-detail access returned `401`; authenticated page and lead-list
  API returned `200`, and deployed client assets contained the personalized
  approach section without recording response bodies or producer values
- the release adds only a local editable/copyable draft from the approved
  report contract; it added no send, persistence, producer write, n8n workflow
  change or provider call

Release `demo3-preprod-20260817-lead-problem-001`:
- exact target and contact TLS preflights passed before mutation
- lint, typecheck, 115 files / 2,118 tests and a sanitized production build
  passed before rollout
- the release-scoped app, edge, proxy and PostgreSQL image references rolled
  out with one ready app pod, one ready PostgreSQL pod and zero restarts;
  unchanged infrastructure layers reused their existing image digests
- anonymous Leads access returned `401`; authenticated Leads, API and one
  value-safe lead detail returned `200`, and its client assets contained the
  explicit-problem empty-state copy without recording identifiers or bodies
- the draft now requires an explicit problem from the approved report and uses
  sector only as supporting context; no n8n/provider call or producer write
  occurred

Release `demo3-preprod-20260817-all-report-approach-001`:
- exact target and contact TLS preflights passed before mutation
- lint, typecheck, 115 files / 2,126 tests and a sanitized production build
  passed before rollout
- release-scoped app, edge, proxy and PostgreSQL image references rolled out
  with one ready app pod, one ready PostgreSQL pod and zero restarts; unchanged
  infrastructure layers reused their existing image digests
- anonymous Leads access returned `401`; authenticated Leads/API returned
  `200`, and a value-safe search found one available report without an explicit
  problem whose detail returned `200`
- deployed detail assets contain the all-report approach copy; focused local
  tests prove opportunity and neutral-fallback rendering without recording any
  identifier, report body or producer value
- no producer write, n8n/provider call, contact action or message send occurred

Release `demo3-preprod-20260817-ai-approach-001`:
- owner-selected `gpt-5.6-terra` and the server-only API key passed fail-closed
  configuration validation; neither value is exposed through public config
- exact target and contact TLS preflights passed before mutation; immutable
  app, PostgreSQL, edge and proxy images built and published successfully
- app and PostgreSQL rolled out `1/1` Ready with zero container restarts; the
  runtime feature flag, model, non-empty key and timeout were verified without
  printing secrets
- value-free route smoke returned anonymous `401` and authenticated invalid
  input `400`; it made no producer read, OpenAI request or message send

Release `demo3-preprod-20260817-ai-proposal-001`:
- 16 focused service tests, 36 combined service/route/component tests, full
  lint/typecheck, 117 files / 2,154 tests and sanitized build passed before
  rollout
- exact target and contact TLS preflights passed; immutable app, PostgreSQL,
  edge and proxy images built, published and rolled out successfully
- app and PostgreSQL are `1/1` Ready with zero container restarts; runtime
  configuration and the compiled Apollo/proposal prompt were verified without
  printing secrets
- value-free route smoke returned anonymous `401` and authenticated invalid
  input `400`; no producer fact, report body, OpenAI call or message send was
  used during rollout or postflight

Release `demo3-preprod-20260817-ai-tone-001`:
- 18 focused service tests, full lint/typecheck, 117 files / 2,156 tests and a
  sanitized production build passed before rollout; two bounded provider
  evaluations used only fully synthetic companies
- exact target and contact TLS preflights passed; immutable release-scoped
  images and secrets were built, published and rolled out successfully
- app and PostgreSQL are `1/1` Ready with zero container restarts; unchanged
  infrastructure layers reused their existing image digests
- runtime checks confirmed the enabled feature, `gpt-5.6-terra`, bounded
  timeout and compiled `reasoning: low`, `verbosity: low`, `store:false` plus
  the low-pressure prompt without printing the API key
- value-free route smoke returned anonymous `401` and authenticated invalid
  input `400`; no valid producer read, OpenAI request or message send occurred
  during rollout or postflight

Release `demo3-preprod-20260817-commercial-queue-approach-001`:
- initial PostgreSQL image build stopped before cluster mutation because
  `.dockerignore` omitted migration `015`; the allowlist and packaging contract
  were corrected before a fresh exact-target preflight
- immutable app, PostgreSQL, edge and proxy images rolled out; app and database
  pods are Ready with zero container restarts
- app-owned cache table/index and runtime `SELECT`/`INSERT`/`UPDATE` without
  `DELETE` passed independent postflight
- queue smoke returned anonymous `401`, authenticated `200` and an enabled
  auto-generation capability without recording producer values or response
  bodies
- rollout/postflight made no OpenAI request, n8n call, producer write or
  outreach action

Release `demo3-preprod-20260817-shared-approach-001`:
- exact target and contact TLS preflights passed before cluster mutation
- immutable app, PostgreSQL, request-edge and loopback-proxy images rolled out;
  app and database are `1/1` Ready and all containers have zero restarts
- authenticated queue and cache-only lead reads returned `200`; a ready draft
  matched exactly across both responses in an in-memory comparison that logged
  no company identifier, producer run or message content
- app, edge and PostgreSQL had zero sanitized error markers in the rollout
  window
- no OpenAI POST, n8n call, producer write or outreach action occurred during
  deployment or postflight

Release `demo3-preprod-20260817-profile-fit-001`:
- profile-fit code passed 76 focused tests, full lint/typecheck, 120 files /
  2,192 tests, 10 contract files / 54 tests and the sanitized production build
- exact target and contact TLS preflights passed before mutation; immutable
  app, PostgreSQL, request-edge and loopback-proxy images were built, published
  and rolled out with idempotent app-owned migrations
- app and PostgreSQL are `1/1` Ready, all four containers have zero restarts,
  and the runtime contains `apollo-profile-fit-v2` with the AI and automatic
  queue flags enabled, `gpt-5.6-terra` and a configured server-only key
- anonymous Leads returned `401`; authenticated invalid approach generation
  returned `400`; sanitized logs contained zero error or provider-call markers,
  so the postflight made no valid producer read, OpenAI request or message send

Release `demo3-preprod-20260818-operational-ux-001`:
- full lint/typecheck, 124 files / 2,267 tests and sanitized production build
  passed before rollout; no route, schema or external contract changed
- exact target and contact TLS preflights passed before mutation; immutable
  app, PostgreSQL, request-edge and loopback-proxy images rolled out
- app and PostgreSQL are `1/1` Ready, all containers have zero restarts and
  rollout-window logs contain zero sanitized error markers
- anonymous Queue returned `401`; authenticated Leads, Queue, an existing
  Workspace and its qualification cadence returned `200` without recording
  identifiers, commercial values or response bodies
- no OpenAI, n8n, contact-provider or producer-write call occurred during
  rollout or postflight

Release `demo3-preprod-20260818-executive-reason-001`:
- focused presentation checks passed 86 tests; full lint/typecheck, 124 files /
  2,270 tests and sanitized production build passed before rollout
- exact target and contact TLS preflights passed before mutation; all four
  immutable images rolled out and both workloads are `1/1` Ready
- all containers have zero restarts and rollout-window logs contain zero
  sanitized error markers
- anonymous Leads returned `401` and authenticated Leads returned `200`; a
  value-safe read found one matching live reason and the active client bundle
  contains the executive-copy markers, without recording company values
- no OpenAI, n8n, contact-provider or producer-write call occurred during
  rollout or postflight

Release `demo3-preprod-20260818-risk-original-001`:
- focused risk presentation passed 63 tests; full lint/typecheck, 124 files /
  2,270 tests and sanitized production build passed before rollout
- exact target and contact TLS preflights passed before mutation; all four
  immutable images rolled out and both workloads are `1/1` Ready
- all containers have zero restarts and rollout-window logs contain zero
  sanitized error markers
- anonymous Leads returned `401` and authenticated Leads returned `200`;
  value-safe reads observed seven unknown live risk items without recording
  their values, while the active bundle omits generic fallback copy and retains
  known risk descriptions
- no OpenAI, n8n, contact-provider or producer-write call occurred during
  rollout or postflight

Release `demo3-preprod-20260818-report-preservation-001`:
- focused mapper checks passed 42 tests; full lint/typecheck, 124 files / 2,271
  tests and sanitized production build passed before rollout
- exact target and contact TLS preflights passed before mutation; all four
  immutable images rolled out and both workloads are `1/1` Ready
- all containers have zero restarts and rollout-window logs contain zero
  sanitized error markers
- anonymous Leads returned `401` and authenticated Leads returned `200`; a
  value-safe live check found one targeted report available, within 12,000
  characters, with reduction and privacy markers and no phone-like content
- no OpenAI, n8n, contact-provider or producer-write call occurred during
  rollout or postflight

Release `demo3-preprod-20260820-prospecting-pipeline-001`:
- exact Demo 3 target and contact TLS preflights passed before mutation
- immutable app, PostgreSQL, request-edge and loopback-proxy images rolled out;
  application and PostgreSQL are `1/1` Ready with zero container restarts
- anonymous Pipeline returned `401`; authenticated Pipeline and work-queue API
  returned `200`, and the published HTML contains the pipeline heading
- rollout-window logs contain zero sanitized error markers; no OpenAI, n8n,
  contact-provider, outreach or producer-write call occurred

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

Release `demo3-preprod-20261006-mvp-feedback-001`:
- owner explicitly requested finishing contact front end, then app deployment
  to the existing HTTPS NodePort30443; no n8n deployment was included
- exact cluster and TLS preflights passed before mutation; all four immutable
  images published and app/PostgreSQL rollouts completed
- app-owned migration017 adds restricted nullable provider diagnostics;
  migration postconditions passed; producer contents and app audit preserved
- 26 HTTPS postflight checks passed with trusted CA, eight pages and approved
  read samples; all release containers Ready with zero restarts
- no real response values, screenshots, webhook/provider calls or application
  mutations were recorded/performed; raw callbacks remain outside diagnostics
- callbacks from the installed n8n workflow can still lack diagnostic facts;
  the updated repository v2 artifact is inactive and was not published
- rollout rollback must be checked operationally if invoked; existing helper
  does not independently confirm its restoration command statuses

Release `demo3-preprod-20261013-ux-feedback-001`:
- exact target/TLS preflight passed; app-only image built and published
- deployment revision66 → 67; resourceVersion/image preconditions plus
  template checksums verified the sole app-container image change
- existing ConfigMap/Secret refs, Basic Auth password, feature flags, TLS,
  edge/proxy and PostgreSQL image preserved; no migration or n8n change
- app and PostgreSQL `1/1` Ready; app containers zero restarts; active image
  digest matches the registry publication; 17 authenticated/anonymous HTTPS
  and asset checks passed with no real values recorded
- a later full-helper deploy must still use a fresh release ID: this tag
  contains only an app image, not all four infrastructure image tags
- evidence and revision66 rollback: `docs/prospecta-ux-feedback-deploy.md`

Release `demo3-preprod-20261013-batch-results-001`:
- owner requested deploy; scoped app-only target preflight passed after the
  full helper halted without mutation because n8n had an active execution
- verified source image built with default Turbopack; registry tag absence and
  digest confirmed before guarded app-image patch; revision67 → 68
- app `1/1` Ready, zero container restarts; PostgreSQL `1/1` Ready and template
  unchanged; settings/credentials, TLS, edge/proxy and flags preserved
- 15 HTTPS status/cache/static-asset checks passed; no real response values
  recorded; no migrations, uploads, provider calls or n8n mutation
- static marker checks must normalize minified JS Unicode/hex escapes before
  matching Portuguese copy; do not execute the served assets
- release evidence and previous image/revision67 rollback:
  `docs/prospecta-batch-results-fix.md`

Release `demo3-preprod-20261014-ux-continuity-001`:
- owner requested deploy; app-only preflight confirmed exact context, HTTPS
  API, kube-system UID, existing non-production namespace, gateway and CA
- isolated verified source built; offline image checks excluded env/git;
  absent immutable tag checked before build/push and registry digest verified
- guarded app-image patch with UID/resourceVersion/container-name/image
  preconditions; revision68 → 69; app `1/1` Ready with zero restarts
- remaining template, configuration/credential checksums, TLS, edge/proxy and
  PostgreSQL preserved; PostgreSQL `1/1` Ready with stable revision
- 22 HTTPS access/cache/assets checks passed; no raw response values recorded,
  migration, n8n change, upload or provider call
- release evidence and previous image/revision68 rollback:
  `docs/prospecta-ux-list-continuity-deploy.md`

Release `demo3-preprod-20261014-import-notices-001`:
- owner requested deploy and existing gateway password; exact target preflight
  passed before mutations, gateway credentials/TLS/settings preserved
- applied only app-owned019 via verified source hash, stdin and
  `psql --single-transaction --file=-`, with timeouts and same-transaction
  schema/constraints/append-only/grants verification; historical migrations
  were not replayed
- immutable isolated app image passed offline inspection and digest checks;
  guarded image-only patch revision69 → 70, app `1/1` Ready, zero restarts
- PostgreSQL template unchanged; schema019 retained on application rollback
- 22 HTTPS access/cache/receipt-envelope/assets checks passed; no response data
  recorded, uploads, n8n/producer mutation or provider calls
- evidence: `docs/prospecta-import-company-notices-deploy.md`

Updated: 2026-10-16
