# Testing Infrastructure

**Analyzed:** 2026-07-16

## Frameworks and Organization

- Unit/component/route: Vitest 4 with jsdom, co-located under `src`.
- PostgreSQL integration: Vitest node profile, sequential files.
- n8n contract: dedicated Vitest contract profile.
- React assertions: Testing Library and jest-dom.

## Coverage Matrix

| Changed layer | Required test |
| --- | --- |
| Formatter, validator, mapper, policy | unit |
| React page/component behavior | component/unit |
| Route auth, parsing, envelope | route/unit |
| Repository SQL and transaction semantics | unit plus PostgreSQL integration when target exists |
| n8n contract behavior | unit plus contract against identified non-production target |
| Kubernetes release | client/server dry-run, rollout, HTTP smoke, browser UAT |

## Parallelism Assessment

- Source-only lint can run independently.
- Next build and raw `tsc` must not run concurrently because both consume `.next`
  generated types.
- The full Vitest suite must use bounded workers on this 31 GiB host; the
  unbounded baseline exhausted memory and left 53 files without workers.
- PostgreSQL integration tests are sequential and require disposable synthetic
  targets.

## Gate Commands

Use repository scripts when `pnpm` is available; local binary equivalents are
acceptable on this host.

- Quick: `pnpm test <test-files>`
- Static: `pnpm lint && pnpm typecheck`
- Build: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Integration: `pnpm test:integration`
- Contract: `pnpm test:contract`

Run typecheck, tests, and build sequentially for the release gate. Never run
tests against real data.
