# Demo 3 Release Evidence — 2026-07-16

## Implemented gates

- `next typegen` and isolated TypeScript check: passed.
- ESLint: passed with zero errors and zero warnings.
- Unit/component/route/repository suite: 71 files and 1,682 tests passed.
- Production Next.js build under the Demo 3 synthetic profile: passed.
- Containerized Next.js build with two workers: passed.
- Kubernetes client dry-run: namespace, ConfigMap, services, StatefulSet,
  Deployment, NetworkPolicy accepted.
- Script syntax, shell syntax, and `git diff --check`: passed.
- HTTP n8n exception restricted to the exact approved internal endpoint.

## Published immutable release

- Release: `demo3-20260716-144825`.
- App image: `localhost:5000/prospecta/app:demo3-20260716-144825`.
- PostgreSQL image: `localhost:5000/prospecta/postgres:demo3-20260716-144825`.
- Request-edge image:
  `localhost:5000/prospecta/request-edge:demo3-20260716-144825`.
- All three images were built and published before cluster mutation.
- `.env.demo3.local` is Git-ignored and contains distinct generated owner,
  runtime-database, Auth.js, and OIDC-placeholder secrets.

## Applied cluster state

The exact preflight matched:

- context `kubernetes-admin@kubernetes`;
- API server `https://192.168.0.20:6443`;
- kube-system UID `3ae1e9e9-3768-49a7-9f26-b77f35947734`;
- namespace policy `prospecta-demo3`, non-production/disposable.

The following objects were created:

- namespace `prospecta-demo3`;
- versioned ConfigMap and separate app/PostgreSQL Secrets;
- ClusterIP app/PostgreSQL services;
- app Deployment and PostgreSQL StatefulSet;
- retained 1 GiB PVC, successfully Bound through `nfs-client`;
- egress NetworkPolicy.

## Live blocker

The release is applied but not Ready. The node reported `Ready=True`, Flannel
up, no Memory/Disk/PID pressure, and the PVC became Bound. Both application and
PostgreSQL pods remained before sandbox creation:

- no Container ID;
- no pod IP;
- `PodReadyToStartContainers=False`;
- `ContainerCreating`;
- no image, Secret, manifest, scheduling, or PVC error event.

During the rollout, host load exceeded 180 and had roughly 6,900 tasks. The
kube-apiserver repeatedly lost HTTP/2 connections and returned TLS timeouts.
Two bounded rollout waits, pod recreation, and a retained-PVC StatefulSet
`0 → 1` reconciliation did not restore sandbox creation. Restarting kubelet,
containerd, Docker, or the control plane was not authorized because it would
affect workloads outside this namespace.

PostgreSQL integration tests were also not completed: the configured local
disposable target rejected the available synthetic credential, and the
producer integration URL was absent. The failed test run made no approved
database mutation.

## Safe continuation

After the host runtime is healthy, do not rebuild or republish this release:

```bash
node scripts/deploy-demo3-k8s.mjs --published-images
```

The command revalidates context, server, UID, namespace marker, and all three
published tags. It recognizes the same currently applied release, reapplies
idempotently, waits up to ten minutes for both rollouts, and executes the local
port-forward smoke. Manual read-only checks:

```bash
kubectl -n prospecta-demo3 get pods,pvc
kubectl -n prospecta-demo3 port-forward service/prospecta-demo3 3013:80
```

No production target, producer mutation, n8n activation, NodePort, sensitive
permission, or cost permission was introduced.
