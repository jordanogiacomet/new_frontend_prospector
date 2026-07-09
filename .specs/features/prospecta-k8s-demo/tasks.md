# Prospecta Kubernetes Demo Tasks

**Design**: `.specs/features/prospecta-k8s-demo/design.md`
**Status**: Done

---

## Execution Plan

### Phase 1: Demo Runtime

```
T1 -> T2 -> T3
```

### Phase 2: Kubernetes Deploy

```
T3 -> T4 -> T5
```

---

## Task Breakdown

### T1: Add Demo Environment Flag

**What**: Add `FEATURE_DEMO_DATA_ENABLED` as a server-only flag and document its
placeholder.
**Where**: `src/server/env.ts`, `src/server/env.test.ts`, `.env.example`
**Depends on**: None
**Requirement**: K8SDEMO-05
**Tests**: unit
**Gate**: `pnpm test src/server/env.test.ts`

**Done when**:

- [x] Flag defaults to false when absent.
- [x] Malformed value is rejected when present.
- [x] `.env.example` documents placeholder false.

### T2: Add Synthetic Demo Data Paths

**What**: Route leads/import APIs to synthetic data when the demo flag is true.
**Where**: `src/server/demo/`, `src/app/api/leads/**`, `src/app/api/imports/**`
**Depends on**: T1
**Requirement**: K8SDEMO-01, K8SDEMO-02, K8SDEMO-03, K8SDEMO-05
**Tests**: targeted route/unit tests where practical
**Gate**: `pnpm typecheck`

**Done when**:

- [x] Auth and feature checks still run before demo data.
- [x] Demo leads, details, history, batch list, and batch detail satisfy
      current envelopes.
- [x] Demo upload validates CSV and returns `202` without DB/n8n work.

### T3: Render Non-Sensitive Insight Items

**What**: Allow available risk/signal collections to contain sanitized strings
and render them.
**Where**: `src/types/leads.ts`,
`src/app/(private)/leads/[cnpj]/page.tsx`,
`src/components/leads/lead-insights.tsx`
**Depends on**: T2
**Requirement**: K8SDEMO-02
**Tests**: component/page tests where practical
**Gate**: `pnpm typecheck`

**Done when**:

- [x] Client validation accepts arrays of non-empty strings.
- [x] UI renders risk/signal items instead of falling back.
- [x] Evidence and strategic report remain withheld/absent.

### T4: Add Local Kubernetes Manifest

**What**: Add a local demo manifest with namespace, placeholders, deployment,
NodePort service, and image build artifacts.
**Where**: `Dockerfile`, `.dockerignore`, `k8s/prospecta-demo.yaml`, `README.md`
**Depends on**: T3
**Requirement**: K8SDEMO-04, K8SDEMO-05
**Tests**: Kubernetes dry run/apply
**Gate**: `kubectl apply --dry-run=server -f k8s/prospecta-demo.yaml`

**Done when**:

- [x] Manifest uses placeholders and synthetic/demo flags only.
- [x] Service exposes `192.168.0.20:30097`.
- [x] Image points to `localhost:5000/prospecta/app:demo`.
- [x] No production migration, n8n activation, or real secret is required.

### T5: Apply and Validate Local Demo

**What**: Apply the manifest to the local cluster and validate the demo URL.
**Where**: Kubernetes cluster `kubernetes-admin@kubernetes`
**Depends on**: T4
**Requirement**: K8SDEMO-01, K8SDEMO-04
**Tests**: `kubectl rollout status`, HTTP smoke checks
**Gate**: Manual/browser smoke plus command output

**Done when**:

- [x] Pod is Ready in namespace `prospecta-demo`.
- [x] `/leads` and core APIs respond.
- [x] Limitations are recorded in the final report.

---

## Validation Tables

| Task | Scope | Status |
| --- | --- | --- |
| T1 | Env parser/docs | Granular |
| T2 | Demo server paths | Cohesive multi-route slice |
| T3 | UI insight contract | Granular |
| T4 | K8s manifest/docs | Granular |
| T5 | Apply/validate | Granular |

| Task | Depends On | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | T1 starts | Match |
| T2 | T1 | T1 -> T2 | Match |
| T3 | T2 | T2 -> T3 | Match |
| T4 | T3 | T3 -> T4 | Match |
| T5 | T4 | T4 -> T5 | Match |

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Env parser | unit | unit | OK |
| T2 | API/server | route/typecheck | targeted/typecheck | OK for reduced demo gate |
| T3 | Client component/types | component/typecheck | component/typecheck | OK |
| T4 | Infra docs | none | dry-run | OK |
| T5 | Runtime deploy | smoke | smoke | OK |
