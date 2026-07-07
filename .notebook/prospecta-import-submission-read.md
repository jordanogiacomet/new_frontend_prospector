# Prospecta Import Submission Read
> App-owned submission list/detail facts for T021

Entry: `src/server/repositories/imports/import-submissions-repository.ts:listImportSubmissions()`
Detail: `src/server/repositories/imports/import-submissions-repository.ts:getImportSubmissionDetail()`

Flow: verified caller org input -> app client -> `prospecting_app.import_submissions`
- List: count + paged read, `submitted_at DESC, submission_id DESC`
- Detail: `organization_id` + `submission_id`, missing/cross-org -> safe not_found
- Public read model omits `file_sha256` and `idempotency_key`
- Workflow acknowledgement remains nullable and separate from durable acceptance

Tests:
- Unit: `src/server/repositories/imports/import-submissions-repository.test.ts`
- DB: `tests/integration/app-schema-migration.test.ts` (repository integration block)

Updated: 2026-07-07
