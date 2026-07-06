# App-owned Write Model

**Status:** APPROVED FOR LOCAL/NON-PRODUCTION IMPLEMENTATION — production
migration remains blocked

## Boundary

All tables belong to the app-owned schema `prospecting_app`. No foreign key may
cascade into producer tables. Producer
identifiers are stored as external references, and producer data is never
copied as an editable app decision.

## Proposed Tables

### `import_submissions`

Stores submission and producer acceptance metadata, not CSV bytes.

Minimum fields:

- `submission_id` UUID primary key;
- `organization_id`;
- `created_by_subject`;
- sanitized `original_filename`;
- `file_sha256`;
- byte count and approved MIME type;
- `idempotency_key` with an organization-scoped uniqueness rule;
- app contract version;
- submitted timestamp and nullable durable-acceptance timestamp;
- returned producer `import_batch_id`;
- acknowledged `row_count` kept distinct from any future durable accepted-row
  count;
- status facts and last observation time;
- created/updated timestamps.

### `import_submission_events`

Append-only audit of submission, acceptance, reconciliation, and deletion
events. Payloads are allowlisted metadata only.

### `lead_workspaces`

Current app-owned commercial projection:

- app workspace identity and organization;
- external CNPJ and observed `lead_run_id`;
- responsible actor;
- commercial stage;
- next action and due time;
- commercial outcome;
- optimistic concurrency version;
- created/updated actor and timestamps;
- logical archive fields.

Suggested stages:

```text
NOT_STARTED
ASSIGNED
CONTACTED
FOLLOW_UP
MEETING
PAUSED
CLOSED_WON
CLOSED_LOST
```

These stages describe sales execution and never replace `finalAction`.

Approved transitions:

```text
NOT_STARTED → ASSIGNED
ASSIGNED → CONTACTED | PAUSED
CONTACTED → FOLLOW_UP | MEETING | PAUSED | CLOSED_WON | CLOSED_LOST
FOLLOW_UP → CONTACTED | MEETING | PAUSED | CLOSED_WON | CLOSED_LOST
MEETING → FOLLOW_UP | PAUSED | CLOSED_WON | CLOSED_LOST
PAUSED → ASSIGNED | CONTACTED | FOLLOW_UP
```

Terminal stages do not reopen in MVP 1. A future reopening policy requires a
new audited transition contract.

### `lead_activities`

Append-only contact/activity facts with actor, occurrence time, activity type,
outcome, and the `lead_run_id` observed at the time.

### `lead_notes`

App-owned commercial notes with author and timestamps. Notes are append-only
in MVP 1. Edit/delete routes do not exist.

### `commercial_audit_events`

Append-only before/after metadata for every app-owned state transition. It must
not contain raw CSV, report bodies, contacts, or producer payloads.

## Required Invariants

- Every row is organization-scoped.
- Every mutation is authorized server-side.
- Every mutation and audit event commit in one transaction.
- Actor subject and organization come from the verified session, never request
  body fields.
- `lead_run_id` is an external reference and cannot trigger producer deletion.
- Producer score, priority, action, verdict, confidence, evidence, and report
  content are not writable here.
- Concurrent ownership/stage changes use optimistic conflict detection.
- Logical archive does not delete audit events.
- Free-text length and content limits are explicit.
- Workspace next-action text is at most 500 Unicode code points.
- Activity summary is at most 1,000 Unicode code points.
- Note body is at most 4,000 Unicode code points.
- User-authored free text is never copied into audit metadata or operational
  logs.

## Prohibited Writes

- `company_validations`;
- `company_validation_runs`;
- `company_strategic_research_reports`;
- producer cache, CRM, decisions, processing state, or events;
- scoring, recommendation, verdict, priority, or trust replacements;
- producer run creation or reprocessing.

## Transaction Examples

### Assign a lead

1. Authorize `commercial:write`.
2. Lock/read workspace version.
3. Require `commercial:assign`.
4. Reject a stale version. An unassigned workspace may be claimed; changing a
   non-null responsible actor requires an exact expected version and
   `commercial:assign`.
5. Update current workspace.
6. Append audit event with actor and referenced `lead_run_id`.
7. Commit atomically.

### Record contact

1. Authorize `commercial:write`.
2. Validate activity type, time, and permitted content.
3. Append activity.
4. Optionally transition stage under an explicit transition rule.
5. Append audit event and commit.

## External Activation Blockers

- Tenant/organization isolation mechanism.
- Database roles and grants.
- Backup, restoration, and audit retention.
- Migration and rollback plan.
