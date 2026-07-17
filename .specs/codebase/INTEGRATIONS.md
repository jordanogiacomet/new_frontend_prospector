# Integrations

**Analyzed:** 2026-07-16

## OIDC

- Entry: `src/server/auth/config.ts`
- Verified issuer, subject, and organization are retained in the session.
- Permission sourcing for the real OIDC path remains incomplete; unknown
  permissions fail closed.

## Producer PostgreSQL

- Entry: `src/server/db/producer-client.ts`
- Runtime intent: approved SELECT-only sources.
- Current readers include leads, retained history, batch observations, and the
  narrowly allowlisted estimated cost projection.

## App PostgreSQL

- Entry: `src/server/db/app-client.ts`, `db/app`
- Owns import intent/events, workspaces, activities, notes, and commercial audit.
- Migrations are authorized only for local/disposable non-production targets.

## n8n Import Ingress

- Entry: `src/server/imports/ingress-client.ts`
- Approved internal target: `http://192.168.0.20:30098/webhook/empresaqui/import`.
- This is the sole HTTP exception; other HTTP hosts, ports, and webhook paths
  fail environment validation. Approved HTTPS webhook forms remain supported.
- The current target acknowledges with HTTP 202 and verifies no HMAC. Production
  authentication/replay controls remain deferred.

## Local Kubernetes

- Existing Demo 2 assets target `kubernetes-admin@kubernetes`, local registry
  `localhost:5000`, and NodePort 30097.
- On 2026-07-16 the API server, registry, Docker daemon, and current demo URL did
  not respond. No Demo 3 target has yet been remotely verified.
