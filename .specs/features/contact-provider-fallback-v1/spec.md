# Contact Provider Fallback v1 — Specification

Status: approved by the repository owner for staged Demo 3 implementation on
2026-08-10. Production remains target-specific and separately gated.

## Problem

Lusha Decision Makers may return no candidates even for a valid confirmed
company. The existing local ranking already falls back to generic Lusha
decision makers, but cannot recover when the provider sample itself is empty.

## P1 — exact-company Apollo fallback

As a commercial operator, I want a second professional-directory search when
Lusha has no candidate so that an otherwise qualified company does not become
a dead end.

### Acceptance criteria

1. WHEN Lusha returns a successful, structurally valid empty Decision Makers
   sample THEN n8n SHALL perform one Apollo Organization Enrichment operation
   for the confirmed domain. Only an exact returned `primary_domain` match may
   dispatch one Apollo People API Search operation by organization ID.
2. WHEN Lusha fails, times out or returns an unknown outcome THEN n8n SHALL NOT
   call Apollo.
3. Organization Enrichment SHALL use only the confirmed company domain. People
   Search SHALL use only the exact organization ID returned by that validated
   match, page 1, maximum 10 results and leadership seniorities. Neither call
   may search by CNPJ, free text or an unconfirmed company name.
4. A missing, malformed or different `primary_domain` SHALL fail closed with
   the original honest empty result and no People Search call.
5. Valid Apollo candidates SHALL be ordered by the same exact priority aliases,
   then the same adjacent aliases, then provider order for generic leadership.
6. The callback SHALL expose at most 10 allowlisted previews with
   `provider_source = APOLLO`; raw responses, billing, pagination, employer
   payloads and provider request IDs remain excluded.
7. A PREVIEW_BY_COMPANY_ID request SHALL use Apollo only when the encrypted,
   confirmed company match also contains a valid domain. Otherwise its empty
   Lusha result remains honestly empty.
8. Existing callbacks and encrypted Lusha provider references without an
   explicit source SHALL remain readable as Lusha data.

## P1 — selected Apollo email reveal

1. WHEN the user explicitly selects work email for an Apollo candidate THEN
   n8n SHALL perform one People Enrichment request by Apollo person ID with
   personal email, phone and waterfall options disabled.
2. Apollo candidates SHALL never advertise or accept business-phone reveal in
   this version.
3. The mapper SHALL retain at most two syntactically valid business emails and
   SHALL return no phone value. It MAY return only the selected person's
   factual full name and approved LinkedIn profile as a profile update.
4. WHEN phone is requested for an Apollo candidate THEN Prospecta SHALL reject
   the reveal before provider dispatch.
5. Apollo reveal remains subject to the existing encryption, suppression,
   retention, permission, callback authentication and idempotency controls.

## P1 — corporate-phone last fallback

1. WHEN the exact-domain Apollo Organization Enrichment succeeds but the
   subsequent Apollo People Search returns a structurally valid empty sample,
   THEN n8n MAY return one corporate phone already present in that exact
   organization response.
2. The mapper SHALL accept only `primary_phone.sanitized_number` or
   `sanitized_phone` in E.164 form. Raw phone strings, mobile/person phone
   fields, numbers from a mismatched domain and additional provider calls are
   forbidden.
3. A corporate phone SHALL be returned only when both the Lusha and Apollo
   person samples contain no valid candidate. It SHALL be presented separately
   from decision makers and SHALL never affect `contact-commercial-score-v1`.
4. Because the organization endpoint supplies no do-not-call assertion, the
   response SHALL label contactability as unknown and the UI SHALL NOT create a
   `tel:` link or describe the number as permission to call.
5. The application SHALL store the number only under authenticated encryption,
   retain only a keyed phone fingerprint for suppression matching, erase the
   encrypted value after 30 days and exclude it from logs and audit metadata.

## User experience

- The contact area explains the provider order as “Lusha e, se a amostra vier
  vazia, Apollo pela empresa confirmada”.
- Every candidate identifies its factual source.
- A last-resort company number is labeled “Telefone geral da empresa”, source
  Apollo, and is never represented as a person or decision maker.
- Only an exact priority-profile title affects the local commercial score.
- An empty result states that neither provider returned a valid candidate; it
  never claims that the company has no employees or contacts.
- Provider fallback is automatic only after a confirmed Lusha empty result.
  Organization Enrichment consumes one Apollo credit when a company is found;
  People Search is free. Email reveal remains explicit and may consume
  additional Apollo credits.
- Apollo preview names may be provider-obfuscated and LinkedIn is unavailable
  until a selected People Enrichment result supplies it. That selected profile
  update and its channels commit in the same app-owned transaction.

## Out of scope

| Item | Reason |
| --- | --- |
| Google/Bing scraping | Uncontrolled identity matching and unstable contract |
| Invented role mailboxes | An address pattern is not a factual contact |
| Apollo personal email | Outside the approved professional-channel allowlist |
| Apollo phone | Asynchronous flow and inconclusive DNC do not meet v2 policy |
| Apollo waterfall enrichment | Separate providers/costs are not approved here |
| Producer contact history | Its contact columns remain outside producer grants |
| Automatic retry | An unknown acceptance remains unknown |
| Producer score mutation | Producer facts remain immutable |

## Requirements traceability

| Requirement | Verification | Status |
| --- | --- | --- |
| CPF-01: Apollo only after confirmed Lusha empty | Executable workflow contract | Verified |
| CPF-02: exact company domain and organization ID | Organization mapper contract with mismatched-domain cases | Verified |
| CPF-03: shared three-tier ordering | Source/embedded-title contract | Verified |
| CPF-04: strict Apollo preview allowlist | Contract and policy tests | Verified |
| CPF-05: explicit work-email-only reveal | Service, workflow and component tests | Verified |
| CPF-06: encrypted provider source and Lusha compatibility | Service/repository tests | Verified |
| CPF-07: honest copy, source and exact-only score | Component tests | Verified |
| CPF-08: no raw payload, retry or producer mutation | Static and full regression gates | Verified |
| CPF-09: corporate phone only after both person samples are empty | Workflow and callback contract tests | Verified |
| CPF-10: encrypted request-scoped storage and 30-day erasure | Repository, migration and policy tests | Verified |
| CPF-11: separate non-callable UI with no score effect | Component tests | Verified |

## Authoritative provider references

- Apollo People API Search:
  https://docs.apollo.io/reference/people-api-search
- Apollo People Enrichment:
  https://docs.apollo.io/reference/people-enrichment
- Apollo Organization Enrichment:
  https://docs.apollo.io/reference/organization-enrichment
- Lusha Decision Makers:
  https://docs.lusha.com/apis/openapi/decision-makers
