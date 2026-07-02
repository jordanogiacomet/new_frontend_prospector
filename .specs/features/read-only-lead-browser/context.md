# Read-only Lead Browser Context

**Gathered:** 2026-06-30  
**Spec:** `.specs/features/read-only-lead-browser/spec.md`  
**Status:** RLB-T002 FAIL — authorized audit ran, but the target contained zero retained rows

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
- Subject to the contract gate, the default lead list and detail use the latest eligible, readable, retained completed decision per normalized CNPJ, ordered by `created_at DESC, decision_id DESC`.
- A detail view may accept `leadRunId` only to select a run already associated with the requested CNPJ; it must not create a run.
- Distinct decision/run identifiers are never collapsed by CNPJ, source hash, batch, or row.

### Missing and low-confidence data

- `null` remains `null`; the UI does not convert it to numeric zero.
- An absent array is different from a present empty array.
- Missing report copy is “Relatório ainda não disponível”.
- Unavailable history is stated directly; no operational event log is substituted.
- When retained history is enabled without proof of complete retention, use “Histórico disponível” or “Análises retidas encontradas” and state that older analyses may not be present.
- Unknown action, priority, verdict, or trust values remain visible as safely escaped “unknown/unmapped” values.
- Low-confidence styling is applied only after the stored-value mapping is approved.

### Batch/source behavior

- Any batch/source capability is GET-only and informational.
- It remains deferred unless reviewers establish that its labels, metrics, navigation, and context cannot reasonably be mistaken for import progress or operational monitoring.
- Expected row count is metadata, not proof of progress.
- Saved-decision counts are labeled as persisted decisions, not processed or completed import rows.
- Replay counters and legacy workflow-flow views are not shown as import progress.

## Evidence-Based Design Decisions

### RLB-T002 contract audit status

**FAIL as of 2026-06-30.** The authorized audit ran successfully, but the
`prospecting.public.lead_decisions` target contained zero retained rows.
Consequently, the audit cannot approve a readable production contract or an
eligibility coverage threshold.

#### Preflight

- The approved local DB-READ profile loaded without exposing or persisting its DSN.
- Connection target: database `prospecting`; current role: `rlb_readonly`.
- `SELECT` on `public.lead_decisions`: allowed.
- `INSERT`, `UPDATE`, and `DELETE` table privileges: absent.
- Forced `transaction_read_only`: `on`.
- Aggregate retained-row count: `0`.

#### Aggregate findings

The audit used retained rows as the denominator. A zero denominator is reported
as undefined, never as `0%`.

- Native-field null/empty profiling covered 27 proposed list, detail, history, audit, and report columns. Every count had denominator `0`; null rates are undefined.
- JSON-path profiling covered all 21 proposed `decision_payload` paths for company identity, fiscal/commercial detail, scores, summary, risks, positive signals, evidence, and fallbacks. Presence, JSON type, and incompatible-shape counts were all `0` of `0`; percentages are undefined.
- Effective fallback checks for company name, risks, and evidence returned `0` of `0`.
- Priority, action, verdict, trust, research-status, execution-mode, workflow-version, ruleset-version, and prompt-model-version domains had no observed values. Their distinct counts were all `0`.
- No time period, workflow/ruleset/prompt-model version, or execution-mode stratum existed.
- Structural eligibility produced `0` retained, completed, valid-CNPJ, mode-classified, eligible, readable, unreadable, and unclassified rows. Readable, unreadable, and unclassified percentages are undefined.
- `report_json` presence, type, multiplicity, array/object size, and object-signature variation were measured as `0` observations; minimum, maximum, and average multiplicity are undefined.
- Risk, signal, and evidence arrays had `0` observations. Array lengths, element types, and object-signature variation are therefore unobservable.
- Domain and version outputs used rare/long-value redaction even though the empty target produced no values.
- No raw row, JSON payload, report, evidence, contact data, strategic content, identifying value, or credential was printed, persisted, or committed.

#### Coverage decision

**Rejected.** Zero retained rows provide no empirical support for JSON-path
stability, null rates, domain mappings, mode eligibility, time/version
compatibility, readability, or report/evidence structure. The observed counts
must not be interpreted as `0%` missing, `100%` compatible, or proof that the
table has no structural variation.

`RLB-T002` does not pass. Rerun the same aggregate audit against an authorized
production or production-like target containing representative retained
`lead_decisions` rows. `RLB-T003` remains blocked until that rerun produces an
accepted coverage decision.

### Authoritative read source

- `lead_decisions` is the structurally strongest candidate read model because it preserves native final fields and audit identity.
- It is not yet approved as a trustworthy production read contract. Approval requires time/version/mode-stratified aggregate evidence for path presence, JSON types, nulls, domains, eligibility, and unreadable/unclassified coverage.
- `company_latest_validation` is useful evidence for latest-row ordering but is not a DTO source because it omits `final_action` and masks some missing JSON values with defaults.
- `company_validations` and `vw_dashboard_empresaqui` are mutable projections and are not history sources.
- `company_validation_runs`, processing events/state, dead letters, and integrity errors are operational producer records and remain outside the business UI.

### History availability

- History is considered structurally available from distinct `lead_decisions` rows.
- The UI must label superseded rows and disclose that retention/deletion policy is not evidenced.
- History remains conditional until production data scope and retention limitations are approved.
- Unless completeness is proven, the product shows retained analyses currently found, not a complete audit trail.

### Strategic report selection

- Prefer a report whose `company_strategic_research_reports.lead_run_id` exactly matches the selected decision.
- Do not join by CNPJ alone because that could attach a report from another run.
- If multiple exact-run reports exist, do not silently choose one until multiplicity is profiled. The provisional deterministic choice is latest `created_at DESC, id DESC`, accompanied by provenance.
- A report with non-`OK` integrity is unavailable by default; its internal `integrity_error` is not exposed.
- `lead_decisions.report_json` may be a fallback only after its shape and provenance are validated.
- Structural validation, Markdown sanitization, and URL validation are necessary but insufficient for privacy. Reports and evidence remain omitted until semantic PII and confidential-content handling, redaction, access, and logging rules are approved.

### Query behavior and production safety

- Pagination is a response bound, not proof that ranking, filtering, sorting, JSON extraction, or exact counts are safe.
- The MVP exposes only query shapes supported by realistic production or production-like evidence.
- Approval must review data and count plans, JSON extraction cost, filter/index compatibility, statement timeouts, expected concurrency, and representative selective/unselective parameters.
- Broad text search, broad date ranges, computed JSON filters, expensive sorts, and exact totals default to omitted or narrowed until evidence supports them.

### CRM/contact selection

- Contact data is not required for the initial vertical slice.
- If approved, it comes from CRM snapshot tables through the exact stored `crmCompanyKey` relationship, is nullable, and is labeled with snapshot freshness.
- CRM contact values are sensitive and mutable and must not be logged or used in tests/screenshots.

## Approval Decisions Still Required

These are not invitations to expand scope. They are prerequisites that prevent the implementation from guessing.

| Decision | Why it matters | Proposed default |
| --- | --- | --- |
| Authentication provider and organization claim | The repository contains no identity provider configuration. | Use the organization’s existing OIDC provider with server sessions; do not invent local users. |
| Authorized organization rule | A single-organization model still needs an exact claim/domain/allowlist. | Explicit server-side organization identifier, not email-domain-only authorization. |
| Eligible `execution_mode` values | The schema has a free-text mode and no row inventory. Test/eval data may coexist. | Allowlist confirmed production modes; exclude unknown modes from default business results. |
| Current-decision eligibility | `COMPLETED` and supersession fields exist, but manual supersession behavior needs confirmation. | Include only `decision_status = 'COMPLETED'` and `cnpj_normalizado IS NOT NULL`. |
| Contract readability threshold | DDL does not prove stable JSON paths/types across time, versions, or modes. | Quantify eligible, readable, unreadable, and unclassified percentages; do not approve meaningful coverage without an explicit accepted threshold. |
| Priority/action/verdict/trust value sets | Columns are free text; UI labels and low-confidence mapping cannot be inferred safely. | Profile distinct values read-only, approve mappings, preserve unknown values. |
| Report multiplicity and fallback | `lead_run_id` is indexed but not unique; report JSON shapes are unprofiled. | Exact-run, integrity-OK report only after content policy approval; no CNPJ-only fallback. |
| Query/performance envelope | Existing indexes do not prove proposed filters/counts are safe under realistic load. | Approve a measured capability matrix; omit unsupported filters, sorts, exact totals, and broad search. |
| Test database strategy | No test infrastructure exists and no heavy dependency is preapproved. | Dedicated non-production PostgreSQL with synthetic fixtures; unit-test mappers/routes independently. |
| Database grants | Schema dump does not include the deployed application role. | A separately provisioned role with `CONNECT`, `USAGE`, and `SELECT` only on approved objects. |

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

## Agent’s Discretion After Approval

- Exact visual composition within the required screen hierarchy and states.
- Component boundaries that keep business logic out of React components.
- The typed PostgreSQL driver, provided it is server-only, parameterized, and does not introduce migrations.
- The exact synthetic company names and values used in fixtures.
- Copy refinements that preserve the specified business meanings.
- Whether list filters use a drawer or an inline responsive panel.

## Specific References

- Repository guidance in `AGENTS.md`.
- DDL evidence in `docs/db/schema.sql`.
- `docs/db/tables.txt`, `docs/db/views.txt`, and `docs/db/functions.txt` exist but are empty.
- No sanitized n8n documentation was present, so no workflow behavior beyond repository and schema evidence is assumed.

## Deferred Features

- Batch/source screens/routes until linked lineage and non-progress semantics
  receive separate approval.
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
2. An authorized production/production-like `lead_decisions` contract audit quantifies JSON-path presence, JSON value types, null rates, domain values, time/workflow-version/execution-mode variation, eligibility coverage, and unreadable/unclassified row percentages. No raw payload is committed.
3. Production scope, eligible modes, authentication provider, and exact organization authorization rule are approved.
4. ~~History retention limitations, semantic report/evidence privacy policy,
   and batch/source inclusion or explicit deferral are approved.~~ Completed by
   RLB-T004 on 2026-07-01: history is retained-only with incomplete/unknown
   completeness; report/evidence and contacts are omitted pending separate
   allowlists; batch/source screens/routes are deferred.
5. Realistic query/performance evidence approves the enabled filter, sort, search, pagination, and count capability matrix.
6. The design and task plan are approved after those findings are incorporated.
