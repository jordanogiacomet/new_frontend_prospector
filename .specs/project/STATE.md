# State

**Last Updated:** 2026-07-22
**Current Work:** Demo 3 updated at the approved local target with the
batch-alignment app code; the separate n8n v1/producer-worker promotion remains
gated by OPEN-01–OPEN-05

---

## Recent Decisions (Last 60 days)

### AD-001: Local k8s presentation uses explicit demo profile (2026-07-08)

**Decision:** Use `FEATURE_DEMO_DATA_ENABLED=true`, existing development auth
bypass, and synthetic data for the local Kubernetes presentation.
**Reason:** The app is incomplete and lacks approved non-production database
credentials, but the manager demo needs visible product screens.
**Trade-off:** This is not production-like runtime hardening.
**Impact:** The demo can be presented locally without producer mutation, real
CSV storage, production migration, or n8n workflow activation.

### AD-002: Local Docker registry image for Kubernetes demo (2026-07-08)

**Decision:** Build `localhost:5000/prospecta/app:demo` and let the local
cluster pull from the host's Docker registry.
**Reason:** The cluster runtime is containerd and the current user cannot import
images into the `k8s.io` namespace, but a pull test from `localhost:5000`
succeeded.
**Trade-off:** This depends on the host-local registry container.
**Impact:** The demo uses a normal image-based Deployment without hostPath source
mounts.

### AD-003: Demo 3 PostgreSQL uses an NFS-safe data subdirectory (2026-07-17)

**Decision:** Mount the disposable PVC at `/var/lib/postgresql/data`, set
`PGDATA` to its app-owned `pgdata` subdirectory, and gate liveness/readiness
behind a startup probe that verifies the final runtime-role grant.
**Reason:** The NFS root cannot be chmod-ed by the non-root PostgreSQL process,
and initialization can exceed the normal liveness window.
**Trade-off:** First startup may remain unready for several minutes on slow NFS.
**Impact:** Initialization remains non-root and cannot be reported Ready before
schema, role, and grants exist.

### AD-004: Demo 3 frontend uses the approved LAN NodePort (2026-07-17)

**Decision:** Expose only the Demo 3 frontend Service as NodePort `30100` on
`192.168.0.20`; keep PostgreSQL as ClusterIP.
**Reason:** The repository owner explicitly corrected the presentation access
requirement from port-forward to NodePort.
**Trade-off:** The synthetic auth-bypass demo is reachable on the local LAN and
must not be treated as a secure or production profile.
**Impact:** Demo 3 is available at `https://192.168.0.20:30100`; no persistent
port-forward service is required.

### AD-005: Demo 3 becomes the local pre-production target (2026-07-17)

**Decision:** Promote the exact Demo 3 namespace and NodePort to a
single-tester local pre-production profile. Read real producer facts with the
existing read-only role, preserve an isolated app-owned database, and require
HTTPS gateway authentication before the shared application actor.
**Reason:** The owner needs all implemented pages and real producer data for
end-to-end product testing, while the available OIDC settings remain
placeholders.
**Trade-off:** Audit identifies the shared pre-production actor rather than an
individual corporate identity, and the self-signed LAN certificate requires
local browser acceptance.
**Impact:** The permanent producer write boundary remains unchanged; Demo 3
can exercise real reads and app-owned writes without anonymously exposing the
application on the LAN.

### AD-006: Demo 3 local pre-production uses HTTP (2026-07-17)

**Decision:** Replace the self-signed HTTPS edge with plain HTTP on the exact
local `192.168.0.20:30100` target while retaining mandatory gateway Basic Auth.
**Reason:** The owner explicitly accepted real producer facts over HTTP to
remove the browser certificate interruption for the current LAN test.
**Trade-off:** Gateway credentials and response data can be intercepted on the
local network. This profile is unsuitable for internet or production access.
**Impact:** The shared actor, real read-only producer access, isolated app-owned
writes, immutable release, preflight, and anonymous `401` remain unchanged.

### AD-007: Canonical producer acceptance migration chain (2026-07-22)

**Decision:** Keep only `003_import_acceptance.sql` followed by
`004_import_acceptance_rollback.sql`; the alternate `_v1` drafts were removed
after full semantic comparison.
**Reason:** The canonical pair is the only sequence referenced by integration
tests and is stricter about manifest shape, source-row identity, exact durable
row membership, public grants, and non-idempotent DDL.
**Trade-off:** The draft's `uuid` column type and `IF NOT EXISTS`/`OR REPLACE`
forms were not retained because they added no required rule and weakened a
reviewable operator-owned migration.
**Impact:** `db/producer/` now has one unambiguous acceptance/rollback chain;
OPEN-05 still blocks application outside disposable local PostgreSQL.

### AD-008: Current n8n export is a behavior baseline only (2026-07-22)

**Decision:** Keep the active 98-node current workflow immutable and use its
ignored local export only as static behavior evidence. Do not call, clone or
adapt that workflow in place; OPEN-02 requires a separately approved producer
worker and terminal adapter behind the versioned ingress.
**Reason:** The export has no subworkflow entry, responds before any Postgres
node, uses legacy identities, persists only legacy facts and sends fallible
callbacks after the response.
**Trade-off:** The ingress v1 remains fail-closed after durable acceptance and
cannot complete batches until the producer worker is explicitly approved and
implemented.
**Impact:** The current workflow and its scoring/recommendation semantics remain
untouched. The sanitized implementation direction is recorded in
`.specs/features/batch-import-n8n-alignment/evidence/current-workflow-static-review-2026-07-22.md`.

### AD-009: Demo 3 applies app-owned upgrades before app rollout (2026-07-22)

**Decision:** Package the idempotent app migration
`006_import_acceptance_reconciliation_forward.sql` in fresh PostgreSQL images
and stream it transactionally to an existing Demo 3 PostgreSQL pod before
replacing the application. Verify that the legacy unique producer-batch index
is absent and the canonical non-unique index is present before continuing.
**Reason:** The persistent Demo 3 database retained the old unique index even
though the application code already allowed separate submissions to correlate
to the same canonical producer batch. The first deploy attempt also proved
that `kubectl exec` without `--stdin` can exit successfully without applying
the supplied SQL.
**Trade-off:** A release may make a backward-compatible app-owned index change
before a later manifest/smoke failure; rollback restores application images
but intentionally does not recreate the obsolete unique index.
**Impact:** Release `demo3-preprod-20260722-batch-alignment-001` is running at
`http://192.168.0.20:30100`; schema verification returned the canonical `0|1`
index state and authenticated route/API smoke passed. No producer DDL or n8n
change was made.

---

## Active Blockers

- **OPEN-01:** Identify and authorize a separate non-production HTTPS v1 URL,
  workflow ID/version, and inspection source before any remote contract run.
- **OPEN-02:** Approve a separate producer worker and idempotent terminal
  adapter that preserve the current rules and emit the exact
  `prospecta-producer-worker-v1` envelope; the reviewed current workflow has no
  reusable subworkflow entry.
- **OPEN-03:** Approve an idempotent runner for late reconciliation; until then,
  timeouts remain `ACCEPTANCE_UNKNOWN` and are never re-uploaded.
- **OPEN-04:** Name the operational owner and evidence-based freshness window
  before enabling `NO_UPDATE`.
- **OPEN-05:** Name the disposable external target, database owner, credentials,
  rollback owner, and approval before applying producer DDL anywhere else.

The updated Demo 3 application release itself has no active blocker; these five
blockers apply to the separate n8n v1 batch-alignment promotion path. Demo 3
continues to use the approved legacy ingress URL and must not be represented as
v1 end-to-end completion.

---

## Lessons Learned

### L-001: Local cluster uses containerd without user-level image import

**Context:** Planning Prospecta local Kubernetes deployment.
**Problem:** `ctr -n k8s.io images ls` fails with permission denied.
**Solution:** Push the image to the existing local Docker registry and reference
`localhost:5000/prospecta/app:demo` from the Kubernetes Deployment.
**Prevents:** Spending time on a local Docker image that kubelet cannot see.

### L-002: Next standalone request URL used internal bind host

**Context:** Smoke testing `POST /api/imports` through NodePort.
**Problem:** `requireSameOrigin()` compared `Origin` to `request.url`, which was
`http://0.0.0.0:3000` inside standalone Next.
**Solution:** Also accept the exact origin derived from `Host` and optional
`X-Forwarded-Proto` headers.
**Prevents:** False 403 on same-origin browser uploads through NodePort/proxy.

### L-003: `kubectl exec` needs stdin enabled for streamed migrations

**Context:** Applying app-owned migration `006` before the Demo 3 rollout.
**Problem:** `psql` exited successfully with no SQL when `kubectl exec` omitted
`--stdin`, leaving the legacy unique index unchanged.
**Solution:** Use `kubectl exec --stdin`, run `psql --single-transaction` and
require a structural postcondition before applying the manifest.
**Prevents:** Reporting a successful release when an app-owned migration was
never consumed.

---

## Quick Tasks Completed

| # | Description | Date | Commit | Status |
| --- | --- | --- | --- | --- |
| 001 | Link upload result to evidence-based batch progress | 2026-07-15 | `feat(imports): link upload result to batch progress` | ✅ Done |

---

## Deferred Ideas

- [ ] Replace dev-mode hostPath deployment with a production-style image once a
      non-production registry target is identified.
- [ ] Wire real non-production database credentials through Kubernetes Secrets.
- [ ] Replace the shared Demo 3 actor with corporate OIDC and individual audit
      attribution before any broader rollout.

---

## Todos

- [x] Validate `http://192.168.0.20:30097` after manifest apply.
- [x] Release Demo 3 through the approved LAN NodePort at
      `http://192.168.0.20:30100`.
- [x] Promote Demo 3 to local pre-production with real producer SELECTs,
      isolated app-owned writes, gateway authentication, and route/API UAT.
- [x] Release the owner-approved HTTP transport for the exact Demo 3 LAN
      target while retaining gateway authentication.
- [x] Release `demo3-preprod-20260722-batch-alignment-001` with the app-owned
      reconciliation index migrated and verified.
