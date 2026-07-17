# Demo 3 Local Pre-production Specification

**Status:** Approved for implementation
**Date:** 2026-07-17
**Target:** `prospecta-demo3` on `192.168.0.20:30100`

## Problem

Demo 3 is currently synthetic. The owner needs every implemented page to use
real producer facts while retaining an isolated Prospecta write model and a
recoverable Kubernetes release.

## Goals

- Serve the existing NodePort through owner-approved HTTP with mandatory
  gateway authentication on the exact local LAN target.
- Keep the application actor private behind that gateway and grant every
  implemented business permission required by the single tester.
- Read real leads, lead details/history, batch observations, estimated costs,
  and allowlisted sensitive content through `prospecta_producer_read`.
- Keep imports, workspaces, activities, notes, assignments, and audit writes in
  the isolated Demo 3 app-owned database.
- Send controlled imports only through the approved internal Prospecta-to-n8n
  ingress contract.
- Replace the 20-row guard with a bounded guard that supports the observed
  22-row producer source while retaining pagination and query timeouts.
- Preserve immutable release identity, preflight, health checks, smoke checks,
  and rollback.

## Non-goals

- Internet or production exposure.
- Direct producer writes, workflow administration, reprocessing, or automatic
  retries.
- Individual user attribution behind the shared local gateway actor.
- HTTPS transport for this exact temporary local LAN profile.
- Copying real records into source control, fixtures, logs, or evidence files.
- Migrating or reusing the existing `prospecta_app_prod` database.

## Requirements

1. Anonymous requests to NodePort `30100` SHALL receive `401`.
2. Authenticated gateway requests SHALL use HTTP and reach every private page.
3. The runtime SHALL reject the Demo 3 profile unless demo data and both Demo 2
   gates are disabled.
4. Producer credentials SHALL come from the identified cluster Secret and
   retain read-only use; app credentials SHALL continue to target the isolated
   Demo 3 PostgreSQL Service.
5. Lead and work-queue APIs SHALL support the observed real source cardinality
   with server-side pagination and bounded statement timeouts.
6. Imports SHALL require `imports:read` or `imports:create` before database,
   file, hashing, or producer work.
7. Batch observation, sensitive content, and costs SHALL each remain gated by
   their feature flag and mapper/allowlist policy.
8. The rollout smoke SHALL prove anonymous denial, authenticated browser/API
   success, real-source availability, and Kubernetes readiness.
9. Rollback SHALL leave the producer untouched and preserve the Demo 3 app
   database and audit history.
10. The release evidence SHALL state that Basic Auth credentials and response
    data are observable in plaintext on the local network and that this profile
    is forbidden for internet or production exposure.

## Success criteria

- Lint, typecheck, unit tests, build, manifest validation, target preflight,
  rollout, direct NodePort smoke, and page/API UAT pass.
- Producer mutation privileges are absent from the application role.
- No secret or real record is printed or committed.
