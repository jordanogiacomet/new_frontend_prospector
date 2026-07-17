# Demo 2 Source Guard
> Read-mode list rejects sources above the approved presentation bound

Entry: `src/app/api/leads/route.ts:GET()`
Flow: `GET /api/leads` → `src/server/demo/mode.ts:isDemoDataEnabled()` → `src/server/repositories/lead-list-repository.ts:listLeads()`

Read-mode:
- `FEATURE_DEMO_DATA_ENABLED=false` → producer query path
- Source guard reads up to 21 `company_validations` rows before filters
- More than 20 rows → `DATA_SOURCE_UNAVAILABLE` / HTTP 503
- Guard is intentionally fail-closed; `src/server/repositories/lead-list-repository.test.ts` asserts the unfiltered condition

Presentation mode:
- `FEATURE_DEMO_DATA_ENABLED=true` → `src/server/demo/prospecta-demo-data.ts:listDemoLeads()`
- Also switches imports, batches, histories, lead detail, and commercial queue to synthetic in-process data
- `src/app/api/imports/route.ts:POST()` then does not invoke the test ingress

Updated: 2026-07-14
