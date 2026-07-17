# Prospecta Commercial Workspace
> T029/T030/T031/T033/T035/T036 commercial workspace APIs and queue

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

Work queue entry: `src/server/commercial/work-queue-repository.ts`

Flow: actor organization + validated filters/sort/pagination ->
workspace-filter CNPJ lookup when commercial filters are present ->
guarded current producer lead SELECT through `producer-client` ->
active org-scoped workspace lookup through `app-client` -> compose
`producerLead` and nullable `workspace` without recalculating producer facts

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
- Unit: `src/app/api/workspaces/route.test.ts`
- Unit: `src/app/api/workspaces/[id]/route.test.ts`
- Integration config includes co-located `src/**/*.integration.test.ts` and
  disables file parallelism for shared disposable DB reset safety

Updated: 2026-07-16
