# Read-only Lead Browser Context

**Gathered:** 2026-06-30  
**Spec:** `.specs/features/read-only-lead-browser/spec.md`  
**Status:** RLB-T005 COMPLETE — bounded query capability envelope approved; bootstrap not started

## Feature Boundary

This feature delivers **a browser for eligible, readable, retained decisions** already stored in PostgreSQL. It is not an authoritative inventory of every analysis ever produced. It includes a bounded lead list and detail view, plus retained-analysis history when its limitations are approved. A limited batch/source view is optional and defaults to deferred. It excludes all producer behavior, n8n integration or changes, CSV handling, imports, retry/idempotency flows, reprocessing, exports, lead writes, and production migrations.

## Locked Product Decisions

### Product language and audience

- The primary user is a business manager, not a workflow operator.
- Labels use business Portuguese; technical identifiers appear only in audit/advanced sections.
- The application presents stored decisions and provenance. It does not explain or reproduce producer algorithms.
- Absence from the browser means no eligible/readable/retained decision was returned; it does not prove that no analysis ever occurred.
- The experience should resemble an internal CRM/lead intelligence browser, not n8n monitoring.

### Read-only system boundary

- The only allowed runtime data path is `Frontend → App API → PostgreSQL`.
- Browser code never connects directly to PostgreSQL.
- There is no n8n URL, webhook, credential, SDK, or call in the application.
- There are no write operations against lead, batch, report, CRM, processing, or producer tables.
- There are no production migrations in this feature.
- Missing or inconsistent producer data is displayed honestly; the application does not repair it.
- All application data routes are authenticated, server-only, GET-only PostgreSQL reads.

### Lead identity and current decision

- CNPJ is the business route identity.
- `decision_id` and `lead_run_id` are the audit identities.
- The default list/detail reads the one-row-per-CNPJ current projection,
  requires its exact eligible/readable terminal run, and orders list results by
  `company_validations.validated_at DESC, company_validations.id DESC`.
- A detail view may accept `leadRunId` only to select a run already associated with the requested CNPJ; it must not create a run.
- Distinct decision/run identifiers are never collapsed by CNPJ, source hash, batch, or row.

### Missing and low-confidence data

- `null` remains `null`; the UI does not convert it to numeric zero.
- An absent array is different from a present empty array.
- Missing report copy is “Relatório ainda não disponível”.
- Unavailable history is stated directly; no operational event log is substituted.
- When retained history is enabled without proof of complete retention, use “Histórico disponível” or “Análises retidas encontradas” and state that older analyses may not be present.
- Unknown action, priority, verdict, or trust values use a neutral “Não
  mapeado” presentation; the safely escaped stored value may appear only in the
  audit/advanced section.
- The initial low-confidence token set is intentionally empty because the
  aggregate evidence did not record an exact stored token with that proven
  meaning. No score, priority, action, or unknown value may be used to infer
  confidence.

### Batch/source behavior

- Batch/source screens and routes are deferred by RLB-T004.
- A future approval may consider a GET-only informational capability only after
  reviewers establish that its lineage, labels, metrics, navigation, and
  context cannot reasonably be mistaken for import progress or operational
  monitoring.
- Expected row count is metadata, not proof of progress.
- Saved-decision counts are labeled as persisted decisions, not processed or completed import rows.
- Replay counters and legacy workflow-flow views are not shown as import progress.

## Evidence-Based Design Decisions

### Read-only source discovery status

**Completed on 2026-06-30.** After the DB-READ grants were corrected, the
approved profile connected to database `prospecting` as role `rlb_readonly`.
The role had `SELECT` on all six revised targets and no `INSERT`, `UPDATE`, or
`DELETE` privilege on any of them. Every audit query ran inside an explicit
read-only transaction.

Exact aggregate counts:

| Object | Exact rows |
| --- | ---: |
| `public.company_validations` | 20 |
| `public.company_validation_runs` | 240 |
| `public.company_strategic_research_reports` | 32 |
| `public.lead_import_batches` | 1 |
| `public.vw_dashboard_empresaqui` | 20 |
| `public.vw_company_validation_runs_latest_per_company` | 120 |

No raw row, payload, report, evidence, contact data, strategic content,
identifier value, identifying sample, or credential was selected, printed, or
committed. Categorical outputs were limited to bounded business/technical
domains with unsafe values redacted.

### RLB-T002 contract audit status

**COMPLETE with bounded approval as of 2026-06-30.** The audit approves a
production-like structural read contract for current lead browsing. It does not
prove authoritative inventory coverage, real-production coverage, retention
completeness, report-content safety, batch lineage, or query performance.

#### Preflight

- The approved local DB-READ profile loaded without exposing or persisting its DSN.
- Connection target: database `prospecting`; current role: `rlb_readonly`.
- `SELECT` on all six revised audit targets: available.
- `INSERT`, `UPDATE`, and `DELETE` privileges on all six revised targets: unavailable.
- Forced `transaction_read_only`: `on`.
- `default_transaction_read_only`: `off`; the audit explicitly opened a
  read-only transaction before checking privileges.
- Revised aggregate audit queries executed: aggregate `SELECT` only.

#### Aggregate findings

- `company_validations` has 20 rows and 20 distinct valid CNPJs. All 20 have
  normalized CNPJ, company name, city, UF, CNAE, bounded scores, priority,
  verdict, trust status, agent version, integrity `OK`, and complete current
  audit references. No audited score uses the table's zero default.
- All 20 projection rows changed after creation, confirming mutable current-row
  semantics. The table is suitable only as a current projection, never as
  immutable history.
- Arrays retained their expected JSON array type. Risks were explicitly empty
  for 5/20 rows; evidence and positive signals were present arrays for all 20.
  Empty remains distinct from missing.
- `company_validation_runs` has 240 rows, 120 distinct `lead_run_id` values,
  120 distinct batch/source positions, and 20 CNPJs across two aggregate date
  strata. Every run key has exactly two operational rows: one `RECEBIDO` row
  and one `INSERIDO_VALIDATION` row. Every terminal row has a stored
  `final_action`; no run has multiple terminal rows or action variation within
  the same run.
- Every current projection's `last_lead_run_id` matches two operational rows
  and exactly one terminal `INSERIDO_VALIDATION` row. For all 20 projections,
  that terminal row matches CNPJ and source position, contains a stored action,
  and is the latest terminal run for the CNPJ.
- Retained terminal history contains six distinct run IDs per CNPJ. Actions
  vary across retained runs for 5/20 CNPJs. All 240 run rows are test-tagged,
  so this proves a production-like structure, not real-production coverage.
- Observed current priority values are `B`, `C`, `E`, and `R`. Observed
  terminal actions are `NAO_ABORDAR`, `NUTRIR`, `PROSPECTAR`,
  `PROSPECTAR_COM_CAUTELA`, and `REVISAO_HUMANA`. Exact label and
  low-confidence mappings are approved in the RLB-T003 record below.
- `company_strategic_research_reports` has 32 rows for 11 CNPJs and 32 run IDs.
  Every report matches exactly one validation, two rows for the exact run, and
  exactly one terminal row, with no CNPJ or source mismatch. There is exactly
  one report per represented run. Current-run structural report coverage is
  11/20 projections; 9/20 have no current-run report.
- All 32 reports are test-tagged and integrity `OK`; report JSON is structurally
  object-shaped, evidence is array-shaped, 5/32 evidence arrays are explicitly
  empty, and Markdown is structurally present. No content was inspected.
  Research status is `COMPLETED` for 6/32 and `COMPLETED_WITH_FALLBACK` for
  26/32. RLB-T004 therefore leaves the semantic allowlist empty and content
  exposure disabled.
- `lead_import_batches` has one `PRODUCTION_E2E` row with expected-row and
  received counters both equal to 20. Its identifier matches none of the 20
  projections, 240 run rows, or 32 reports. Those counters therefore cannot be
  used as progress or lineage for the audited lead data.
- `vw_dashboard_empresaqui` returns one row per current projection and matches
  the direct-table result in this dataset, but it selects runs by latest numeric
  ID/raw CNPJ and does not expose the selected run ID. It is not the primary
  read model.
- `vw_company_validation_runs_latest_per_company` returns 120 rows: six per
  CNPJ. It is actually latest-per-batch/source-position, not latest-per-company.
  Its observed ordering selects the same terminal row as chronological ordering,
  but its cardinality makes it unsuitable for the current lead list.

#### Coverage decision

**Accepted for the bounded production-like structural contract; rejected for
authoritative or real-production coverage.** The current model is structurally
readable for 20/20 projections (100%): each row satisfies the audited identity,
score, domain-presence, integrity, exact terminal-run, stored-action, CNPJ, and
source-position checks. That percentage must not be generalized beyond this
small, entirely test-tagged dataset.

`RLB-T002` passes. RLB-T003 accepts its 20/20 bounded structural result only as
production-like contract evidence. It does not treat that result as
real-production coverage. Batch/source remains disabled.

### Recommended primary read model

- `lead_decisions` should no longer remain the primary read-model candidate for
  this connected target: its prior exact row count was zero.
- Use `company_validations` as the current list/detail projection. Preserve its
  stored values exactly and present it explicitly as mutable current state.
- Join the current stored action/provenance through
  `company_validations.last_lead_run_id` to exactly one terminal
  `company_validation_runs` row. The observed terminal contract is
  `processing_result = 'INSERIDO_VALIDATION'`; unknown or ambiguous terminal
  shapes must be treated as unreadable until approved, not guessed.
- Read current reports only by exact selected `lead_run_id`, with CNPJ and
  validation relationship checks. Report content remains withheld pending
  policy approval.
- `company_latest_validation` is useful evidence for latest-row ordering but is not a DTO source because it omits `final_action` and masks some missing JSON values with defaults.
- Do not use either comparison view as the primary DTO source.
- Do not expose operational `RECEBIDO` rows, processing state/events, dead
  letters, or integrity-error payloads.

### History availability

- Retained-only history is structurally reconstructable from the single terminal
  `INSERIDO_VALIDATION` row per distinct `lead_run_id` in the audited dataset.
- Operational `RECEBIDO` rows are excluded. Distinct run IDs are never
  collapsed by CNPJ, batch, source row, or action.
- Completeness and deletion/retention policy are not evidenced, and all audited
  rows are test-tagged. RLB-T004 therefore classifies completeness as
  **incomplete/unknown**, not proven complete.
- Retained-only history is semantically approved, subject to the production
  activation and RLB-T005 query-safety gates.
- The product uses “Histórico disponível” or “Análises retidas encontradas”
  and states “Análises mais antigas podem não estar presentes.” It never
  describes the returned rows as a complete audit trail or every analysis ever
  produced.

### Strategic report selection

- Prefer a report whose `company_strategic_research_reports.lead_run_id` exactly matches the selected terminal run.
- Do not join by CNPJ alone because that could attach a report from another run.
- The audited data has one report per represented run. Future zero/multiple
  matches remain explicit missing/ambiguous states; do not silently choose one.
- A report with non-`OK` integrity is unavailable by default; its internal `integrity_error` is not exposed.
- There is no `lead_decisions.report_json` fallback for this target.
- RLB-T004 approves the deny-by-default privacy policy below but no current
  report/evidence field or content class for exposure. Reports and evidence
  therefore remain omitted until a separate content-owner approval establishes
  a semantic allowlist.

### Query behavior and production safety

- Pagination is a response bound, not proof that ranking, filtering, sorting, JSON extraction, or exact counts are safe.
- The MVP exposes only the controls in the RLB-T005 capability matrix below.
- The approved list envelope is valid only while the unfiltered current
  projection contains at most 20 rows. The list count/guard must fail closed
  with `DATA_SOURCE_UNAVAILABLE` if that ceiling is exceeded; it must not
  silently return a partial list.
- Broad text search, date ranges, computed JSON filters, user-selectable sorts,
  and every unlisted filter remain deferred.

### CRM/contact selection

- Contact data is not required for the initial vertical slice.
- If approved, it comes from CRM snapshot tables through the exact stored `crmCompanyKey` relationship, is nullable, and is labeled with snapshot freshness.
- CRM contact values are sensitive and mutable and must not be logged or used in tests/screenshots.

## RLB-T003 Approval Record

**Approved on 2026-07-01.** These decisions close only RLB-T003. They do not
approve implementation, report/evidence content, contact data, batch/source,
retention claims, or unmeasured query shapes.

| Decision | Approved contract | Evidence / boundary |
| --- | --- | --- |
| Authentication provider | The application uses the organization-managed OpenID Connect provider through a server-only Auth.js integration and server-validated sessions. The exact issuer, client ID, and client secret are deployment configuration; local users and password authentication are prohibited. | The repository has no existing identity implementation. OIDC preserves external identity ownership without inventing an account store. Auth implementation remains RLB-T017. |
| Organization authorization | Access is single-organization and fail-closed. A session is authorized only when the verified token issuer exactly equals configured `AUTH_OIDC_ISSUER`, `sub` is non-empty, and the exact string `org_id` claim equals configured `AUTH_ALLOWED_ORG_ID`. Email address/domain, display name, and client-supplied claims never authorize. Missing or multi-valued `org_id` is `403`. | Satisfies the single-organization rule without treating an email domain as membership. Every private page and API revalidates the server session. |
| Production/test scope | Superseded in part by RLB-T035A. For the current producer, an exact terminal run is eligible when `test_case_id IS NULL` or `test_case_id = 'SR_' || source_row`. Every other non-null marker remains excluded as test/audit data. No execution mode is inferred from batch metadata, filenames, IDs, or versions. | RLB-T035A aligns the predicate with the producer's row-provenance marker while retaining fail-closed exclusion for explicit test identifiers. |
| Time/version scope | No historical lower date or producer-version allowlist applies. Require non-empty `agent_version`, non-future `validated_at` and terminal `run_created_at`, and preserve the exact version for audit. Expiry does not remove a retained row; an expired value is presented as stale. Unknown future versions remain eligible only if the same structural/readability contract passes. | Prevents an unevidenced version cutoff and does not silently hide retained stale data. |
| Eligibility and readability | Use one `company_validations` projection with `integrity_status = 'OK'`, a 14-digit normalized CNPJ matching its CNPJ, and a `last_lead_run_id` matching exactly `lr_` plus 8 or 64 lowercase hexadecimal characters. That ID must resolve to exactly one `company_validation_runs` row with `processing_result = 'INSERIDO_VALIDATION'`, `integrity_status = 'OK'`, the RLB-T035A production predicate, matching normalized CNPJ and null-safe exact batch/source position, non-future time, and a non-empty stored `final_action`. Zero/multiple matches, an unknown terminal result, identity/provenance mismatch, or failed required scalar bounds is unreadable. Optional nulls remain null; a malformed optional collection is omitted with a data-quality notice and does not become zero or an empty array. | RLB-T035A changes only producer identity/provenance eligibility. Stored decisions, scores, actions, and audit identities remain exact and are never grouped or deduplicated. |
| Coverage threshold | Accept the RLB-T002 result as **20/20 (100%) bounded production-like structural coverage only**. Initial production activation requires a non-zero production denominator, 100% readable eligible production candidates, and zero unclassified candidates under the predicate above. A zero denominator is “not measured,” never 100%. | This preserves the accepted T002 result without generalizing its entirely test-tagged sample. A lower threshold requires a later explicit approval. |
| Action domain | Recognized exact tokens are `PROSPECTAR` → “Prospectar”, `PROSPECTAR_COM_CAUTELA` → “Prospectar com cautela”, `NUTRIR` → “Nutrir”, `NAO_ABORDAR` → “Não abordar”, and `REVISAO_HUMANA` → “Revisão humana”. | These are the terminal actions recorded by RLB-T002. Mapping changes presentation only and never recomputes the action. |
| Priority domain | Recognized exact tokens are `B`, `C`, `E`, and `R`, presented as “Prioridade B/C/E/R”. No rank, severity, or confidence order is inferred. | These are the priority tokens recorded by RLB-T002; their business ordering was not evidenced. |
| Verdict/trust domain | The only exact evidenced default mappings approved by the checked-in DDL are verdict `REVISAO_HUMANA` and trust status `Revisão Humana`, both presented as “Revisão humana”. Other bounded safe strings are readable but unmapped. | RLB-T002 states that these free-text domains were bounded but does not record the other exact tokens, so this approval does not fabricate them. |
| Confidence handling | The initial explicit low-confidence set is empty. “Revisão humana,” null, and every unmapped value are neutral/unknown, never low confidence. Low/unknown values do not alter eligibility, score, sorting, priority, or action. Any future low-confidence token requires evidence and approval before receiving a warning badge. | Meets the no-recalculation rule and prevents unknown values from being silently classified. |
| Runtime database grants | Provision a dedicated application role with `CONNECT` on the application database, `USAGE` (not `CREATE`) on `public`, and column-level `SELECT` only on the approved fields of `company_validations` and `company_validation_runs`. It has no table-wide grants, `TEMP`, DDL, sequence, function-execution, ownership, membership, bypass-RLS, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, or n8n/producer-table privileges. Set role-level read-only transactions and a bounded statement timeout. Reports, evidence collections, CRM, batch, raw payload, search-query, integrity-error, and operational/cost columns receive no runtime grant unless a later gate explicitly approves them. | The audit role demonstrated read-only access, but it is not the deployed runtime role. Column grants enforce the readable-field boundary below. |
| Secret ownership | The platform/identity administrator owns the OIDC registration, issuer/client values, client-secret rotation, and session-secret rotation. The database administrator owns the runtime role and credential rotation. Deployment injects secrets server-side; only placeholders/names may be committed. Secrets never enter browser bundles, fixtures, screenshots, logs, or error responses. | Separates identity and database authority and keeps application code from owning production values. |
| Test database and tools | Unit tests use synthetic in-memory objects/mocks. Repository and E2E database tests use a dedicated disposable PostgreSQL database and dedicated test-only role/DSN, reset from test schema/fixtures. No production snapshot, dump, row, CNPJ, contact, report, evidence, credential, or production URL may be copied or used. OIDC tests use synthetic signed claims or provider mocks, never the live provider. Use `pnpm` and the repository-selected test runner; database tests run only under a `TEST_DATABASE_URL` guard that rejects equality with `DATABASE_URL`. `DB-READ` remains separately authorized for evidence gates only. | Satisfies RLB-15 without requiring production data or a production clone. No package installation or test infrastructure is implemented by this task. |

### Approved readable-field grant contract

The future runtime role may read only these columns for the initial
list/detail/authenticated contract:

- `company_validations`: `cnpj`, `cnpj_normalizado`, `razao_social`,
  `nome_fantasia`, `cidade`, `uf`, `cnae_principal`, `cnae_descricao`,
  `porte_empresa`, `regime_tributario`, `faturamento_estimado`,
  `quadro_funcionarios`, `quantidade_filiais`, `source_hash`, `trust_score`,
  `trust_verdict`, `trust_status`, `validated_at`, `expires_at`,
  `agent_version`, `icp_score`, `priority`, `strategic_asset_score`,
  `strategic_tier`, `used_cache`, `created_at`, `updated_at`,
  `last_lead_run_id`, `last_idempotency_key`, `last_import_batch_id`,
  `last_source_row`, and `integrity_status`.
- `company_validation_runs`: `id`, `import_batch_id`, `source_row`, `cnpj`,
  `final_action`, `reason`, `processing_result`, `created_at`,
  `test_case_id`, `run_created_at`, `lead_run_id`, `idempotency_key`,
  `cnpj_normalizado`, and `integrity_status`.

The role receives no grant on `raw_payload`, `search_queries`,
`integrity_error`, CRM fields, LLM inputs/usage/costs, strategic report content,
`positive_signals`, `risk_flags`, or `evidences` at this gate. Later gates may
approve a smaller content-specific column list; they may not silently widen
this contract.

## RLB-T004 Approval Record

**Approved on 2026-07-01.** This decision closes the history, sensitive-content,
and batch/source semantics gate. It does not authorize UI/routes, widen runtime
database grants, approve report/evidence content, approve contact snapshots, or
replace the RLB-T005 query/performance gate.

| Decision | Approved contract | Evidence / boundary |
| --- | --- | --- |
| History completeness | Classify retained history as **incomplete/unknown**. The audited data proves six distinct retained terminal runs per CNPJ only in a bounded, entirely test-tagged dataset; it does not prove retention duration, deletion behavior, or older-run completeness. | Complete-history and full-audit wording is prohibited unless a later retention audit proves completeness. |
| History wording | A retained-history section may use “Histórico disponível” or “Análises retidas encontradas” and must state “Análises mais antigas podem não estar presentes.” It must preserve distinct run identities and must not claim to show every analysis ever produced. | History remains subject to the production activation predicate and the RLB-T005 six-terminal-row ceiling; operational events are never a substitute. |
| Report/evidence exposure | The privacy policy is approved, but **no current report/evidence content class or field is semantically allowlisted** because RLB-T002 inspected structure only. The default response state is `omitted_by_policy`; raw JSON, raw Markdown, evidence text, and evidence URLs are not retrieved for browser exposure. | Structural validity, integrity `OK`, exact-run matching, and Markdown sanitization do not establish privacy approval. XSS sanitization is not privacy approval. |
| Semantic review boundary | Before any future exposure, a named business data owner and privacy/security reviewer must approve an exact field/content-class allowlist. Review covers semantic PII, including names, email addresses, phone numbers, personal identifiers, person-linked free text, and PII embedded in URLs; and confidential content, including pricing, contracts, credentials/tokens, internal notes, CRM history, prompts, proprietary strategy, and customer-restricted information. | Category or schema names are insufficient evidence that free text is safe. Unknown, mixed, or unclassified content is omitted. |
| Redaction and omission | A field/item may be exposed only when it is allowlisted and either contains no disallowed content or has a deterministic, tested redaction that removes it without exposing the original. If safe meaning after redaction is uncertain, omit the item or entire section. Redacted/omitted, absent, explicit-empty, malformed, and unavailable states remain distinct. | Uncertain content defaults to omission, never pass-through. Raw source content is not available through an advanced/debug view. |
| URL safety | A future allowlist may make a URL clickable only when it is an absolute normalized `https:` URL, contains no username/password, uses an explicitly approved public hostname that is not a known redirector, contains no token or semantic PII in its path/query/fragment, and is rendered with no-referrer and `noopener noreferrer`. Localhost, private/link-local IP destinations, non-HTTPS schemes, embedded content, and server-side fetching or redirect resolution are prohibited. Otherwise omit the link or render approved non-link evidence text. | URL validation prevents unsafe navigation/fetch behavior; it does not make the linked content private, accurate, or authorized, and the app does not attest to a downstream redirect destination. |
| Authorization and delivery | Future content requires the same fail-closed server-side organization authorization as all private data, exact selected-run/CNPJ binding, least-privilege column grants for only approved fields, mapped DTOs, `private, no-store` responses, and no raw-payload fallback. Browser state alone never authorizes access. | Authorization permits an approved viewer to access approved content; it is not semantic privacy approval. |
| Logging and diagnostics | Logs, traces, analytics, error details, fixtures, screenshots, and test artifacts must not contain report/evidence bodies, raw Markdown/JSON, evidence URLs, URL query/fragment values, contacts, CRM history, prompts, or redacted originals. Record only bounded event type, policy outcome, non-content correlation ID, and approved pseudonymous audit identifiers needed for access auditing. | SQL parameters and payload fragments remain excluded even on failures. |
| Contact snapshots | CRM company/contact snapshots remain deferred. They require a separate explicit approval under this same semantic PII, allowlist, omission, authorization, URL, and logging boundary; RLB-T004 does not approve them. | Snapshot freshness does not make contact PII safe to expose. |
| Batch/source | Batch/source list/detail screens, `/api/imports` routes, aggregates, filters, and navigation are deferred. The sole audited batch has no lineage to the audited projections/runs/reports, and its expected/received counters can be mistaken for import progress. Exact batch/source identifiers may remain only in the collapsed audit provenance of an already authorized lead decision, without status, percentage, aggregate, link, or progress wording. | A future task must supply linked lineage and complete wording/metric examples that reviewers confirm cannot reasonably imply import progress before any screen or route is reconsidered. |

## RLB-T005 Approval Record

**Approved on 2026-07-01.** The audit used the authorized `rlb_readonly`
profile against the same production-like target as RLB-T002. Every statement
ran in an explicit read-only transaction with a 2-second local statement
timeout. The role had `SELECT` and no table write privilege on the two queried
tables. No parameter value, row, payload, report/evidence content, credential,
or identifying sample was selected, printed into this record, or committed.

### Sanitized evidence

- Cardinality remained 20 mutable current projections for 20 distinct CNPJs,
  240 run/event rows, and 120 terminal rows. All terminal rows remained
  test-tagged, so the real production-eligible denominator was zero. The audit
  used the exact production predicate to verify fail-closed behavior and the
  test-tagged rows only as a production-like plan surrogate.
- The actual production-predicate list returned zero rows in 0.486 ms after
  17.555 ms planning, touched 32 shared buffers, and used no temporary I/O.
  The 20-row surrogate current-list plan returned all 20 rows in 1.353 ms after
  0.318 ms warm planning, touched 69 shared buffers, and used a 30 kB in-memory
  quicksort with no temporary I/O.
- The independent 20-row exact list count took 1.141 ms and 69 shared-buffer
  hits. It performs essentially the same full current-relation work as the
  data query; it is approved only because it also enforces the 20-row
  activation ceiling.
- Exact CNPJ detail used the unique CNPJ index plus the `lead_run_id` index,
  returned one surrogate row in 0.743 ms, and touched 9 shared buffers.
- Exact-CNPJ retained history used the CNPJ index, returned six terminal rows
  in 0.384 ms, touched 21 shared buffers, and sorted in 26 kB without temporary
  I/O. Its independent exact count took 0.208 ms and 15 shared-buffer hits.
  History is therefore capped at the six observed terminal rows per CNPJ; a
  larger retained set fails closed pending reapproval.
- Representative exact/selective and unselective filters completed in
  1.622–2.015 ms at the approved cardinality. The most common observed UF
  matched 8/20 projections, the most common priority matched 16/20, and the
  most common terminal action matched 85/120 terminal rows. These distributions
  show that pagination does not make those predicates selective.
- The existing `(uf, cidade)` and `(priority, strategic_tier, trust_verdict)`
  indexes are compatible with a single exact `uf` or exact approved `priority`
  as leading-key predicates. CNPJ equality uses the unique CNPJ index. City
  without UF, action, trust status, score, and validation date have no
  compatible leading index for the proposed list shape.
- Broad and prefix company-name probes, narrow and broad date probes, and all
  candidate alternate sorts scanned/materialized the eligible relation and
  sorted in memory at this small scale. The data covered a zero-day date span,
  so it cannot establish either narrow- or broad-range behavior. No company
  name index exists on this source.
- A structural JSON projection over the three candidate collection columns
  scanned the projection and took 0.649 ms with 41 shared-buffer hits. A
  computed JSON-length filter used a sequential scan and took 0.202 ms with 12
  shared-buffer hits. Payload-size and larger-cardinality behavior are not
  established, and the readable-field/content gates do not grant those
  columns. No JSON path is therefore approved for selection or filtering.
- The server reported 10 observed sessions, 1 active, and
  `max_connections = 100`. Two concurrent read-only sessions each executed 25
  bounded list/count probes; all 50 statements succeeded in 173 ms wall time.
  This is a concurrency-cap check, not a general load test.

### Approved capability matrix

| Capability | Decision | Bound and compatibility |
| --- | --- | --- |
| Current list relation | **Enabled** | `company_validations` plus exactly one matching terminal run; unfiltered source guard `<= 20` current rows; production activation still requires a non-zero eligible denominator and RLB-T003 readability coverage. |
| Pagination | **Narrowed** | Server-side `page` plus exact total, `pageSize` default/max `20`; a page beyond the total is empty. No response may be returned when the 20-row source guard fails. |
| Default ordering | **Narrowed** | Fixed `validated_at DESC, id DESC` only. The measured in-memory sort is accepted solely under the 20-row guard; no `sort` or `direction` parameter is exposed. |
| CNPJ search/filter | **Enabled** | One normalized exact 14-digit CNPJ only; unique CNPJ index compatible. No partial/prefix mode. |
| UF filter | **Narrowed** | Zero or one exact uppercase UF; leading key of `(uf, cidade)`. No multi-select, substring, or city-only query. |
| Priority filter | **Narrowed** | Zero or one exact RLB-T003-approved priority token; leading key of the priority composite index. No inferred ordering or multi-select. |
| List exact total | **Narrowed** | Enabled only as the exact eligible/readable/retained match count plus the unfiltered `<= 20` safety guard. Data and count predicates must match; count and data run sequentially, not in parallel. |
| Exact detail | **Enabled** | Exact normalized CNPJ, optionally exact matching `leadRunId`; unique CNPJ and run-ID indexes compatible. |
| Retained history | **Narrowed** | Exact CNPJ only, fixed `created_at DESC, id DESC`, `pageSize` default/max `20`, exact retained total, and at most six terminal rows per CNPJ. A larger retained set is unavailable pending reapproval. |
| Name/company search | **Deferred** | No compatible name index; broad and prefix probes scanned the bounded relation. |
| City filter | **Deferred** | City alone is not a leading index key; no safely populated UF+city control is approved in this gate. |
| Action/trust/score/date filters | **Deferred** | Missing compatible leading indexes, unselective observed domains, or no representative date span. |
| Batch/source filter | **Deferred** | Already deferred by RLB-T004; no matching lineage. |
| Alternate sorts | **Deferred** | Company, score, priority, action, trust, and arbitrary direction require explicit sorts without realistic larger-cardinality evidence. |
| JSON projection/filter | **Deferred** | Sequential work, no payload-size evidence, and no readable-field/content approval. Risk, signal, evidence, report, and raw JSON columns are not queried. |

### Runtime envelope and reapproval triggers

- Set the database role and each repository transaction to
  `statement_timeout = 2s`; use `lock_timeout = 500ms`, an idle-in-transaction
  timeout no greater than 5 seconds, and a pool acquisition timeout no greater
  than 1 second.
- The initial deployment has a global application budget of two database
  connections: one instance with pool minimum 0 and maximum 2. If deployment
  creates more instances, `instance_count × pool_max` must remain at most 2.
  Requests do not run list data/count statements concurrently.
- The expected supported concurrency is at most two in-flight database
  statements. Queue or reject excess work through the pool timeout. The
  producer and administration retain the rest of the server connection budget;
  the application does not treat apparently free server connections as its
  capacity.
- At observed cardinality, all measured execution times were below 2.1 ms and
  the highest observed fresh-connection planning time was 17.555 ms, leaving
  substantial time/timeout headroom. There is **no approved cardinality
  headroom** beyond 20 current projections or six retained terminal rows per
  CNPJ.
- Exceeding either cardinality ceiling, raising database concurrency above two,
  changing the current/terminal predicate, selecting any JSON content, adding
  a filter/sort/search mode, changing indexes, or materially changing payload
  sizes requires a new read-only plan/cost review before that capability is
  enabled. A timeout returns a safe unavailable response; it never relaxes the
  predicate or returns a partial result.

## Agent’s Discretion After Approval

- Exact visual composition within the required screen hierarchy and states.
- Component boundaries that keep business logic out of React components.
- The typed PostgreSQL driver, provided it is server-only, parameterized, and does not introduce migrations.
- The exact synthetic company names and values used in fixtures.
- Copy refinements that preserve the specified business meanings.
- Whether list filters use a drawer or an inline responsive panel.

## RLB-T035A Approval Record

**Approved on 2026-07-03.** This documentary gate partially supersedes the
RLB-T004 batch/source decision and aligns the current producer-provenance
assumptions previously recorded in RLB-T003. It unlocks only RLB-T036 and does
not authorize RLB-T037–RLB-T040, any write, n8n call/change, raw workflow
artifact, CSV, or production migration.

| Decision | Approved contract |
| --- | --- |
| Production eligibility | `test_case_id IS NULL OR test_case_id = 'SR_' || source_row`. Every other non-null identifier, including `grupo_teste`, is excluded as explicit test/audit data. |
| Run identity | Accept exactly `lr_` followed by 8 or 64 lowercase hexadecimal characters. Reject every other prefix, length, character set, and case. Preserve every accepted run and decision identity exactly; never group or deduplicate them. |
| Current batch identity | Recognize the producer's opaque `empresaqui_<timestamp ISO>` identifier and preserve it exactly. Analysis dates come only from `run_created_at`, never by parsing this identifier. |
| Batch source | Do not use `lead_import_batches`; the current producer does not write it. Aggregate only eligible terminal decisions already retained in `company_validation_runs`. |
| Minimal summary | `import_batch_id`, first/last `run_created_at`, eligible saved-decision count, and distinct-CNPJ count. Filename, expected/received rows, execution mode, versions, hashes, manifests, status, percentage, and progress are prohibited. |
| Evidence handling | Only aggregate contract evidence is recorded here. Raw workflow exports and EmpresaAqui CSVs remain outside Git. |
| Task release | RLB-T036 is executable. RLB-T037–RLB-T040 remain blocked pending separate repository/API/UI approval. |

## Specific References

- Repository guidance in `AGENTS.md`.
- DDL evidence in `docs/db/schema.sql`.
- `docs/db/tables.txt`, `docs/db/views.txt`, and `docs/db/functions.txt` exist but are empty.
- Raw workflow exports and EmpresaAqui CSVs remain outside Git. RLB-T035A
  records only the approved aggregate producer contract.

## Deferred Features

- Batch/source repositories, screens, routes, filters, and navigation remain
  blocked after the RLB-T036 mapper until separate approval.
- Report/evidence content until exact semantic allowlists and content-owner
  approval exist under the RLB-T004 privacy policy.
- CRM contact snapshot display until separate PII authorization under the same
  policy boundary.
- Full dashboard metrics.
- Export.
- Human review decisions or any write workflow.
- Multi-tenant authorization.
- Producer operational monitoring.
- Any new database view/index/migration.
- n8n integration of any kind.

## Implementation Hold

No implementation may start until:

1. Read-only scope and the “eligible, readable, retained decisions” MVP wording are approved.
2. ~~An authorized production/production-like multi-source contract audit covers
   `company_validations`, `company_validation_runs`,
   `company_strategic_research_reports`, `lead_import_batches`, and the two
   comparison views named above using exact aggregate counts and contract
   profiling. The role must have `SELECT` on those objects. No raw payload or
   business content is queried or committed.~~ Completed by RLB-T002 on
   2026-06-30 with bounded structural approval.
3. ~~Production scope, eligible modes, authentication provider, and exact
   organization authorization rule are approved.~~ Completed by RLB-T003 on
   2026-07-01.
4. ~~History retention limitations, semantic report/evidence privacy policy,
   and batch/source inclusion or explicit deferral are approved.~~ Completed by
   RLB-T004 on 2026-07-01: history is retained-only with incomplete/unknown
   completeness; report/evidence and contacts are omitted pending separate
   allowlists; batch/source screens/routes are deferred.
5. ~~Realistic query/performance evidence approves the enabled filter, sort,
   search, pagination, and count capability matrix.~~ Completed by RLB-T005 on
   2026-07-01 with hard cardinality/concurrency ceilings and deferred broad or
   unindexed controls.
6. ~~The design and task plan are approved after those findings are
   incorporated.~~ Approved by RLB-T005. Bootstrap remains a separate task and
   was not started.
