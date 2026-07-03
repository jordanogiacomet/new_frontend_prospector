# Current Workflow Evidence

**Status:** VERIFIED against the local sanitized export on 2026-07-03  
**Source:** `private-workflows/EmpresaAqui - CRM Runs Auditado v5.8.22 -
StrictOneTokenDomainGate.sanitized.json`

This is implementation evidence, not authorization to edit or invoke n8n.

## Entry and Response Model

- Entry node: `On form submission` (`n8n-nodes-base.formTrigger`).
- File extraction node: `Extract From File`.
- No `n8n-nodes-base.webhook` node is present.
- No `n8n-nodes-base.respondToWebhook` node is present.
- Therefore the export does not expose the proposed app ingress or asynchronous
  `202` acceptance contract.

## Identity Generation

`Normalizar EmpresaAqui` generates:

- `import_batch_id` as `empresaqui_${new Date().toISOString()}`;
- `lead_run_id` from batch, source row, normalized CNPJ, test case, and source
  hash;
- an idempotency key from normalized CNPJ, source hash, and agent version.

The producer batch identity is generated after workflow entry. The app cannot
pre-correlate a submission to this identity under the current flow.

## Observed Producer Persistence

The PostgreSQL nodes reference:

| Node | Observed target/use |
| --- | --- |
| `Select Cache in PGSQL` | Reads `company_validations` and strategic reports |
| `Insert in PGSQL` | Upserts `company_validations`, inserts runs, upserts strategic reports |
| `Log Run - BLOQUEADO_PRE_VALIDACAO` | Inserts `company_validation_runs` |
| `Log Run - RECEBIDO` | Inserts `company_validation_runs` |
| `Log Run - USOU_CACHE` | Inserts `company_validation_runs` |
| `Log Run - CRM_DECIDIU` | Inserts `company_validation_runs` |
| `Select Histórico CRM in PGSQL` | Reads producer CRM history |

No node in this export references the structured
`lead_import_batches`/`lead_input_rows`/`lead_processing_state`/
`lead_processing_events`/`lead_decisions` model.

## Consequences

- The workflow has no durable app submission identity.
- `company_validation_runs` provides per-event observations, not a batch master
  record.
- No whole-batch acceptance or completion marker is evidenced.
- Current idempotency is lead-oriented, not an approved upload-level replay
  contract.
- Strategic report persistence uses an upsert path and must not be presented as
  immutable report history.
- Automating the current form would not solve authentication, correlation,
  replay, or completion semantics.

## Required Producer Evidence

Before implementation, the producer owner must supply:

- approved ingress workflow/version;
- webhook request/response tests;
- durable acceptance persistence;
- batch/row/run correlation proof;
- terminal result set;
- batch close/completion proof;
- replay and conflict proof;
- deployment and rollback procedure.
