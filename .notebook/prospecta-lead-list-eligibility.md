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

Updated: 2026-07-23
