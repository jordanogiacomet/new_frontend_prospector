# Prospecta K8s Demo Deploy
> Local synthetic demo on machine cluster

Entry: `k8s/prospecta-demo.yaml`
Image: `Dockerfile` -> `localhost:5000/prospecta/app:demo`

Flow: build image -> push local Docker registry -> `kubectl apply` -> NodePort
`192.168.0.20:30097`

Runtime:
- Namespace `prospecta-demo`
- Deployment `prospecta-demo`
- Service `prospecta-demo` NodePort `30097`
- Demo flags in ConfigMap, placeholders in Secret

Auth/upload gotcha: `src/server/auth/require-api-session.ts:requireSameOrigin()`
accepts external `Host` origin because standalone Next sees internal
`0.0.0.0:3000` behind NodePort.

Import UI gotcha: `src/app/(private)/imports/page.tsx:createIdempotencyKey()`
must not assume `crypto.randomUUID()` exists on HTTP demo origins; it falls
back to `crypto.getRandomValues()`.

Updated: 2026-07-08
