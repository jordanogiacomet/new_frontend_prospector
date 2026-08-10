# Contact Enrichment v1 Design

**Spec:** `.specs/features/contact-enrichment-v1/spec.md`

**Status:** PII-free Demo 3 design deployed and synthetic UAT verified

## Architecture Overview

This design supplies the repository and runtime boundary for the exact Demo 3
profile. The app migration, operator-owned credentials, and an imported n8n
copy were separately deployed/activated on 2026-07-31 and verified with
synthetic values. It still does not expose contacts, use real data, or change
the commercial-queue button.

```text
Browser
  └─ remains on the unavailable commercial-queue action

Prospecta POST /api/contact-enrichment
  ├─ authenticated Demo 3 actor + contacts:enrich + same origin
  ├─ app-owned durable hash-only idempotency record
  └─ one authenticated call to the versioned n8n webhook
       ├─ immediate PII-free 202
       ├─ Lusha Decision Makers through manually bound n8n credential
       └─ minimal authenticated callback to Prospecta

Prospecta POST /api/contact-enrichment/callback
  ├─ dedicated machine secret checked before JSON/database work
  ├─ strict PII-free callback schema
  └─ correlated terminal status + append-only event or replay conflict

Producer PostgreSQL / current import workflow
  └─ no connection, read, write, or change
```

The n8n artifact validates and immediately discards `cnpj_normalizado`. It
uses the approved domain only to form the Lusha Decision Makers request.
The transient Lusha response is reduced to an allowlisted status; neither a
preview nor a reveal may leave the workflow.

## Reference Review

The received JSON identifies itself as **“Prospecta - Lusha Decision Makers
Preview - Base v0.1”**, not “Reveal Selected Contact”. It is an inactive
reference only. It cannot be imported as Prospecta runtime design because it:

| Observed reference behavior | v1 design response |
| --- | --- |
| Has an unauthenticated webhook | Require a manually bound n8n `httpHeaderAuth` ingress credential. |
| Uses `$env.LUSHA_API_KEY` | Use generic n8n header credentials; no key value or credential binding in Git. |
| Requires a domain but accepts/moves company/contact fields | Require a domain and discard the validated CNPJ before the provider node. |
| Returns a synchronous contact preview containing names and profile data | Initial `202` and callback have exact non-PII field sets only. |
| Traverses/ranks contact response objects | Do not inspect or return individual contact values; output only an honest withheld/unknown state. |
| Has no callback to Prospecta | Reserve a non-routable callback configuration that requires header authentication. |

The design deliberately does not use the Lusha contact-reveal operation. It
would require a selected Lusha contact identifier and may return email/phone
content; both are outside the current contact policy.

## Code Reuse Analysis

| Existing component or pattern | Location | v1 use |
| --- | --- | --- |
| Import intent → one ingress call → unknown outcome | `src/server/imports/submit-import.ts:submitImport()` | Reuse the durable-intent and no-automatic-retry pattern in a separate contact module. |
| n8n timeout without retry | `src/server/imports/ingress-client.ts:submitToN8nIngress()` | Preserve an unknown outcome instead of retrying. |
| Machine callback authentication and strict Zod parsing | `src/app/api/imports/events/route.ts:POST()` | Reuse auth-before-body and strict-schema behavior in a distinct route/secret. |
| Fail-closed granular permission boundary | `src/server/auth/authorization.ts:createDevelopmentAuthorization()` | Add `contacts:enrich` only to the exact feature-gated Demo 3 actor. |
| Allowlisted audit metadata | `src/server/commercial/audit-repository.ts` and `db/app/001_app_schema_forward.sql` | Add a dedicated hash-only ledger and append-only event table; do not extend free-form commercial metadata. |
| Inactive, secret-free n8n package | `integrations/n8n/prospecting-import-v1/` | Directory/package layout and artifact-test style only; import workflow behavior is not reused. |
| Static n8n artifact checks | `tests/contract/n8n-import-workflow-artifact.contract.test.ts` | Test style for parsing artifact JSON without a remote n8n target. |
| Unavailable enrichment action | `src/app/(private)/work-queue/page.tsx:LeadEnrichmentAction()` | Deliberately unchanged. Its test proves no second request is made. |

## Artifact Components

### Contract document

- **Location:** `.specs/features/contact-enrichment-v1/contracts/contact-enrichment-v1.md`
- **Purpose:** Single source for request, initial response, callback, failure,
  idempotency, and PII constraints.
- **Dependencies:** Sensitive-content policy, authorization policy, and the
  current Lusha Decision Makers documentation.
- **Reuses:** Import contract conventions, while explicitly not extending the
  import endpoint or internal HTTP exception.

### Inactive n8n workflow

- **Location:** `integrations/n8n/prospecting-contact-enrichment-v1/workflow.json`
- **Purpose:** Reviewable non-active export that describes the intended
  authenticated flow.
- **Interfaces:**
  - Inbound request: strict versioned JSON fields defined in the contract.
  - Initial response: exact safe `202` envelope.
  - Provider request: domain + opaque `request_id` only, through native
    `httpHeaderAuth` binding.
  - Callback: exact safe fields, through a different native
    `httpHeaderAuth` binding.
- **Dependencies:** Manual credentials and a non-production target after later
  approval. Neither appears in the artifact.
- **Reuses:** Node/version conventions in
  `integrations/n8n/prospecting-import-v1/workflow.json`.

### Workflow contract and operator README

- **Location:** `integrations/n8n/prospecting-contact-enrichment-v1/workflow-contract.json`
  and `README.md`
- **Purpose:** Keep safe interfaces machine-testable and configuration steps
  operator-owned.
- **Dependencies:** The inactive workflow only; no environment variable,
  secret manager, database, or deployment configuration.

### Synthetic contract test

- **Location:** `tests/contract/contact-enrichment-v1.contract.test.ts`
- **Purpose:** Verify artifact invariants and state-machine expectations with
  static/synthetic values.
- **Reuses:** Vitest node contract profile and import-artifact parser pattern.

## Interfaces

### Server-to-n8n request

Only the authenticated Prospecta server may construct this body. The
browser never constructs or sends it.

| Field | Validation | Boundary use |
| --- | --- | --- |
| `contract_version` | Exact `prospecta-contact-enrichment-v1` | Version gate |
| `request_id` | UUID | Opaque correlation only |
| `idempotency_key` | Trimmed text, 1–128 chars | Future app-ledger comparison only; discarded by n8n before Lusha |
| `cnpj_normalizado` | Exactly 14 digits | Validated and discarded; never sent to Lusha/callback/logs |
| `company_domain` | Lowercase hostname, no protocol/path/query/port | Sole Lusha company identifier in this design |

`company_domain` is required because the documented Decision Makers endpoint
accepts a domain or Lusha company ID, not CNPJ. This feature intentionally has
no domain-discovery fallback.

### Initial n8n response

```json
{
  "contract_version": "prospecta-contact-enrichment-v1",
  "request_id": "UUID",
  "status": "ENRICHMENT_DISPATCHED"
}
```

HTTP `202` only acknowledges that the imported Demo 3 workflow dispatched
after validation. It is never evidence of provider success, contact discovery,
durable provider persistence, or contact permission.

### n8n-to-Prospecta callback

```json
{
  "contract_version": "prospecta-contact-enrichment-v1",
  "request_id": "UUID",
  "status": "COMPLETED_WITHHELD",
  "occurred_at": "2026-01-01T00:00:00.000Z",
  "contact_count": null
}
```

`status` may instead be `PROVIDER_OUTCOME_UNKNOWN`. `contact_count` is always
`null` in this stage; zero must never be inferred from an unavailable or
withheld provider response.

## Data Model

Migration `009` owns two organization-scoped app tables:

| Table | Stored facts | Explicitly absent |
| --- | --- | --- |
| `contact_enrichment_requests` | request UUID, organization, actor subject, SHA-256 idempotency/input hashes, safe status, request/update/provider timestamps | CNPJ, domain, idempotency key, contact/provider fields, raw callback |
| `contact_enrichment_events` | event UUID, organization, request UUID, actor category, safe event type, timestamp | JSON metadata, request body, provider response, contact count |

The request row is the mutable current ledger under constrained transitions.
Events are append-only and commit in the same transaction as state changes.
The rollback refuses to discard recorded history. Both tables are app-owned,
have no producer foreign key, and grant no delete capability to the runtime
role.

## Error Handling Strategy

| Scenario | Artifact behavior | Future app behavior | User-visible claim |
| --- | --- | --- | --- |
| Ingress auth failure | n8n rejects before code/provider | Safe authorization failure | None from this artifact |
| Invalid request ID/CNPJ/domain | Safe validation error before Lusha | Reject before dispatch | No provider call |
| Lusha timeout/non-success/malformed response | `PROVIDER_OUTCOME_UNKNOWN`, no retry | Preserve unknown; no automatic retry | No successful enrichment claim |
| Invalid/unauthenticated callback | Future receiver rejects it | No state change | No status inferred |
| Provider response with contact fields | Drop all fields | Do not log/audit/store/expose | Content withheld |
| Duplicate application action | Not solved by n8n | App ledger returns existing safe result or `409` | No duplicate provider call |

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Provider operation | Lusha Decision Makers only; no contact reveal | It accepts domain/company ID and a reveal is policy-blocked. |
| Authentication | Native n8n `httpHeaderAuth` for ingress, Lusha, and callback | Keeps credentials in n8n; artifact carries neither secrets nor environment variables. |
| Ingress target | Exact Demo 3 URL supplied by the owner | The server env validator accepts this HTTP exception only for `192.168.0.20:30098` and the exact path. |
| Callback target | `http://192.168.0.20:30100/api/contact-enrichment/callback` | Exact local Demo 3 route; n8n must use its dedicated header-auth credential. |
| Provider result | `COMPLETED_WITHHELD` or `PROVIDER_OUTCOME_UNKNOWN`; count `null` | Represents the contact policy and unavailable measurement honestly. |
| Idempotency | Prospecta app ledger, not n8n | The app persists intent before the only permitted outbound attempt. |
| Retry | Disabled | A timeout/unknown outcome cannot be safely replayed. |
| Audit | Dedicated append-only PII-free event table | Avoids widening commercial audit JSON allowlists and forbids raw bodies by schema. |
| Contact retention | Zero | No contact value crosses the callback or app persistence boundary until policy approval. |
