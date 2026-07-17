# Demo 3 Local Pre-production Design

**Spec:** `.specs/features/demo3-preproduction/spec.md`

## Runtime

```text
LAN browser
  -> HTTP NodePort 192.168.0.20:30100
  -> nginx gateway authentication
  -> Next.js shared pre-production actor
      -> prospecta_producer_read -> real producer SELECTs
      -> prospecta_app_rw -> isolated Demo 3 app-owned PostgreSQL
      -> approved internal n8n ingress -> controlled import submission
```

The request gateway requires a generated strong credential but intentionally
does not terminate TLS for this owner-approved local target. The credential and
response data are observable in plaintext on the LAN. Next.js continues to use
its server-only authorization boundary; the shared actor is accepted only for
this local single-tester profile.

The producer URL is copied in memory from the existing identified Kubernetes
Secret into a release-scoped Demo 3 Secret. It is never written to a manifest,
environment example, command output, or evidence file. A loopback proxy
sidecar reaches the existing PostgreSQL Service. The app-owned URL continues
to use `prospecta-demo3-postgres`.

## Data and permissions

The shared actor receives manager, auditor, sensitive, and cost capabilities
only when the owning flags are enabled. Sensitive URLs still pass the existing
hostname allowlist and sanitization mapper. Costs still expose only the
allowlisted estimated USD decimal.

Imports use the normal durable app submission service in pre-production. The
Demo 3 in-memory/import-only branch remains limited to demo-data mode.

The lead/work-queue source guard remains bounded at 1,000 source projections;
the current target has 22. Page size remains capped at 100 and producer
statements retain a two-second timeout.

## Release and rollback

Application, gateway, PostgreSQL, and database-proxy images use the same
immutable release identifier. Health probes use an unauthenticated `/healthz`
location; all application paths require gateway authentication. Smoke checks
run directly against the HTTP NodePort, verify `401` without credentials, and
verify authenticated page/API success.

Rollback uses the previous Deployment/StatefulSet revisions and never changes
producer contents. The isolated PVC is preserved.
