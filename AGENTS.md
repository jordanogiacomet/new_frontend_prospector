# AGENTS.md

## Authority and product direction

- This file is the controlling repository instruction file.
- On 2026-07-03 the repository owner explicitly authorized planning and staged
  implementation of **Prospecta**, an internal assisted-prospecting platform.
- `AGENTS.next.md` is superseded by this file and is retained only as proposal
  history.
- Repository development and synthetic/local verification are authorized.
- Integration requires an identified non-production target and credentials
  only when that target's approved profile uses them.
- Production migrations, n8n activation, deployment, and rollout require a
  separately identified target, credentials, accountable owner, and approval.
- On 2026-07-06 the repository owner approved a simple internal MVP profile
  for `http://192.168.0.20:30098/webhook/empresaqui/import`: HTTP and no
  server-to-server authentication/replay control are accepted limitations for
  this target only. This profile is not evidence of security and does not
  relax production requirements.

## Product

Prospecta evolves the existing private read-only lead browser into a controlled
business workspace that can:

- preserve the existing lead list, detail, and retained-history experience;
- accept one controlled EmpresaAqui CSV through the app server;
- submit exact file bytes to a separately developed, versioned n8n ingress;
- track app submission and producer batch facts without inventing progress;
- organize assignment, stage, next action, activity, notes, and audit in an
  app-owned PostgreSQL schema;
- expose only approved sensitive content through explicit permission,
  allowlists, sanitization, and safe URL policy.

The main user is a business manager. Use business language and keep producer
workflow details out of normal UI flows.

## Permanent producer boundary

The existing productive n8n workflow and its producer data remain immutable to
this application.

Always prohibited:

- edit, disable, clone, activate, or require changes to the current productive
  workflow;
- call its form trigger, arbitrary webhooks, execution API, or administration
  API;
- write producer tables, views, functions, cache, CRM snapshots, reports,
  decisions, runs, processing state, or events;
- create producer runs or reprocess leads from the app;
- recalculate or replace `finalScore`, `priority`, `finalAction`,
  `finalVerdict`, `icpScore`, `strategicAssetScore`, `trustStatus`, enrichment,
  validation, or qualification semantics;
- treat commercial state as a producer recommendation;
- infer failure or completion from missing events;
- automatically retry an accepted or acceptance-unknown upload.

Core producer identifiers and facts keep their established names when used in
contracts:

- `import_batch_id`
- `lead_run_id`
- `idempotency_key`
- `cnpj_normalizado`
- `source_row`
- `source_hash`
- `agent_version`
- `preTrustScore`
- `preTrustStatus`
- `finalScore`
- `finalVerdict`
- `trustStatus`
- `icpScore`
- `priority`
- `strategicAssetScore`
- `finalAction`
- `finalActionReason`
- `agentValidation`
- `riskFlags`
- `positiveSignals`
- `evidences`
- `strategicResearchReport`

## Allowed architecture

```text
Browser → Prospecta pages/API
Prospecta API → approved producer SELECTs through a read-only role
Prospecta API → app-owned schema through a separate read/write role
Prospecta API → approved, versioned n8n import ingress over HTTPS + HMAC
Approved n8n ingress/producer → producer PostgreSQL
```

For the identified internal MVP target only, the n8n edge may use HTTP with
zero authentication headers. A future production edge still requires HTTPS
and an approved, remotely verified server-to-server authentication and replay
mechanism.

Not allowed:

```text
Browser → PostgreSQL
Browser → n8n
Prospecta → current productive form trigger/workflow administration
Prospecta app role → producer mutation
n8n producer role → app-owned commercial schema
```

The n8n ingress is a separate versioned integration. Do not modify or activate
the current productive workflow while developing it.

## Delivery scope

### Authorized staged implementation

1. Actor identity, permissions, and private access.
2. Separate producer-read and app-schema PostgreSQL connections.
3. Reviewed app-owned schema and local/non-production migrations.
4. Server-side CSV upload with superficial validation, exact-byte SHA-256,
   app-owned upload idempotency, one producer submission, and honest handling
   of the observed workflow `202` acknowledgement. The internal profile sends
   zero authentication headers; production authentication remains deferred.
5. Evidence-based batch list/detail with nullable counts.
6. Commercial queue, assignment, stage, next action, append-only activities,
   append-only notes, and transactional audit.
7. Approved sensitive fields through field/source allowlists,
   `sensitive:read`, sanitization, and URL validation.
8. Synthetic tests, UAT, security review, and gradual rollout/rollback plan.

### Deferred unless separately approved

- automatic or background retry of uploads;
- manual producer reprocessing;
- CSV export or bulk data export;
- CRM synchronization;
- notifications and outreach automation;
- score or recommendation changes;
- broad analytics without approved query evidence;
- contact exposure without opt-out/do-not-call and data-policy approval;
- destructive note/activity editing;
- production migration, deployment, or n8n activation.

## n8n ingress rules

- Follow
  `.specs/features/prospecting-console/contracts/n8n-import-webhook.md`.
- The browser submits only to the Prospecta API.
- Authenticate and authorize before reading file bytes where the framework
  permits.
- The app may validate count, extension, allowlisted content type, byte limit,
  UTF-8, non-empty content, and header presence.
- The app must forward the exact accepted bytes and must not normalize rows,
  validate business CNPJ rules, map aliases, enrich, score, or qualify.
- Hash the exact transmitted bytes with SHA-256.
- Under the identified internal profile, send zero authentication headers.
  Do not fabricate HMAC, canonicalization, nonce, timestamp, or replay
  protection that the target does not verify.
- If a future target exposes an approved and remotely tested authentication
  contract, keep its secrets, key IDs, and endpoint URLs server-only.
- Persist app submission intent before calling the producer.
- Persist only a validated, correlated producer acceptance.
- Return `202` only for a durable app record; distinguish submission recorded
  from producer acceptance confirmed.
- The same organization-scoped idempotency key and file hash returns the
  original app result. The same key with a different hash returns `409`.
- A timeout or unknown producer acceptance remains an honest unknown state.
  Do not retry automatically.
- Never store raw CSV bytes in PostgreSQL or general-purpose logs.

## Batch status rules

- Follow
  `.specs/features/prospecting-console/contracts/batch-status-contract.md`.
- Every status, count, and timestamp has a named fact source.
- Missing or unavailable counts are `null`, never confirmed zero.
- Duplicate events do not increment business counts.
- `COMPLETED` requires explicit producer batch closure and exactly one approved
  terminal outcome for every accepted row.
- `INCOMPLETE` requires an explicit producer closure with missing terminal
  outcomes.
- `NO_UPDATE` means only that no approved observation was seen within the
  configured freshness window; it is not failure.
- Current legacy run rows may be shown only as retained observations, never as
  proof of batch acceptance or completion.

## App-owned commercial writes

- All writes belong exclusively to the approved app-owned schema.
- No app-owned foreign key or cascade targets a producer table.
- Producer identities such as CNPJ and `lead_run_id` are external references.
- Every row is organization-scoped.
- Actor and organization come from the verified server session, never the
  request body.
- Assignment/stage/next-action changes and their audit event commit in one
  transaction.
- Use optimistic concurrency for mutable workspace state.
- Activities, notes, import events, and commercial audit events are append-only
  in the first MVP.
- Audit metadata is allowlisted and must not contain note bodies, CSV content,
  contacts, reports, raw producer payloads, secrets, or SQL parameters.
- Commercial stage and producer recommendation must be visibly distinct in API
  contracts and UI labels.

## Authentication and permissions

- Require server-side authentication and authorization for every private page
  and API route.
- Retain verified issuer, subject, organization, and permissions in the server
  actor context.
- Deny unknown roles and permissions by default.
- Enforce permission failure before database, hashing, file, or producer work.
- Use distinct permissions at minimum:
  - `leads:read`
  - `imports:read`
  - `imports:create`
  - `commercial:read`
  - `commercial:write`
  - `commercial:assign`
  - `sensitive:read`
  - `audit:read`
- For the identified single-organization internal MVP, import pages/routes may
  use the existing verified issuer, subject, allowed-organization, same-origin,
  and server-side feature-flag boundary while granular permission sourcing is
  deferred. This exception applies only to imports; it grants no sensitive,
  audit, assignment, or commercial capability.
- Cross-organization identifiers fail closed.
- Private responses use `Cache-Control: private, no-store`.
- Use CSRF protections appropriate to authenticated mutation routes and verify
  same-origin requests.

## Database rules

- Keep database access server-only.
- Use separate least-privilege connections:
  - `PRODUCER_DATABASE_URL`: `SELECT` only on approved producer sources;
  - `APP_DATABASE_URL`: controlled access only to the app-owned schema.
- Never expose database URLs or credentials through `NEXT_PUBLIC_*` variables.
- Use parameterized queries.
- Keep producer reads under `src/server/repositories` and app writes under
  focused app-owned repositories/services.
- Do not put SQL or business logic in React components.
- Preserve nullable, stale, mutable, unavailable, and incomplete semantics.
- Do not present mutable projections as immutable history.
- Do not apply any migration to production without an identified target,
  reviewed plan, rollback, credentials, and explicit approval.
- Local or disposable non-production migrations may use synthetic data only.

## Sensitive content

- Follow
  `.specs/features/prospecting-console/decisions/sensitive-content-policy.md`.
- Database presence is not permission to expose a field.
- Withhold by default unless the exact source column/JSON path, business
  meaning, permission, retention, and UI purpose are allowlisted.
- Evaluate `sensitive:read` in server response mapping, not only in UI.
- Sanitize approved Markdown and reject active HTML.
- Expose only approved `https` links whose normalized hostname passes the
  server-side allowlist; use safe link attributes.
- Do not proxy or prefetch evidence links from the browser.
- Distinguish missing, withheld, unavailable, ambiguous, and explicit-empty
  states.
- Never expose raw/normalized rows, payloads, prompts, model responses, search
  queries, raw report JSON, dead letters, integrity payloads, tokens, costs,
  SQL, or n8n execution IDs.

## Repository conventions

- Use `pnpm`.
- Use strict TypeScript and avoid `any`.
- Route handlers: `src/app/api`.
- Pages/routes: `src/app`.
- Shared UI: `src/components`.
- Formatters: `src/lib/formatters`.
- Validators: `src/lib/validators` or beside the owning route.
- Server database clients: `src/server/db`.
- Repositories/services: `src/server/repositories` and focused
  `src/server/<domain>` modules.
- DTO mappers: `src/server/mappers`.
- Shared domain types: `src/types`.
- App-owned migrations: reviewed files under `db/app/`; never execute
  `docs/db/schema.sql` as an app migration.
- Separate n8n ingress artifacts: `integrations/n8n/prospecting-import-v1/`;
  never overwrite the productive workflow export.
- Keep React components small and business logic out of components.
- Prefer readable focused files over speculative abstractions.

## API rules

Use consistent envelopes:

```ts
{ data: unknown, meta?: Record<string, unknown> }
```

```ts
{
  data: unknown[],
  meta: { page: number, pageSize: number, total: number | null }
}
```

```ts
{
  error: {
    code: string,
    message: string,
    details?: unknown
  }
}
```

- Validate all inputs.
- Paginate every list endpoint server-side.
- Map errors to safe business codes.
- Never return stack traces, SQL, connection strings, internal payloads, or
  producer error bodies.
- Do not log request bodies or sensitive query parameters.
- Existing producer lead endpoints remain GET-only.

Authorized endpoint direction:

- `POST /api/imports`
- `GET /api/imports`
- `GET /api/imports/:id`
- `GET /api/work-queue`
- `POST /api/workspaces`
- `GET/PATCH /api/workspaces/:id`
- `GET/POST /api/workspaces/:id/activities`
- `GET/POST /api/workspaces/:id/notes`
- `GET /api/workspaces/:id/audit`

No route may call an unapproved n8n endpoint or mutate producer data.

## UI rules

- Use Brazilian formats: `dd/MM/yyyy`, `pt-BR` currency,
  `00.000.000/0000-00` CNPJ, and stored 0–100 score integers.
- Use badges for producer priority/trust/action and separate visual language
  for commercial stage.
- Include loading, empty, error, unavailable, low-confidence, and conflict
  states where applicable.
- Use concise business copy. Do not show workflow internals or technical error
  details.
- Never display an unavailable metric as zero.
- Never imply that commercial stage changed the producer recommendation.

## Environment variables

Store real values only in `.env.local` or the deployment secret manager. Keep
placeholders in `.env.example`.

Expected server-only groups:

- authentication/OIDC configuration;
- `PRODUCER_DATABASE_URL`;
- `APP_DATABASE_URL`;
- approved n8n ingress URL, HMAC key ID, and HMAC secret;
- upload limits and producer timeout;
- approved sensitive URL hosts;
- test-only PostgreSQL/n8n targets in isolated test environments.

Do not use `NEXT_PUBLIC_` for credentials, permissions, security policy, or
internal endpoints.

## Testing and quality gates

- Check `package.json` before running commands.
- Use only synthetic CSVs, identities, leads, contacts, reports, and database
  rows in tests.
- Co-locate tests with changed validators, mappers, repositories, services,
  routes, permissions, and components.
- Test HMAC canonicalization/signature/replay behavior only after a remote
  contract implementing those controls exists. Always test upload idempotency,
  app-producer correlation, and explicit completion semantics where applicable.
- Test database role isolation and cross-organization denial against a
  disposable PostgreSQL target.
- Test authorization before file/database/producer work.
- Test nullable counts, duplicate observations, unavailable sources,
  optimistic conflicts, transactional audit, sanitization, URL policy, and
  safe errors.
- For every implementation phase run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- Run contract, PostgreSQL integration, and browser/UAT scripts when their
  tasks introduce them.
- Record commands, results, test counts, and limitations.

## Production and rollout restrictions

Without separate explicit production approval, do not:

- run production migrations;
- deploy or activate the new n8n ingress;
- add or rotate production secrets;
- change producer grants;
- remove current query safety guards;
- enable a feature whose external contract or evidence gate is pending;
- store or use real CSVs, database dumps, screenshots, or fixtures;
- deploy the Prospecta changes.

Use feature flags and a gradual sequence: internal read-only validation,
app-owned writes, controlled single-file ingress, batch observation, and then
approved sensitive content. Rollback disables the affected feature flag and
stops new app-owned mutations or submissions; it never rewrites producer data
or deletes audit history.

## Pull requests and definition of done

- PR title: `[prospecta] <Title>`.
- Keep PRs focused and call out query, DTO, permission, contract, migration, or
  field-mapping changes.
- Include screenshots only with synthetic data.
- Include testing commands and skipped checks with reasons.
- Do not commit secrets, `.env.local`, real CSVs, private workflow credentials,
  production dumps, or sensitive screenshots.
- Code is done only when applicable lint, typecheck, tests, build, security
  checks, empty/error/unavailable states, and audit requirements pass.
- A phase is not production-ready merely because local code builds.
