# Tech Stack

**Analyzed:** 2026-07-16

## Core

- Framework: Next.js 16.2.9, App Router, standalone output
- Language: TypeScript 5, strict mode
- Runtime: Node.js 22
- Package manager: pnpm 10 (declared by repository/Docker build)

## Frontend

- React 19.2.4 client and server components
- Tailwind CSS 4 plus repository CSS utilities
- Local component state and URL search parameters; no global state library

## Backend

- Next route handlers under `src/app/api`
- PostgreSQL via `pg`, with distinct producer-read and app-write pools
- Auth.js/NextAuth 5 beta with OIDC and a server-only local demo profile
- Zod 4 validation

## Testing

- Vitest 4 with jsdom for unit/component/route tests
- Vitest node profiles for PostgreSQL integration and n8n contract tests
- Testing Library for React components

## External Services

- PostgreSQL producer projections: SELECT-only runtime role
- PostgreSQL app schema: controlled read/write runtime role
- Versioned n8n import ingress: internal non-production target only
- Local Kubernetes and Docker registry for demos

## Development Tools

- ESLint 9 with Next.js config
- Docker multi-stage standalone image
- Kubernetes manifests and Node deployment scripts
