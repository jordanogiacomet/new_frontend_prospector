# Prospecta Producer History Grants
> History queries must stay inside column-level read-only grants

Entry: `src/server/repositories/lead-history-repository.ts:listLeadHistory()`

Gotcha:
- `crm_company_history.created_at` exists but is not granted to
  `prospecta_producer_read`
- Selecting it fails with SQLSTATE `42501`
- `crm_company_history.run_created_at` is the approved granted producer fact
  mapped to the public `created_at` alias
- Keep query guard, parameterization, pagination, organization boundary, and
  read-only role unchanged

Test: `src/server/repositories/lead-history-repository.test.ts`

Updated: 2026-07-17
