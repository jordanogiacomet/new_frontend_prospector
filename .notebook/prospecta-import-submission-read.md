# Prospecta Import Submission Read
> App-owned submission list/detail facts for T021

Entry: `src/server/repositories/imports/import-submissions-repository.ts:listImportSubmissions()`
Detail: `src/server/repositories/imports/import-submissions-repository.ts:getImportSubmissionDetail()`

Flow: verified caller org input -> app client -> `prospecting_app.import_submissions`
- List: count + paged read, `submitted_at DESC, submission_id DESC`
- Detail: `organization_id` + `submission_id`, missing/cross-org -> safe not_found
- Public read model omits `file_sha256` and `idempotency_key`
- Workflow acknowledgement remains nullable and separate from durable acceptance
- Legacy workflow close report is read from the append-only event table and
  remains separate from both acknowledgement and durable acceptance
- Demo data: `src/server/demo/demo3-import.ts:recordDemo3Import()` validates,
  hashes, and persists only the app intent
- Demo 3 preprod: demo data is disabled; import routes use the normal durable
  app-owned repository/service and make one approved n8n submission with no
  automatic retry
- Generic demo remains static/in-memory and does not define Demo 3 durability

Tests:
- Unit: `src/server/repositories/imports/import-submissions-repository.test.ts`
- DB: `tests/integration/app-schema-migration.test.ts` (repository integration block)

T15 local implementation:
- `BATCH_CLOSED` is correlated to an acknowledged submission and stored once
  as `WORKFLOW_CLOSED_REPORTED`
- list/detail expose the reported close time and expected row count while
  preserving contractual status and nullable result counts
- unit 1,774/1,774, PostgreSQL integration 88/88 and local contracts 18/18
  passed; 57 remote HTTP cases stayed skipped
- Demo 3/n8n runtime hookup was not deployed or configured

Updated: 2026-07-22
