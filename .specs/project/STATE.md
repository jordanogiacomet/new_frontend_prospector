# State

**Last Updated:** 2026-10-06
**Follow-up in progress:** Closing the presentation MVP and factual contact
search feedback. The owner subsequently requested finishing the contact front
end and publishing the app to the exact Demo 3 HTTPS NodePort30443 target.
Release `demo3-preprod-20261006-mvp-feedback-001` published after exact
cluster/TLS preflight; migration017, rollout and 26 HTTPS postflight checks
passed. Workflows n8n remain at their installed version. The subsequent request
for a sales-oriented company assessment is implemented (101 focal tests);
the owner now also requested a simpler, pleasant manager pipeline. Both UI
changes will ship together in the second verified release.
Details: `.specs/features/demo3-mvp-readiness-v1/` and
`.specs/features/contact-search-feedback-v1/`.

**Prior application work:** Manager MVP focused on importing and reviewing companies,
as clarified by the owner. `/inicio`, exact-priority review shortcuts,
honest unknown upload responses, progressive disclosure and visible mobile
upload results are implemented. Final lint, strict typecheck, 2,377 tests in
129 files, sanitized production build and 132 synthetic browser checks passed.
Infrastructure and Demo 3 publication were explicitly deferred by the owner
during this turn. No new release was published.
Details: `.specs/features/manager-import-analysis-mvp-v1/`.

**Previous delivery context:** Contact-enrichment v2 is active only on the governed Demo 3
HTTPS profile. The commercial queue prefills one exact valid producer domain;
when none exists, it now offers an explicit company-name lookup with an
allowlisted firmographic preview and human confirmation before the contact
preview. The approved Lusha credential does not include Contacts Prospecting,
so new Demo 3 previews make one exact-company Decision Makers request for up to
100 free previews and locally retain at most 10 versioned finance/accounting
title matches; there is no second page, second operation or automatic retry.
The queue now uses one responsive opportunity sheet per company and gives
contacts a dedicated full-width workspace. A real-contact UAT still requires
one selected queue company, relevant candidate and immediate
suppression/erasure; production remains separately gated.
The live 29-node `contact-provider-fallback-v1` workflow now uses Apollo only
after a structurally valid empty Lusha sample. When its exact-domain Apollo
People sample is also empty, it may reuse one sanitized corporate number from
the already completed Apollo Organization Enrichment response. Release
`demo3-preprod-20260811-company-phone-fallback-001` and app-owned migration
012 are active on Demo 3. The number is encrypted, retained for 30 days,
suppression-aware, shown separately with unknown contactability, and never
affects the commercial score. The rollout made no webhook or provider request;
runtime provider access remains an explicit operator UAT.
Release `demo3-preprod-20260811-lead-location-map-001` adds an approximate
company-location section to lead detail using only the existing company name,
city and UF. The map opens on explicit operator action, sends no CNPJ and loads
no third-party content with the private page itself.
Release `demo3-preprod-20260813-registered-address-map-003` upgrades that map
to a server-resolved registered-address point, an explicitly labeled
registered-CEP fallback, and finally the existing municipality fallback. The
browser never calls the registry or geocoders directly; only coordinate cache
fields are retained app-owned.
Release `demo3-preprod-20260813-registered-address-map-004` keeps the marker
coordinate and precision contract intact while tightening registered-reference
framing to approximately 330 × 220 metres; municipality framing is unchanged.
Release `demo3-preprod-20260813-outside-analysis-detail-001` gives every current
“Fora da análise” CRM decision a dedicated, read-only page. It reuses the exact
list eligibility and organization visibility, exposes no new producer field and
offers no analysis, contact or mutation action.
Release `demo3-preprod-20260814-all-current-001` publishes the complete current
worktree requested by the owner. It presents uppercase underscore terms in
decision reasons as readable business text while preserving API/producer
values. Exact target/TLS preflights, all local build gates, disposable
PostgreSQL integration, local contracts and value-safe authenticated smoke
passed; both pods are Ready with zero restarts.
Release `demo3-preprod-20260817-lead-approach-001` adds the editable lead-detail
approach draft from approved report context. Fresh local gates and value-free
postflight passed; the app and PostgreSQL pods are Ready with zero restarts.
The feature has no send or persistence path and the rollout called no n8n or
contact provider.
Release `demo3-preprod-20260817-lead-problem-001` refines that draft to require
an explicit company problem from the approved report; sector is supporting
context only and generic opportunity/qualification fields no longer produce a
message. Exact preflights, 115 files / 2,118 tests, build and value-safe
postflight passed. Both pods are Ready with zero restarts, and the rollout made
no producer write, n8n call or provider request.
Release `demo3-preprod-20260817-all-report-approach-001` publishes the owner's
correction: every identified company with an available report receives a draft
from its best approved context. Problems remain first priority, but opportunity,
differential, asset, signal, summary, safe prose and sector are valid bases; an
identity-only neutral draft covers reports with no customer-facing fact. Lint,
typecheck, 115 files / 2,126 tests, sanitized build, exact preflights and
value-safe postflight passed with both pods Ready and zero restarts.
Release `demo3-preprod-20260817-ai-approach-001` activates lead approach AI v1
on Demo 3 with the owner-selected `gpt-5.6-terra` model and a server-only key.
The PLASFORT research-quality sentence is denied from deterministic customer
copy. “Gerar com IA” re-reads the sanitized selected report server-side,
requires `leads:read` plus `sensitive:read`, and makes one OpenAI Responses
request with `store:false`, structured output, bounded timeout, no tools and no
retry. Prior full lint/typecheck, 117 files / 2,151 tests, 54 local contracts
and sanitized build passed; the release build, exact target/TLS preflights and
value-free route postflight also passed. Both workloads are Ready with zero
restarts. No OpenAI request was made during rollout or postflight.
Release `demo3-preprod-20260817-ai-proposal-001` makes every accepted AI draft
present Apollo Gestão, explain a relevant approved asset-management capability
and formulate a concrete initial proposal tied to the target report. Full
lint/typecheck, 117 files / 2,154 tests, sanitized build, exact target/TLS
preflights and value-free route smoke passed. Both workloads are Ready with
zero restarts; rollout and postflight made no OpenAI request.
Release `demo3-preprod-20260817-commercial-queue-approach-001` publishes the
approved commercial-queue approach v1 implementation. Visible exact-priority
`B` and `C` companies receive a review-only personalized draft through a
durable organization/CNPJ/run/version claim cache; refreshes reuse ready copy
and concurrent requests do not duplicate provider calls. The independent
automatic-queue flag is default-off outside the configured local Demo 3
profile. Full lint/typecheck, 119 files / 2,175 tests, 103 disposable PostgreSQL
integrations, 54 local contracts and production build passed. Exact preflights,
app-owned migration/grant verification and value-safe queue smoke passed; all
workloads are Ready with zero restarts. Rollout/postflight made no OpenAI, n8n,
producer-write or outreach call.
Release `demo3-preprod-20260818-qualification-cadence-001` publishes the
app-owned four-contact qualification cadence in the commercial workspace. The
manager chooses a start date and interval, records the current result, and the
sequence advances, reschedules or ends without automatic sending or reply
detection. Full lint/typecheck, 123 files / 2,259 unit tests, 106 disposable
PostgreSQL integrations, 54 local contracts and sanitized production build
passed. Exact target/TLS preflight, migration/index/grant checks and value-safe
authenticated route/workspace smoke passed; app and PostgreSQL workloads are
Ready on the immutable release with zero restarts. Rollout/postflight made no
OpenAI, n8n, contact-provider or producer-write call.
Release `demo3-preprod-20260818-operational-ux-001` publishes the
`operational-ux-flow-v1` pass. It preserves exact lead and queue context across
detail/workspace navigation, adds direct workspace task shortcuts, connects
copied approach text to the qualification section and warns before abandoning
changed commercial drafts through links or browser reload/close. The pass
changed no API, database or integration. Full lint/typecheck, 124 files / 2,267
tests and sanitized production build passed. Exact target/TLS preflights,
immutable rollout and value-safe postflight passed; app and PostgreSQL are
`1/1` Ready, all containers have zero restarts, and rollout-window logs have
zero sanitized error markers. No OpenAI, n8n, contact-provider or
producer-write call occurred.
Release `demo3-preprod-20260818-executive-reason-001` publishes the bounded
executive presentation for the known CRM/public-validation recommendation.
The UI now states the CRM history, pending public confirmation and any
unconfirmed debt indication in plain business language, then gives the manager
the next review action; stored/API producer text remains exact. Full lint,
typecheck, 124 files / 2,270 tests and sanitized build passed. Exact target/TLS
preflight and immutable rollout passed; workloads are `1/1` Ready with zero
restarts. Value-safe postflight found one live matching case, confirmed the
executive copy in the active client bundle and recorded no identifier, reason
body or company value. Logs had zero sanitized error markers, and no OpenAI,
n8n, contact-provider or producer-write call occurred.
Release `demo3-preprod-20260818-risk-original-001` publishes the approved risk
fallback: exact known tokens keep their friendly descriptions, while an
unknown sanitized risk item is displayed unchanged instead of collapsing into
the repeated no-description sentence. Full lint/typecheck, 124 files / 2,270
tests and sanitized build passed. Exact target/TLS preflight and immutable
rollout passed; workloads are `1/1` Ready with zero restarts. Value-safe
postflight observed seven unknown live risk items without recording their
values, confirmed the generic copy absent and known copy present in the active
bundle, and found zero sanitized error markers. No OpenAI, n8n,
contact-provider or producer-write call occurred.
Release `demo3-preprod-20260818-report-preservation-001` publishes the
strategic-report preservation fix. A valid oversized report remains available
through a displayed copy reduced to 12,000 characters with a visible notice;
phone-like content is replaced with an explicit privacy marker before response
mapping. The stored producer report is unchanged; e-mail, active HTML, unsafe
schemes, ambiguous matches and failed integrity remain unavailable. Full
lint/typecheck, 124 files / 2,271 tests and sanitized production build passed.
Exact target/TLS preflights and immutable rollout passed; workloads are `1/1`
Ready with zero restarts and rollout-window logs have zero sanitized error
markers. Anonymous Leads returned `401`, authenticated Leads returned `200`,
and a value-safe live check found the targeted report available, reduced,
within the limit and without phone-like content. No OpenAI, n8n,
contact-provider or producer-write call occurred.

---

## Recent Decisions (Last 60 days)

### AD-001: Local k8s presentation uses explicit demo profile (2026-07-08)

**Decision:** Use `FEATURE_DEMO_DATA_ENABLED=true`, existing development auth
bypass, and synthetic data for the local Kubernetes presentation.
**Reason:** The app is incomplete and lacks approved non-production database
credentials, but the manager demo needs visible product screens.
**Trade-off:** This is not production-like runtime hardening.
**Impact:** The demo can be presented locally without producer mutation, real
CSV storage, production migration, or n8n workflow activation.

### AD-002: Local Docker registry image for Kubernetes demo (2026-07-08)

**Decision:** Build `localhost:5000/prospecta/app:demo` and let the local
cluster pull from the host's Docker registry.
**Reason:** The cluster runtime is containerd and the current user cannot import
images into the `k8s.io` namespace, but a pull test from `localhost:5000`
succeeded.
**Trade-off:** This depends on the host-local registry container.
**Impact:** The demo uses a normal image-based Deployment without hostPath source
mounts.

### AD-003: Demo 3 PostgreSQL uses an NFS-safe data subdirectory (2026-07-17)

**Decision:** Mount the disposable PVC at `/var/lib/postgresql/data`, set
`PGDATA` to its app-owned `pgdata` subdirectory, and gate liveness/readiness
behind a startup probe that verifies the final runtime-role grant.
**Reason:** The NFS root cannot be chmod-ed by the non-root PostgreSQL process,
and initialization can exceed the normal liveness window.
**Trade-off:** First startup may remain unready for several minutes on slow NFS.
**Impact:** Initialization remains non-root and cannot be reported Ready before
schema, role, and grants exist.

### AD-004: Demo 3 frontend uses the approved LAN NodePort (2026-07-17)

**Decision:** Expose only the Demo 3 frontend Service as NodePort `30100` on
`192.168.0.20`; keep PostgreSQL as ClusterIP.
**Reason:** The repository owner explicitly corrected the presentation access
requirement from port-forward to NodePort.
**Trade-off:** The synthetic auth-bypass demo is reachable on the local LAN and
must not be treated as a secure or production profile.
**Impact:** Demo 3 is available at `https://192.168.0.20:30100`; no persistent
port-forward service is required.

### AD-005: Demo 3 becomes the local pre-production target (2026-07-17)

**Decision:** Promote the exact Demo 3 namespace and NodePort to a
single-tester local pre-production profile. Read real producer facts with the
existing read-only role, preserve an isolated app-owned database, and require
HTTPS gateway authentication before the shared application actor.
**Reason:** The owner needs all implemented pages and real producer data for
end-to-end product testing, while the available OIDC settings remain
placeholders.
**Trade-off:** Audit identifies the shared pre-production actor rather than an
individual corporate identity, and the self-signed LAN certificate requires
local browser acceptance.
**Impact:** The permanent producer write boundary remains unchanged; Demo 3
can exercise real reads and app-owned writes without anonymously exposing the
application on the LAN.

### AD-006: Demo 3 local pre-production uses HTTP (2026-07-17)

**Decision:** Replace the self-signed HTTPS edge with plain HTTP on the exact
local `192.168.0.20:30100` target while retaining mandatory gateway Basic Auth.
**Reason:** The owner explicitly accepted real producer facts over HTTP to
remove the browser certificate interruption for the current LAN test.
**Trade-off:** Gateway credentials and response data can be intercepted on the
local network. This profile is unsuitable for internet or production access.
**Impact:** The shared actor, real read-only producer access, isolated app-owned
writes, immutable release, preflight, and anonymous `401` remain unchanged.

### AD-007: Canonical producer acceptance migration chain (2026-07-22)

**Decision:** Keep only `003_import_acceptance.sql` followed by
`004_import_acceptance_rollback.sql`; the alternate `_v1` drafts were removed
after full semantic comparison.
**Reason:** The canonical pair is the only sequence referenced by integration
tests and is stricter about manifest shape, source-row identity, exact durable
row membership, public grants, and non-idempotent DDL.
**Trade-off:** The draft's `uuid` column type and `IF NOT EXISTS`/`OR REPLACE`
forms were not retained because they added no required rule and weakened a
reviewable operator-owned migration.
**Impact:** `db/producer/` now has one unambiguous acceptance/rollback chain;
OPEN-05 still blocks application outside disposable local PostgreSQL.

### AD-008: Current n8n export is a behavior baseline only (2026-07-22)

**Decision:** Keep the active 98-node current workflow immutable and use its
ignored local export only as static behavior evidence. Do not call, clone or
adapt that workflow in place; OPEN-02 requires a separately approved producer
worker and terminal adapter behind the versioned ingress.
**Reason:** The export has no subworkflow entry, responds before any Postgres
node, uses legacy identities, persists only legacy facts and sends fallible
callbacks after the response.
**Trade-off:** The ingress v1 remains fail-closed after durable acceptance and
cannot complete batches until the producer worker is explicitly approved and
implemented.
**Impact:** The current workflow and its scoring/recommendation semantics remain
untouched. The sanitized implementation direction is recorded in
`.specs/features/batch-import-n8n-alignment/evidence/current-workflow-static-review-2026-07-22.md`.

### AD-009: Demo 3 applies app-owned upgrades before app rollout (2026-07-22)

**Decision:** Package the idempotent app migration
`006_import_acceptance_reconciliation_forward.sql` in fresh PostgreSQL images
and stream it transactionally to an existing Demo 3 PostgreSQL pod before
replacing the application. Verify that the legacy unique producer-batch index
is absent and the canonical non-unique index is present before continuing.
**Reason:** The persistent Demo 3 database retained the old unique index even
though the application code already allowed separate submissions to correlate
to the same canonical producer batch. The first deploy attempt also proved
that `kubectl exec` without `--stdin` can exit successfully without applying
the supplied SQL.
**Trade-off:** A release may make a backward-compatible app-owned index change
before a later manifest/smoke failure; rollback restores application images
but intentionally does not recreate the obsolete unique index.
**Impact:** Release `demo3-preprod-20260722-batch-alignment-001` is running at
`http://192.168.0.20:30100`; schema verification returned the canonical `0|1`
index state and authenticated route/API smoke passed. No producer DDL or n8n
change was made.

### AD-010: Source availability does not imply correlated facts (2026-07-22)

**Decision:** Present `observationStatus = AVAILABLE` with
`lastObservedAt = null` as “fonte consultada sem fatos do lote”, not as
“observações disponíveis”. Keep every unsupported count as unavailable.
**Reason:** A diagnosed legacy submission had one workflow acknowledgement but
no durable acceptance and no producer observation row. The producer query was
healthy, so the previous green availability copy overstated the evidence.
**Trade-off:** The UI is more explicit about the integration gap and does not
offer a synthetic progress estimate.
**Impact:** Release `demo3-preprod-20260722-empty-observations-001` is running at
the approved Demo 3 target. The diagnosed batch remains truthfully `SUBMITTED`;
no data, status or count was invented.

### AD-011: Current workflow close is an app-owned operational report (2026-07-22)

**Decision:** Preserve the active 98-node workflow byte-for-byte and receive
only its existing `BATCH_CLOSED` callback through a dedicated authenticated app
route. Persist one minimal append-only app-owned event and present it as
“Processamento encerrado”, without changing contractual `BatchStatus` or
result counts.
**Reason:** The owner needs the current upload flow to state when its loop has
finished, without waiting for the separate v1/X4 architecture or modifying
producer scoring and recommendations.
**Trade-off:** Delivery remains best-effort because the existing callback uses
finite retry plus `continueOnFail`; the UI cannot infer failure from a missing
event. Plain HTTP exposes the callback secret on the approved LAN profile.
**Impact:** Release `demo3-preprod-20260723-lifecycle-refresh-001` is active.
The app and n8n now read the same callback credential from dedicated
Kubernetes Secrets and n8n uses the exact authorized LAN URL. The export
remains active with 98 nodes and its previously recorded SHA-256.

### AD-012: First accepted row is operational start, not acceptance (2026-07-23)

**Decision:** Persist only the first correlated `ACCEPTED_ROW` as the minimal
app-owned event `WORKFLOW_STARTED_REPORTED`, and refresh open lead list, detail
and retained-history pages every five seconds while visible.
**Reason:** The existing upload `202` records submission but does not prove
producer acceptance; users still need an honest start marker and automatic
visibility of facts that later appear in the existing read-only producer
queries.
**Trade-off:** Callback delivery remains fallible on the approved plain-HTTP
LAN profile. Polling improves freshness but does not create or copy producer
facts. A missing event is not failure.
**Impact:** Migrations `007`/`008` are active in Demo 3. n8n revision 16 kept
version 2.30.6 and its existing image digest, uses two Secret-backed callback
environment variables and explicitly sets
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Revision 15 had the variables but its
Code nodes failed before HTTP emission. After correction, a new exactly-once
synthetic upload reported operational start in about five seconds. Pre-fix
executions were not retried. The execution later succeeded and reported close
plus workflow row count while contractual status remained `SUBMITTED`; an
idempotent read-back caused no external resubmission.

### AD-013: Demo 3 test-run visibility requires app-owned batch correlation (2026-07-23)

**Decision:** Preserve the normal production visibility predicate and add a
Demo 3-only union for test-marked terminal runs whose `import_batch_id` is
correlated to an app-owned submission of the authenticated organization.
Require the exact Demo 3 runtime and shared actor, and apply the same bound
`text[]` batch set to lead list, detail and retained history.
**Reason:** The current local workflow marked three otherwise eligible results
from an owner-submitted CSV with a non-production `test_case_id`, so polling
worked but the established production predicate correctly hid them.
**Trade-off:** Each visible-page poll performs one additional app-owned lookup.
The exception is valid only for the single-organization Demo 3 profile and
must not become a production multi-organization rule without a stronger global
batch-identity guarantee.
**Impact:** Eligible `INSERIDO_VALIDATION` results from the user's correlated
Demo 3 submission can appear without exposing unrelated test runs, copying
producer data or changing producer facts. `CRM_DECIDIU_E_SALVO` remains outside
“Leads para análise”. Immutable release
`demo3-preprod-20260723-correlated-leads-002` is active. A first candidate tag
was published but never applied because replaying migration `007` after `008`
temporarily narrowed the event constraint; commit `54ec775` made that replay
forward-compatible and added a regression test before the successful rollout.

### AD-014: Contact enrichment v2 is policy-gated and HTTPS-only (2026-07-31)

**Decision:** Preserve PII-free v1 and implement v2 as separate preview and
human-selected Reveal phases with independent permissions, encrypted app-owned
storage, field/channel suppression, short retention and a separate inactive
n8n artifact. Use legitimate interest only after a signed balance test; never
treat Lusha availability or operator approval as contact consent.
**Reason:** The owner authorized contact processing and asked the agent to
define the policy, but the current Demo 3 HTTP edge, legal controller identity
and production target remain objective facts that cannot be invented.
**Trade-off:** The queue is connected in repository code, but the v2 feature is
explicitly false in Demo 3 and real contacts remain unavailable until HTTPS
and operational/privacy preflight pass.
**Impact:** Migration 010 passed a disposable PostgreSQL 16 suite; the workflow
remains `active:false`, no external endpoint was called, and production still
requires individual OIDC plus remotely verified replay/rate-limit controls.

### AD-015: Queue domain prefill uses one exact CRM history fact (2026-08-06)

**Decision:** Prefill `companyDomain` only when an exact normalized CNPJ has
one distinct value in `public.crm_company_history.website_domain` and that
value passes the existing domain contract. Grant the Demo 3 producer reader
column-level `SELECT` on only `cnpj` and `website_domain`; keep the field
editable and require an explicit user submission.
**Reason:** The producer already stores the company-domain fact, so reusing it
avoids a second provider lookup and preserves the browser → Prospecta boundary.
**Trade-off:** Missing, malformed or ambiguous producer values remain manual.
A company with CRM history but no eligible current queue projection does not
appear solely to demonstrate this feature.
**Impact:** Immutable release
`demo3-preprod-20260806-company-domain-prefill-001` passed read-only UAT. The
current live queue had no correlated domain, and n8n retained zero v2 execution
rows; no Lusha request was made.

### AD-016: Contact fit is a separate derived commercial score (2026-08-10)

**Decision:** Render only the policy-approved factual LinkedIn profile and
calculate `contact-commercial-score-v1` on explicit user action from the best
available priority accounting title. Add the approved bonus to the immutable
producer score, cap at 100, and label the result as a separate commercial
indicator.
**Reason:** The operator needs a concise signal that a requested accounting
decision maker was found, while the producer score and recommendation remain
outside the Prospecta mutation boundary.
**Trade-off:** The derived score is intentionally non-persistent and must be
recalculated after a page reload. Missing provider LinkedIn data remains
missing rather than becoming a fabricated search link.
**Impact:** No route, migration, provider request or producer write is added.
The rule is covered with synthetic Portuguese and English titles, unavailable
contacts, missing producer score and the 100-point cap.

### AD-017: Priority titles are constrained in the provider query (2026-08-10)

**Decision:** Replace the generic Decision Makers preview with one Lusha
Contacts Prospecting request constrained by the human-confirmed company and
the exact Portuguese/English title aliases versioned by
`contact-commercial-score-v1`. Do not issue a table/reveal operation, generic
fallback, automatic retry or second provider request.
**Reason:** A generic ten-contact preview did not establish that the requested
finance/accounting profiles had actually been searched, so local filtering
could report no match even when a relevant employee existed outside that
sample.
**Trade-off:** The provider may return fewer or no profiles, and each explicit
new search may consume Lusha search credits. An empty result describes only
that query and is not proof that the company has no relevant employee.
**Impact:** Demo 3 release
`demo3-preprod-20260810-priority-profile-search-001` updated the UI and exact
published v2 workflow without changing routes, migrations, storage, the
producer score or producer data. Rollout and postflight made no provider
request and retained zero saved or active workflow executions.

### AD-018: Demo 3 uses a one-sample Decision Makers fallback (2026-08-10)

**Decision:** Because the approved Demo 3 Lusha credential returns `403` for
Contacts Prospecting, use one exact-company Decision Makers request with page
0 and size 100. Filter that provider-ranked sample locally with the same
versioned title aliases and expose at most 10 matching candidates. Do not
request another page, retry or call another provider operation.
**Reason:** Company Prospecting and Decision Makers both succeed with the same
credential, isolating the failure to the account's Contacts Prospecting
entitlement. The fallback restores a functional Demo 3 without weakening
secret, callback, storage or producer boundaries.
**Trade-off:** Decision Makers does not perform an exhaustive title-filtered
directory search. An empty priority result means only that none appeared in
the returned sample; it cannot prove employee absence.
**Impact:** Release `demo3-preprod-20260810-decision-makers-fallback-001`
completed a synthetic end-to-end request as `PREVIEW_EMPTY`, with zero contact
values and zero saved/active n8n executions. Production should prefer upstream
title filtering after its separately approved credential has the necessary
entitlement.

### AD-019: Decision Makers uses relevant tiers before generic fallback (2026-08-10)

**Decision:** Within the same exact-company sample, return exact priority
profiles first, adjacent finance/accounting roles second and, only when both
relevant tiers are empty, the provider's first valid decision makers. Preserve
provider order inside each tier and keep the total at 10.
**Reason:** The available Decision Makers sample may omit the narrow approved
profiles while still returning useful contacts. Showing nearby or generic
decision makers is more useful than reporting an empty preview and requires no
second provider call.
**Trade-off:** Adjacent and generic contacts establish neither target-role fit
nor employee completeness. They may be displayed and explicitly revealed, but
only exact priority aliases remain eligible for `contact-commercial-score-v1`.
**Impact:** The callback schema, app-owned storage, provider request count,
reveal boundary and producer facts remain unchanged. Contract tests execute all
three selection tiers with synthetic contacts.

### AD-020: Apollo fallback resolves an exact organization before people (2026-08-10)

**Decision:** Only after a structurally valid empty Lusha sample, enrich the
confirmed domain as one Apollo organization. Require exact returned
`primary_domain` before a single People Search using the returned organization
ID. Preview remains masked; a human-selected work-email reveal may update only
that contact's encrypted factual name and approved LinkedIn. Apollo phone,
personal email and waterfall remain disabled.
**Reason:** Apollo's free People Search can filter by a domain that was a
current or previous employer and does not return a verifiable current-employer
domain. The exact organization step prevents accepting an unverified company.
**Trade-off:** Organization Enrichment consumes one credit when a company is
found; People Search itself is free, and selected People Enrichment may consume
additional credits. The preview has no LinkedIn until human selection.
**Impact:** Repository contracts, server mapping, encrypted provider identity
and UI are verified. On 2026-08-11 the exact native Apollo credential metadata
passed the guarded preflight; workflow `PCEv2Demo3b8L3nR` was rollback-exported,
replaced under the same ID and published with 29 nodes. Release
`demo3-preprod-20260811-apollo-fallback-001` is Ready. Rollout made no provider
request and final n8n state was one webhook with zero saved/active executions.

---

## Active Blockers

- **CONTACT-V2-UAT:** Select one current queue company and one professionally
  relevant candidate for the authorized real-contact test. The first explicit
  preview must also validate the operator-reported Apollo API access if Lusha
  returns an empty sample; then suppress and erase any revealed result without
  recording contact values in evidence.
- **CONTACT-V2-03:** Identify the production hostname/namespace, individual
  OIDC and remotely verified HMAC timestamp/nonce/replay plus durable rate
  limit before production import or rollout.

- **OPEN-01:** Identify and authorize a separate non-production HTTPS v1 URL,
  workflow ID/version, and inspection source before any remote contract run.
- **OPEN-02:** Approve a separate producer worker and idempotent terminal
  adapter that preserve the current rules and emit the exact
  `prospecta-producer-worker-v1` envelope; the reviewed current workflow has no
  reusable subworkflow entry.
- **OPEN-03:** Approve an idempotent runner for late reconciliation; until then,
  timeouts remain `ACCEPTANCE_UNKNOWN` and are never re-uploaded.
- **OPEN-04:** Name the operational owner and evidence-based freshness window
  before enabling `NO_UPDATE`.
- **OPEN-05:** Name the disposable external target, database owner, credentials,
  rollback owner, and approval before applying producer DDL anywhere else.

These five blockers apply only to the deferred n8n v1 batch-alignment path, not
to the simplified T15/T16 presentation. The legacy lifecycle callback is
connected on the exact authorized Demo 3/n8n profile. Demo 3 continues to use
the approved legacy import URL and must not be represented as v1 end-to-end
completion.

---

## Lessons Learned

### L-001: Local cluster uses containerd without user-level image import

**Context:** Planning Prospecta local Kubernetes deployment.
**Problem:** `ctr -n k8s.io images ls` fails with permission denied.
**Solution:** Push the image to the existing local Docker registry and reference
`localhost:5000/prospecta/app:demo` from the Kubernetes Deployment.
**Prevents:** Spending time on a local Docker image that kubelet cannot see.

### L-002: Next standalone request URL used internal bind host

**Context:** Smoke testing `POST /api/imports` through NodePort.
**Problem:** `requireSameOrigin()` compared `Origin` to `request.url`, which was
`http://0.0.0.0:3000` inside standalone Next.
**Solution:** Also accept the exact origin derived from `Host` and optional
`X-Forwarded-Proto` headers.
**Prevents:** False 403 on same-origin browser uploads through NodePort/proxy.

### L-003: `kubectl exec` needs stdin enabled for streamed migrations

**Context:** Applying app-owned migration `006` before the Demo 3 rollout.
**Problem:** `psql` exited successfully with no SQL when `kubectl exec` omitted
`--stdin`, leaving the legacy unique index unchanged.
**Solution:** Use `kubectl exec --stdin`, run `psql --single-transaction` and
require a structural postcondition before applying the manifest.
**Prevents:** Reporting a successful release when an app-owned migration was
never consumed.

---

## Quick Tasks Completed

| # | Description | Date | Commit | Status |
| --- | --- | --- | --- | --- |
| 001 | Link upload result to evidence-based batch progress | 2026-07-15 | `feat(imports): link upload result to batch progress` | ✅ Done |
| 002 | Make pending/unknown company-search reads visible without automatic retry | 2026-08-11 | Not committed in the existing dirty feature worktree | ✅ Done |
| 003 | Embed an approximate municipality map in lead detail | 2026-08-12 | Not committed in the existing dirty feature worktree | ✅ Done |
| 004 | Add a read-only page for each current outside-analysis CRM decision | 2026-08-13 | Not committed in the existing dirty feature worktree | ✅ Done |
| 005 | Improve strategic-report readability and withhold technical metadata | 2026-08-13 | Not committed in the existing dirty feature worktree | ✅ Done |
| 006 | Recognize and filter the exact producer priority `D` without inferring rank | 2026-08-14 | Not committed in the existing dirty feature worktree | ✅ Done |
| 007 | Add a report-grounded editable approach draft to lead detail without sending | 2026-08-14 | Not committed in the existing dirty feature worktree | ✅ Done |
| 008 | Generate a safe report-grounded approach draft for every identified company | 2026-08-17 | Not committed in the existing dirty feature worktree | ✅ Done |

---

## Deferred Ideas

- [ ] Replace dev-mode hostPath deployment with a production-style image once a
      non-production registry target is identified.
- [ ] Wire real non-production database credentials through Kubernetes Secrets.
- [ ] Replace the shared Demo 3 actor with corporate OIDC and individual audit
      attribution before any broader rollout.

---

## Todos

- [x] Validate `http://192.168.0.20:30097` after manifest apply.
- [x] Release Demo 3 through the approved LAN NodePort at
      `http://192.168.0.20:30100`.
- [x] Promote Demo 3 to local pre-production with real producer SELECTs,
      isolated app-owned writes, gateway authentication, and route/API UAT.
- [x] Release the owner-approved HTTP transport for the exact Demo 3 LAN
      target while retaining gateway authentication.
- [x] Release `demo3-preprod-20260722-batch-alignment-001` with the app-owned
      reconciliation index migrated and verified.
- [x] Release `demo3-preprod-20260722-empty-observations-001` with distinct
      source-available/no-correlated-facts presentation.
- [x] Implement and locally validate the legacy `BATCH_CLOSED` receiver without
      modifying the 98-node workflow or contractual result semantics.
- [x] Release T15/T16 and configure the shared callback credential and exact
      URL in the explicitly authorized Demo 3/n8n environment.
