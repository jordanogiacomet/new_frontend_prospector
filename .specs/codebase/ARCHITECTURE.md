# Architecture

**Analyzed:** 2026-07-16
**Pattern:** layered Next.js monolith with explicit data-ownership boundaries

## High-Level Structure

Browser requests private pages and same-origin APIs. Route handlers authenticate,
authorize, validate, and call focused server modules. Producer repositories use a
read-only PostgreSQL pool; imports and commercial workspaces use a separate
app-owned pool. Only the import service may call the approved n8n ingress.

## Identified Patterns

### Private API boundary

- Location: `src/app/api`, `src/server/auth/require-api-session.ts`
- Pattern: authorization before feature checks, parsing, databases, hashing, or
  producer calls; mutation routes also enforce same-origin.
- Exceptions found by audit: lead routes currently require a session but not the
  `leads:read` permission.

### Safe API envelopes

- Location: `src/server/api/errors.ts`
- Pattern: `{ data, meta? }`, paginated metadata, and business-safe error codes.
- Private handlers consistently return `Cache-Control: private, no-store`.

### Data ownership

- Producer reads: `src/server/repositories`, `src/server/db/producer-client.ts`
- App writes: `src/server/commercial`, import repositories, and
  `src/server/db/app-client.ts`
- App schema has no foreign keys into producer tables; producer identifiers are
  external references.

### Demo data switch

- Location: `src/server/demo`, selected lead/import/work-queue handlers
- Pattern: explicit server-only feature flag after authorization.
- Limitation: demo import state is process-local and commercial writes still need
  an app PostgreSQL database.

## Critical Flows

### Import

private page -> `POST /api/imports` -> auth/same-origin -> multipart validation ->
exact-byte hash -> app intent/idempotency -> approved ingress -> correlated result.
Unknown acceptance is never automatically retried.

### Commercial workspace

queue -> create/read/patch workspace -> app transaction -> append-only audit.
Activities and notes are append-only. Optimistic versioning protects mutable
workspace state.

### Lead read

lead API -> auth -> query validation -> producer repository -> DTO mapper -> UI.
Sensitive content is mapped only through server allowlists.
