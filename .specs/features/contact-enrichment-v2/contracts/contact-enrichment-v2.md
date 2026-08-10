# Contact enrichment v2 contracts

The JSON schemas are executable in
`src/server/contact-enrichment-v2/contact-enrichment-v2-contract.ts`. This file
records the transport boundary.

## Company search

When no approved domain is available, the browser may explicitly submit the
queue company name, optional city, optional two-letter UF and fixed country
`BR` to Prospecta. Prospecta records an app-owned intent before one
`prospecta-contact-company-search-v2` n8n attempt. n8n responds `202
SEARCH_DISPATCHED` without a match, calls Lusha Prospecting Companies once with
name and available location filters, discards billing and raw response fields,
and callbacks at most five strict company profiles. The producer sector is
shown only for human comparison and is never converted into an unverified
Lusha taxonomy ID.

Provider company IDs and profiles are encrypted for 24 hours. The browser sees
only an opaque `company_match_id` and allowlisted firmographic fields. It must
confirm one match before Prospecta decrypts the provider ID server-side and
sends `PREVIEW_BY_COMPANY_ID`. Lookup, preview and reveal have independent
idempotency keys and none is retried automatically.

## Preview

Prospecta sends one strict request to the HTTPS n8n v2 ingress after durable
intent. n8n authenticates the ingress, validates UUID/CNPJ plus a confirmed
domain or server-only provider company ID, responds
`202 PREVIEW_DISPATCHED` without contact data, then calls Decision Makers once.
The callback contains at most 10 allowlisted normalized candidates. Prospecta
authenticates it before bounded body reading, applies suppression, encrypts the
provider reference/profile, and records a terminal result hash.

## Reveal

The browser supplies only an app-owned `contact_id` and explicit
`work_email`/`business_phone` choices to Prospecta. Prospecta checks permission,
organization, expiry and suppression, decrypts the provider ID server-side,
records intent and makes one n8n attempt. n8n responds `202 REVEAL_DISPATCHED`
without channels and calls Lusha Enrich without `waterfallReveal`.

The callback admits work email and work/direct phone structures only. The app
drops all non-work emails, non-work/direct phones and DNC numbers; DNC produces
only a keyed suppression. Normalized allowed channels are encrypted and expire
in 90 days.

## Error and replay

- malformed/authentication failure: `400`/`401` with safe envelope;
- unknown request: `404`;
- changed idempotent input or terminal callback: `409`;
- timeout/unknown acceptance: durable `*_OUTCOME_UNKNOWN`, no retry;
- exact terminal result hash and timestamp: replay no-op;
- all private responses: `Cache-Control: private, no-store`.
