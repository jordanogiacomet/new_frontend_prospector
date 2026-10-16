# Contact Enrichment v2 — specification

Status: approved for repository implementation and synthetic/local verification
on 2026-07-31. External activation is gated by this document.

The 2026-10-13 contact-targeting refinement is implemented locally as
`contact-asset-targeting-v1`. LinkedIn-first integration remains pending the
identified API contract in `../contact-linkedin-first-v1/spec.md`; the existing
provider calls must not be described as LinkedIn queries.

## Outcome

A Prospecta user may request a short list of professional decision-maker
previews for a company in the commercial queue, explicitly select one preview,
and reveal only approved professional contact channels. The browser talks only
to Prospecta. Prospecta owns all durable state. n8n is an isolated integration
edge and Lusha is a provider, never a browser dependency or producer-data
writer.

The PII-free `contact-enrichment-v1` contract and its ledger remain unchanged.
v2 uses separate routes, tables, workflow artifacts, feature gates, and
permissions.

## Requirements

### R1 — purpose and legal basis

- The sole purpose is relevant, one-to-one B2B prospecting of professionals
  responsible for company fixed assets, accounting, finance or explicit
  inventory/physical-asset operations at organizations already
  selected into the commercial queue.
- The intended legal basis is legitimate interest under LGPD arts. 7 IX and
  10, not consent. Before real processing, the controller must complete and
  sign the balance test in `decisions/legitimate-interest-assessment.md` for
  this exact purpose.
- A blanket account or operator approval is not a data subject's consent.
- If the balance test is incomplete, inconclusive, or the data subject's
  rights prevail, real preview, reveal, storage, and exposure stay disabled.
- No sensitive personal data, minors, automated decision making, bulk export,
  mass outreach, CRM synchronization, or automated outreach is authorized.

### R2 — exact allowlisted data

Company request:

- `cnpj_normalizado`: 14 digits, app correlation only;
- `company_domain`: normalized DNS name confirmed by the user. The commercial
  queue may prefill it only from the exact producer source
  `public.crm_company_history.website_domain` when an exact CNPJ match has one
  distinct valid normalized domain. The producer reader selects only `cnpj`
  and `website_domain`; every contact, status and other CRM field remains
  withheld. Missing, invalid or ambiguous values fall back to manual entry.

Company-name fallback, used only when the queue has no approved domain:

- `company_name`: the queue company name, normalized only by trimming and
  whitespace folding, maximum 200 characters;
- `company_city`: the queue city after the same text normalization, maximum
  100 characters, or `null` when unavailable;
- `company_state`: the queue UF as exactly two uppercase ASCII letters, or
  `null` when unavailable;
- `company_country_iso2`: fixed to `BR` for a CNPJ-correlated queue item;
- the producer sector remains a visual comparison fact because Lusha
  Prospecting accepts provider-taxonomy industry IDs, not the producer's
  free-text activity description;
- one durable, organization-scoped `prospecta-contact-company-search-v2`
  request calls Lusha Prospecting Companies once using company name and country
  `Brazil`; city/UF do not exclude provider results;
- the mapper preserves provider order unless one or more returned companies
  match the normalized lead city, or the normalized UF when city is
  unavailable. Matching companies move first while preserving their provider
  order. When none matches, the first provider result remains the fallback;
- the single search may consume an `api_search` credit even when no later
  contact is revealed and is never automatically retried;
- the app stores the provider company reference and the normalized match
  profile under authenticated encryption for 24 hours;
- the browser receives only an app-owned opaque `company_match_id`, company
  name, optional domain, optional industry and city/state/country;
- provider request IDs, billing, credit counts, employee counts, social links,
  `has`, `canReveal`, signals, error messages and the raw provider response are
  excluded;
- a user must explicitly confirm one displayed company match. No score or
  confidence is invented and no result is auto-selected. The confirmed opaque
  ID is resolved and decrypted only by the Prospecta server before Decision
  Makers is called by provider company ID.

Decision-maker preview, maximum 10 selected candidates per request:

- one `contact-asset-targeting-v1` Lusha Decision Makers
  request uses exactly the confirmed domain or server-decrypted provider
  company ID and asks for one provider-ranked sample of up to 100 previews;
- n8n ranks approved fixed-asset/patrimony titles first, accounting,
  controllership and finance titles second, then explicit inventory/stock or
  physical-asset operations titles. It preserves provider order within each
  tier, deduplicates provider contact IDs and omits unrelated generic roles;
- a valid sample with no approved target title returns `PREVIEW_EMPTY` with
  `NO_RELEVANT_MATCHES`, distinct from a genuinely empty provider sample. It
  must not dispatch Apollo or expose the corporate-phone fallback;
- search selection never broadens the existing score bonuses: only the
  original exact aliases qualify for `contact-commercial-score-v1`;
- the request uses no provider table, second page or automatic retry. Decision
  Makers previews are documented as free. Only a structurally valid empty
  Lusha sample may trigger one Apollo Organization Enrichment by the confirmed
  domain; exact returned `primary_domain` is required before one free People
  Search by the returned organization ID. Organization Enrichment consumes one
  Apollo credit when a company is found;
- app-owned opaque `contact_id`;
- encrypted provider contact reference, never returned to the browser;
- `full_name` assembled from the provider's `firstName`/`lastName` or
  `fullName`;
- `job_title`;
- `departments[]`, maximum 5;
- `seniority`;
- `location.city`, `location.state`, `location.country`;
- approved professional LinkedIn URL on `https://www.linkedin.com` or
  `https://linkedin.com`;
- availability booleans `can_reveal_work_email` and
  `can_reveal_business_phone`;
- `source = LUSHA | APOLLO`, `obtained_at`, `expires_at` and list position.
  Apollo's search preview may contain an obfuscated name and has no LinkedIn or
  channel value; only availability is exposed.

Corporate-phone last fallback, only when both person samples are empty:

- the exact-domain Apollo Organization Enrichment response MAY supply one
  `primary_phone.sanitized_number` or `sanitized_phone` in E.164 form;
- the number is a company-level fallback, never a person, candidate or score
  input, and no additional provider or web request is made;
- source is exactly `APOLLO`, contactability is `UNKNOWN`, and the UI shows no
  `tel:` link because the organization response has no DNC assertion;
- the normalized value is encrypted app-owned data retained for 30 days; only
  its keyed phone fingerprint may be retained for suppression matching.

Selected reveal, maximum one selected candidate per user action:

- work email only when provider `type` is exactly `work`;
- email confidence and provider `updateDate`, when valid;
- business phone only when provider `type` is exactly `work` or `direct` and
  `doNotCall` is exactly `false`;
- phone type and provider `updateDate`, when valid;
- `source = LUSHA | APOLLO`, `obtained_at`, `expires_at`. Apollo supports only
  work email in this version and explicitly disables personal email, phone and
  both waterfall options.

Explicitly excluded: private/unknown email, mobile/unknown phone, DNC phone,
coordinates, EU flag, tags, X/Twitter, previous employment, company enrichment
other than the exact-domain corporate-phone fallback above,
provider billing, credit counts, raw `has`/`canReveal`, signals, raw provider
payloads, provider request IDs, prompts, execution IDs and waterfall providers.

### R3 — minimization and human selection

- A company-name lookup and a decision-maker preview are separate actions with
  separate idempotency keys. The lookup never starts merely because a domain
  is missing.
- Lusha Prospecting Companies is a filtered provider directory, not proof of
  legal-entity identity. The request is capped at five results and the UI
  labels them for confirmation, not as a verified CNPJ-to-provider match.
- A company match must be explicitly confirmed before the priority-profile
  Decision Makers sample runs.
- Lusha preview and Apollo People Search are free provider samples, while the
  exact-domain Apollo organization validation can consume one credit. The UI
  discloses the asset, finance and inventory target order, that only original
  exact priority profiles affect
  the derived score, that the sample is not exhaustive and that later channel
  reveal may consume credits.
- Reveal never runs automatically and never reveals all preview candidates.
- The user selects one candidate and one or both channel classes.
- `waterfallReveal` is omitted unconditionally.
- No automatic retry follows a timeout or acceptance-unknown state.

### R4 — permissions and actor source

- `contacts:enrich`: request preview only.
- `contacts:read`: read an approved, unexpired preview or revealed result.
- `contacts:reveal`: request paid reveal for one candidate.
- `contacts:govern`: record suppression, execute erasure, and manage rights
  requests.
- `sensitive:read` grants none of these permissions.
- Normal environments source permissions from the verified individual server
  session. Demo 3 may grant them only to the immutable
  `demo3-preproduction-user` under its exact pre-production runtime gates,
  v2 feature flag, governance approval flag and explicit subject allowlists.
- Every read and mutation is organization-scoped. Actor and organization never
  come from the body.

### R5 — transparency and source of permission

Before first exposure, the UI must name the legal controller, the specific
purpose, legitimate-interest basis, Lusha and Apollo as possible sources, retention periods,
privacy contact, opt-out path, and data-subject rights. These values are
server-owned configuration and exposure fails closed while controller legal
name or privacy contact is absent.

Lusha and Apollo are data sources, not proof of outreach consent. Provider documentation
states it does not collect an active opt-in specifically for a customer's
third-party outreach. Prospecta must establish its own basis and honor local
suppression.

### R6 — retention and erasure

- An encrypted company-match profile and provider reference expire 24 hours
  after collection and are cleared no later than 24 hours after expiry.
- Preview PII expires 30 days after collection.
- Revealed professional channels expire 90 days after collection unless a new,
  separately approved relationship record is created outside this feature.
- A valid opt-out or rights erasure makes PII unavailable immediately and
  irreversibly clears encrypted PII no later than 24 hours after receipt.
- Expired encrypted PII is cleared no later than 24 hours after expiry.
- PII-free request ledger and redacted governance events are retained for 5
  years for accountability.
- Suppression HMACs are retained for 5 years from the most recent request, only
  to prevent recontact. They contain no reversible address or phone value.
- No raw provider body or contact value appears in application/n8n logs,
  audit metadata, analytics, screenshots, fixtures, or error responses.

### R7 — opt-out, do-not-call and rights

- Opt-out may apply to all contact, email only, or phone only.
- A local suppression is checked before provider dispatch, before persistence,
  before reveal, and before every response.
- Provider phone `doNotCall: true` is never stored or displayed; its keyed
  fingerprint is recorded as a phone suppression when technically possible.
- Absence of a DNC field is unknown, never permission to call.
- The corporate-phone fallback therefore remains display-only, has no `tel:`
  action and is not represented as an outreach-ready channel.
- A first contact must disclose controller/source/purpose and provide a simple
  no-cost opt-out path.
- Rights supported: confirmation, access, correction, information on source
  and sharing, opposition, blocking, anonymization where appropriate, deletion
  and revocation where consent is actually used elsewhere.
- Rights requests are tracked without storing the free-form request body in
  audit. Identity verification occurs outside the contact payload.

### R8 — storage and transport

- Durable data is only in the app-owned PostgreSQL schema; there is no foreign
  key to or write into producer data.
- Provider references and normalized PII payloads use authenticated encryption
  at rest with a server-only 256-bit key. Suppression matching uses a distinct
  server-only HMAC key.
- Private responses are `Cache-Control: private, no-store`.
- Browser, URLs, query strings and client telemetry never receive provider IDs,
  secrets or raw payloads.
- Any edge carrying PII must be HTTPS. The current Demo 3 HTTP exception is
  sufficient only for the PII-free v1 flow.
- n8n execution persistence for v2 must be disabled and remotely verified
  before real data is used.

### R9 — idempotency and callbacks

- Company lookup, preview and reveal use separate organization-scoped
  idempotency keys.
- Same key and same canonical input returns the original result; same key with
  different input returns `409`.
- Prospecta records intent before its one outbound attempt.
- Callback authentication is checked before body reading. v2 production
  requires timestamp, nonce, HMAC verification, replay ledger and rate limit.
- Callback body byte count is enforced while reading, not only through
  `Content-Length`.
- An exact result hash may replay as a no-op. A different terminal result
  returns `409`.

### R10 — UI behavior

- “Enriquecer lead / Recuperar contatos” opens a domain confirmation form,
  prefills the single approved producer domain when available, keeps it
  editable, and submits only to a Prospecta route. When no approved domain is
  available, it instead offers an explicit, potentially billable company-name
  lookup while retaining manual domain entry as an alternative.
- The company-name fallback displays the allowlisted company profile and
  the queue name, city/UF and sector reference, then requires an explicit “Usar
  esta empresa” action. It never exposes or accepts a provider company ID in
  browser data.
- A stable idempotency key is shared between desktop and mobile presentations
  for the same lead attempt.
- Preview cards remain separate from producer recommendations and use the label
  “Adequação do contato” only when displaying an app-owned ordering.
- Contacts are fetched only after an explicit “Ver contatos” action.
- The contact action explains that it filters one free sample of up to 100
  provider-ranked decision makers by the approved priority profiles; channel
  reveal remains separate and may consume credits.
- An empty preview means only that no priority profile appeared in that
  provider query. It is not evidence that the company has no such employee.
- Suppressed, DNC, withheld, expired, empty, unknown, error and permission
  states never display `mailto:` or `tel:` links.
- A company-phone fallback is visually separate from decision makers, names
  Apollo as source, labels contactability unknown and never renders the
  commercial-score action when no person candidate exists.

### R11 — real-data and production gates

A real Demo 3 test is limited to one controller-approved company and one
selected contact, has a named operator, records no PII as evidence, validates
HTTPS and n8n no-execution-data first, and erases the test PII immediately
after assertions.

Production rollout additionally requires an identified hostname/namespace,
valid HTTPS certificate, individual OIDC identity and permission source,
machine credentials, HMAC timestamp/nonce/replay and rate limit, reviewed
migration/backup, accountable migration and rollout owners, canary cohort,
monitoring, and a rollback that disables new requests without deleting audit
or changing producer data.

## Acceptance criteria

- AC1: field mappers reject unknown structure and never emit excluded fields.
- AC2: private/unknown email, mobile/unknown/DNC person phone and waterfall
  fields are absent from storage and responses; the exact corporate-phone
  fallback is encrypted, display-only and separately labeled.
- AC3: permission denial occurs before body, DB, crypto or outbound work.
- AC4: suppression and expiry prevent response even with `contacts:read`.
- AC5: idempotency, callback replay, cross-org denial and timeout-unknown paths
  have synthetic tests.
- AC6: migration proves producer isolation, least privilege and append-only
  redacted events against disposable PostgreSQL.
- AC7: UI never calls n8n/Lusha, requires an explicitly confirmed valid domain
  or app-owned company match, and never auto-selects a producer or provider
  value.
- AC8: lint, typecheck, unit, contract, integration and build gates pass.
- AC9: real-data and production commands fail closed while their preflight facts
  are absent.
- AC10: the n8n preview request uses the exact company and one provider sample
  of at most 100; it orders fixed-asset, finance and explicit inventory titles,
  excludes unrelated roles and deduplicates candidates before the cap of 10.
  A non-relevant sample never starts another provider operation. It performs
  no retry/second page and preserves the strict callback allowlist and the
  existing commercial-score rules.
- AC11: only an exact-domain Apollo organization phone may appear after both
  person samples are empty, with no additional call, `tel:` link or score
  effect.

## Authoritative references

- LGPD, arts. 6, 7, 9, 10, 15–18, 37–38 and 46–48:
  https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- ANPD legitimate-interest guide and balance test:
  https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/copy_of_guia_legitimo_interesse.pdf/@@display-file/file
- ANPD data-subject rights:
  https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares
- Lusha v3 Enrich contract:
  https://docs.lusha.com/apis/openapi/enrich
- Lusha v3 Prospecting Companies contract:
  https://docs.lusha.com/apis/openapi/prospecting/prospectingcompanies
- Lusha v3 Decision Makers contract:
  https://docs.lusha.com/apis/openapi/decision-makers
- Lusha outreach/legal-basis guidance:
  https://docs.lusha.com/user-guide/privacy-and-compliance/how-can-i-ensure-compliance-with-privacy-laws-when-using-lushas-data-for-b2b-out
- Lusha opt-out behavior:
  https://docs.lusha.com/user-guide/privacy-and-compliance/opt-out-contacts
