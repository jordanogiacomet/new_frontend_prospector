# Prospecta Contact Enrichment Boundary
> v1 is PII-free; v2 is active only on the governed Demo 3 HTTPS profile

Entry: `src/components/contacts/contact-enrichment-action.tsx`

UI: the queue prefills a domain only from an exact CNPJ match with one distinct
valid `public.crm_company_history.website_domain`. Without one, the operator
may enter a domain or explicitly search Lusha by the known company name plus
available city/UF and fixed country `BR`. The provider sector taxonomy is not
inferred from the producer's free-text activity; that sector is shown only as
a human comparison reference. Search results expose only allowlisted
firmographic fields and require `Usar esta empresa`; the browser receives only
an opaque app-owned match ID. Decision
Makers and Reveal remain separate human actions. The queue renders one
responsive opportunity sheet and one contact component per company, so mobile
and desktop share the same markup, attempt and idempotency key instead of
duplicated CSS-hidden instances.

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
`db/app/010_contact_data_governance_forward.sql` and
`db/app/011_contact_company_resolution_forward.sql`
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

Updated: 2026-08-06
