# n8n Import Webhook Contract

**Status:** APPROVED FOR IMPLEMENTATION — executable non-production proof
pending  
**Contract version:** `prospecting-import-v1`  
**Acceptance schema:** `prospecting-import-acceptance-v1`

This contract applies only to a separately developed, versioned ingress. It
does not authorize changing or invoking the current productive form workflow.

## Ownership Prerequisites

Before any deployed integration, approval must name:

- producer owner;
- app integration owner;
- security reviewer;
- non-production endpoint and test environment;
- deployment and rollback owner.

## Request

```http
POST /webhook/prospecta/imports/v1
Content-Type: multipart/form-data
```

| Field | Required | Contract |
| --- | --- | --- |
| `arquivo_csv` | Yes | Exact bytes selected by the user; producer-compatible field name |
| `submission_id` | Yes | App-generated UUID |
| `idempotency_key` | Yes | Immutable identifier for the logical submission |
| `file_sha256` | Yes | Lowercase SHA-256 of uploaded bytes |
| `contract_version` | Yes | `prospecting-import-v1` |
| `original_filename` | Yes | Sanitized metadata; never a storage path |

Implementation limits:

- exactly one file;
- maximum 10 MiB;
- case-insensitive `.csv` extension after filename sanitization;
- allowlisted media types: `text/csv`, `application/csv`,
  `application/vnd.ms-excel`, and `text/plain`;
- valid UTF-8 without NUL bytes;
- non-empty bytes and a non-empty first logical header line.

These are superficial checks. The app must not normalize rows, validate CNPJ
business rules, map aliases, count business records, score, enrich, or qualify.
SHA-256 is calculated over the exact bytes forwarded in `arquivo_csv`.

## Authentication and Replay Protection

- HTTPS only and no URL query string.
- Dedicated random secret of at least 32 bytes per environment.
- HMAC-SHA-256 over the exact UTF-8 canonical string defined below.
- Constant-time comparison after strict 32-byte hexadecimal decoding.
- Five-minute absolute clock-skew window.
- A UUID nonce is single-use for ten minutes per key ID.
- Timestamp, nonce, unknown key ID, malformed signature, and signature mismatch
  are rejected before body processing or acceptance persistence.
- Rate and body-size limits apply before expensive producer work.
- Secrets, key IDs, endpoint URLs, signatures, and nonces remain server-only
  and out of general-purpose logs.

Required headers:

| Header | Value |
| --- | --- |
| `X-Prospecta-Key-Id` | Opaque active key identifier |
| `X-Prospecta-Timestamp` | Unix epoch seconds, base 10 |
| `X-Prospecta-Nonce` | Lowercase canonical UUID |
| `X-Prospecta-Signature` | `v1=` plus 64 lowercase hexadecimal characters |

Canonical payload, with each item separated by one LF (`\n`) and no trailing
LF:

```text
PROSPECTA-HMAC-V1
POST
/webhook/prospecta/imports/v1
<timestamp>
<nonce>
<submission_id>
<idempotency_key>
<file_sha256>
prospecting-import-v1
```

The signature is
`hex(HMAC-SHA-256(secret_for_key_id, canonical_payload_utf8))`.
Multipart boundaries, filename, MIME type, and row count are intentionally not
canonicalized; the signed file hash binds the exact bytes, while the producer
independently verifies the received hash before durable acceptance.

Key rotation uses one active signing key and may retain one previous
verification key for at most the approved deployment overlap. Unknown or
retired key IDs fail closed. Rotation never permits a replayed nonce.

## Accepted Response

```json
{
  "schemaVersion": "prospecting-import-acceptance-v1",
  "status": "ACCEPTED",
  "submissionId": "00000000-0000-4000-8000-000000000000",
  "producerBatchId": "opaque-producer-identifier",
  "rowCountAccepted": 120,
  "acceptedAt": "2026-07-03T15:00:00Z"
}
```

Response requirements:

- HTTP status is `202`.
- `submissionId` exactly matches the request.
- `producerBatchId` is non-empty, opaque, stable, and producer-issued.
- `rowCountAccepted` is a non-negative integer with defined header/blank-row
  semantics.
- `acceptedAt` is a producer-generated UTC timestamp.
- No SQL, stack trace, credentials, workflow execution ID, or raw row data is
  returned.

`rowCountAccepted` is the number of logical CSV data records durably accepted
for the producer batch, excluding the single header record and completely
blank records. Embedded newlines inside a quoted record do not create another
record. Acceptance fails rather than returning a count if the producer cannot
parse this boundary deterministically.

## Idempotency

| Condition | Required result |
| --- | --- |
| New organization-scoped key and valid request | One stable acceptance and producer batch |
| Same organization, key, contract version, and file hash | Same acceptance payload; no duplicate batch |
| Same key and different file hash | `409 Conflict` |
| Client timeout with unknown acceptance | Client queries app submission state; no automatic resubmit |
| Producer accepted but app persistence failed | Reconciliation uses the same key/hash; no new batch |

The producer must persist acceptance before returning `202`. The durable
uniqueness key is `(caller_organization, contract_version, idempotency_key)`.
The stored acceptance also binds `submission_id` and `file_sha256`. A replay
that changes either bound value returns `409`; a valid replay uses a fresh HMAC
timestamp/nonce and returns the original acceptance.

## Error Contract

| Status | Meaning |
| --- | --- |
| `400` | Invalid fields or unsupported contract |
| `401` / `403` | Missing/invalid authentication or forbidden caller |
| `409` | Idempotency conflict |
| `413` | File exceeds approved size |
| `429` | Rate limit |
| `503` | Producer unavailable before acceptance |

Errors use a safe, versioned envelope:

```json
{
  "error": {
    "code": "IDEMPOTENCY_CONFLICT",
    "message": "A chave de envio já foi usada com outro arquivo."
  }
}
```

## Producer Guarantees Required Before Approval

- Exactly one acceptance identity per organization/contract/idempotency tuple.
- Stable correlation from `producerBatchId` to every accepted source row.
- At most one approved terminal conclusion per accepted source row.
- Documented terminal and non-terminal result sets.
- Defined handling for duplicate CNPJs and duplicate source rows.
- Defined completion evidence for the whole batch.
- No dependency on the app to call producer database mutation functions.

## Correlation and Completion Facts

The separate ingress/producer must expose approved read-only facts that satisfy
`batch-status-contract.md`:

- one durable batch fact keyed by `producerBatchId`, with the exact
  `submissionId`, file hash, accepted row count, acceptance time, and optional
  explicit closure time;
- one stable accepted row identity for each logical source row;
- every row fact retains `producerBatchId`, `submissionId`, and `sourceRow`;
- materialized lead rows retain the corresponding `leadRunId`;
- at most one terminal outcome per accepted row identity;
- terminal outcomes are the contract-level classes `MATERIALIZED`, `BLOCKED`,
  or `FAILED`, each mapped by the producer owner to explicit producer facts;
- closure is an explicit durable producer fact, never elapsed time or absence
  of events.

The physical producer tables/views are producer-owned and remain an external
implementation decision. The app receives `SELECT` only on the approved
read-model fields.

## Contract Tests

- Valid acceptance.
- Canonical payload golden vectors.
- Unknown key, malformed signature, invalid signature, expired timestamp, and
  excessive future timestamp.
- Nonce replay inside ten minutes and a fresh nonce outside the replay window.
- Same-key/same-hash replay.
- Same-key/different-hash, changed-submission, and changed-contract conflict.
- Oversized and empty files.
- Unsupported encoding, NUL content, extension, MIME, and contract version.
- Received-byte hash mismatch.
- Producer timeout before and after durable acceptance.
- Response schema and sensitive-error redaction.
- Stable batch/submission/row/run correlation.
- Explicit closure with exact, missing, duplicate, conflicting, and excess
  terminal row facts.
