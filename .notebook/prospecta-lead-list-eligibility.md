# Prospecta lead list eligibility
> Processed rows are not automatically eligible for “Leads para análise”

Entry: `src/server/repositories/lead-list-repository.ts:buildEligibleCurrentCte()`
Visibility: `src/server/repositories/production-run-predicate.ts:buildProductionRunPredicate()`

Eligibility:
- current `company_validations` projection with integrity `OK`
- exactly one matching terminal `company_validation_runs` row
- terminal result `INSERIDO_VALIDATION`
- matching batch, source row, normalized CNPJ and current `lead_run_id`
- non-empty action/version and valid timestamps/identifiers
- production-visible test marker: null or exact `SR_<source_row>`

Runtime finding (2026-07-23):
- visible polling worked; the new synthetic validation appeared first
- user batch: 20 acknowledged/started/closed producer rows
- 17 rows ended `CRM_DECIDIU_E_SALVO` and are outside this list by design
- 3 rows ended `INSERIDO_VALIDATION` and passed every predicate except test
  visibility; all carried non-null, non-`SR_<source_row>` `test_case_id`
- result: 20 healthy projections, zero list-eligible rows

Boundary:
- processing completion does not imply lead-list eligibility
- do not enable broad test-run visibility outside an explicitly approved test
  profile
- do not reprocess automatically to change visibility

Authorized Demo 3 resolution:
- require the exact isolated Demo 3 runtime and shared actor
- read app-owned correlated `import_batch_id` values for the authenticated
  organization
- use the normal production predicate OR a bound `ANY($n::text[])` batch check
- apply the same options to list, detail and retained history
- an empty correlation set or any other runtime keeps the production predicate
  byte-for-byte
- `CRM_DECIDIU_E_SALVO` remains outside lead-list eligibility

Runtime:
- release `demo3-preprod-20260723-correlated-leads-002` is active
- authenticated value-free smoke confirmed the authorized correlated batch in
  list, detail and retained history
- the n8n callback URL, credential and deployment revision remained unchanged

Non-analysis terminal path:
- `CRM_DECIDIU_E_SALVO` is a final producer destination, not proof that the
  company was generically discarded
- the current workflow uses it when public validation was skipped by the
  rules/CRM route (`searchMeta.skippedPublicValidation`)
- `company_validation_runs.final_action` and `.reason` are already inside the
  approved read-only column grant
- a value-free Demo 3 read confirmed that current rows in this destination
  have both stored action and stored reason
- `src/server/repositories/outside-analysis-repository.ts` reuses one exact
  current projection/run/provenance CTE and the Demo 3 correlated-batch
  boundary while selecting only this explicit terminal result
- UI copy should say “Fora da análise” or “Decisão pelo CRM”, not “Falhou” or
  “Descartado”, and must display the stored reason without recalculation
- the list links to `/leads/outside-analysis/:cnpj`; its GET detail applies the
  same CTE, binds the normalized CNPJ and fails closed on zero/multiple eligible
  projections
- the detail page is read-only and exposes only the already approved company,
  location, sector, stored action/reason, decision date and import provenance;
  it never opens public analysis or starts commercial/contact actions

Runtime detail:
- release `demo3-preprod-20260813-outside-analysis-detail-001` is active
- value-free authenticated smoke confirmed 401 anonymously, 200 for list/API/
  page, exact DTO allowlist, non-empty current view and 400 for invalid CNPJ
- one app pod and one PostgreSQL pod are ready with zero container restarts
- no producer write, migration, n8n/provider call or real-value evidence was
  introduced

Updated: 2026-08-13
