# Prospecta legacy workflow lifecycle callback
> n8n `ACCEPTED_ROW`/`BATCH_CLOSED` become app-owned UI reports, never durable acceptance or contractual completion

Entry: `src/app/api/imports/events/route.ts:POST()`
Start persistence: `src/server/repositories/imports/legacy-workflow-start-repository.ts:recordLegacyWorkflowStart()`
Close persistence: `src/server/repositories/imports/legacy-workflow-close-repository.ts:recordLegacyWorkflowClose()`
Read: `src/server/repositories/imports/import-submissions-repository.ts:submissionReadColumns()`
Migrations: `db/app/007_legacy_workflow_close_report_forward.sql`,
`db/app/008_legacy_workflow_start_report_forward.sql`

Flow:
- existing 98-node workflow sends its already-defined lifecycle envelopes;
- app compares `X-Prospecta-N8N-Secret` before reading JSON or PostgreSQL;
- strict schemas accept the current `ACCEPTED_ROW` or
  close=true/status=COMPLETED/EmpresaAqui `BATCH_CLOSED` forms;
- configured organization plus legacy `import_batch_id` must correlate to an
  acknowledged app submission; close also requires the acknowledged row count;
- first accepted row stores one `WORKFLOW_STARTED_REPORTED`; later rows are
  idempotent even when their time or row differs;
- one append-only `WORKFLOW_CLOSED_REPORTED` event is stored per submission;
- exact replay succeeds, conflicting replay returns 409;
- list/detail polling shows “Processamento iniciado pelo workflow” until a
  close report supersedes it with “Processamento encerrado”;
- lead list, detail and retained history poll every five seconds only while
  visible, reject overlapping reads and abort on unmount.

Boundary:
- operational start is not durable producer acceptance;
- `BatchStatus` is not changed to `COMPLETED`;
- accepted/terminal/lead/blocked/failed counts remain sourced only from
  approved facts and stay null when absent;
- callback delivery is fallible because the current n8n node uses finite retry
  plus `continueOnFail`; missing callback remains “Envio registrado”;
- no upload retry, producer write, workflow edit, activation or administration.

Runtime (2026-07-23):
- immutable Demo 3 release
  `demo3-preprod-20260723-lifecycle-refresh-001` is active and Ready;
- app-owned migrations `007` and `008` are structurally verified;
- n8n Deployment revision 16 reads the exact callback URL
  `http://192.168.0.20:30100/api/imports/events` and shared credential from a
  dedicated Kubernetes Secret;
- n8n stayed on version 2.30.6 and its previously running image digest;
- revision 16 explicitly sets `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`; without
  it, the workflow's Code nodes fail before the HTTP callback despite the
  variables being present in the pod;
- an authenticated request from the n8n pod reached the app: invalid body
  failed 400 and an exact but uncorrelated synthetic event failed 404 without
  a write;
- after the environment-access correction, a new synthetic upload received a
  correlated acknowledgement and reported operational start in about five
  seconds, then reported close and its workflow row count after the n8n
  execution succeeded; contractual status remained `SUBMITTED`;
- one synthetic upload ended honestly as `ACCEPTANCE_UNKNOWN` and was not
  retried. There was no correlated producer batch from which to prove a real
  callback, so none was fabricated;
- workflow export remains active with 98 nodes and SHA-256
  `26a2c00f30a58de01eae60802d470c6ba4d16d0e6e09e8340453c38aea142c23`.

Updated: 2026-07-23
