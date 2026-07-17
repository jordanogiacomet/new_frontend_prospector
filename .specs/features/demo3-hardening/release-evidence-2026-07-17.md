# Demo 3 Release Evidence — 2026-07-17

## Released artifact

- Release: `demo3-20260717-120127`.
- App: `localhost:5000/prospecta/app:demo3-20260717-120127`.
- PostgreSQL: `localhost:5000/prospecta/postgres:demo3-20260717-120127`.
- Request edge:
  `localhost:5000/prospecta/request-edge:demo3-20260717-120127`.
- The previously gated application image was reused byte-for-byte. Only the
  PostgreSQL packaging, nginx configuration, and Kubernetes runtime contract
  changed.

## Target and rollout

- Context: `kubernetes-admin@kubernetes`.
- API: `https://192.168.0.20:6443`.
- `kube-system` UID:
  `3ae1e9e9-3768-49a7-9f26-b77f35947734`.
- Namespace: `prospecta-demo3`, explicitly non-production and disposable.
- Node `mercury`: Ready with containerd, kubelet, and Docker active.
- Deployment: `1/1`, two containers Ready, zero restarts.
- PostgreSQL StatefulSet: `1/1`, zero restarts.
- PVC: new disposable 1 GiB `nfs-client` volume, Bound.
- Frontend Service: NodePort `30100`; PostgreSQL Service: ClusterIP.

## Corrected live failures

- PostgreSQL uses `/var/lib/postgresql/data/pgdata` because the NFS mount root
  rejects chmod from the non-root UID.
- The app-role init script is owned by `postgres:postgres`, retaining mode
  `0500`.
- The startup probe remains closed until the final runtime-role table grant
  exists, preventing liveness from interrupting slow initialization.
- All nginx temporary paths use the writable `/tmp` EmptyDir while the root
  filesystem remains read-only.

## Verification

- Configuration validation, exact target preflight, Kubernetes client dry-run,
  shell syntax, image builds, and nginx read-only-root config test passed.
- A disposable local PostgreSQL image check completed all migrations, created
  `prospecta_app_rw`, and returned `startup_probe_result=t`.
- The live database contains six `prospecting_app` tables, the runtime role has
  import read/write grants, and the three audit-context columns exist.
- `/api/leads`, `/api/work-queue`, and `/api/imports` returned 200.
- `/api/costs` returned the expected 403.
- A synthetic EmpresaAqui CSV returned 202 with
  `SUBMISSION_RECORDED`, `producerOutcome=unknown`, and no claimed durable
  producer acceptance.
- Repeating the same key and bytes returned the original submission with
  `meta.result=duplicate`; different bytes with that key returned HTTP 409.
- A synthetic commercial workspace was created and read successfully; its
  audit row stored non-null issuer and request-correlation context with
  `authorization_basis=local_demo3`.
- Private API responses returned `Cache-Control: private, no-store`.
- `/imports`, `/imports/batches`, `/work-queue`, and the created workspace
  detail page returned HTTP 200.
- Final `git diff --check` passed.

## Access

```bash
http://192.168.0.20:30100
```

Direct NodePort smoke returned HTTP 200 for the browser and private APIs. The
obsolete transient port-forward unit was stopped. No public-internet exposure,
production migration, producer mutation, sensitive permission, cost
permission, or n8n activation was introduced.
