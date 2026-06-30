# AGENTS.md

## Project overview

* This repository contains a new read-only frontend/API layer for lead qualification data already produced by an existing n8n workflow.
* The existing n8n workflow is the data producer and must remain untouched.
* This app is only a business interface for reading, filtering, reviewing, and presenting PostgreSQL data.
* The main user is a business manager, not a technical n8n operator.
* Prioritize simple flows, business language, auditability, and safe read-only access.
* The product should feel like an internal CRM/lead intelligence dashboard, not like a workflow automation tool.
* Do not call n8n from this app.
* Do not upload CSV files from this app.
* Do not trigger imports from this app.
* Do not reprocess leads from this app.
* Do not edit, clone, activate, or require changes to the production n8n workflow.
* Do not duplicate n8n scoring, enrichment, cache, validation, or qualification logic in the frontend/API.

## Business context

* The existing n8n workflow processes EmpresaAqui CSV exports and writes lead qualification data to PostgreSQL.
* The new app reads this data and helps the business understand which companies are good opportunities.
* The app should help a manager answer:

  * Which companies were analyzed?
  * Which leads are the best opportunities?
  * Which leads should be approached, nurtured, ignored, or reviewed?
  * Why was a company recommended or rejected?
  * What risks, positive signals, and evidence support the recommendation?
  * What is the history of analyses for a company, when available?
  * Which data is incomplete, unavailable, or low confidence?
* The app should hide low-level workflow complexity and expose final decisions, scores, risks, signals, evidence, and reports clearly.

## Existing n8n workflow context

* The existing n8n workflow already works and must not be changed by this project.
* Use the sanitized workflow documentation only as a reference for:

  * field names;
  * output concepts;
  * database tables;
  * processing flow;
  * integration context;
  * business meaning of scores and recommendations.
* The app must treat n8n as an external data producer, not as something it controls.
* The app must not assume it can fix missing or inconsistent data by changing n8n.
* If data is missing, stale, mutable, or incomplete, represent that honestly in the UI.

The workflow may generate or store fields such as:

* `import_batch_id`
* `lead_run_id`
* `idempotency_key`
* `cnpj_normalizado`
* `source_row`
* `source_hash`
* `agent_version`
* `preTrustScore`
* `preTrustStatus`
* `finalScore`
* `finalVerdict`
* `trustStatus`
* `icpScore`
* `priority`
* `strategicAssetScore`
* `finalAction`
* `finalActionReason`
* `agentValidation`
* `riskFlags`
* `positiveSignals`
* `evidences`
* `strategicResearchReport`

Keep these concepts stable when they appear in API, database, or UI contracts.

## Project scope

### In scope for the first MVP

* Authentication/private access.
* Read-only lead list.
* Lead detail page.
* Lead analysis history when safely available.
* Basic filters, search, sorting, and pagination.
* Optional batch/source view if existing PostgreSQL data supports it safely.
* Clear empty, loading, error, unavailable, and low-confidence states.
* Server-side PostgreSQL reads only.
* Safe API responses for frontend consumption.
* Business-friendly labels and formatting.

### Out of scope for the first MVP

* CSV upload.
* Calling n8n.
* Triggering imports.
* Reprocessing leads.
* Editing n8n workflows.
* Creating n8n clones.
* Retry/idempotency/import acceptance logic.
* Early `202 Accepted` import protocol.
* Production database migrations.
* Exporting data.
* Full dashboard metrics if they are not safely supported by existing data.
* Human review write actions.
* Any write action against lead data.
* Any action that changes scoring, qualification, enrichment, cache, or CRM matching semantics.

## Dev environment tips

* Use `pnpm` unless the repo already uses another package manager.
* If starting from scratch, use:

```bash
pnpm create next-app@latest <project_name> --ts --tailwind --eslint --app
```

Recommended stack:

* Next.js App Router
* TypeScript
* Tailwind CSS
* shadcn/ui
* PostgreSQL
* Prisma or a typed SQL layer
* Zod
* TanStack Table
* Recharts only if dashboard/metrics become approved later

Rules:

* Keep database access server-side only.
* Never expose database URLs, API keys, secrets, or raw credentials to the browser.
* Store real secrets in `.env.local` or the deployment platform.
* Keep only placeholders in `.env.example`.

## Repo conventions

* Put route handlers under `src/app/api`.
* Put pages/routes under `src/app`.
* Put shared UI components under `src/components`.
* Put reusable formatters under `src/lib/formatters`.
* Put database access under `src/server/db`, `src/server/repositories`, or an equivalent server-only layer.
* Put shared domain types under `src/types`.
* Put Zod schemas under `src/lib/validators` or near the route that uses them.
* Put API DTO mappers under `src/server/mappers` or near the repository that owns the query.
* Prefer small, focused files over large components.
* Keep business logic out of React components.
* Prefer clear service/repository functions for server-side read logic.

## Architecture rules

Allowed flow:

```text
Frontend → App API → PostgreSQL
```

Not allowed:

```text
Frontend → PostgreSQL
Frontend → n8n webhook
App API → n8n webhook for MVP 1
App API → production workflow mutation
```

Rules:

* The frontend should call only this app's API.
* The API should handle authentication, authorization, validation, database reads, pagination, mapping, and error handling.
* Use API mappers or database views for frontend-friendly data.
* Do not bind UI components directly to large raw workflow JSON payloads.
* Use pagination for every list endpoint.
* Preserve audit fields when available:

  * `import_batch_id`
  * `lead_run_id`
  * `source_row`
  * `source_hash`
  * `agent_version`
  * timestamps
* Do not overwrite, mutate, or backfill historical analysis results from this app.
* Do not create new lead runs from this app in MVP 1.

## Database/read model rules

* PostgreSQL is the source for this read-only app.
* Prefer existing views or stable read queries documented in `docs/db`.
* If a table is mutable or projection-only, document that caveat and avoid presenting it as immutable history.
* If a field can be absent, nullable, stale, or incomplete, model it explicitly.
* Do not invent data to fill missing reports, scores, evidence, or history.
* Do not treat missing data as zero unless the database contract explicitly says it means zero.
* Use parameterized queries.
* Avoid raw SQL in UI components.
* Keep all query logic server-side.
* Any new database migration requires explicit approval and is out of scope for MVP 1 unless separately authorized.

## Domain rules

* Do not recalculate:

  * `finalScore`
  * `priority`
  * `finalAction`
  * `finalVerdict`
  * `icpScore`
  * `strategicAssetScore`
  * `trustStatus`
* The frontend can map technical values to:

  * labels;
  * badges;
  * colors;
  * filters;
  * sorting;
  * user-friendly copy.
* Show technical fields only in audit or advanced sections.
* Prefer business labels in the UI:

  * `finalAction` → "Ação recomendada"
  * `finalScore` → "Pontuação"
  * `finalVerdict` → "Veredito"
  * `trustStatus` → "Status de confiança"
  * `riskFlags` → "Riscos encontrados"
  * `positiveSignals` → "Sinais positivos"
  * `evidences` → "Evidências"
  * `import_batch_id` → "Lote de importação"
  * `lead_run_id` → "Execução da análise"
* If a lead has missing report data, show an empty state such as "Relatório ainda não disponível".
* If a recommendation is low confidence, make that visible to the user.
* If history is incomplete or unavailable, show that clearly instead of fabricating a timeline.

## MVP screens

Build in this order:

1. Login/private access
2. Lead list
3. Lead detail
4. Lead history/audit section
5. Optional batch/source view, only if existing data safely supports it

Each page must include:

* loading state;
* empty state;
* error state;
* unavailable data state where applicable.

## Screen details

### Login/private access

* Require authentication before accessing private pages.
* Do not expose private lead data to unauthenticated users.
* Keep the first version simple.
* Authorization may start as a single-organization model unless a multi-tenant requirement is explicitly approved.

### Lead list

Support server-side pagination and filtering.

Useful filters, if supported by the database:

* CNPJ
* company name
* city
* UF
* priority
* recommended action
* score range
* trust status
* date range
* batch/source identifier, if safely available

Useful columns:

* Company
* CNPJ
* City/UF
* CNAE or sector, when available
* Score
* Priority
* Recommended action
* Trust/confidence status
* Last analysis date
* Batch/source reference, when available

Rules:

* Do not load all rows into the browser.
* Do not sort/filter client-side over large datasets.
* Preserve the selected `lead_run_id` or equivalent audit identity when available.

### Lead detail

Show:

* company identity;
* contact data when available;
* fiscal/commercial data when available;
* recommendation;
* score;
* priority;
* risks;
* positive signals;
* evidence;
* strategic report;
* audit identifiers;
* history when safely available.

Rules:

* Missing evidence, report, or history must be shown as missing.
* Do not expose raw payloads by default.
* Markdown/report fields must be sanitized before rendering.
* External URLs must be validated before being rendered as clickable links.

### Lead history

Show previous analyses/runs when safely reconstructable from existing data.

Useful fields:

* run identifier;
* batch/source identifier;
* analysis date;
* score;
* final verdict;
* final action;
* agent version;
* source hash;
* cache/provenance indicator when available.

Rules:

* Do not collapse distinct run identifiers.
* Do not present mutable projection rows as immutable history unless the database contract supports it.
* If history is not reliable, omit this screen or mark it as incomplete.

### Optional batch/source view

Only include this if existing PostgreSQL data supports it safely.

May show:

* batch/source identifier;
* import/analysis date;
* total rows when available;
* processed rows when available;
* failed/blocked/cache counts when reliable;
* link to filtered leads.

Rules:

* Do not infer progress from frontend state.
* Do not trigger imports.
* Do not call n8n.
* Do not display missing metrics as confirmed zeroes.

## UI requirements

Use Brazilian formatting:

* Dates: `dd/MM/yyyy`
* Currency: `pt-BR`
* CNPJ: `00.000.000/0000-00`
* Scores: integers from 0 to 100

UI rules:

* Use badges for priority, trust status, and recommended action.
* Prefer concise business copy over technical workflow terms.
* Do not show stack traces or technical error details to business users.
* Use skeletons or loading states while data is loading.
* Use empty states for:

  * no data;
  * no matching filters;
  * no report;
  * no evidence;
  * no history;
  * unavailable data.

## Recommended API routes

Read-only MVP routes:

* `GET /api/leads` — list leads with filters and pagination.
* `GET /api/leads/:cnpj` — get lead details.
* `GET /api/leads/:cnpj/history` — get lead processing history, if safely available.
* `GET /api/imports` — optional read-only list of batches/sources, if supported.
* `GET /api/imports/:id` — optional read-only batch/source status, if supported.

Do not create these routes in MVP 1:

* `POST /api/imports`
* `POST /api/leads/:cnpj/reprocess`
* `GET /api/exports/leads.csv`
* any route that calls n8n;
* any route that writes lead review decisions;
* any route that mutates production data.

## API response patterns

Use consistent response shapes.

Success:

```ts
{
  data: unknown,
  meta?: Record<string, unknown>
}
```

Paginated list:

```ts
{
  data: unknown[],
  meta: {
    page: number,
    pageSize: number,
    total: number
  }
}
```

Error:

```ts
{
  error: {
    code: string,
    message: string,
    details?: unknown
  }
}
```

Rules:

* Error messages must be safe for business users.
* Do not return stack traces.
* Do not leak SQL queries, connection strings, secrets, or internal payloads.
* Map database errors to safe error codes.

## Security

* Require authentication for private pages and API routes.
* Validate authorization server-side.
* Keep database credentials server-side only.
* Do not log full payloads containing CNPJ, email, phone, CRM history, or strategic reports.
* Do not commit `.env`, `.env.local`, production CSVs, screenshots with real data, or database dumps.
* Use parameterized queries when raw SQL is necessary.
* Treat all lead data as sensitive business data.
* Do not expose raw strategic reports or evidence URLs without sanitization/validation.
* Use least-privilege database credentials for read-only access when possible.
* Prefer a database role that can only read approved tables/views for this application.

## Environment variables

Store real values in `.env.local` or the deployment platform.

Keep only placeholders in `.env.example`.

```env
DATABASE_URL="postgresql://readonly_user:password@localhost:5432/app"
NEXTAUTH_SECRET="change-me"
NEXTAUTH_URL="http://localhost:3000"
```

Do not include n8n webhook variables in MVP 1 unless a future phase explicitly approves n8n integration.

## Testing instructions

* Check `package.json` before running commands.
* Run `pnpm install` if dependencies are missing.
* Run `pnpm lint` after changing components, routes, imports, or formatting.
* Run `pnpm typecheck` if the script exists.
* Run `pnpm test` if the script exists.
* Run `pnpm build` before considering the task complete.

Add or update tests for changed logic, especially:

* API input validation;
* lead filters;
* pagination bounds;
* CNPJ/date/currency formatters;
* action/status label mapping;
* permission checks;
* database mapper behavior;
* null/missing field handling;
* Markdown/report sanitization;
* safe error mapping.

To focus Vitest, use:

```bash
pnpm vitest run -t "<test name>"
```

If a script does not exist, mention it in the final response and suggest adding it.

## PR instructions

* Title format: `[read-only-leads] <Title>`.
* Keep PRs small and focused.
* Include a short summary of changes.
* Include screenshots for visible UI changes.
* Include testing notes with the commands that were run.
* Mention skipped checks and why.
* Never include secrets, real lead data, production CSVs, database dumps, or screenshots with sensitive information.
* Do not mix unrelated refactors with feature work.
* Call out any change to database queries, DTO contracts, or field mappings.

## Code style

* Use TypeScript strictly.
* Avoid `any`; prefer typed DTOs and domain types.
* Keep React components small and focused.
* Keep business logic out of UI components.
* Use clear domain names such as:

  * `LeadSummary`
  * `LeadDetail`
  * `LeadHistoryItem`
  * `LeadAction`
  * `StrategicReport`
  * `LeadRisk`
  * `LeadSignal`
* Prefer readable code over clever abstractions.
* Add comments only when they explain non-obvious business, database, or audit decisions.

## Definition of done

* Code builds successfully.
* TypeScript passes.
* Lint passes or limitations are documented.
* Relevant tests pass or missing scripts are documented.
* API inputs are validated.
* UI includes loading, empty, error, and unavailable states.
* Sensitive values are not exposed to the browser.
* Database access is server-side only.
* No n8n call is introduced.
* No write operation is introduced.
* No production migration is introduced.
* The final response explains what changed and which checks were run.

## Do not do without explicit approval

* Do not edit the production n8n workflow.
* Do not create or activate an n8n clone.
* Do not call n8n webhooks.
* Do not add CSV upload.
* Do not add reprocess actions.
* Do not change scoring rules.
* Do not rename core n8n fields.
* Do not remove database columns.
* Do not delete historical runs.
* Do not expose direct database access to the frontend.
* Do not add write APIs.
* Do not run production migrations.
* Do not add heavy dependencies without a clear reason.
* Do not use real lead data in tests, seeds, screenshots, or fixtures.

## n8n workflow reference

* A sanitized n8n workflow export may live under `docs/n8n/workflows/`.
* Use it only as a reference for:

  * output field names;
  * database writes;
  * business meanings;
  * integrations;
  * processing context.
* Do not edit the production n8n workflow from this repository.
* Do not commit credentials, tokens, real payloads, private URLs, webhook IDs, or secrets.
* If the workflow changes outside this project, update documentation and read-only DTO mappings as needed, but do not make this app responsible for managing that workflow.

## Project principle

This project starts simple:

```text
Existing n8n workflow → PostgreSQL → read-only frontend/API
```

Not this:

```text
Frontend/API → n8n → import/retry/reprocess pipeline
```

Keep the first MVP read-only, safe, useful, and business-friendly.
