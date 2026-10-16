# Contact Enrichment v2 — design

## Boundaries

```text
Browser
  -> Prospecta private API (individual/Demo3-approved actor)
  -> app-owned PostgreSQL (ledger, encrypted normalized PII, suppression)
  -> authenticated n8n v2 ingress (one attempt)
  -> Lusha v3 Decision Makers or Enrich (native n8n credential)
  -> Apollo Organization/People Search only after confirmed Lusha empty
     or Apollo People Enrichment after human selection (native credential)
  -> authenticated Prospecta v2 callback
```

There is no browser-to-n8n/Lusha edge and no producer mutation. v1 stays
PII-free and compatible.

## Phases

1. `COMPANY_SEARCH`: CNPJ plus company name and Brazilian location request,
   Prospecting Companies, encrypted app-owned match and strict non-contact
   callback.
2. `PREVIEW`: CNPJ plus confirmed domain or opaque company-match ID, one
   `contact-asset-targeting-v1` request for one ranked sample of up to 100.
   The mapper places fixed-asset/patrimony roles first, accounting,
   controllership and finance roles second, and explicit inventory/stock or
   physical-asset operations roles third. Unrelated generic roles are omitted;
   provider IDs are deduplicated before the cap of 10. `NO_RELEVANT_MATCHES`
   does not start the empty-provider fallback. A provider company ID is
   decrypted only server-side and never crosses the browser boundary. Only the
   exact aliases are shared with the commercial-score contract; there is no
   retry or second page. A structurally valid empty Lusha sample may invoke
   `contact-provider-fallback-v1`: one exact-domain Apollo organization match,
   followed only on an exact `primary_domain` match by one People Search using
   the returned organization ID. If that People Search is also structurally
   empty, the mapper may carry one sanitized corporate phone already present in
   the exact organization response; it remains separate from candidates.

   LinkedIn as the first source requires the still-unidentified API contract
   recorded in `../contact-linkedin-first-v1/spec.md`; no current provider
   operation is relabeled or activated by this local refinement.
3. `REVEAL`: one app contact ID, explicit channels, provider ID and provider
   source decrypted only server-side, provider-specific Enrich, strict reveal
   callback. Apollo accepts work email only; personal email, phone and
   waterfall options remain disabled.
4. `GOVERN`: response-time policy, field/channel suppression, rights and
   irreversible encrypted-payload clearing.

## Storage

Migration 010 adds separate v2 request, candidate, reveal, contact,
suppression, rights and governance-event tables. Migration 011 adds the
company-search ledger and encrypted match table and permits a preview request
to reference exactly one confirmed domain or company match. Migration 012 adds
one request-scoped encrypted corporate-phone fallback with a keyed suppression
fingerprint and 30-day erasure. Provider
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
