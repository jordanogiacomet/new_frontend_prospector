# Contact enrichment v2 contracts

The JSON schemas are executable in
`src/server/contact-enrichment-v2/contact-enrichment-v2-contract.ts`. This file
records the transport boundary.

## Safe search feedback

Company-search and preview callbacks may include optional `search_diagnostics`.
It contains up to four unique provider/stage facts with exactly `provider`,
`stage` and `code`, using the executable allowlist in the schema. It contains no
free-form message, HTTP body, provider ID, contact value, credit balance or
secret. Callbacks without this field preserve their existing result hash and
remain compatible; no reason is inferred for those historical results.

Prospecta commits these facts with the terminal result in the organization-
scoped request ledger through migration 017. Read responses expose only the
validated codes as `searchDiagnostics`; browser copy uses a fixed dictionary.
Diagnostics do not change producer recommendations or grant contact access.
Migration 018 permits `NO_RELEVANT_MATCHES` only for `CONTACT_PREVIEW`: the
provider returned valid people, but none had an approved target title. This
observation is not an empty provider sample and never starts Apollo fallback.
HTTP access denial and rate limits remain distinct from confirmed empty
samples. A timeout or unvalidated result retains an unknown business outcome;
consulting the request does not resubmit it. An Apollo company that cannot be
confirmed preserves the prior empty observation and explains why the people
search was skipped. Full requirements and rollout boundaries are in
`.specs/features/contact-search-feedback-v1/spec.md`.

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
`202 PREVIEW_DISPATCHED` without contact data, then calls Decision Makers once
with the exact company and asks for one ranked sample of up to 100 free
previews. Under
`contact-asset-targeting-v1`, n8n callbacks at most 10 allowlisted normalized
candidates: fixed-asset/patrimony titles first, accounting, controllership and
finance titles second, then explicit inventory/stock or physical-asset
operations titles. Unrelated generic roles are excluded, IDs are deduplicated
before the cap and provider order is preserved inside each tier. The original
commercial-score aliases and bonuses are unchanged. It does not save to a
provider table, reveal channels, retry
automatically or request another page. Only a structurally valid empty Lusha
sample may start `contact-provider-fallback-v1`: n8n enriches the confirmed
domain as one Apollo organization, requires exact returned `primary_domain`,
then performs one free People Search using the returned organization ID. An
Apollo organization mismatch callbacks the original honest empty result and
does not search people. If the exact People Search is structurally empty, the
callback may include one E.164 corporate number already returned as
`primary_phone.sanitized_number` or `sanitized_phone` by that same organization
operation. The app encrypts it for 30 days, labels contactability unknown and
does not treat it as a candidate or score input.
Prospecta authenticates it before bounded body reading, applies suppression,
encrypts the provider reference/profile, and records a terminal result hash.

## Reveal

The browser supplies only an app-owned `contact_id` and explicit
`work_email`/`business_phone` choices to Prospecta. Prospecta checks permission,
organization, expiry and suppression, decrypts the provider ID server-side,
records intent and makes one n8n attempt. n8n responds `202 REVEAL_DISPATCHED`
without channels and calls the matching provider. Lusha Enrich omits
`waterfallReveal`. Apollo People Enrichment uses the encrypted Apollo ID and
forces personal email, phone and both waterfall options to false; only an
explicit work-email selection is accepted.

The callback admits work email and work/direct phone structures only. The app
drops all non-work emails, non-work/direct phones and DNC numbers; DNC produces
only a keyed suppression. Normalized allowed channels are encrypted and expire
in 90 days.

The private preview GET may project `candidate.reveal` from the latest
organization-, preview-request- and contact-scoped app-owned recovery ledger.
The projection contains only `revealRequestId`, the persisted recovery
`status`, the explicit `requestedChannels`, `requestedAt`, `updatedAt`, and
`channelsMatchResult`. The latter is true only when the returned channel
record belongs to that exact recovery. It contains no provider references,
payloads, diagnostic guesses, identifiers from providers, or extra personal
data. Missing recovery facts are `null`; withheld transparency still withholds
the candidate projection. No new provider call or callback contract is added.

The browser validates the correlated preview/recovery IDs and business status
as well as HTTP. Recorded/dispatched/unknown states instruct the operator to
consult the existing preview by GET. `REVEAL_EMPTY` is an explicit persisted
result and does not imply that the person lacks an email or phone. Completion
requires `REVEAL_AVAILABLE`, available governed channels linked to the recovery,
and at least one channel for every explicit selection. A linked result with
only some selected channels is partial; unavailable or unlinked channels do
not establish completion or a cause. An absent diagnosis is “Motivo não
informado”. Recovery failures preserve candidates and human channel choices,
remain next to the affected action, and never redispatch automatically.

## Error and replay

- malformed/authentication failure: `400`/`401` with safe envelope;
- unknown request: `404`;
- changed idempotent input or terminal callback: `409`;
- timeout/unknown acceptance: durable `*_OUTCOME_UNKNOWN`, no retry;
- exact terminal result hash and timestamp: replay no-op;
- all private responses: `Cache-Control: private, no-store`.
