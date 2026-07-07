# Database Source Map

**Status:** VERIFIED against `docs/db/schema.sql` on 2026-07-03  
**Limitation:** DDL presence does not prove that a workflow actively populates
an object

**Current workflow cross-check:**
`private-workflows/EmpresaAqui_Webhook_Import_v1.json` on 2026-07-06

## Producer Sources Evidenced by the Official Workflow Export

| Concept | Source | Contract caveat |
| --- | --- | --- |
| Current company projection | `public.company_validations` | Unique by CNPJ and mutable through upsert; not immutable history |
| Processing observations | `public.company_validation_runs` | Multiple event-like rows; no batch master or proven complete retention |
| Strategic report | `public.company_strategic_research_reports` | Contains sensitive/raw fields and may be upserted by CNPJ/version |
| CRM company/contact snapshots | `public.crm_company_history`, `public.crm_lead_contact_history` | Sensitive and mutable; not approved for general UI exposure |
| Operational failures | `public.workflow_dead_letters`, `public.workflow_integrity_errors` | Operational, potentially sensitive, not commercial UI sources |

## Structured Objects Present in DDL but Not Evidenced in the Official Export

| Object | Intended concept | Current treatment |
| --- | --- | --- |
| `public.lead_import_batches` | Immutable import identity and file metadata | Do not treat as active without runtime evidence |
| `public.lead_input_rows` | Batch row identity and normalized/raw hashes | Do not expose raw row/payload |
| `public.lead_processing_state` | Current processing state | Producer-owned; no app mutation |
| `public.lead_processing_events` | Structured processing events | Producer-owned; not a commercial timeline |
| `public.lead_decisions` | Structured final decisions | Producer-owned; raw snapshots remain withheld |
| `lead_claim_processing_empresaaqui_import` | Producer claim/upsert function | App must not call it directly |
| `lead_mark_stage_status` | Producer event mutation | App must not call it directly |
| `lead_save_decision` and strict variant | Producer decision mutation | App must not call it directly |

## X4 Batch Observation Adapter

T022 approves `public.prospecta_import_batch_observations_v1` as a
producer-owned read adapter over the structured objects above. The adapter is
defined in `db/producer/001_batch_observation_source.sql` and documented in
`.specs/features/prospecting-console/evidence/x4-producer-batch-observations.md`.

The adapter exposes only approved observation fields for Prospecta:
`import_batch_id`, `fact_type`, `source_row`, `lead_run_id`,
`producer_result`, `observed_at`, and `closed_at`. It does not expose raw rows,
normalized payloads, decision payloads, snapshots, reports, prompts, search
queries, n8n execution IDs, costs, or errors.

`company_validation_runs` may contribute only retained legacy observations.
It does not prove durable acceptance, close, terminal completeness, failure, or
confirmed zero counts.

## Field Exposure Direction

### Candidate business fields

Subject to query and semantic approval:

- company identity, CNPJ, city, UF, CNAE;
- company size and commercial ranges;
- stored score, priority, action, reason, verdict, and trust;
- analysis timestamp and cache indicator;
- agent version;
- batch, run, and source row in an audit area.

### Policy-gated fields

- risks and positive signals;
- evidence and external URLs;
- strategic reports;
- names, email addresses, and phone numbers;
- CRM history and opt-out state.

### Withheld fields

- `raw_payload`, `raw_row`, `normalized_payload`;
- input and external snapshots;
- LLM prompts/raw responses and search queries;
- `report_json` and unsanitized Markdown;
- integrity/error payloads and dead letters;
- tokens, credentials, costs, and n8n execution IDs;
- idempotency keys and hashes in the main UI.

## History Reliability

- Distinct `lead_run_id` rows can support a retained-history view.
- The DDL and official workflow do not prove complete retention.
- `company_validations` is a current projection.
- Strategic reports can be replaced by upsert and are not inherently immutable.
- UI copy must describe retained/available history, not every analysis ever
  produced.

## App Schema

No `prospecting_app` schema is present in the documented DDL. Creating it
requires a separately reviewed migration, privileges, rollback, and explicit
production approval.
