# Read-only Lead Browser Specification

**Project:** `read-only-lead-browser`  
**Phase:** Specify  
**Status:** Draft — review required before implementation  
**Confidence:** Medium — architecture is credible; production contract evidence is incomplete  
**Evidence reviewed:** `AGENTS.md`, `docs/db/schema.sql`, `docs/db/tables.txt`, `docs/db/views.txt`, `docs/db/functions.txt`  
**Evidence unavailable:** no `docs/db/columns.csv`, `constraints.csv`, or `indexes.csv`; no sanitized `docs/n8n/` files; no database profile or sample rows

## Executive Summary

`read-only-lead-browser` is a private business application for managers to review qualification decisions that are eligible for business display, readable under the approved contract, and still retained in PostgreSQL. The MVP is **a browser for eligible, readable, retained decisions**. It is not an authoritative inventory of every analysis ever produced.

The architecture and planning framework are sound, but full implementation is unsafe until evidence gates validate the production data contract, realistic query behavior, retention limitations, sensitive-content policy, and batch/source semantics.

The application is a consumer only:

```text
Authenticated manager → read-only frontend/API → PostgreSQL
```

The existing n8n workflow remains an external data producer. This project neither calls nor changes n8n, accepts CSV files, triggers imports, reprocesses leads, recalculates scores, writes lead data, nor runs production migrations.

## Problem Statement

Qualification results exist in PostgreSQL but are not yet presented through a manager-friendly, private interface. A business manager needs to find analyzed companies, compare recommendations, understand risks and supporting evidence, and distinguish current, missing, low-confidence, or incomplete information without learning workflow internals.

## Product Goals

- [ ] An authenticated manager can find and inspect the latest eligible, readable, retained qualification decision for a company.
- [ ] Lists use only query shapes, filters, counts, and sorting proven acceptable by realistic production or production-like evidence; pagination alone is not treated as a safety guarantee.
- [ ] Detail pages explain approved stored recommendation fields and audit provenance without recalculation; reports and evidence remain conditional on semantic privacy review.
- [ ] Retained prior decision rows are shown as “Histórico disponível” or “Análises retidas encontradas,” never as a complete audit trail unless retention completeness is proven.
- [ ] Missing, nullable, stale, mutable, and unreliable data is represented explicitly rather than converted to zero or fabricated.
- [ ] Every browser-accessible data path is authenticated and reaches PostgreSQL only through server-side code using read-only credentials.

## Users and Business Outcomes

**Primary user:** a business manager reviewing lead opportunities.

The MVP should let that manager answer:

- Which companies have an eligible, readable, retained decision available to this application?
- Which opportunities have the strongest stored recommendations?
- What action did the producer recommend?
- What risks, positive signals, evidence, and report support that result?
- When was the company analyzed, from which source batch, and by which producer version?
- Are there distinct retained prior decisions for the same CNPJ?
- Is information absent, stale, low confidence, or unsuitable to present as verified history?

The absence of a company or analysis from this application does not prove that the producer never analyzed it.

## New Project Scope

### P1 — MVP

1. Authentication and private access using a single-organization authorization model.
2. A read-only lead list based on the latest eligible and readable retained decision per normalized CNPJ.
3. Server-side search, filters, allowlisted sorting, counts, and pagination only to the extent supported by approved query evidence.
4. A lead detail page using the selected decision identity, not an unqualified raw JSON payload.
5. A read-only retained-analysis history section based on distinct `lead_decisions` rows, with an explicit incompleteness caveat unless retention completeness is proven.
6. Loading, empty, no-results, unavailable, low-confidence, and safe error states.
7. Brazilian presentation formatting for dates, CNPJ, currency values when truly numeric, and scores.
8. Server-only PostgreSQL access with a least-privilege read-only database role.

### P2 — Conditional

1. A limited batch/source browser based on `lead_import_batches` plus persisted-decision aggregates.
2. Display of mutable CRM contact snapshots after explicit approval of the PII policy.
3. Exact-run strategic report and evidence display after multiplicity, integrity, semantic PII, confidential-content, redaction, and URL behavior are approved.

### Explicitly Out of Scope

| Capability | Reason |
| --- | --- |
| CSV upload or import UI | The app is a reader, not a data producer. |
| `POST /api/imports` or any write route | No write operation belongs in MVP 1. |
| Calling an n8n webhook or API | n8n is external and producer-only. |
| Editing, cloning, activating, or patching n8n | Existing production workflow must remain untouched. |
| Async import gates, retry, idempotency, or import acceptance | These are producer concerns and are specifically excluded. |
| Lead reprocessing | Would create producer-side state and new analyses. |
| Recalculating scores, actions, verdicts, priorities, or trust | Stored producer decisions are authoritative. |
| Human-review write actions | Would mutate business state. |
| Export | Explicitly deferred from MVP 1. |
| Full metrics dashboard | Current evidence does not establish reliable dashboard metrics. |
| Production database migrations or new views/indexes | Require separate future approval. |
| Raw workflow payload browser | Raw JSON is sensitive, unstable, and not business-friendly. |
| Operational workflow monitoring | Processing state, retries, dead letters, and event internals are not this product. |

## Database Source Map

The map below is based only on DDL evidence. It does not prove production grants, row quality, value distributions, cardinality, or retention.

| Product need | Proposed source | Evidence and use | Decision |
| --- | --- | --- | --- |
| Latest lead list | `public.lead_decisions` | Structurally strongest candidate: native decision fields, CNPJ, audit IDs, versions, source identity, payload, and timestamps. Production consistency, eligibility coverage, and query cost remain unproven. | Provisional primary source pending contract/query gates |
| Lead detail | `public.lead_decisions` | Same exact decision used by list/detail; null-safe extraction from approved JSON paths only after path/type coverage is measured. | Provisional primary source pending contract/content gates |
| Latest-row helper | `public.company_latest_validation` | Shows intended “latest completed per CNPJ” ordering, but omits `final_action` and coerces several absent JSON values to `0`/empty arrays. | Reference only; do not bind DTOs directly |
| Strategic report | `public.company_strategic_research_reports` | Has `lead_run_id`, report JSON/Markdown, evidence, confidence, integrity, timestamps, and expiry. | Conditional exact-run enrichment |
| Lead history | `public.lead_decisions` | `decision_id` PK, unique `idempotency_key`, required `lead_run_id`, source/batch fields, versions, and creation timestamp preserve distinct retained decisions. The DDL does not prove retention completeness. | Retained history only; incomplete unless proven otherwise |
| Current mutable projection | `public.company_validations` | One unique row per CNPJ with defaults and `updated_at`; appears to be latest-state projection rather than immutable history. | Do not use for history; fallback only after explicit approval |
| Legacy run/event log | `public.company_validation_runs` | Multiple operational rows/stages and no uniqueness by CNPJ/run; not a decision history contract. | Exclude from business history |
| Idempotent event view | `public.company_validation_runs_idempotent` | Joins processing events/state; reflects producer operations and retry/state semantics. | Exclude from MVP |
| Input/source batch | `public.lead_import_batches` | Stable batch PK and source metadata; some counters/timestamps are mutable on replay. | Conditional batch metadata source |
| Source row | `public.lead_input_rows` | Stable input row identity and source-row relationship; raw payload is sensitive. | Audit join only; never expose raw payload |
| CRM company/contact snapshots | `public.crm_company_history`, `public.crm_lead_contact_history` | Nullable contact and CRM history fields; rows can be refreshed and contain PII. | Conditional, mutable enrichment |
| Dashboard view | `public.vw_dashboard_empresaqui` | Combines mutable `company_validations` with a latest legacy run chosen by numeric ID. | Do not use as authoritative read model |
| Batch summaries/flow views | `public.vw_company_validation_batch_*`, `public.vw_company_validation_run_summary` | Aggregate legacy processing-result strings and operational logs. They do not establish completed business progress. | Do not show as confirmed progress |
| Processing state/events, dead letters, integrity errors | `public.lead_processing_state`, `public.lead_processing_events`, `public.workflow_dead_letters`, `public.workflow_integrity_errors` | Operational producer data, mutable state, retries, and internal errors. | Exclude from business UI and API |

## Safe, Nullable, Mutable, Incomplete, and Unreliable Data

### Structurally strongest candidate for the MVP read model

- `lead_decisions.decision_id`, `lead_run_id`, `import_batch_id`, `input_row_id`, `source_row`, hashes, version fields, and `created_at` are explicit audit fields.
- `lead_decisions.final_score` is constrained to `0..100` when present.
- The producer function shown in the schema inserts a decision with `ON CONFLICT DO NOTHING`, which supports append-only behavior for that write path.
- Foreign keys connect decisions to processing state, batch, and input rows.
- A retained history item can remain distinct by `decision_id` and `lead_run_id`; rows must never be collapsed merely because CNPJ or source hash matches.

These structural properties do not prove that rows are consistently populated across workflow versions or execution modes. The production contract audit must quantify eligible, readable, unreadable, and unclassified coverage before the application claims meaningful breadth.

### Nullable or absent

- CNPJ, final score, verdict, trust status, action, action reason, priority, report, and many nested company fields can be null.
- Risk, signal, and evidence JSON may be absent, explicitly empty, malformed, or shaped differently from the expected array.
- `row_count_expected`, report Markdown, contact data, expiry, and report integrity details may be unavailable.
- Missing numeric JSON values must remain `null`; they must not inherit the `0` defaults used by helper functions or projection tables.

### Mutable or stale

- `company_validations` is one row per CNPJ with `updated_at`, so it is a mutable current-state projection.
- `crm_company_history` and contact history have `loaded_at`/modified fields and should be presented as snapshots, not immutable qualification facts.
- Strategic reports have `updated_at` and expiry, and the schema does not enforce one report per `lead_run_id`.
- `lead_import_batches.last_seen_at` and `received_count` change on replay; `received_count` is not processed-row progress.
- A decision can be marked `SUPERSEDED_MANUALLY`; supersession metadata is mutable audit state and must be shown rather than silently overwritten.

### Incomplete or unverified

- No row profiling proves which `execution_mode` values are production data.
- No distinct-value inventory proves the complete sets of `priority`, `final_action`, `final_verdict`, or `trust_status`.
- No sample establishes all JSON shapes or whether report evidence URLs use safe schemes.
- Database roles/grants and row-level security are absent from the dump.
- Retention behavior and whether old decisions can be deleted outside the shown functions are unknown.
- Query performance cannot be confirmed without realistic parameter distributions, cardinalities, concurrency assumptions, and `EXPLAIN (ANALYZE, BUFFERS)` or an approved non-invasive equivalent.
- Existing indexes support some identity/latest lookups but do not prove compatibility with JSON extraction, broad text search, every proposed filter/sort, or exact count queries.
- Structural Markdown and URL sanitization does not establish that report/evidence content is free of personal, confidential, contractual, or commercially restricted information.

### Unsafe to present as business truth

- `company_latest_validation` calls helper functions with default `0` for some nested scores and counts, so it can hide “missing” as zero.
- `company_validations` uses non-null zero/default values and cannot prove historical values.
- Legacy batch-flow views count operational log rows and use “possibly missing” calculations; they are unsuitable for confirmed progress.
- Raw payloads, input snapshots, CRM histories, prompts, and operational error payloads may contain sensitive or technical data and must not be returned wholesale.

## User Stories and Acceptance Criteria

### P1: Private access

**User story:** As an authorized manager, I want private access so that sensitive lead data is not publicly exposed.

1. WHEN an unauthenticated user requests a private page THEN the system SHALL redirect to login without returning lead content.
2. WHEN an unauthenticated request reaches any lead or batch API THEN the system SHALL return a safe `401` response.
3. WHEN an authenticated identity is not authorized for the configured organization THEN the system SHALL return a safe `403` response.
4. WHEN authentication succeeds THEN the system SHALL create a secure server-validated session without exposing provider secrets.

**Independent test:** Request a private page and API with no session, an unauthorized session, and an authorized session.

### P1: Browse latest lead decisions

**User story:** As a manager, I want a paginated list of eligible, readable, retained decisions so that I can identify available opportunities without loading every row or assuming complete inventory coverage.

1. WHEN the lead list is requested THEN the system SHALL return at most the validated page size of latest eligible decisions, one per normalized CNPJ.
2. WHEN a company has multiple decisions THEN the system SHALL select the latest eligible decision by `created_at DESC, decision_id DESC`.
3. WHEN no leads exist THEN the UI SHALL show a no-data state.
4. WHEN valid filters match no leads THEN the UI SHALL show a no-matching-filters state and preserve the filters.
5. WHEN a displayed value is null THEN the UI SHALL show “Não disponível” or an equivalent field-specific state rather than zero.
6. WHEN a retained row fails the approved eligibility or readability contract THEN the system SHALL exclude it from business results and SHALL include it in aggregate coverage reporting from the evidence audit, without exposing its raw payload.
7. WHEN coverage evidence is communicated THEN the system SHALL describe the list as eligible/readable/retained decisions and SHALL not imply complete inventory coverage.

**Independent test:** Load a synthetic dataset with two decisions for one CNPJ and verify only the latest eligible decision appears.

### P1: Search, filter, sort, and paginate

**User story:** As a manager, I want server-side controls so that I can narrow the business list efficiently.

1. WHEN valid page, filter, and sort parameters are supplied THEN the API SHALL apply them in a parameterized server-side query.
2. WHEN parameters violate bounds or allowlists THEN the API SHALL return `400 VALIDATION_ERROR` without querying the database.
3. WHEN sorting values tie THEN the query SHALL add deterministic audit-identity tie-breakers.
4. WHEN the user changes filters or sorting THEN pagination SHALL return to page 1.
5. WHEN a text filter contains wildcard characters THEN the API SHALL treat them as literal input unless wildcard search is explicitly approved.
6. WHEN realistic query evidence does not support a filter, sort, exact total, or search mode THEN the MVP SHALL omit or narrow that capability rather than relying on pagination to contain database cost.
7. WHEN list queries are approved THEN their data and count forms SHALL have reviewed JSON extraction cost, filter/index compatibility, timeout behavior, and expected concurrency impact.

**Independent test:** Exercise every valid filter, invalid boundary, sort key, sort direction, and a page beyond the result set.

### P1: Inspect lead detail

**User story:** As a manager, I want a business-readable lead detail so that I can understand the stored recommendation and its evidence.

1. WHEN a valid CNPJ resolves to an eligible latest decision THEN the API SHALL return a mapped `LeadDetail`, not a raw payload.
2. WHEN the route includes an approved `leadRunId` selector THEN the system SHALL return only that run if it belongs to the CNPJ.
3. WHEN a report, evidence, signals, or risks are absent or withheld by policy THEN the UI SHALL distinguish absent, omitted, and explicit-empty states without revealing sensitive content.
4. WHEN Markdown is approved for display THEN the system SHALL sanitize it before rendering; XSS sanitization SHALL NOT be treated as proof of privacy safety.
5. WHEN evidence contains an external URL THEN only validated `https:` URLs SHALL be clickable; invalid URLs SHALL render as non-clickable text or be omitted.
6. WHEN the recommendation is recognized as low confidence THEN the UI SHALL show an explicit warning; unknown trust values SHALL not be silently classified.
7. WHEN semantic PII or confidential-content safety is uncertain THEN report/evidence content SHALL be redacted or omitted by default, and raw payloads SHALL remain unavailable.

**Independent test:** Open complete, nullable, empty-array, malformed-evidence, missing-report, and low-confidence synthetic records.

### P1: Review decision history

**User story:** As a manager, I want distinct retained decisions for a company so that I can review the analyses currently available without assuming a complete audit trail.

1. WHEN multiple `lead_decisions` rows exist for a CNPJ THEN the API SHALL return each distinct `decision_id`/`lead_run_id` in descending analysis order.
2. WHEN a decision is superseded THEN the history SHALL retain and label its supersession status.
3. WHEN history reliability prerequisites fail THEN the UI SHALL show “Histórico indisponível” or “Histórico incompleto” rather than constructing a timeline from projection or event rows.
4. WHEN history is returned THEN it SHALL be paginated and SHALL never merge runs by source hash, batch, or CNPJ.
5. WHEN retention completeness is not proven THEN the section SHALL be labeled “Histórico disponível” or “Análises retidas encontradas” and SHALL state that older analyses may not be present.
6. WHEN retained rows are shown THEN the UI SHALL not describe them as every analysis ever produced.

**Independent test:** Use synthetic current, superseded, and repeated-source decisions and verify all audit identities remain distinct.

### P2: Browse batch/source metadata

**User story:** As a manager, I want limited source-batch context so that I can understand where analyses originated.

1. WHEN batch browsing is approved THEN the API SHALL return only source metadata and clearly named persisted-decision aggregates whose semantics cannot reasonably be mistaken for import progress.
2. WHEN `row_count_expected` is null THEN the UI SHALL show unavailable rather than zero.
3. WHEN expected rows and saved decisions differ THEN the UI SHALL not infer completion, failure, or progress.
4. WHEN batch detail is requested THEN the route SHALL remain GET-only and SHALL not trigger any producer behavior.
5. WHEN reviewers cannot establish non-operational wording and semantics THEN the batch/source screen SHALL be deferred.

**Independent test:** Display batches with null expected count, replayed receipts, and different decision counts without showing a progress percentage.

## UI States

Every private screen must define:

| State | Required behavior |
| --- | --- |
| Loading | Use a stable skeleton that does not reveal previous lead data. |
| No data | Explain that no eligible, readable, retained decisions are available; do not claim that no analyses ever occurred. |
| No matching filters | Preserve active filters and offer a clear-filter action. |
| Missing report | Show “Relatório ainda não disponível”. |
| Missing evidence | Show “Nenhuma evidência disponível para esta análise”. |
| Available/incomplete history | Use “Histórico disponível” or “Análises retidas encontradas” and state that older analyses may not be present unless retention completeness is proven. |
| Unavailable history | State that retained history cannot be presented reliably; do not substitute event logs. |
| Low confidence | Show a visible warning tied to the stored trust status and approved mapping. |
| Unknown confidence | Show the raw business label safely as unknown/unmapped, without guessing. |
| Database/API error | Show a retry option and safe business message; never show stack, SQL, host, or payload. |
| Unauthorized/forbidden | Show login or access-denied state without private data. |
| Stale/expired report | Label the report using stored expiry; do not refresh or reprocess it. |

## Requirement Traceability

| ID | Requirement | Priority | Design target | Status |
| --- | --- | --- | --- | --- |
| RLB-01 | Authenticate private pages and APIs; authorize one organization. | P1 | Auth boundary | In Design |
| RLB-02 | Select the latest eligible, readable, retained completed decision per normalized CNPJ. | P1 | Lead repository | In Design |
| RLB-03 | Provide only evidence-approved bounded server-side filtering, sorting, search, counts, and pagination. | P1 | Validators/repository/API | In Design |
| RLB-04 | Map exact lead detail without exposing raw payloads. | P1 | Detail repository/mapper/API | In Design |
| RLB-05 | Preserve null, empty, unavailable, stale, and malformed distinctions. | P1 | DTO mappers/UI states | In Design |
| RLB-06 | Show distinct retained-decision history with a mandatory incompleteness caveat unless retention completeness is proven. | P1 conditional gate | History repository/API/UI | In Design |
| RLB-07 | Sanitize Markdown and validate evidence URLs. | P1 | Content safety boundary | In Design |
| RLB-08 | Use Brazilian CNPJ/date/currency/score presentation. | P1 | Formatters/UI | In Design |
| RLB-09 | Return consistent safe success/error envelopes. | P1 | API response layer | In Design |
| RLB-10 | Keep PostgreSQL and credentials server-only and read-only. | P1 | DB/security boundary | In Design |
| RLB-11 | Do not call/change n8n, write lead data, or run production migrations. | P1 invariant | Whole system | In Design |
| RLB-12 | Preserve decision, run, batch, source-row, hash, version, and timestamp audit identity. | P1 | DTOs/detail/history | In Design |
| RLB-13 | Show a low-confidence warning only from an approved stored-value mapping. | P1 | Labels/UI | In Design |
| RLB-14 | Optionally expose limited batch/source metadata without progress inference. | P2 conditional | Batch repository/API/UI | In Design |
| RLB-15 | Test validation, auth, mapping, formatting, content safety, errors, and null handling with synthetic data. | P1 | Test strategy | In Design |
| RLB-16 | Audit production/production-like `lead_decisions` path presence, JSON types, null/domain values, version/mode variation, eligibility, and unreadable/unclassified coverage before implementation. | P1 evidence gate | Contract audit | Pending Evidence |
| RLB-17 | Enable only query shapes supported by realistic plan/cost, count, JSON extraction, index compatibility, timeout, and concurrency evidence. | P1 evidence gate | Query/performance gate | Pending Evidence |
| RLB-18 | Treat reports/evidence as potentially sensitive; require semantic PII/confidential-content policy, redaction/omission rules, and URL safety beyond XSS sanitization. | P1 conditional gate | Content policy/mapper/UI | Pending Approval |

**Coverage:** 18 requirements; 18 mapped into design; task mapping is defined in `tasks.md`.

## Success Criteria

- [ ] No unauthenticated browser or API request returns private lead data.
- [ ] No application code imports the database client into a client component.
- [ ] Every list endpoint enforces pagination and deterministic sorting.
- [ ] Every enabled list filter, sort, count, and search shape has approved realistic query evidence; unsupported broad/expensive controls are absent.
- [ ] Latest, detail, and history queries preserve audit identity and never recalculate producer decisions.
- [ ] Contract-audit results quantify eligibility coverage and unreadable/unclassified row percentages across time, workflow version, and execution mode without committing raw payloads.
- [ ] Missing stored values remain missing through SQL, DTO, API, and UI.
- [ ] No raw payload, unapproved report/evidence content, SQL error, credential, stack trace, or producer-internal error reaches the browser.
- [ ] Test fixtures and screenshots contain only synthetic data.
- [ ] Lint, typecheck, tests, and production build pass before implementation is considered complete.
- [ ] A static scope audit finds no n8n call, CSV upload, POST import, reprocess, export, lead write, or production migration.

## Required Answers

- **Does this project require changing n8n?** NO.
- **Does this project require calling n8n?** NO.
- **Does this project require production migrations?** NO, unless a future approved change explicitly says otherwise.
- **Can implementation start now?** NO.
- **What must pass first?** Read-only scope/MVP wording approval; the production or production-like `lead_decisions` contract audit; production scope/auth approval; retention/history plus report/evidence plus batch semantics decisions; and realistic query/performance approval.
- **Did the MVP remain read-only?** YES. It remains authenticated, server-only, GET-only, PostgreSQL-read-only, with no n8n call/change, CSV upload, import, retry/idempotency behavior, reprocess, export, lead write, or migration.
