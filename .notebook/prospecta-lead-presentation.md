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

Tests: `src/lib/lead-labels.test.ts`

Updated: 2026-08-06
