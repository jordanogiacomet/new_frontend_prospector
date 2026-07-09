# State

**Last Updated:** 2026-07-08
**Current Work:** Prospecta Kubernetes Demo - deployed

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

---

## Active Blockers

None.

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

---

## Quick Tasks Completed

| # | Description | Date | Commit | Status |
| --- | --- | --- | --- | --- |

---

## Deferred Ideas

- [ ] Replace dev-mode hostPath deployment with a production-style image once a
      non-production registry target is identified.
- [ ] Wire real non-production database credentials through Kubernetes Secrets.

---

## Todos

- [x] Validate `http://192.168.0.20:30097` after manifest apply.
