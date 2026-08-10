# Contact Enrichment v1 Contract

**Contract version:** `prospecta-contact-enrichment-v1`

**Status:** Approved PII-free Demo 3 application contract. Exact-target
deployment, credential binding, activation, and synthetic UAT completed on
2026-07-31; contact exposure and production remain blocked.

## Scope

This contract describes the approved Demo 3 server-to-server enrichment
dispatch. The browser never receives a n8n
URL, Lusha URL, credential, provider response, contact preview, or reveal.

The existing `POST /api/imports/events` callback is import-specific and is not
part of this contract.

The application endpoints are authenticated same-origin
`POST /api/contact-enrichment` for a `contacts:enrich` actor and
machine-authenticated `POST /api/contact-enrichment/callback`. Both return
private, no-store envelopes and neither returns contact content.

## Inbound n8n Request

### Authentication

The n8n Webhook node requires `headerAuth` with a manually selected native
`httpHeaderAuth` credential. The export contains no credential object, header
name, header value, API key, environment variable, or target-specific secret.

Unauthenticated requests must be rejected by n8n before request parsing or a
provider node. The header name is
`X-Prospecta-Contact-Enrichment-Secret`; its value remains server-only and
absent from the repository. The exact approved Demo 3 URL is
`http://192.168.0.20:30098/webhook/prospecta/lusha/decision-makers`.

### Exact JSON body

```json
{
  "contract_version": "prospecta-contact-enrichment-v1",
  "request_id": "00000000-0000-4000-8000-000000000001",
  "idempotency_key": "synthetic-request-key",
  "cnpj_normalizado": "12345678000195",
  "company_domain": "empresa-sintetica.example"
}
```

| Field | Rule | n8n retention/use |
| --- | --- | --- |
| `contract_version` | Exactly the contract version | Validate and retain as protocol metadata. |
| `request_id` | RFC 4122 UUID | Retain only for the safe response/callback correlation. |
| `idempotency_key` | Trimmed text, 1–128 characters | Validate, then discard before the provider node. |
| `cnpj_normalizado` | Exactly 14 ASCII digits | Validate, then discard before the provider node. |
| `company_domain` | Lowercase hostname; no scheme, path, query, fragment, port, credentials, or whitespace | Use as the only provider company identifier. |

The node rejects any missing, extra, malformed, or mismatched-version field
with a safe `INVALID_ENRICHMENT_REQUEST` category. It must not echo the input
body or the rejected field value.

### Initial response

The response is sent from a Respond to Webhook node before the provider call.

```json
{
  "contract_version": "prospecta-contact-enrichment-v1",
  "request_id": "00000000-0000-4000-8000-000000000001",
  "status": "ENRICHMENT_DISPATCHED"
}
```

| Property | Required value |
| --- | --- |
| HTTP status | `202` |
| Response fields | Exactly `contract_version`, `request_id`, `status` |
| Contact fields | None |
| Meaning | Valid n8n dispatch only; not provider success, durable app storage, a count, or permission to view contacts. |

## Lusha Operation

The inactive artifact describes one `POST` to
`https://api.lusha.com/v3/contacts/decision-makers`. This is configuration in a
disabled repository export, not a request made by Prospecta or Codex.

| Concern | Requirement |
| --- | --- |
| Authentication | HTTP Request node uses `genericCredentialType` with `httpHeaderAuth`; the credential must be manually bound in n8n after separate approval. |
| Provider input | The request has only `company_domain` and opaque `request_id` correlation. It must not include CNPJ, idempotency key, actor, organization, contact identifiers, or user data. |
| Provider operation | Decision Makers only. Lusha contact preview/reveal output is not an allowed Prospecta result. |
| Response handling | Reduce response transiently to `COMPLETED_WITHHELD` or `PROVIDER_OUTCOME_UNKNOWN`; do not map any response property into output. |
| Timeout | The workflow has a finite timeout and `retryOnFail: false`. A timeout is unknown, not failure/completion. |
| Cost/billing | Do not request, expose, persist, or audit billing/credit data. |

The Decision Makers provider endpoint requires a company domain or Lusha company
ID. This contract chooses a validated domain and explicitly prohibits CNPJ
lookup, company search, contact selection, and Lusha contact reveal.

## Callback to Prospecta

### Target and authentication

The Demo 3 artifact uses exactly
`http://192.168.0.20:30100/api/contact-enrichment/callback`.

The callback HTTP Request node requires a separately manually bound native
`httpHeaderAuth` credential. It must never share the inbound or Lusha
credential by default. The header name is
`X-Prospecta-Contact-Callback-Secret`; authentication is evaluated before body
parsing or persistence.

### Exact callback body

```json
{
  "contract_version": "prospecta-contact-enrichment-v1",
  "request_id": "00000000-0000-4000-8000-000000000001",
  "status": "COMPLETED_WITHHELD",
  "occurred_at": "2026-01-01T00:00:00.000Z",
  "contact_count": null
}
```

| Field | Rule |
| --- | --- |
| `contract_version` | Exact contract version. |
| `request_id` | Valid UUID for a previously recorded app request. |
| `status` | Exactly `COMPLETED_WITHHELD` or `PROVIDER_OUTCOME_UNKNOWN`. |
| `occurred_at` | Offset-aware RFC 3339 timestamp. |
| `contact_count` | Always `null` in v1 preparation. It must never be replaced with an inferred zero. |

The receiver must reject a callback that has missing/extra fields,
invalid types, unknown status/version, unauthenticated machine credential,
unknown organization-scoped request, replay conflict, or body larger than its
approved limit. A rejected callback records no inferred enrichment state.

## Idempotency and Retry Contract

The n8n artifact has no database, Data Store, cache, or ledger node. The
Prospecta app-owned ledger implements idempotency before its one permitted n8n
dispatch:

| Situation | Required app behavior |
| --- | --- |
| Same organization, idempotency key, and immutable input fingerprint | Return the existing safe app result; do not dispatch n8n again. |
| Same organization/key with a different input fingerprint | Return `409` before n8n work. |
| N8n/Lusha timeout or callback absence | Persist an honest unknown state; no automatic/background retry. |
| Callback replay with the same validated immutable result | Return the existing safe result without another event. |
| Callback replay with different result | Reject as a conflict; do not overwrite history. |

An n8n duplicate webhook delivery is not proof of idempotency and must not be
used as a workaround for a missing app ledger. Manual reprocessing/retry is
outside scope.

## PII, Logging, Audit, and Execution Retention

The following must never be included in an initial response, callback,
app-owned audit metadata, log statement, workflow output, pinned data, or
stored n8n execution data:

- contact name or surname;
- email address;
- telephone/mobile/direct dial;
- contact ID or profile/link;
- job title, location, seniority, department, `has`, or `canReveal` value;
- raw/normalized Lusha request or response;
- provider billing, credits, API key, header value, secret, or credential ID;
- CNPJ and idempotency key.

The workflow settings disable data retention for successful, failed, and manual
executions. Its Code nodes contain no `console`, logging, SQL, database, or
producer calls. The app ledger contains only hashes, opaque request/event IDs,
safe state categories, actor categories, and timestamps. It never stores the
request/callback body or a contact/provider value. Contact PII retention is
zero until a separate policy is approved.

## Status Semantics

| Status | Fact source | Meaning |
| --- | --- | --- |
| `ENRICHMENT_DISPATCHED` | n8n validation path | Safe initial acknowledgement only. |
| `COMPLETED_WITHHELD` | Provider request completed without a surfaced result | No contact content/count is visible, stored, or implied. |
| `PROVIDER_OUTCOME_UNKNOWN` | Timeout, malformed, or non-success provider outcome | No success/failure/completion is inferred. |

There is no `NO_CONTACTS`, `COMPLETED`, `REVEALED`, `CONTACT_FOUND`, or
`CONTACT_SELECTED` state in this contract.

## Operational State and Remaining Gates

Items 1–4 below were separately approved and evidenced on 2026-07-31 for the
exact Demo 3 profile:

1. accountable n8n/Lusha operator and inspection/rollback owner;
2. three distinct credentials bound outside Git for ingress, Lusha, and
   callback;
3. explicit n8n import/activation and Demo 3 deployment/migration execution;
4. synthetic evidence for authorization order, callback validation,
   idempotency, unknown outcomes, and PII withholding.

Contact exposure remains blocked until a separate LGPD, retention, deletion,
opt-out/do-not-call, UI-purpose, pricing/quota, and vendor-processing policy is
approved. Production retains all independent HTTPS, identity, security,
migration, rollout, and rollback gates.
