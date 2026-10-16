# Prospecta Contact Enrichment Boundary
> v1 is PII-free; v2 is active only on the governed Demo 3 HTTPS profile

2026-10-16 local UI change:
- Entry: `src/app/(private)/leads/[cnpj]/page.tsx:LeadDetailPage()` →
  `ContactEnrichmentProvider` / `ContactEnrichmentAction`; contacts now appear
  directly after company assessment. The pipeline UI is retired.
- `Encontrar contatos` and the `Contatos` anchor require both `contacts:enrich`
  and `contacts:read`; denied actors see the existing access message. Reveal
  and governance permissions remain independent, with unchanged server gates.
- `initialDomain` is `null`: manual domain or explicit company-name search,
  then human confirmation of a name-search match before preview. No new
  producer query or domain-prefill DTO is introduced.
- Provider and attempt use the company CNPJ as stable identity. Same-company
  analysis refresh preserves contact state, including unknown submissions;
  mounting the section does not submit a request or reveal channels.
- Navigation changes do not delete app-owned history/workspaces, change
  provider contracts, migrate databases, publish or activate integrations.
- Verification: `src/app/(private)/leads/[cnpj]/page.test.tsx` covers permission
  denial, explicit company-name/CNPJ/location input and unknown-request
  continuity through a changed producer decision/run.

The queue-prefill and deployment descriptions below are historical context.

2026-10-13 local refinement: `src/lib/contact-search-policy.ts` versions search
selection independently of `contact-commercial-score-v1`. The inactive v2
reference mappers now select fixed-asset/patrimony, accounting/control/finance,
then explicit inventory/physical-asset operations, excluding personal-wealth
and unrelated generic roles. Deduplication precedes the cap of 10.
`NO_RELEVANT_MATCHES` is an empty local selection from a non-empty valid sample;
it never starts Apollo or exposes a corporate-phone fallback. Migration 018
permits that code only for contact preview. No remote migration or activation
was performed. This refinement supersedes the historical generic-fallback
description below for the repository reference artifact only.

LinkedIn-first integration is pending the chosen provider contract and policy
review: `.specs/features/contact-linkedin-first-v1/spec.md`. The recommended
MVP candidate is People Data Labs Person Search, a professional dataset API
with LinkedIn profile URLs, not a live query to the official LinkedIn API.
Recommendation is not provider selection or activation approval.

Search feedback: `src/lib/contact-search-feedback.ts` maps only allowlisted
provider/stage/code facts to business copy. Optional v2 callback
`search_diagnostics` is persisted with the terminal result in the two app-owned
request ledgers by migration 017. Missing diagnostics remain unavailable;
the UI no longer assumes Apollo was consulted for every empty result. A
structured provider timeout keeps the business status unknown. HTTP 401/403
means access refused and 429 means a query limit, without inferring credits.
The inactive reference workflow rejects malformed Lusha samples before Apollo;
an unconfirmed Apollo company keeps the prior empty observation and explains
why no people search ran. Migration rollback retains any recorded feedback.
Requirements: `.specs/features/contact-search-feedback-v1/spec.md`.

Entry: `src/components/contacts/contact-enrichment-action.tsx`

UI: the queue prefills a domain only from an exact CNPJ match with one distinct
valid `public.crm_company_history.website_domain`. Without one, the operator
may enter a domain or explicitly search Lusha by the known company name plus
available city/UF and fixed country `BR`. The provider sector taxonomy is not
inferred from the producer's free-text activity; that sector is shown only as
a human comparison reference. Search results expose only allowlisted
firmographic fields and require `Usar esta empresa`; the browser receives only
an opaque app-owned match ID. Priority-profile preview and Reveal remain
separate human actions. The approved Demo 3 key returns `403` for Contacts
Prospecting, so new previews use one Decision Makers request constrained by the
confirmed provider company ID (or exact domain), with page 0 and size 100. The
mapper locally returns at most 10 candidates: exact priority aliases shared
with `contact-commercial-score-v1` first, versioned adjacent finance/accounting
roles second, or the provider's first valid decision makers only when neither
relevant tier exists. Adjacent and generic contacts never alter the derived
score. The mapper does not use a provider table, reveal, second page, automatic
retry or second request; an empty response means only that the ranked sample
had no valid candidate. The queue renders one
responsive opportunity sheet and one contact component per company, so mobile
and desktop share the same markup, attempt and idempotency key instead of
duplicated CSS-hidden instances.

Contact presentation: `src/components/contacts/contact-enrichment-action.tsx`
renders only the policy-approved factual LinkedIn URL and never builds a search
URL from a person's name. `src/lib/contact-commercial-score.ts` versions an
on-demand, non-persistent commercial indicator from the best available priority
accounting title. It adds the approved bonus to the producer score with a cap
of 100, but always labels both facts separately and never mutates the producer.

Policy: `.specs/features/prospecting-console/decisions/sensitive-content-policy.md` (L35-41)
- v1 names/emails/phones remain withheld
- v2 policy is `.specs/features/contact-enrichment-v2/spec.md`
- legitimate interest requires a completed balance test; provider availability
  is not contact consent
- preview retention is 30 days, revealed channels 90 days, erasure SLA 24
  hours, and suppression fingerprints 5 years

Authorization: `src/server/auth/authorization.ts:createDevelopmentAuthorization()`
- `contacts:enrich`, `contacts:read`, `contacts:reveal`, and `contacts:govern`
  are independent from `sensitive:read`
- OIDC uses exact individual subject allowlists; Demo 3 may use only its shared
  actor under the v2 feature and subject gates

App boundary: `src/app/api/contact-enrichment/`
- Same-origin actor route plus machine-secret callback
- Durable app-owned intent precedes one outbound attempt; no automatic retry
- Responses and callback contain opaque status only

v2 boundary: `src/app/api/contact-enrichment/v2/`
- HTTPS is enforced for browser and callback PII paths; Demo 3 HTTP is rejected
- provider references, preview profiles and channels are AES-256-GCM encrypted
- suppression uses a distinct keyed HMAC; raw provider JSON is never stored
- private/unknown email, mobile/unknown/DNC phone and waterfall reveal are
  withheld
- callback bodies are byte-bounded and terminal results are hash-idempotent
- company provider IDs and preview profiles from name lookup are encrypted,
  retained for at most 24 hours and never returned to the browser

Ledgers: `db/app/009_contact_enrichment_ledger_forward.sql`,
`db/app/010_contact_data_governance_forward.sql`,
`db/app/011_contact_company_resolution_forward.sql` and
`db/app/012_contact_company_phone_fallback_forward.sql`
- Stores only organization/actor categories, opaque UUIDs, hashes, statuses, and timestamps
- No CNPJ, domain, idempotency key, contact/provider body, or producer reference

n8n artifact: `integrations/n8n/prospecting-contact-enrichment-v1/`
- Separate repository artifact remains inactive and credential-free
- Imported Demo 3 copy is active only on the exact approved authenticated path
- Native credentials are operator-bound outside Git; execution saving is
  disabled in the artifact

v2 artifact: `integrations/n8n/prospecting-contact-enrichment-v2/`
- separate, inactive, credential-free and HTTPS-only
- current callback host is an intentional placeholder
- production HMAC timestamp/nonce/replay and durable rate limit are still a
  remote-contract gate, so production activation is impossible

Operational gates:
- Release `demo3-preprod-20260731-contact-enrichment-v1-001`, migration `009`,
  three credential bindings, workflow activation, and synthetic UAT completed
  on 2026-07-31
- n8n 2.30.6 soft-deletes `saveData...: none` runs before its pruner removes
  execution data; UAT therefore verifies and hard-deletes only the exact new
  workflow's soft-deleted synthetic rows, leaving zero execution/data rows
- The first pre-fix UAT stopped in an invalid Code-node return shape before
  Lusha; the corrected UAT made one synthetic Decision Makers attempt and
  produced a PII-free `PROVIDER_OUTCOME_UNKNOWN` callback
- Identical replay returned `200`; changed-input replay returned `409`; neither
  dispatched n8n again
- Migrations 009 and 010 were applied to the isolated Demo 3 app-owned database
  only after their governed preflight
- Real data remains blocked by the current Demo 3 HTTP edge, missing legal
  controller identity/privacy channel, unsigned balance test and absent v2
  credential/no-execution-data evidence
- Production remains blocked by an unidentified target, individual OIDC,
  remotely verified HMAC/replay/rate-limit and production credentials
- Release `demo3-preprod-20260806-company-domain-prefill-001` grants the
  producer reader column-level `SELECT` on only `cnpj` and `website_domain`;
  DML, table-wide access and the tested contact field remain denied
- The live queue currently has four items and no correlated source domain, so
  the deployed UI correctly uses manual fallback. The controller record has a
  source domain but is not a queue lead; producer facts were not modified to
  manufacture a demo case
- The domain-prefill release was verified without a POST to contact enrichment;
  the v2 n8n workflow retained zero execution and execution-data rows
- Release `demo3-preprod-20260806-company-name-fallback-001` adds the separate
  company-name lookup and confirmed-provider-ID path. Migration 011 is applied;
  the active 19-node v2 workflow retained zero executions, so rollout used no
  Lusha API call or credit
- Release `demo3-preprod-20260806-work-queue-layout-001` replaces the wide
  eight-column queue table with one responsive opportunity sheet and gives the
  governed contact UI a full-width workspace; the workflow retained zero
  executions during rollout
- Release `demo3-preprod-20260806-company-location-search-001` versions company
  search as name plus available city/UF and fixed country `BR`, using Lusha
  Prospecting Companies with at most five matches. Producer sector stays a
  visual comparison reference rather than a guessed provider taxonomy filter;
  the updated active workflow retained zero executions during rollout
- Lusha Prospecting Companies requires `pagination.size` from 10 through 100
  and documents request locations with `country`; the adapter therefore asks
  for 10, maps `BR` to `Brazil` and still exposes at most five matches
- Release `demo3-preprod-20260810-company-search-fallback-001` keeps one
  provider request but uses only name plus Brazil as provider filters. The
  callback mapper moves normalized city matches first (or UF when city is
  unavailable); without a local match it preserves the provider's first valid
  result as fallback and still requires human confirmation
- A live company search completed as `SEARCH_AVAILABLE` two seconds after its
  initial dispatch response was recorded as unknown. Release
  `demo3-preprod-20260810-unknown-refresh-001` therefore keeps the no-retry
  boundary but lets the operator issue a GET for the already-recorded company
  search or contact preview. Its regression test proves that this status check
  does not submit a second POST; rollout retained zero saved n8n executions
- `contact-commercial-score-v1` maps the approved Portuguese/English priority
  titles to bonuses 15/12/10/8/5, ignores suppressed or expired candidates,
  applies only the highest bonus and refuses to invent a score when the
  producer score is unavailable. The calculation is browser-local and is not
  persisted, audited or presented as a producer recommendation
- Release `demo3-preprod-20260810-contact-score-001` renders factual LinkedIn
  links and the explicit commercial-score action. Rollout smoke passed with
  all containers ready, zero restarts and zero saved n8n executions; no
  provider request was made during deployment
- Release `demo3-preprod-20260810-priority-profile-search-001` moves the title
  criterion upstream into the exact-company Contacts Prospecting request while
  preserving the strict callback projection and local derived-score rule. The
  published workflow remained at 19 nodes and one webhook, with zero saved or
  active executions after rollout; no provider request, Lusha credit or
  producer mutation was used by the deployment
- Release `demo3-preprod-20260810-decision-makers-fallback-001` records the
  Contacts Prospecting `403`, restores compatibility through one free
  exact-company Decision Makers sample of up to 100 and locally exposes only
  priority-title matches. Synthetic end-to-end UAT reached `PREVIEW_EMPTY` with
  zero candidates; n8n retained 19 nodes, one webhook and zero saved/active
  executions
- Release `demo3-preprod-20260810-adjacent-contact-fallback-001` keeps that
  single sample but returns exact profiles first, adjacent finance/accounting
  roles second, or first valid generic decision makers only when neither
  relevant tier exists. Adjacent/generic contacts never change the exact-only
  derived score. Synthetic UAT reached `PREVIEW_EMPTY`; final n8n state was zero
  saved/active executions
- `contact-provider-fallback-v1` is repository-complete and rolled out in
  `demo3-preprod-20260811-apollo-fallback-001`. It
  adds Apollo only after a structurally valid empty Lusha sample: one
  exact-domain Organization Enrichment (one credit when matched), then one
  free People Search by the exact returned organization ID. Preview remains
  masked and PII-free; only a human-selected work-email reveal may update the
  selected encrypted factual name/LinkedIn profile
- Provider references now encrypt `{ source, providerContactId }`; legacy
  scalar ciphertext remains Lusha-compatible and Apollo HMAC identity is
  source-namespaced. No schema or producer grant change is required
- The first 2026-08-11 preflight exposed a validator compatibility bug: the
  approved 19-node predecessor already used the current Lusha node name but
  had no Apollo nodes. A RED/GREEN contract added that exact previous binding
  set; guarded replacement then published 29 nodes under the same workflow ID
  with one webhook and zero saved/active executions
- Apollo credential metadata is exact and bound, but the key/API access remains
  runtime-unverified until an explicit provider request. No provider/webhook
  call or credit occurred during rollout
- A 2026-08-11 live company-name request proved that repeated result-button
  clicks append app-owned reads but never redispatch n8n. Its provider callback
  arrived after approximately 30 seconds as `PROVIDER_OUTCOME_UNKNOWN`; release
  `demo3-preprod-20260811-company-search-feedback-001` now distinguishes the
  still-processing state and provides a separately disclosed manual restart
  only after an unknown outcome
- Release `demo3-preprod-20260811-company-phone-fallback-001` adds the final
  fallback without a third provider request: only after structurally valid
  empty Lusha and Apollo People samples, it reuses one sanitized corporate
  number from the exact-domain Apollo Organization Enrichment result. The
  number is encrypted app-owned data with a keyed suppression fingerprint and
  30-day expiry. It appears separately as `Telefone geral da empresa`, with
  unknown contactability, no `tel:` link and no commercial-score effect.
  Migration 012, the 29-node workflow replacement and the immutable app
  release passed guarded preflight/postflight with all workloads ready and
  zero restarts. Deployment made no webhook or provider request.

Updated: 2026-08-11

UX recovery update, 2026-10-13: preview GET now adds an optional safe
`candidate.reveal` projection of the latest app-owned recovery ledger, scoped
by organization, preview request and contact. `channelsMatchResult` prevents an
older channel record from establishing completion of a newer recovery. HTTP
200/202 alone establishes no completion. Cards and channel choices stay
mounted during GET and failed reveal/suppression; action-local errors preserve
the context. A failed mutation without a confirmed request ID keeps its
idempotency context and blocks a new request; 401/403 blocks further mutations
until a valid GET. No provider call, migration or activation accompanies this
projection. Tests cover safe fields, recorded/dispatched/unknown/empty/failed,
partial versus complete, invalid replies, duplicate clicks and GET recovery.
