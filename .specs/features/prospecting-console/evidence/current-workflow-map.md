# Current Official Workflow Evidence

**Status:** STATICALLY VERIFIED against the official local export on
2026-07-06; runtime/non-production proof pending

**Operational source of truth:**
`private-workflows/EmpresaAqui_Webhook_Import_v1.json`

**Workflow name:** `EmpresaAqui - Webhook Import v1 -
StrictOneTokenDomainGate`

This is integration evidence, not authorization to edit, activate, or invoke
n8n. The export's `active` field is `false`; the file alone does not prove the
state or configuration of any deployed target.

## Entry, Binary, and Response Map

```text
Webhook EmpresaAqui Import
  POST; path=empresaqui/import
  binaryPropertyName=arquivo_csv
    ↓
Extract From File
  binaryPropertyName=arquivo_csv
  delimiter=; encoding=utf8 headerRow=true relaxQuotes=true
    ↓
Normalizar EmpresaAqui
    ├─→ Preparar Resposta Aceite Webhook
    │     ↓
    │   Responder Webhook - Aceite (JSON, HTTP 202)
    ├─→ Log Run - RECEBIDO
    └─→ qualification/CRM/cache branches
```

- The request is `multipart/form-data` with the file in `arquivo_csv`.
- The n8n binary property received and read is also `arquivo_csv`.
- No binary normalization node exists before `Extract From File`.
- The official workflow has both `n8n-nodes-base.webhook` and
  `n8n-nodes-base.respondToWebhook`.
- It is not the legacy form-trigger ingress.

## Controlled Response

`Preparar Resposta Aceite Webhook` returns:

```json
{
  "accepted": true,
  "message": "Arquivo recebido para processamento.",
  "import_batch_id": "<generated batch identity>",
  "row_count": 1,
  "source": "EmpresaAqui"
}
```

`Responder Webhook - Aceite` returns the object as JSON with HTTP `202`.

The response branch starts after extraction and producer normalization, but it
does not wait for `Log Run - RECEBIDO` or a batch acceptance transaction.
Therefore it is a controlled acknowledgement, not evidence of durable
acceptance under `batch-status-contract.md`.

## Identity Generation

`Normalizar EmpresaAqui` generates:

- `import_batch_id` as `empresaqui_${new Date().toISOString()}`;
- `source_row` as the extracted item index plus 2;
- `lead_run_id` from batch, source row, normalized CNPJ, test case, and source
  hash;
- a lead-oriented `idempotency_key` from normalized CNPJ, source hash, and
  agent version.

The response exposes `import_batch_id`, allowing the app to associate one
received response with its app-owned submission. The workflow does not receive
or echo an app `submission_id`, bind a file hash, or persist upload-level
idempotency.

## Observed Producer Persistence

The PostgreSQL nodes reference:

| Node | Observed target/use |
| --- | --- |
| `Select Cache in PGSQL` | Reads `company_validations` and `company_strategic_research_reports` |
| `Insert in PGSQL` | Upserts `company_validations`, inserts `company_validation_runs`, conditionally upserts `company_strategic_research_reports` |
| `Log Run - BLOQUEADO_PRE_VALIDACAO` | Inserts `company_validation_runs` |
| `Log Run - RECEBIDO` | Inserts `company_validation_runs` |
| `Log Run - USOU_CACHE` | Inserts `company_validation_runs` |
| `Log Run - CRM_DECIDIU` | Inserts `company_validation_runs` |
| `Select Histórico CRM in PGSQL` | Reads producer CRM matching/history through `crm_find_company_matches(...)` |

No node in this export references the structured
`lead_import_batches`/`lead_input_rows`/`lead_processing_state`/
`lead_processing_events`/`lead_decisions` model.

## Static Guarantees and Limits

The export proves the configured nodes, edges, parameters, generated response,
and SQL text. It does not prove:

- deployment or activation;
- effective URL, HTTPS, proxy, body, rate, or timeout settings;
- webhook authentication, HMAC, nonce, or replay controls;
- exact-byte SHA-256 validation;
- upload-level idempotency/conflict handling;
- durable acceptance before `202`;
- controlled failure envelopes;
- batch master, accepted-row set, terminal-row uniqueness, or explicit batch
  closure.

Accordingly, current app configuration requires only the server-side
`N8N_IMPORT_URL` for the exact `empresaqui/import` webhook path. Optional HMAC
settings are unused deferred hardening and do not establish authentication.
`FEATURE_IMPORTS_ENABLED` remains `false`; no client or `/api/imports` route is
unblocked by this static evidence.

The existing keyed integrity validators protect internal producer merges.
They do not establish upload-level acceptance or completion.

## Previous Evidence vs Official Ingress

The historical sanitized export
`private-workflows/EmpresaAqui - CRM Runs Auditado v5.8.22 -
StrictOneTokenDomainGate.sanitized.json` remains useful for qualification
lineage, but it is no longer the authority for the current ingress.

| Concern | Historical export | Current official export |
| --- | --- | --- |
| Entry | `On form submission` | `Webhook EmpresaAqui Import` |
| Request | n8n form | `POST` multipart field `arquivo_csv` |
| CSV extraction | `Extract From File` | `Extract From File` with the explicit options above |
| Controlled app response | None | JSON `202` through `Responder Webhook - Aceite` |
| Batch correlation | Internal only | `import_batch_id` is returned |
| Durable acceptance | Not evidenced | Still not evidenced |
| Upload authentication/idempotency | Not evidenced | Still not evidenced |
| Batch completion | Not evidenced | Still not evidenced |

## Evidence Still Required

Before app integration:

- named non-production target, owner, URL, credentials, and test window;
- imported workflow/version/configuration proof;
- effective request/response and failure tests;
- authentication and replay-control decision and implementation;
- durable acceptance/idempotency or an approved redesign of app state;
- response/persistence timing and timeout-reconciliation tests;
- safe size, content, error, and logging behavior.

Before production, also require deployment/activation approval, exact version
attestation, security review, batch completion evidence, monitoring, rollback,
and accountable production owners.
