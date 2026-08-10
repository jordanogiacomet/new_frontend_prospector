# Contact Enrichment v2 — design

## Boundaries

```text
Browser
  -> Prospecta private API (individual/Demo3-approved actor)
  -> app-owned PostgreSQL (ledger, encrypted normalized PII, suppression)
  -> authenticated n8n v2 ingress (one attempt)
  -> Lusha v3 Decision Makers or Enrich (native n8n credential)
  -> authenticated Prospecta v2 callback
```

There is no browser-to-n8n/Lusha edge and no producer mutation. v1 stays
PII-free and compatible.

## Phases

1. `COMPANY_SEARCH`: CNPJ plus company name and Brazilian location request,
   Prospecting Companies, encrypted app-owned match and strict non-contact
   callback.
2. `PREVIEW`: CNPJ plus confirmed domain or opaque company-match ID, Decision
   Makers, strict preview callback. A provider company ID is decrypted only
   server-side and never crosses the browser boundary.
3. `REVEAL`: one app contact ID, explicit channels, provider ID decrypted only
   server-side, Enrich, strict reveal callback.
4. `GOVERN`: response-time policy, field/channel suppression, rights and
   irreversible encrypted-payload clearing.

## Storage

Migration 010 adds separate v2 request, candidate, reveal, contact,
suppression, rights and governance-event tables. Migration 011 adds the
company-search ledger and encrypted match table and permits a preview request
to reference exactly one confirmed domain or company match. Provider
references, company-match profiles and normalized PII are encrypted with
AES-256-GCM. A distinct HMAC-SHA-256 key creates stable suppression
fingerprints. Encryption keys and key IDs are server-only; rows carry a key ID
to support rotation.

No table has a producer foreign key. Audit/governance events store only opaque
app IDs, event type, actor category and timestamps.

## Contracts

- `prospecta-contact-company-search-v2`
- `prospecta-contact-enrichment-preview-v2`
- `prospecta-contact-enrichment-preview-by-company-id-v1`
- `prospecta-contact-enrichment-reveal-v2`

All accept safe `202` acknowledgements without company or contact results.
Callbacks are bounded,
strict and hash-correlated. Provider bodies are mapped inside n8n to exact
allowlisted callback objects and never forwarded raw.

## Security gates

v2 requires its own feature flag, permissions, read/govern subject allowlists,
controller transparency configuration, encryption/HMAC keys and HTTPS n8n/app
callback URLs. The Demo 3 plain-HTTP exception is rejected for v2 PII.

Production additionally uses a timestamp, nonce and HMAC signature over exact
bytes, a durable replay ledger and per-organization/actor rate limit. The repo
artifact describes these controls but stays inactive until its remotely tested
contract exists.

## Failure semantics

- Intent is durable before one outbound attempt.
- Timeout is `*_OUTCOME_UNKNOWN`; there is no automatic retry.
- Exact idempotent replay returns the existing record.
- Changed input/result returns `409`.
- Suppressed/expired/erased data is withheld, not represented as missing or
  empty.
- Invalid provider structure yields a safe failed state with no partial PII.
