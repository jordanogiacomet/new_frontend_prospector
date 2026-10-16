# Prospecta lead decision presentation
> Stored producer decisions remain exact; UI labels use bounded mappings

Entry: `src/lib/lead-labels.ts`

Flow: producer `trust_status` -> `src/server/mappers/lead-summary-mapper.ts` ->
`LeadSummary.trustStatus` -> `getTrustStatusLabel()` -> Leads, detail and
commercial-queue badges.

Trust-status gotcha:
- the mapper and APIs preserve the producer value; “Não mapeado” can therefore
  be a presentation-domain miss rather than missing data
- current approved categories are `Aprovada`, `Nutrir`, `Não Abordar`, and
  `Revisão Humana`
- a category matches only the complete value or the exact prefix followed by a
  space; descriptive producer text is never displayed by the badge
- unknown categories remain neutral and unmapped
- `deriveConfidenceIndicator()` remains independent; labels do not infer low
  confidence, alter eligibility, or recalculate producer action/score

Priority gotcha:
- `src/lib/lead-labels.ts:getPriorityLabel()` recognizes the exact producer
  tokens `B`, `C`, `D`, `E`, and `R`
- a read-only Demo 3 check on 2026-08-13 observed the new token `D`; the owner
  approved its exact “Prioridade D” presentation and filtering on 2026-08-14
- no business ordering is inferred among the priority tokens
- this does not affect the separately mapped action or trust-status badges
- release `demo3-preprod-20260814-priority-d-001` carries the label and exact
  filter through Leads and Fila comercial

Risk-flag presentation:
- `src/lib/lead-labels.ts:getRiskFlagLabel()` maps only approved exact producer
  tokens to business sentences; stored/API values remain unchanged
- missing site, e-mail and phone mean “not located in the analyzed data”, never
  proof that the company has no such channel
- when no approved friendly description exists, the UI presents the exact
  sanitized source item so distinct risks do not collapse into repeated generic
  copy; it does not invent or mechanically reinterpret an unknown meaning

Decision-reason presentation:
- `src/lib/lead-labels.ts:formatDecisionReason()` mechanically presents every
  uppercase underscore term embedded in a stored reason with spaces and normal
  casing; the producer value and API stay unchanged
- the known CRM/public-validation review reason receives a bounded executive
  summary: CRM history, public-data confirmation and any unconfirmed debt
  indication remain explicit, while `match` and internal action wording are
  removed; both observed reengagement action tokens map to the same copy
- known Portuguese words recover presentation accents and known business
  acronyms remain uppercase; unknown words are only lowercased, not semantically
  reinterpreted
- the rule applies to the decision table, CRM detail, lead summary and retained
  history

Strategic-report presentation:
- `src/server/mappers/lead-sensitive-content.ts:mapSensitiveStrategicReport()`
  remains the response boundary: it removes Markdown links/images/active HTML,
  contact-like content and technical model/pipeline fields before the browser
- `unavailable` is a collapsed safe state for ambiguous report matches, failed
  integrity and content still rejected by the sanitizer; active markup, unsafe
  schemes and e-mail remain fail-closed, so “try later” is not necessarily a
  transient-failure diagnosis
- an oversized valid report is reduced to the 12,000-character response limit
  with a visible reduction notice; phone-like content in the retained portion
  is replaced by a privacy marker, while the producer report stays unchanged
- recognized `**Label:** value` blocks become newline-delimited business fields;
  unrecognized safe prose remains plain text without semantic invention
- `src/components/leads/strategic-report.tsx:ReadableReportContent()` renders
  prose at a bounded reading measure and complete `label: value` blocks as a
  responsive definition list; it never accepts Markdown or raw HTML
- underscore-only machine values receive a presentation-only space replacement;
  producer content and storage remain unchanged

Lead-approach draft:
- `src/lib/formatters/lead-approach-message.ts:buildLeadApproachDraft()` uses an
  ordered, label-allowlisted context from the available sanitized report plus
  the lead identity to create local Portuguese copy; missing, unavailable, and
  policy-omitted reports fail closed
- context priority is challenge/need, opportunity, differential/asset/signal,
  context/summary, safe unlabeled prose, and sector; up to two facts may shape
  one message
- every identified lead with an available report receives a draft; if no safe
  customer-facing fact exists, the fallback uses only company identity and
  asks neutrally about the current moment and priorities
- sector may provide context but never becomes an inferred problem; missing
  contact channels, debt, and unknown risk flags are not used
- internal score, priority, fit, confidence, research value, recommendation,
  and lead terms are not copied into the customer-facing draft
- research-quality metadata about AI, weak/insufficient sources, hypotheses,
  validation and premium-report status is also denied; the exact PLASFORT
  failure now falls through to safe sector or identity context
- `src/components/leads/lead-approach-message.tsx:LeadApproachMessage()` keeps
  edits through same-source polling, resets on changed source facts, and copies
  the exact local text with accessible feedback
- `POST /api/leads/[cnpj]/approach-message` is an explicit same-origin action:
  it requires `leads:read` plus `sensitive:read`, re-reads the selected run and
  never accepts report/company content from the browser
- `src/server/lead-approach/generate-lead-approach.ts:generateLeadApproachMessage()`
  filters internal report metadata, calls the configured OpenAI Responses API
  once with `store:false`, strict structured output, bounded timeout, no tools
  and no retry, then rejects unsafe or ungrounded output locally
- the trusted sender profile identifies Apollo Gestão and its approved
  asset-management portfolio; organização patrimonial and inventário
  patrimonial are one service and may never be presented as separate offers
- generator version `apollo-profile-fit-v2` routes direct report signals to at
  most one relevant capability: patrimonial organization/inventory, stock
  inventory, patrimonial processing, asset valuation, impairment, useful-life
  review or traceability; it never uses patrimonial inventory as a default
- when the sanitized report does not directly support one specific service,
  accepted copy presents only Apollo's broad intelligent asset-management
  profile and asks a discovery question instead of inventing a fit
- release `demo3-preprod-20260817-profile-fit-001` activates this routing on
  the owner-approved Demo 3 local target with `gpt-5.6-terra`
- the local validator classifies the offered specific capability and rejects
  unsupported services, multiple specific services, or repeated
  organization/inventory wording before the editable draft is replaced
- accepted AI copy must present the sender and open a low-pressure discovery
  conversation while target company claims remain restricted to the sanitized
  report
- the first contact must not prescribe a pilot, execution stages, scope,
  deliverables or a fixed meeting duration; an impersonal “equipe da empresa”
  greeting is also rejected before replacing the editable draft
- the Responses request uses low reasoning effort and low text verbosity; two
  bounded evaluations with three fully synthetic companies each confirmed the
  intended short, report-grounded style without exposing producer facts
- AI generation is disabled by default and requires server-only key/model
  configuration; a failed or late response never replaces the current draft
- `src/server/lead-approach/prepare-lead-approach.ts` now gives non-demo AI
  generation a durable app-owned claim/cache keyed by organization, CNPJ,
  selected `lead_run_id` and generator version; refreshes reuse ready copy and
  concurrent requests do not duplicate the provider call
- the commercial queue exposes the cache only to actors with `leads:read` and
  `sensitive:read`; visible exact-priority `B` and `C` items prepare missing
  drafts sequentially when the independent default-off auto-queue flag passes
- priority now controls only automatic creation: the queue reads persisted
  states for every visible priority, so a manual AI message generated from a
  D/E/R lead appears there unchanged while an absent non-B/C draft remains null
- `GET /api/leads/[cnpj]/approach-message` is cache-only and requires
  `leads:read` plus `sensitive:read`; it performs no producer read and no
  provider call, and lets lead detail hydrate the current persisted message
- the commercial workspace uses that same cache-only read to present the exact
  shared draft; opening the workspace never creates a message, and a missing
  draft links back to the lead's explicit Generate with AI action
- failed generation has a five-minute cooldown and no in-request retry; demo
  fixtures never trigger automatic generation or persistence
- only the validated final message is persisted; reports, prompts and provider
  payloads remain absent from the app-owned table
- there is still no n8n or send action; queue edits remain local and the manager
  remains responsible for reviewing facts and wording

Location presentation:
- `src/components/leads/lead-location-map.tsx` consumes the CNPJ/run only to
  call an authenticated Prospecta read route; company name is not a component
  input and is never sent to the map provider
- when `FEATURE_REGISTERED_ADDRESS_MAP_ENABLED` passes its server-only gate,
  the route checks the organization/CNPJ app cache, requests the public
  registered address from the configured registry, and sends that address only
  in process memory to the configured structured geocoder
- an exact Nominatim miss performs one distinct BrasilAPI CEP v2 fallback;
  a valid fallback is exposed as `registered_postal_code`, never as an exact
  address match
- the app cache stores only organization, CNPJ, resolution status,
  coordinates, precision, source and timestamps; it has no address/query/raw
  response columns
- a resolved point is displayed as `Sede cadastral aproximada` with tight
  bounds; it is never described as an operational site verified by Prospecta
- a postal point is displayed as `Entorno do CEP cadastral` and explicitly
  says that it is not the entrance or a verified operating unit
- registry/geocoder/postal failure falls back to the exact city/UF pair in the
  pinned municipality index and keeps the wider `centro do município`
  explanation
- OpenStreetMap receives only coordinates and bounds from the browser; BrasilAPI
  and Nominatim geocoding URLs remain server-only
- Nominatim lookup starts are serialized at one per second in the single-pod
  Demo 3 profile, have no automatic retry and use 90-day/24-hour positive and
  negative cache retention respectively
- the browser session key is versioned; bumping it when precision behavior
  changes prevents a prior municipality result from hiding a better server
  result

Tests: `src/lib/lead-labels.test.ts`,
`src/lib/formatters/lead-approach-message.test.ts`,
`src/components/leads/lead-approach-message.test.tsx`,
`src/server/lead-approach/generate-lead-approach.test.ts`,
`src/server/lead-approach/prepare-lead-approach.test.ts`,
`src/server/lead-approach/lead-approach-draft-repository.test.ts`,
`src/server/lead-approach/lead-approach-draft-repository.integration.test.ts`,
`src/app/api/leads/[cnpj]/approach-message/route.test.ts`,
`src/app/(private)/work-queue/page.test.tsx`,
`src/components/leads/lead-location-map.test.tsx`,
`src/components/leads/strategic-report.test.tsx`,
`src/server/mappers/lead-detail-mapper.test.ts`

Updated: 2026-08-18
