# Demo 3 Local Pre-production Tasks

**Spec:** `.specs/features/demo3-preproduction/spec.md`
**Design:** `.specs/features/demo3-preproduction/design.md`

- [x] D3P-01 Update the repository authority and runtime invariant from
      synthetic Demo 3 to the exact local pre-production profile.
- [x] D3P-02 Grant the shared Demo 3 actor the flag-bounded business
      permissions and add authorization/environment tests.
- [x] D3P-03 Enforce granular import permissions and route real pre-production
      imports through the normal durable service.
- [x] D3P-04 Raise the bounded producer source guard, retain pagination and
      timeouts, and test the new threshold.
- [x] D3P-05 Add HTTPS, gateway authentication, health endpoint, immutable
      database proxy, and real producer Secret wiring to Kubernetes packaging.
- [x] D3P-06 Add exact producer/n8n egress declarations and preflight checks.
- [x] D3P-07 Run lint, typecheck, tests, build, and deployment validation.
- [x] D3P-08 Publish immutable images, roll out, and execute direct NodePort
      smoke/UAT for every implemented page.
- [x] D3P-09 Record release evidence, credential retrieval, limitations, and
      rollback.
- [ ] D3P-10 Replace the self-signed HTTPS edge with owner-approved HTTP on the
      exact LAN target, retain mandatory gateway authentication, roll out an
      immutable release, and record the plaintext transport limitation.

## Completion evidence

- Immutable release: `demo3-preprod-20260717-104309`
- Direct endpoint: `https://192.168.0.20:30100`
- Quality gates: lint, typecheck, 1,682 tests, and production build passed
- UAT: every implemented private page and owning API passed
- Cluster: application `3/3`, PostgreSQL `1/1`, zero restarts
- Import: durable `202`; producer acceptance remained honestly `unknown`
- Detailed evidence:
  `.specs/features/demo3-preproduction/release-evidence-2026-07-17.md`
