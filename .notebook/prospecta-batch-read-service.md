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

Updated: 2026-07-22
