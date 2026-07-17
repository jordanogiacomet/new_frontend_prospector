# Demo 3 Local HTTP Release Evidence

**Date:** 2026-07-17
**Release:** `demo3-preprod-http-20260717-113107`
**Target:** `prospecta-demo3`
**Endpoint:** `http://192.168.0.20:30100`

No credential, real producer identifier, producer value, CSV content, or
private payload is recorded in this evidence.

## Quality gates

| Gate | Result |
| --- | --- |
| Lint | Passed with the repository-local ESLint binary |
| Strict TypeScript | Passed with Next type generation and repository-local TypeScript |
| Unit suite | 71 files, 1,682 tests passed |
| Production build | Passed with compile-time runtime gates disabled |
| nginx configuration | Container `nginx -t` passed |
| Kubernetes manifest | Client dry-run passed |
| Deploy preflight | Exact context, HTTPS Kubernetes API, cluster UID, namespace marker, source Secret, endpoints, and immutable tag checks passed |

`pnpm` was unavailable on the host PATH, so the repository-local binaries were
used as permitted by `.specs/codebase/TESTING.md`. The first production build
correctly rejected the Demo 2 flags inherited from `.env.local`; the successful
build used process-only overrides that disabled all Demo runtime gates. The
deployed ConfigMap independently enables only the approved Demo 3 profile.

## Runtime evidence

| Check | Result |
| --- | --- |
| Anonymous lead API | `401` |
| Authenticated login | `307` application redirect |
| Authenticated leads API | `200` |
| Authenticated work queue API | `200` |
| Authenticated imports API | `200` |
| Authenticated costs API | `200` |
| Legacy HTTPS endpoint | Disabled |
| Application pod | `3/3` Ready, zero restarts |
| App-owned PostgreSQL pod | `1/1` Ready, zero restarts |
| Service | HTTP port `80`, NodePort `30100` |

The application, request edge, PostgreSQL proxy, and app-owned PostgreSQL all
use the immutable `demo3-preprod-http-20260717-113107` image tag. Real producer
facts remain available through the existing read-only role; Prospecta writes
remain isolated in the Demo 3 app-owned database.

## Credential retrieval

Retrieve the release-scoped gateway username and password locally without
writing either value to repository files:

```bash
kubectl -n prospecta-demo3 get secret \
  prospecta-demo3-gateway-secrets-demo3-preprod-http-20260717-113107 \
  -o jsonpath='{.data.DEMO3_GATEWAY_USERNAME}' | base64 -d; echo
kubectl -n prospecta-demo3 get secret \
  prospecta-demo3-gateway-secrets-demo3-preprod-http-20260717-113107 \
  -o jsonpath='{.data.DEMO3_GATEWAY_PASSWORD}' | base64 -d; echo
```

## Accepted local limitation

Basic Auth protects against anonymous access but does not provide transport
confidentiality over HTTP. A party with visibility into this local network can
observe or replay the gateway credential and read response data. This exception
is limited to the exact single-tester LAN target and is forbidden for another
shared environment, internet exposure, or production.

## Rollback

Rollback changes only the immutable application release:

```bash
kubectl -n prospecta-demo3 rollout undo deployment/prospecta-demo3
kubectl -n prospecta-demo3 rollout status deployment/prospecta-demo3
```

Do not delete the Demo 3 PVC during rollback. App-owned audit history remains
preserved and producer data is never rewritten.
