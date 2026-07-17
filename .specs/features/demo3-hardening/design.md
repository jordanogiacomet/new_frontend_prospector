# Prospecta Demo 3 Hardening Design

**Spec:** `.specs/features/demo3-hardening/spec.md`
**Status:** APPROVED BY OWNER REQUEST FOR AUTONOMOUS LOCAL EXECUTION

## Architecture

Demo 3 keeps the existing Next.js boundaries and applies focused corrections at
route, service/repository, mapper, UI, and deployment edges. Kubernetes assets
are separate from Demo 2. The application is reached only through a local
NodePort on the explicitly approved non-production LAN target; synthetic lead
data remains server-only. App-owned
commercial/import writes require a disposable app PostgreSQL target and are
disabled or reported unavailable when durability is not present.

```text
LAN browser -> 192.168.0.20:30100 -> request edge -> non-root Next.js
                                              -> disposable app PostgreSQL
                                              -> synthetic lead projections
                                              -X producer/n8n unless exact gate enabled
```

## Key Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Demo isolation | New namespace/script/manifest and release ID | Preserve Demo 2 and allow rollback. |
| Access | NodePort `30100` on `192.168.0.20` | Owner-approved LAN demo access for this synthetic target only. |
| Images | Release-specific tag and recorded digest when registry is healthy | Deterministic rollout/undo. |
| Auth | Explicit synthetic actor only inside the synthetic Demo 3 profile | No invented OIDC permissions. |
| Import | 202 only after app-owned durable intent | Preserve contract honesty. |
| Upload bound | Application-configured limit plus Kubernetes/edge bound | Avoid relying on Content-Length alone. |
| Audit | Allowlisted categorical metadata; no free text | Prevent indefinite sensitive duplication. |

## Component Changes

- Lead handlers and mapper: permission-aware access and audit redaction.
- Workspace policy/UI: self-claim-only assignment, correct local time conversion,
  abortable route-keyed reads, canonical pagination reloads.
- Batch service/mapper: flag gate and terminal identity conflict detection.
- Import route/client: configured byte limit, ambiguous transport state, durable
  demo semantics; streaming/edge cutoff before expensive work.
- Audit migration/repositories: categorical metadata plus actor issuer,
  correlation ID, and authorization basis.
- Test tooling: bounded Vitest workers and serialized Next type generation/build.
- Kubernetes: separate hardened workload with non-root security contexts,
  resource limits, no service-account token, probes, immutable release labels,
  and preflight/rollback script.

## Failure Handling

- Authorization and feature gates fail before I/O.
- Missing producer observations remain nullable/unavailable.
- Upload ambiguity never triggers automatic retry or a new key.
- Failed cluster preflight performs no mutation.
- Failed rollout/smoke invokes only Kubernetes release rollback; it never
  rewrites producer/app history.
