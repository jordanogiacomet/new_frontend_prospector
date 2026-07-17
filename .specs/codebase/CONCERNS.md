# Codebase Concerns

**Analysis Date:** 2026-07-16

## Release Blockers

- Lead APIs do not enforce `leads:read`; audit identifiers reach the standard
  lead DTO without an `audit:read` gate.
- Assignment policy allows a writer to assign an unowned workspace to a third
  party without `commercial:assign`.
- Commercial audit metadata copies free-text `next_action` and lacks request,
  issuer, and authorization-basis context.
- Batch terminal deduplication can hide two distinct materialized runs for one
  source row and report false completion.
- Batch observation and upload-size configuration are parsed but not enforced.
- Multipart upload is materialized before the byte limit is applied.
- Synthetic demo imports return 202 using process-local state, not durable data.
- Real OIDC identities do not yet receive approved commercial permissions.

## Frontend Correctness

- `datetime-local` values are interpreted as UTC, shifting commercial activity
  facts in Brazilian time zones.
- Workspace detail can accept an out-of-order response from a previous route.
- Appending activity/note locally breaks server-side page boundaries.
- Upload transport ambiguity encourages a new idempotency key.
- Out-of-range pages can be labeled as globally empty.

## Performance and Test Reliability

- Batch list observation performs up to 100 producer reads through a pool of 2.
- Lead/history/work-queue fail-closed caps block datasets above 20/6 rows until
  query plans and indexes are proven.
- Unbounded Vitest workers exhausted available memory during the baseline.
- Next typecheck and build contend on generated `.next` type artifacts.

## Kubernetes

- Existing Demo 2 uses mutable tags, an administrative context, NodePort access,
  and a production-mode bypass; it must not be overwritten for Demo 3.
- Application container lacks a non-root security context and resource limits.
- No verified Demo 3 namespace, cluster UID, immutable release, rollback, or
  healthy API/registry currently exists.
