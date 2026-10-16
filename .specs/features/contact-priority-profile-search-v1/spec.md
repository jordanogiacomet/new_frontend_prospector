# Contact Priority Profile Search v1

Status: Demo 3 three-tier fallback implemented and verified on 2026-08-10
after provider entitlement verification.

## Problem

The upstream-filtered Contacts Prospecting implementation returned HTTP `403`
with the approved Demo 3 Lusha credential, while the same credential continued
to perform approved V3 company searches. The provider documents `403` for an
inactive account, unavailable V3 access or a feature excluded from the plan;
the working V3 company operation isolates the current limitation to contact
prospecting entitlement. Demo 3 therefore needs an honest compatible fallback.

## P1 — search the same priority profiles used by the score

As a commercial operator, I want the contact preview to search the confirmed
company for the approved finance and accounting profiles so that the preview
and the derived commercial score use the same business criterion.

Acceptance criteria:

1. WHEN a confirmed domain or app-owned company match starts `PREVIEW` THEN
   n8n SHALL make one `POST /v3/contacts/decision-makers` request.
2. The request SHALL identify exactly the confirmed domain or the
   server-decrypted Lusha company ID and request page 0 with size 100.
3. The mapper SHALL rank exact aliases used by
   `contact-commercial-score-v1` first, then versioned adjacent
   finance/accounting roles, preserving provider order inside each tier.
4. WHEN neither an exact nor adjacent valid candidate exists THEN the mapper
   SHALL return the first valid Decision Makers candidates in provider order.
   Generic fallback SHALL NOT be mixed into a result that already has an exact
   or adjacent candidate.
5. The callback SHALL contain at most 10 allowlisted candidates after tier
   selection, without duplicates.
6. The request SHALL NOT use a provider table, reveal channels, automatically
   retry, request another page or issue a second provider operation.
7. WHEN no valid returned decision maker exists THEN the callback SHALL be
   `PREVIEW_EMPTY` and the UI SHALL describe only the provider sample, never
   claim the company has no professional contact.
8. The UI SHALL identify Decision Makers as a free preview, explain the three
   tiers, disclose that only exact priority profiles affect the derived score,
   and disclose that a later human-selected channel reveal remains separate
   and may consume credits.

## Priority profiles

`priority-adjacent-generic-decision-makers-fallback-v1` first filters the
returned sample with the Portuguese and English aliases for:

- Diretor Financeiro and Controller;
- Gerente Contabil;
- Coordenador Contabil;
- Supervisor Contabil;
- Analista or Assistente Contabil;
- Analista or Assistente de Patrimonio/fixed assets.

The executable alias list is exported by
`src/lib/contact-commercial-score.ts:CONTACT_PRIORITY_PROFILE_SEARCH_TITLES`.
Contract tests require the embedded n8n request list to equal that source.

## Adjacent and generic fallback

The second tier includes versioned Portuguese and English aliases for CFO,
finance leadership/operations, accounting leadership, treasury, tax/fiscal and
financial planning roles. Its executable list is exported by
`src/lib/contact-commercial-score.ts:CONTACT_ADJACENT_PROFILE_SEARCH_TITLES`
and contract tests require the embedded n8n list to equal that source.

If neither tier contains a valid candidate, the mapper returns the provider's
first valid candidates. Adjacent and generic candidates are display/reveal
fallbacks only: `contact-commercial-score-v1` continues to score exact
priority aliases and therefore does not silently broaden commercial scoring.

## Out of scope

| Feature | Reason |
| --- | --- |
| Contacts Prospecting | The approved Demo 3 credential receives provider `403`; enablement remains the preferred future path |
| More Decision Makers pages | It would be another provider operation and violate the single-attempt boundary |
| Provider score or recommendation mutation | Producer facts remain immutable |
| Automatic channel reveal | Reveal remains a separate human-selected action |
| New storage or transport fields | The existing encrypted v2 callback contract remains sufficient |

## Requirement traceability

| Requirement | Verification | Status |
| --- | --- | --- |
| PPS-01: exact company selector | Executable workflow contract | Verified |
| PPS-02: shared local priority-title aliases | Unit plus workflow contract | Verified |
| PPS-03: single 100-result sample, no retry/second page | Static workflow contract | Verified |
| PPS-04: strict allowlisted callback | Executable mapper contract | Verified |
| PPS-05: accurate user copy and billing disclosure | Component test | Verified |
| PPS-06: producer and stored-contact boundaries unchanged | Full regression gates | Verified |
| PPS-07: exact, adjacent and generic fallback order | Executable mapper contract | Verified |
| PPS-08: adjacent/generic roles do not alter score | Unit and component tests | Verified |

## Authoritative provider reference

- Lusha v3 Decision Makers:
  https://docs.lusha.com/apis/openapi/decision-makers
