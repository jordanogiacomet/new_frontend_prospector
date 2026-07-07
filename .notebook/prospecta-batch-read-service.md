# Prospecta Batch Read Service
> T023 app + producer batch summary composition

Entry: `src/server/imports/batch-read-service.ts:listImportBatches()`
Detail: `src/server/imports/batch-read-service.ts:getImportBatchDetail()`

Flow: verified org input -> T021 app submission reads -> optional T022 producer observations -> T020 mapper
- Producer read only when `workflowAcknowledgement.import_batch_id` exists
- `workflowAcknowledgement` remains correlation, not durable acceptance
- `durableAcceptance` survives producer `UNAVAILABLE`; producer counts stay nullable through mapper
- No freshness policy is supplied here

Tests: `src/server/imports/batch-read-service.test.ts`

Updated: 2026-07-07
