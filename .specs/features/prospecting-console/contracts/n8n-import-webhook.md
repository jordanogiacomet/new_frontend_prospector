# n8n EmpresaAqui Import Webhook Contract

**Status:** CURRENT WORKFLOW MAPPED — app integration and production use
blocked by the gaps below

**Operational source of truth:**
`private-workflows/EmpresaAqui_Webhook_Import_v1.json`

**Workflow name:** `EmpresaAqui - Webhook Import v1 -
StrictOneTokenDomainGate`

**Observed workflow active flag in the export:** `false`

This document records the behavior present in the official workflow export. A
statement under **Observed contract** is evidenced by that file. A statement
under **Required before implementation/production** is a pending requirement,
not behavior attributed to the workflow.

The official ingress is no longer the legacy form trigger. The legacy
qualification export remains historical producer evidence, but it is not the
current EmpresaAqui app-ingress contract.

## Trust Boundary

The only allowed call chain remains:

```text
Browser → Prospecta App API → official n8n webhook
```

The browser must never receive or call the n8n URL. The complete webhook URL,
any authentication secret, and all related security configuration are
server-only. The official workflow must not be edited, activated, or invoked by
repository documentation work.

## Observed Request Contract

The `Webhook EmpresaAqui Import` node has this configuration:

| Item | Observed value |
| --- | --- |
| HTTP method | `POST` |
| Configured webhook path | `empresaqui/import` |
| Request type | `multipart/form-data` |
| File form field | `arquivo_csv` |
| n8n binary property | `arquivo_csv` |
| Response mode | `responseNode` |

The exact environment-specific webhook URL is not present in the export. It
must be supplied as a server-only non-production or production setting for the
corresponding environment. Documentation must not substitute the previous
proposed path `/webhook/prospecta/imports/v1` for the configured path above.

The workflow sticky note gives the following request shape:

```sh
curl -X POST <URL_DO_WEBHOOK> \
  -F "arquivo_csv=@lista.csv;type=text/csv"
```

This is a shape example, not authorization to call a real endpoint.

No other multipart field is read by the official workflow. In particular, the
export does not consume `submission_id`, upload-level `idempotency_key`,
`file_sha256`, `contract_version`, or `original_filename`.

## Current App Configuration Boundary

- `N8N_IMPORT_URL` is the only required n8n setting in this phase.
- It must be an absolute HTTPS URL without credentials, query, or fragment,
  and use the standard n8n production
  `/webhook/empresaqui/import` or test
  `/webhook-test/empresaqui/import` form.
- `N8N_HMAC_KEY_ID` and `N8N_HMAC_SECRET` are optional, server-only, unused
  deferred-hardening placeholders. Their presence does not mean the current
  workflow authenticates or validates HMAC.
- `IMPORT_MAX_BYTES` and `IMPORT_PRODUCER_TIMEOUT_MS` are app controls, not
  observed workflow guarantees.
- `FEATURE_IMPORTS_ENABLED` remains `false`. It cannot be enabled before T019
  and definition/testing of the approved server-to-server authentication
  mechanism.

This configuration validation does not implement an n8n client, authorize a
call, or satisfy the runtime contract gate.

## Binary Handling and CSV Extraction

The connection is direct:

```text
Webhook EmpresaAqui Import
  → Extract From File
  → Normalizar EmpresaAqui
```

There is no Code, Set, Move Binary Data, or other binary-normalization node
between the webhook and `Extract From File`. Both nodes use the binary property
`arquivo_csv`.

`Extract From File` reads the CSV with:

| Option | Observed value |
| --- | --- |
| Binary property | `arquivo_csv` |
| Delimiter | `;` |
| Encoding | `utf8` |
| Header row | `true` |
| Relax quotes | `true` |

After extraction, `Normalizar EmpresaAqui` performs producer-owned header
aliasing, row normalization, CNPJ validation, producer identity generation,
pre-trust calculation, and the existing qualification preparation. Prospecta
must not reproduce or alter any of that logic.

The workflow does not calculate or verify a SHA-256 hash of the received file
bytes. It also does not persist the raw file bytes as an import acceptance
record. Therefore direct binary hand-off to `Extract From File` is evidenced,
but exact-byte integrity, retention, and replay binding are not.

`row_count` has only the observed meaning “number of items passed from
`Normalizar EmpresaAqui` to the response preparation node.” The export does not
define a separate durable accepted-row set or explicit blank-record semantics.

## Observed Response Contract

`Normalizar EmpresaAqui` fans out to `Preparar Resposta Aceite Webhook`, which
builds one response item. `Responder Webhook - Aceite` returns that item as
JSON with HTTP `202`.

Observed response shape:

```json
{
  "accepted": true,
  "message": "Arquivo recebido para processamento.",
  "import_batch_id": "empresaqui_2026-07-06T12:00:00.000Z",
  "row_count": 120,
  "source": "EmpresaAqui"
}
```

| Field | Observed origin and meaning |
| --- | --- |
| `accepted` | Literal `true` on the controlled response branch |
| `message` | Literal Portuguese acknowledgement |
| `import_batch_id` | Generated in `Normalizar EmpresaAqui` as `empresaqui_${new Date().toISOString()}` |
| `row_count` | Count of normalized items reaching response preparation |
| `source` | First item source, defaulting to `EmpresaAqui` |

The response does not contain `schemaVersion`, `submissionId`,
`producerBatchId`, `rowCountAccepted`, or `acceptedAt`. Those fields belonged
to the previous proposed contract and must not be expected from the official
workflow.

## App Interpretation and Correlation

If a future app integration receives this exact `202` response, it may record
only that the official workflow synchronously acknowledged the parsed and
normalized request and returned an `import_batch_id`.

The app must:

1. require HTTP `202`, a JSON body, `accepted === true`, a non-empty
   `import_batch_id`, and a non-negative integer `row_count`;
2. correlate the returned `import_batch_id` to the app-owned submission that
   made that single server-side request;
3. preserve the producer identifier under its established name
   `import_batch_id`;
4. treat `row_count` as the workflow response count, not as a proven durable
   accepted-row count;
5. retain an unknown outcome after timeout or loss of the response and never
   retry automatically.

The response is not sufficient to derive `ACCEPTED` under
`batch-status-contract.md`, because the response branch does not wait for a
durable batch acceptance record. It runs after extraction/normalization and in
parallel with the `Log Run - RECEBIDO` and downstream processing branches.

The workflow does not receive or echo an app `submission_id`. Correlation is
therefore limited to the app's association of one outbound request with the
returned `import_batch_id`. Recovery of that association after an
acceptance-unknown timeout is not evidenced.

## Observed Producer Reads and Writes

The official workflow keeps the existing producer-owned qualification
behavior. Its PostgreSQL nodes evidence:

| Producer object | Observed operation |
| --- | --- |
| `company_validations` | Read cache; upsert the current company validation projection |
| `company_validation_runs` | Insert `RECEBIDO`, blocked, cache, CRM-decision, and final run observations |
| `company_strategic_research_reports` | Read cached report; conditionally insert/upsert the strategic report |
| `crm_find_company_matches(...)` | Read producer CRM matching/history through the producer function |

The workflow carries `import_batch_id`, `source_row`, `lead_run_id`,
lead-oriented `idempotency_key`, `cnpj_normalizado`, `source_hash`, and
`agent_version` through producer processing. Its lead-oriented
`idempotency_key` is not upload-level replay protection.

No node in the export writes `lead_import_batches`, `lead_input_rows`,
`lead_processing_state`, `lead_processing_events`, or `lead_decisions`. No
app-owned commercial table is read or written.

## What the Official Workflow Already Guarantees

Within the static workflow definition, it:

- exposes a webhook node rather than a form trigger;
- accepts `POST` and directs binary `arquivo_csv` to CSV extraction;
- parses using the exact extraction options documented above;
- creates one `import_batch_id` for the normalized items of an execution;
- assigns producer row/run identities and continues through the existing
  qualification flow;
- has a controlled JSON response node with HTTP `202`;
- returns the five observed response fields;
- writes only the existing producer-owned qualification objects listed above;
- contains internal keyed-merge integrity checks for producer processing.

These static observations do not prove that a deployed endpoint is active,
reachable, secured, or configured identically.

## What the Official Workflow Does Not Guarantee

The export does not evidence:

- webhook authentication or caller authorization;
- HMAC verification, key ID handling, timestamp validation, nonce replay
  protection, or constant-time signature comparison;
- HTTPS termination, rate limiting, body-size limits, MIME/extension
  allowlists, malware scanning, or infrastructure request limits;
- upload-level `submission_id`, idempotency, conflict detection, or replay;
- SHA-256 verification of the received bytes;
- durable acceptance persistence before the `202`;
- organization scope;
- a versioned success or error schema;
- controlled error responses for extraction, normalization, database, or
  downstream failures;
- an acceptance timestamp;
- recovery after an acceptance-unknown timeout;
- a durable batch master, accepted-row set, explicit batch close fact, or
  exactly one approved terminal outcome per accepted row;
- absence of duplicate processing after repeated requests.

Internal lead/run identities and keyed merges do not close these upload-level
gaps.

## Difference Map: Previous Contract vs Official Workflow

| Concern | Previous documented proposal | Official workflow evidence | Consequence |
| --- | --- | --- | --- |
| Workflow | Separate ingress to be built | Official file already exists | Do not create a second workflow from zero |
| Entry | Legacy form described as current | Webhook node is current ingress | Correct context/design/evidence |
| Path | `/webhook/prospecta/imports/v1` | Configured path `empresaqui/import` | App must use only the environment URL for the official path |
| Body | File plus five metadata fields | One multipart file field `arquivo_csv` | Previous request DTO is incompatible |
| Binary | Exact-byte hash-bound upload | Direct `arquivo_csv` binary hand-off only | Exact-byte integrity is unproven |
| Authentication | Detailed HMAC v1 contract | No webhook authentication in export | Security gap blocks app integration |
| Idempotency | Organization/key/hash replay contract | Only lead-oriented key after parsing | Upload retries can duplicate work |
| Success schema | Versioned acceptance object | Five unversioned response fields | Client schema must match reality after gaps are resolved |
| Batch ID | `producerBatchId` | `import_batch_id` | Preserve the producer's real identifier |
| Count | Durable `rowCountAccepted` | `row_count` after normalization | Do not treat it as durable acceptance count |
| Durability | Acceptance persisted before `202` | Response branch does not wait for persistence | `202` is acknowledgement, not durable `ACCEPTED` |
| Completion | Batch/row/close facts required | No batch master or close fact | `COMPLETED` remains unavailable |
| Errors | Safe versioned status/envelope | No controlled error branch evidenced | Error contract remains pending |

## Pending Before Implementing `/api/imports`

- Name a non-production n8n target, endpoint owner, credentials owner, and
  safe test window.
- Import/inspect the official file in that target and prove its effective
  request and response behavior without production data.
- Decide and implement an approved server-to-server authentication mechanism;
  the repository HMAC/replay baseline is not present in the workflow.
- Decide whether the current unversioned response is retained or upgraded, and
  publish the exact tested schema.
- Add or approve durable upload acceptance/idempotency, or explicitly redesign
  app state so acknowledgement can never be mistaken for durable acceptance.
- Define timeout/reconciliation behavior without automatic retry.
- Prove request size, content-type, filename, encoding, and infrastructure
  limits.
- Define safe controlled error behavior.
- Reconcile `row_count` with an approved accepted-row fact.
- Execute T018/T019 contract evidence; static JSON inspection alone is not a
  passing integration test.

Until these items are resolved, app client, `POST /api/imports`, and upload UI
tasks remain blocked.

## Additional Pending Before Production

- Confirm the official deployed workflow/version matches the reviewed file and
  record its activation state; the committed export says `active: false`.
- Complete authentication, replay, idempotency, byte-integrity, rate-limit,
  body-limit, logging/redaction, secret-rotation, and incident-response review.
- Prove durable batch/row/terminal/close facts required by
  `batch-status-contract.md`.
- Approve producer read-only sources and retention for batch observation.
- Name product, producer, security, LGPD/data-policy, deployment, monitoring,
  rollback, and incident owners.
- Run synthetic contract, database-isolation, security, UAT, and rollback
  exercises in identified non-production environments.
- Obtain separate approval for workflow activation/configuration, production
  secrets, database grants/migrations, deployment, and rollout.

## Required Contract Tests

T018/T019 must prepare and then execute, against an identified non-production
target:

- exact `POST` path and multipart `arquivo_csv` behavior;
- missing/wrong field, empty file, malformed CSV, delimiter, UTF-8, header, and
  relaxed-quote cases;
- response status and exact five-field success schema;
- `import_batch_id` stability within one execution and row/run correlation;
- response timing relative to producer persistence;
- timeout before and after the response branch;
- repeated identical requests and resulting duplicate behavior;
- authentication/replay behavior after the security gap is resolved;
- safe/redacted failures;
- producer object writes with synthetic rows only;
- explicit proof that no browser request targets n8n;
- batch close/completion cases only after an approved producer fact source
  exists.

T018 and T019 remain incomplete until the applicable contract is executed and
recorded against the named non-production endpoint.
