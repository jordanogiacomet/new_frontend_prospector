# Prospecta Commercial Workspace
> T029/T030/T031/T033/T035/T036 commercial workspace APIs and queue

2026-10-16 local UI change:
- Pipeline removed from navigation, start/help guidance and company detail.
  `src/app/(private)/work-queue/page.tsx:RetiredPipelinePage()` redirects legacy
  links to Leads through `src/lib/navigation-return.ts:resolveLeadListReturnHref()`;
  only compatible company filters/pagination survive.
- Contact discovery now lives in
  `src/app/(private)/leads/[cnpj]/page.tsx:LeadDetailPage()` under independent
  contact permissions; no workspace creation or commercial permission is
  required by that flow.
- App-owned workspaces, activities, notes, cadence, audit and their APIs remain
  preserved. No database deletion, migration, producer mutation, provider
  change, deployment or integration activation accompanies UI retirement.

The queue and pipeline UI descriptions below are historical context; retained
repositories and commercial API rules still apply.

Workspace entry: `src/server/commercial/workspace-repository.ts`

Flow: caller actor context + unknown request body -> T028 Zod validator ->
`src/server/db/app-client.ts:transaction()` -> `prospecting_app.lead_workspaces`
write/read -> `prospecting_app.commercial_audit_events` insert

Mutation audit context: route →
`src/server/commercial/audit-context.ts:createCommercialAuditActorContext()` →
verified issuer + generated request correlation UUID + enumerated authorization
basis → transactional audit insert. Historical rows remain nullable; migration
`db/app/005_commercial_audit_request_context_forward.sql` requires complete
context on new rows through `NOT VALID` checks.

Activity entry: `src/server/commercial/activity-repository.ts`

Flow: actor context + workspace id + unknown request body -> T028 activity
validator -> org-scoped `lead_workspaces` read -> `lead_activities` append ->
`commercial_audit_events` `ACTIVITY_APPENDED` insert in same transaction

Note entry: `src/server/commercial/note-repository.ts`

Flow: actor context + workspace id + unknown request body -> T028 note
validator -> org-scoped `lead_workspaces` read -> `lead_notes` append ->
`commercial_audit_events` `NOTE_APPENDED` insert in same transaction

Audit reader entry: `src/server/commercial/audit-repository.ts`

Flow: actor organization + workspace id + pagination -> org-scoped active
`lead_workspaces` read -> count/list `commercial_audit_events` by organization
and workspace -> DTO mapper re-applies allowlists for `previous_metadata`,
`new_metadata`, and `metadata`

Qualification cadence entry:
`src/server/commercial/qualification-cadence-repository.ts`

Flow: active organization-scoped workspace -> one-time creation of exactly four
`lead_qualification_contacts` rows -> current contact result under workspace
and cadence row locks -> optional next-date reschedule or terminal cancellation
-> one channel-specific `lead_activities` append and one allowlisted
`ACTIVITY_APPENDED` audit append in the same transaction. The workspace UI uses
`GET/POST /api/workspaces/:id/qualification-cadence`; it never sends outreach,
detects replies or changes producer facts.

Work queue entry: `src/server/commercial/work-queue-repository.ts`

Shared current-lead membership:
`src/server/repositories/current-lead-query.ts`

Flow: authenticated actor visibility + actor organization + validated
filters/sort/pagination ->
workspace-filter CNPJ lookup when commercial filters are present ->
shared guarded current producer lead SELECT through `producer-client` ->
active org-scoped workspace lookup through `app-client` -> authorized exact-page
approach-draft lookup through the app-owned cache -> compose `producerLead`,
nullable `workspace` and nullable `approachDraft` without recalculating producer
facts

Workspace create API entry: `src/app/api/workspaces/route.ts`

Flow: `POST` only -> `requirePermission("commercial:write")` ->
`requireSameOrigin()` -> `FEATURE_COMMERCIAL_ENABLED` ->
`createLeadWorkspaceRequestSchema` -> optional `commercial:assign` check for
non-null `responsible_subject` from verified actor permissions ->
`src/server/commercial/workspace-repository.ts:createLeadWorkspace()` -> safe
`201`/`409`/`400` envelope with `Cache-Control: private, no-store`

Workspace detail/update API entry: `src/app/api/workspaces/[id]/route.ts`

Flow: `GET` -> `requirePermission("commercial:read")` ->
`FEATURE_COMMERCIAL_ENABLED` -> UUID ->
`src/server/commercial/workspace-repository.ts:getLeadWorkspace()` -> safe
`200`/`404`; `PATCH` -> `requirePermission("commercial:write")` ->
`requireSameOrigin()` -> feature -> UUID -> strict T028 update validator ->
`src/server/commercial/workspace-repository.ts:updateLeadWorkspace()` -> safe
`200`/`404`/`409`; both use `Cache-Control: private, no-store`

Rules:
- Actor organization/subject parsed from server context, not body
- Create: app UUID, org-scoped CNPJ uniqueness, `NOT_STARTED` without owner,
  `ASSIGNED` with owner
- Update: `SELECT ... FOR UPDATE`, `expected_version`, T028 transition policy,
  non-null owner replacement requires `commercial:assign`
- Activity: app UUID, observed lead run copied from current workspace, not body
- Note: app UUID, author from actor context, observed lead run copied from
  current workspace, body never copied into audit metadata
- Audit: allowlisted metadata only, same transaction as workspace/activity/note
  write
- Audit request context: server-derived only; `verified_oidc` or `local_demo3`;
  local Demo 3 basis requires the exact local-demo issuer
- Audit reader: read-only, returns `not_found` for missing/cross-org
  workspace, orders by `occurred_at DESC, audit_event_id`, and has no
  audit append/update/delete function
- Work queue: producer facts and commercial state stay contractually distinct;
  producer unavailable returns empty items with `total: null`; app DB
  unavailable remains the app-client safe database error
- Work queue membership: with no commercial filter, Leads and Queue use the
  same eligibility, actor visibility, producer filters, source guard, stable
  ordering, and pagination. Domain/workspace data only decorates the selected
  rows; no app-owned membership snapshot exists.
- Work queue approach drafts: exact priorities `B` and `C` are the approved
  C-minimum set. Missing visible-page drafts are prepared sequentially only
  when both lead/sensitive permissions and both AI feature gates pass. Ready
  drafts are reused from the organization/CNPJ/run/generator cache; `D`, `E`
  and `R` never trigger automatic generation.
- Draft generation is review-only: the queue can edit and copy the text but
  has no send action. Only the validated final message is stored app-owned;
  prompt/report/provider payloads are not retained.
- Workspace create route: never reads organization, actor, author,
  permissions, or audit metadata from the request
- Workspace detail/update route: derives organization, subject, and
  permissions only from the verified actor; PATCH passes permissions to T029
  without a blanket `commercial:assign` route check, and never returns an
  invalid-transition reason
- Queue UI: `src/app/(private)/work-queue/page.tsx:WorkspaceStartAction()`
  sends only CNPJ + observed `lead_run_id` to `POST /api/workspaces`; `201`
  opens the returned workspace. Existing workspaces use the detail link.
- DB tests with synthetic audit-failure triggers must drop their synthetic
  trigger/function before schema rollback
- Qualification cadence membership is zero or exactly four numbered rows.
  `NO_RESPONSE`, `RESPONDED` and `OTHER_RESPONSE` advance;
  `FOLLOW_UP_LATER` advances and reschedules only the next row; `QUALIFIED`,
  `NOT_INTERESTED` and `WRONG_CONTACT` cancel later rows. The fourth row cannot
  request a fifth follow-up. Time alone never completes a row.
- Cadence result summaries remain only in the linked append-only activity and
  never enter audit metadata. Successful cadence changes ask the workspace to
  reload canonical activity and audit pages.
- `/work-queue` is presented as the prospecting pipeline without changing its
  route or membership query. The UI groups the current page into Novos
  (`null`/`NOT_STARTED`), Preparação (`ASSIGNED`), Em prospecção
  (`CONTACTED`/`FOLLOW_UP`), Reunião (`MEETING`), Em espera (`PAUSED`) and
  Encerrados (`CLOSED_WON`/`CLOSED_LOST`); phase counts are explicitly
  page-local.
- Explicit qualification outcomes update the app-owned pipeline in the same
  transaction: early no-response/follow-up later -> `FOLLOW_UP`, qualified ->
  `MEETING`, not interested -> `CLOSED_LOST`. Ambiguous response, other
  response, wrong contact and fourth no-response preserve the stage and place
  a human-readable recommendation in `next_action`. Terminal workspaces never
  reopen.
- Pipeline cards always prefer persisted `next_action`; when absent they show
  a deterministic phase/message-derived orientation without writing state.
- After a confirmed cadence mutation, the workspace reloads canonical stage,
  next action and version without unmounting the commercial forms. Only locally
  edited workspace fields survive that refresh; unchanged fields adopt the
  server state. A failed refresh retains drafts, blocks stale workspace saves
  and offers a read-only refresh action without repeating the contact mutation.
- Confirmed workspace, activity and note writes reload the first audit page,
  so the audit panel reflects the transaction that was just committed.
- An absent persisted approach draft links to the lead analysis without
  promising AI generation; the lead page owns its independent feature gates.

Tests:
- Unit: `src/server/commercial/workspace-repository.test.ts`
- Unit: `src/server/commercial/audit-context.test.ts`
- Unit: `src/server/commercial/activity-repository.test.ts`
- Unit: `src/server/commercial/note-repository.test.ts`
- DB: `src/server/commercial/workspace-repository.integration.test.ts`
- DB: `src/server/commercial/activity-repository.integration.test.ts`
- DB: `src/server/commercial/note-repository.integration.test.ts`
- Unit: `src/server/commercial/audit-repository.test.ts`
- DB: `src/server/commercial/audit-repository.integration.test.ts`
- Unit: `src/server/commercial/work-queue-repository.test.ts`
- DB: `src/server/commercial/work-queue-repository.integration.test.ts`
- Unit: `src/server/lead-approach/lead-approach-draft-repository.test.ts`
- DB: `src/server/lead-approach/lead-approach-draft-repository.integration.test.ts`
- Unit: `src/server/lead-approach/prepare-lead-approach.test.ts`
- Unit: `src/app/(private)/work-queue/page.test.tsx`
- Unit: `src/app/api/workspaces/route.test.ts`
- Unit: `src/app/api/workspaces/[id]/route.test.ts`
- Unit: `src/server/commercial/qualification-cadence-repository.test.ts`
- DB: `src/server/commercial/qualification-cadence-repository.integration.test.ts`
- Unit: `src/app/api/workspaces/[id]/qualification-cadence/route.test.ts`
- Unit: `src/components/commercial/qualification-cadence.test.tsx`
- Unit: `src/server/commercial/qualification-pipeline-policy.test.ts`
- Unit: `src/lib/commercial-pipeline.test.ts`
- Integration config includes co-located `src/**/*.integration.test.ts` and
  disables file parallelism for shared disposable DB reset safety

Manager simplification 2026-10-06:
- `work-queue/page.tsx:QueueResults()` uses compact company rows grouped by
  existing phases; stage/next action/deadline are primary, evaluation secondary
- `CompanyResources()` mounts once after explicit opening, then hides without
  unmounting; contact context and edited messages survive close/reopen
- queue AI preparation is explicit per company; synchronous attempt latch and
  202 unknown prevent duplicate/automatic attempts within the current query
- `api/work-queue/route.ts` adds safe `approachPreparationEnabled` independently
  of the retained auto flag; GET remains read-only and no credential is exposed
- fallback next steps are labeled suggestions; stage remains separate from
  producer action and no recommendation/score is calculated in the client

Updated: 2026-10-06
