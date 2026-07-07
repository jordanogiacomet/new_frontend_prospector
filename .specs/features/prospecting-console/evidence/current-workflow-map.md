# Current Official Workflow Evidence

**Status:** STATICALLY VERIFIED against the official local export and
PARTIALLY EXERCISED against the authorized non-production target on
2026-07-06; identity, durability, and X4 proof pending

**Operational source of truth:**
`private-workflows/EmpresaAqui_Webhook_Import_v1.json`

**Workflow name:** `EmpresaAqui - Webhook Import v1 -
StrictOneTokenDomainGate`

**Static local export identity parsed on 2026-07-07:**

| Field | Observed value |
| --- | --- |
| Workflow `id` | `6HM8Era5svuUN24x` |
| Workflow `versionId` | `4be457b8-ccd1-47f9-9d0e-a1fbb38edc7e` |
| Export `active` flag | `false` |
| Nodes | `69` |
| Directed connection edges | `75` |

This is integration evidence, not authorization to edit, activate, or invoke
n8n. The export's `active` field is `false`; the file alone does not prove the
state or configuration of any deployed target.

The local `id` and `versionId` above are not remote proof. The authorized
non-production webhook did not expose those values in its public response or
headers, and no authorized n8n administrative inspection result was available.

## Authorized Non-Production Runtime Evidence

Target:

```text
http://192.168.0.20:30098/webhook/empresaqui/import
```

Scope and disposition:

- the target is internal and explicitly identified as non-production;
- the owner approved synthetic HTTP calls and producer writes;
- the owner separately selected a liberal internal profile that accepts HTTP,
  no authentication, and no replay protection for this target only;
- production still requires HTTPS and approved server-to-server
  authentication/replay controls;
- no administrative credential or inspection mechanism was available.

Observed:

- `GET` returned `404` with a method hint for `POST`, showing the stable
  webhook path was registered;
- a synthetic `POST multipart/form-data` request with `arquivo_csv` returned
  HTTP `202` and exactly `accepted`, `message`, `import_batch_id`, `row_count`,
  and `source`;
- the smoke returned `row_count: 1`, source `EmpresaAqui`, and completed in
  659 ms;
- the endpoint accepted the request without credentials;
- the provided `/webhook-test/empresaqui/import` endpoint returned an
  unregistered-webhook error requiring a canvas action and was not suitable
  for the repeatable contract suite.

The stable endpoint is behaviorally compatible with the local export's
webhook and response nodes. The effective remote workflow ID and version
remain unproved because neither the response nor headers attest them and no
authorized administrative read mechanism was supplied.

The first executable T019 run collected 43 cases: 28 passed and 15 failed. A
second run collected the same 43 cases: 29 passed and 14 failed. Sanitized
diagnostics showed missing-file `200`/empty, wrong-field `202`, empty-file
`500`, and malformed-quote/invalid-UTF-8 `200`/empty outcomes. The exact
10 MiB case timed out once at 20 seconds and passed once, which is not stable
compatibility evidence. Runtime identity/version attestation, persisted
correlation, durable acceptance/timing, and X4 accepted-row/close/terminal
facts remained missing.

## Entry, Binary, and Response Map

The full export contains this node inventory:

| Node type | Count |
| --- | ---: |
| `n8n-nodes-base.code` | 33 |
| `n8n-nodes-base.extractFromFile` | 1 |
| `n8n-nodes-base.httpRequest` | 4 |
| `n8n-nodes-base.if` | 5 |
| `n8n-nodes-base.merge` | 6 |
| `n8n-nodes-base.noOp` | 3 |
| `n8n-nodes-base.postgres` | 7 |
| `n8n-nodes-base.respondToWebhook` | 1 |
| `n8n-nodes-base.splitInBatches` | 1 |
| `n8n-nodes-base.stickyNote` | 6 |
| `n8n-nodes-base.wait` | 1 |
| `n8n-nodes-base.webhook` | 1 |

The static connection map has 75 directed edges. The ingress edge is exactly
`Webhook EmpresaAqui Import` -> `Extract From File`; the response branch is
`Normalizar EmpresaAqui` -> `Preparar Resposta Aceite Webhook` ->
`Responder Webhook - Aceite`.

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

The seven PostgreSQL nodes are all `executeQuery` nodes and reference:

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

Reachability, stable-path registration, POST/multipart behavior, the
five-field `202`, delimiter/row-count behavior, UTF-8 accents, BOM, CRLF,
liberal media type/filename handling, and repeated-request behavior now have
runtime coverage. Deployment identity/version, safe failure semantics, the
10 MiB compatibility bound, persistence ordering, and X4 facts do not.

Accordingly, current app configuration requires only the server-side
`N8N_IMPORT_URL` for the exact `empresaqui/import` webhook path and accepts
HTTP or HTTPS under the owner's internal-use decision. Optional HMAC settings
are unused deferred hardening and do not establish authentication. A future
client operating under this profile must send zero authentication headers;
client-generated HMAC-like headers would not be verified by the target.
This evidence plus the owner's explicit limitation acceptance unblocks
T013–T017 repository implementation. `FEATURE_IMPORTS_ENABLED` remains `false`
by default and may be enabled for the named internal target only after those
tasks and controlled synthetic UAT pass.

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

## Evidence Still Required for Batch Facts, Hardening, or Production

| Gap | Owner/input needed | Disposition |
| --- | --- | --- |
| Exact deployment identity | Deployment/n8n owner must provide authorized inspection evidence for target workflow `id`, `versionId`, activation state, and path | Blocks T018 completion and production |
| Production security profile | Security/deployment owners must approve and test HTTPS plus authentication/replay controls | Blocks production; not required by the internal HTTP/no-auth profile |
| Stable producer error mapping | n8n/producer owner must provide controlled response behavior for missing, wrong, empty, malformed, invalid-UTF-8, and oversized inputs | Blocks T019 completion and production hardening |
| Durable producer acceptance/idempotency | Producer owner must expose an approved durable acceptance and upload/idempotency fact source | Blocks durable `ACCEPTED`; current app may only record acknowledgement/unknown |
| Response/persistence timing and timeout reconciliation | Producer/deployment owners must provide observable synthetic evidence | Blocks T019 completion and production hardening |
| X4 batch/row/close/terminal facts | Producer owner must identify approved accepted-row, terminal-row, and close facts plus mappings | Blocks X4 and any completion status |
| Size, logging, and infrastructure limits | Deployment/security owners must provide body-limit, timeout, logging/redaction, monitoring, and rollback evidence | Blocks production hardening |

The authentication decision for this internal profile is explicitly “none”,
so T012 is not applicable to it. Internal upload behavior is deliberately
limited to app submission, workflow acknowledgement, and unknown outcome.
Before production, require HTTPS plus a
separately approved and remotely testable server-to-server authentication and
replay mechanism, deployment/activation approval, exact version attestation,
security review, batch completion evidence, monitoring, rollback, and
accountable production owners.
