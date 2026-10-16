# Prospecta Batch Read Service
> T023 app + producer batch summary composition

Entry: `src/server/imports/batch-read-service.ts:listImportBatches()`
Detail: `src/server/imports/batch-read-service.ts:getImportBatchDetail()`

Flow: verified org input -> app submission reads -> one optional producer batch read -> mapper
- List collects at most 100 distinct correlated batch IDs and issues one
  `WHERE import_batch_id = ANY($1::text[])` query
- Duplicate submissions that resolve to the same canonical batch reuse one
  observation set
- Detail keeps one producer lookup
- Producer read only when `workflowAcknowledgement.import_batch_id` exists
- `workflowAcknowledgement` remains correlation, not durable acceptance
- `durableAcceptance` survives producer `UNAVAILABLE`; producer counts stay nullable through mapper
- No freshness policy is supplied here
- `src/app/(private)/imports/batches/page.tsx` and
  `src/app/(private)/imports/batches/[id]/page.tsx` refresh their private GET
  APIs every five seconds while the browser tab is visible, so newly observed
  facts replace the displayed summary without a manual page reload

Tests: `src/server/imports/batch-read-service.test.ts`,
`src/server/repositories/imports/producer-batch-observations-repository.test.ts`

Presentation (2026-10-13):
- `src/lib/import-batch-presentation.ts:hasConfirmedBatchCounts()` distinguishes
  all-null results from partial/explicit-zero facts, without changing the DTO.
- `src/components/imports/batch-results.tsx:BatchResults()` renders the same
  summary in list/detail. Unconfirmed metrics remain in collapsed details;
  reported row counts use the separate “Linhas informadas” label.
- A correlated observation clock alone is “Atualização registrada”, not a
  promise of confirmed counts. Legacy observations and operational start/close
  callbacks must not be promoted to acceptance or completion.
- Source-outage copy in the detail preserves known accepted-row counts; an
  unavailable or inconsistent observation source does not erase independently
  confirmed acceptance. Regression: imports/batches/[id]/page.test.tsx.
- Verification and local release: `docs/prospecta-batch-results-fix.md`.

Additional local verification (2026-10-13, isolated source copy):
- `pnpm lint` and `pnpm typecheck`: passed.
- Focused import UI/service/status tests: 135 passed.
- `pnpm test`: 2,608 tests in 139 files passed.
- `pnpm test:contract`: 78 passed; 57 remote cases skipped without a test target.
- `pnpm build --webpack`: passed with synthetic configuration. The default
  Turbopack build rejected the temporary dependency symlink outside its root;
  repository build configuration was unchanged.
- Browser UAT: 208 synthetic checks passed in 1366/1440/375/390px using a
  separate Webpack preview. Zero external calls, unexpected mutations,
  runtime errors or overflow. The owned preview server was stopped. API mocks
  verify presentation, not PostgreSQL persistence or n8n execution.

Updated: 2026-10-13
