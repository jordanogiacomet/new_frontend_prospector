# Demo 3 Local Pre-production Release Evidence

**Date:** 2026-07-17
**Release:** `demo3-preprod-20260717-104309`
**Target:** `prospecta-demo3`
**Endpoint:** `https://192.168.0.20:30100`

No credential, real producer identifier, producer value, CSV content, or
private payload is recorded in this evidence.

## Quality gates

| Gate | Result |
| --- | --- |
| Lint | Passed |
| Strict TypeScript | Passed |
| Unit/integration suite | 71 files, 1,682 tests passed |
| Production build | Passed with compile-time runtime gates disabled |
| Deploy preflight | Exact context, HTTPS API, cluster UID, namespace marker, source Secret, endpoints, and immutable tags passed |

The local development environment selects the authorized Demo 2 bypass. The
production build therefore used explicit compile-time gate overrides; the
deployed Demo 3 ConfigMap separately enforces its approved production runtime
invariants.

## Runtime evidence

| Check | Result |
| --- | --- |
| Anonymous NodePort request | `401` |
| Authenticated NodePort request | Passed through HTTPS gateway |
| Application pod | `3/3` Ready, zero restarts |
| App-owned PostgreSQL pod | `1/1` Ready, zero restarts |
| Real producer lead source | Available through read-only role |
| Producer work queue | Available |
| Allowlisted sensitive mapper | Available |
| App-owned workspace | Available |
| Append-only activity | `201` |
| Append-only note | `201` |
| Controlled import | Durable `202`; producer outcome `unknown` |

The `unknown` producer outcome is contract-correct: the app recorded the
submission durably but did not invent remote acceptance and did not retry.

## Page and API UAT

The login redirect, leads, lead detail/history, work queue, workspace,
imports, batch list/detail, and cost pages passed. Their owning leads,
workspace, activities, notes, audit, imports, batch detail, and costs APIs
also passed.

UAT mutations used only synthetic input and the isolated Demo 3 app database.
Producer access remained SELECT-only.

## Credential retrieval

Retrieve the generated gateway username and password locally without writing
them to repository files:

```bash
kubectl -n prospecta-demo3 get secret \
  prospecta-demo3-gateway-secrets-demo3-preprod-20260717-104309 \
  -o jsonpath='{.data.DEMO3_GATEWAY_USERNAME}' | base64 -d; echo
kubectl -n prospecta-demo3 get secret \
  prospecta-demo3-gateway-secrets-demo3-preprod-20260717-104309 \
  -o jsonpath='{.data.DEMO3_GATEWAY_PASSWORD}' | base64 -d; echo
```

The certificate is self-signed for the local LAN target, so the browser must
explicitly accept it.

## Rollback

Rollback changes only the immutable application release:

```bash
kubectl -n prospecta-demo3 rollout undo deployment/prospecta-demo3
kubectl -n prospecta-demo3 rollout status deployment/prospecta-demo3
```

Do not delete the Demo 3 PVC during rollback. The app-owned audit history is
preserved and producer data is never rewritten.

## Accepted local limitations

- Shared tester identity; corporate OIDC and individual audit attribution are
  deferred.
- Self-signed LAN certificate.
- Kubernetes Secrets are not an encrypted-at-rest secret manager.
- The local Flannel installation may not enforce NetworkPolicy; runtime
  destination validation and database least privilege remain mandatory.
