# Prospecta n8n v7.4 lifecycle events
> Callback events improve telemetry but do not satisfy durable batch acceptance

Reviewed artifacts:
- previous attachment retained as historical evidence
- local-only ignored export: `.local/n8n-review/workflow-atual.json`
- sanitized evidence:
  `.specs/features/batch-import-n8n-alignment/evidence/current-workflow-static-review-2026-07-22.md`

Relevant app flow:
- `src/server/imports/ingress-client.ts:requestAcknowledgement()`
- `src/server/imports/batch-read-service.ts:composeBatchSummary()`
- `src/server/repositories/imports/producer-batch-observations-repository.ts:readProducerBatchObservations()`
- `db/app/001_app_schema_forward.sql`
- `db/producer/001_batch_observation_source.sql`

Findings:
- The export keeps the active current workflow identity
  `6HM8Era5svuUN24x`; it is not the separate inactive versioned ingress
  required by `.specs/features/batch-import-n8n-alignment/spec.md`.
- `ACCEPTED_ROW` is emitted after the acknowledgement response and a timing
  wait, not after an atomic durable producer acceptance.
- Callback failures retry briefly and then continue, so callback delivery is
  not a durable producer fact source or recoverable outbox.
- T15/T16 added a dedicated `POST /api/imports/events` path for
  `ACCEPTED_ROW` and `BATCH_CLOSED`, authenticated before body/DB work. It
  stores minimal app-owned operational reports and never treats them as X4.
- Demo 3 reserves only the exact callback path outside browser Basic Auth; the
  app still requires the independent machine secret. Release
  `demo3-preprod-20260723-lifecycle-refresh-001` is deployed.
- The extractor still names `arquivo_csv0` while the app transmits
  `arquivo_csv`; this is contract drift that needs a synthetic disposable
  execution check.
- `BATCH_CLOSED` delivery can follow failed terminal callback delivery, so the
  callback stream can be incomplete even when the n8n loop finishes.
- Local export fingerprint:
  `26a2c00f30a58de01eae60802d470c6ba4d16d0e6e09e8340453c38aea142c23`.
- Inventory: 98 active nodes; 9 credential-bearing references; no pin data;
  no Execute Sub-workflow or Execute Sub-workflow Trigger.
- The response has no Postgres ancestor. Seven Postgres nodes write/read the
  legacy model and reference none of the accepted X4 tables/functions.
- Current normalization has 35 alias groups and producer scoring/search rules;
  ingress v1 normalization has 8 structural groups. They are not
  interchangeable.
- Current identities (`empresaqui_<timestamp>`, short FNV run ID and legacy
  idempotency key) cannot satisfy the structured 64-hex constraints.

Runtime gotcha (2026-07-23):
- Adding `PROSPECTA_IMPORT_EVENT_URL` and
  `PROSPECTA_IMPORT_EVENT_SECRET` to the pod was insufficient on n8n 2.30.6.
  With `N8N_BLOCK_ENV_ACCESS_IN_NODE` unset, the active Code nodes failed with
  `access to env vars denied` before reaching their HTTP Request nodes.
- A direct `process.env` connectivity probe from the container did not exercise
  the Code-node sandbox and therefore could not reveal this failure.
- The local target has one workflow, active with 98 nodes and both callback
  environment references. Three recent executions reached the
  `ACCEPTED_ROW` preparer and failed before the emitter.
- After the exact cluster preflight, n8n revision 16 explicitly set
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, retaining version 2.30.6 and the
  previously pinned image digest.
- This flag lets every Code node on the instance read pod environment
  variables. It is accepted only for this controlled local target and must not
  be copied to production or a shared instance with untrusted editors.
- A new synthetic upload was submitted exactly once, received a correlated
  producer acknowledgement, and produced `WORKFLOW_STARTED_REPORTED` on the
  second five-second observation. The n8n execution finished successfully and
  the app then recorded `WORKFLOW_CLOSED_REPORTED` plus the reported row
  count, while contractual status correctly remained `SUBMITTED`. No new
  environment-access denial occurred. Failed pre-fix executions were not
  retried.

Direction:
- Keep the current workflow immutable.
- Use its existing `BATCH_CLOSED` only to display “Processamento encerrado”;
  keep acceptance and result counts nullable.
- Continue the inactive artifact under
  `integrations/n8n/prospecting-import-v1/`.
- Make atomic producer acceptance precede `202`, expose acceptance and X4
  through approved producer read views, reconcile app-owned acceptance, and
  persist explicit producer close facts.
- OPEN-02 requires a separately approved worker plus an idempotent terminal
  adapter. The current workflow is a behavior baseline only; do not change,
  clone or call it from v1.

Updated: 2026-07-23
