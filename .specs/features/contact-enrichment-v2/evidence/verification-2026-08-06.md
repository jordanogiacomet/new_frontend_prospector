# Contact Enrichment v2 verification — 2026-08-06

Status: Demo 3 implementation, migration, HTTPS edge, inactive import,
publication and synthetic UAT verified. No real Lusha request was made.

## Target and release

- Kubernetes context, HTTPS API server, `kube-system` UID, non-production
  namespace marker and n8n namespace UID matched the approved Demo 3 profile
  before every mutation.
- The immutable app and request-edge release is
  `demo3-preprod-20260806-contact-enrichment-v2-uat-fix-001`; both containers
  are ready and available.
- Existing HTTP NodePorts `30100` and `30098` were preserved. Contact-bearing
  browser, ingress and callback traffic uses the dedicated HTTPS NodePort
  `30443`.
- Anonymous Prospecta access returned `401`; the v2 n8n webhook without its
  machine credential returned `403`.
- The private TLS key exists only in the namespace-local Kubernetes TLS Secret.
  The public CA is mounted read-only into the app and n8n; n8n verified the CA
  file as readable and completed a TLS request to Prospecta, receiving the
  expected `401` application boundary.

## Database and application UAT

- Migrations 009 and 010 were applied only to the isolated app-owned Demo 3
  PostgreSQL database. Nine `contact_*` tables are present; the runtime role
  can read v2 requests and has only the intended narrow suppression deletion
  grant.
- Producer tables, grants and workflows were not mutated.
- Synthetic preview callback, exact replay, conflicting callback, reveal,
  encrypted read, suppression and ciphertext erasure passed. Unauthorized
  callback returned `401`; conflicting terminal result returned `409`.
- A PostgreSQL `FOR UPDATE OF candidate` regression discovered by synthetic UAT
  was fixed and covered by a repository test before the immutable fix release.
- No real contact, provider response or producer value was copied to repository
  evidence, logs, fixtures, output or screenshots.

## n8n verification

- The repository v2 workflow remains an inactive, credential-free artifact.
- The exact Demo 3 copy has ID `PCEv2Demo3b8L3nR`, is published, has one
  registered webhook, and binds separate native Header Auth ingress/callback
  credentials plus the existing native Lusha `api_key` credential.
- The existing v1 workflow `PCEv1Demo3a7K2mQ` remained active; the existing
  import workflow was not changed.
- Workflow execution settings are `saveDataErrorExecution=none`,
  `saveDataSuccessExecution=none`, and `saveManualExecutions=false`.
- Missing machine authentication returned `403` without starting an execution.
  An authenticated empty synthetic body returned `400` before any Lusha node.
- That invalid execution was immediately absent from visible execution history.
  Demo 3 hard pruning removed both its technical execution metadata and payload
  row within one minute; the verified final counts were zero execution rows,
  zero execution-data rows and zero active executions for v2.
- No Lusha API call, reveal credit, real callback or real contact was used.

## Repository quality gates

- Full lint, strict typecheck, 1,957 unit tests, 41 contract tests, 95 disposable
  PostgreSQL integration tests and the production build passed for this work.
- The focused TLS-edge contract suite passed again after the CA-path and
  hard-pruning correction.
- Test identities, contacts and database rows were synthetic. The disposable
  PostgreSQL test container was removed after the suite.

## Remaining gate for one real Demo 3 test

The operator must select one commercial-queue company/domain, then explicitly
select one professionally relevant preview candidate and channel class before
Reveal. Evidence may record only pass/fail, opaque IDs, counts and timestamps;
the test contact must be suppressed and erased immediately after verification.

Production remains separately blocked by the target-specific hostname,
namespace, OIDC identity, credentials, migration owner, rollout and rollback
evidence required by the specification.

## Company-domain prefill release

- Immutable release
  `demo3-preprod-20260806-company-domain-prefill-001` is ready at the same
  authenticated Demo 3 HTTPS edge. Anonymous queue access returned `401`.
- The queue DTO now carries `companyDomain` separately from producer
  recommendation facts. The action prefills it only after strict validation,
  remains editable, and still requires the user to press `Buscar decisores`.
  Opening or viewing the queue never dispatches contact enrichment.
- The exact local producer role received column-level `SELECT` only on
  `public.crm_company_history(cnpj, website_domain)`. It has no table-wide
  grant, no access to the tested contact column, and no `INSERT`, `UPDATE` or
  `DELETE`. The producer row count was unchanged at 4,946 before and after the
  grant.
- A disposable PostgreSQL 16 test verified one normalized domain, ambiguous
  fail-closed behavior, exact column grants and denial of contact/status
  columns. The focused suite passed 11/11 tests.
- Live read-only UAT found four current queue items. None had a correlated
  domain in the exact approved source, so all correctly retained manual entry.
  The separately supplied controller record had one unique source domain but
  was not an eligible queue lead; no producer row was created or changed to
  manufacture a UI example.
- Repository gates passed: lint, strict typecheck, 1,960 unit tests, 41 contract
  tests, focused PostgreSQL integration and production build. The v2 n8n
  workflow retained zero execution and execution-data rows throughout this
  read-only UAT, so no Lusha call or credit was used.

## Company-name fallback release

- Immutable release `demo3-preprod-20260806-company-name-fallback-001` is ready
  at the same authenticated Demo 3 HTTPS edge. Anonymous queue access returned
  `401`; authenticated queue API and page access returned `200`; the company
  search callback without its machine credential returned `401`.
- When an approved producer domain is unavailable, the queue now offers a
  separate, explicit Lusha Companies Search action using the known company
  name. It warns that the lookup may consume a search credit, preserves manual
  domain entry, and never selects a result automatically.
- A returned match is limited to company name, domain, industry and location.
  The encrypted provider company reference remains server-side behind an
  app-owned opaque match ID, expires after 24 hours, and can reach Decision
  Makers only after the operator presses `Usar esta empresa`.
- Migration 011 is present in the isolated app-owned database. Its three
  company-resolution tables exist, event rows are append-only to the runtime
  role, and the existing v2 request accepts exactly one of company domain or
  confirmed company match.
- The exact Demo 3 n8n workflow `PCEv2Demo3b8L3nR` is published with 19 nodes,
  one registered webhook, native credential bindings and all execution-saving
  settings disabled. It has zero total and zero active executions after the
  rollout.
- Quality gates passed: lint, strict typecheck, 1,968 unit tests, 41 contract
  tests, 41 focused disposable PostgreSQL integration tests and the production
  build. Remote contract cases remained explicitly skipped.
- No company search, Decision Makers request, reveal, callback with provider
  data or real contact operation was performed; no Lusha credit was consumed
  by this rollout.

## Commercial-queue layout release

- Immutable release `demo3-preprod-20260806-work-queue-layout-001` is ready at
  the authenticated Demo 3 HTTPS edge. Anonymous page access returned `401`;
  authenticated page and queue API access returned `200`.
- The duplicated desktop table and mobile cards were replaced by one responsive
  opportunity sheet per company. Producer recommendation, commercial state and
  next action remain distinct, while contact enrichment now occupies a
  dedicated full-width workspace.
- Contact transparency is grouped by purpose, controller, basis/source,
  retention and rights channel. Professional candidates use a responsive grid
  with their actions kept inside each candidate region.
- The queue now renders one contact action and one idempotency state per company
  instead of two CSS-hidden component instances.
- Focused component/page tests passed 29/29. Full lint, strict typecheck, 1,967
  unit tests and the production build passed. The first local build attempt was
  correctly rejected by stale development/Demo 2 flags; the verified build ran
  with all demo gates explicitly disabled.
- The v2 workflow retained zero execution rows before and after rollout. No n8n
  or Lusha request was made and no real queue value was copied into evidence.

## Company-location search release

- Immutable release
  `demo3-preprod-20260806-company-location-search-001` is ready at the
  authenticated Demo 3 HTTPS edge. The app and all supporting containers are
  ready with zero restarts; authenticated queue page/API checks returned `200`.
- Company search contract `prospecta-contact-company-search-v2` sends the
  normalized company name, available city/UF and fixed country `BR` from the
  server to Lusha Prospecting Companies. CNPJ remains app correlation only.
- The producer sector text is shown in the company-match panel only as a human
  comparison reference. It is never converted into or sent as a guessed Lusha
  industry taxonomy filter. At most five matches are accepted and the operator
  must explicitly choose one.
- The exact Demo 3 workflow `PCEv2Demo3b8L3nR` was exported for rollback,
  unpublished, replaced under the same ID with the reviewed 19-node version,
  and republished. Postflight verified one webhook, the v2 contract, the
  Prospecting Companies endpoint, native credential bindings, execution saving
  disabled, and zero total/active executions.
- Quality gates passed: lint, strict typecheck, 1,978 unit tests, 42 local
  contract tests, 98 disposable PostgreSQL integration tests and the production
  build. Remote contract cases remained explicitly skipped.
- A safe negative smoke sent the obsolete two-field search contract and
  received `400` before dispatch. No valid company search, n8n execution, Lusha
  request, provider response, credit use or contact operation occurred during
  rollout.

## Prospecting Companies adapter correction

- Two operator-initiated attempts reached authenticated callbacks as
  `SEARCH_FAILED`. Diagnosis used only status, timestamp and aggregate counts;
  no company value, contact value, provider body or opaque identifier was
  copied into evidence.
- The repository adapter requested `pagination.size: 5`, while the official
  Lusha V3 Prospecting Companies contract accepts page sizes from 10 through
  100 and documents the request location with `country`. The adapter now asks
  for 10, maps app value `BR` to provider value `Brazil`, and still forwards at
  most five allowlisted matches to Prospecta.
- The regression contract failed against the old adapter and passed after the
  correction. Full lint, strict typecheck, 1,978 unit tests, 42 local contract
  tests and the production build passed; no database or migration changed.
- Exact Demo 3 and contact-TLS preflights passed. The active workflow was
  exported for rollback, unpublished, replaced under the same ID and
  republished. Postflight confirmed 19 nodes, one webhook, safe execution
  settings and zero active or saved executions.
- The corrective rollout did not call the webhook, n8n execution path or Lusha.
  A new search remains an explicit operator action with no automatic retry.
