# Prospecta legacy workflow close callback
> Existing n8n `BATCH_CLOSED` becomes an app-owned UI report, never contractual completion

Entry: `src/app/api/imports/events/route.ts:POST()`
Persistence: `src/server/repositories/imports/legacy-workflow-close-repository.ts:recordLegacyWorkflowClose()`
Read: `src/server/repositories/imports/import-submissions-repository.ts:submissionReadColumns()`
Migration: `db/app/007_legacy_workflow_close_report_forward.sql`

Flow:
- existing 98-node workflow sends its already-defined `BATCH_CLOSED` envelope;
- app compares `X-Prospecta-N8N-Secret` before reading JSON or PostgreSQL;
- strict schema accepts only close=true/status=COMPLETED/EmpresaAqui and a
  positive expected row count;
- configured organization plus legacy `import_batch_id` must correlate to an
  acknowledged app submission with the same row count;
- one append-only `WORKFLOW_CLOSED_REPORTED` event is stored per submission;
- exact replay succeeds, conflicting replay returns 409;
- list/detail polling shows “Processamento encerrado”.

Boundary:
- `BatchStatus` is not changed to `COMPLETED`;
- accepted/terminal/lead/blocked/failed counts remain sourced only from
  approved facts and stay null when absent;
- callback delivery is fallible because the current n8n node uses finite retry
  plus `continueOnFail`; missing callback remains “Envio registrado”;
- no upload retry, producer write, workflow edit, activation or administration.

Runtime hookup still requires an authorized operator to set the same random
secret in the app and n8n environments and point the existing callback URL to
the exact app route. Repo packaging is ready; no external configuration was
applied on 2026-07-22.

Updated: 2026-07-22
