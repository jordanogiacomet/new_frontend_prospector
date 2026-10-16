# Lead Location Map v2 — Verification Evidence

Date: 2026-08-13  
Target: Demo 3 local pre-production  
Release: `demo3-preprod-20260813-registered-address-map-003`

## Repository verification

- Full ESLint: passed.
- Next route generation plus strict TypeScript check: passed.
- Unit/component/route suite: 113 files, 2,079 tests passed.
- Contract suite: 9 files passed, 2 skipped by their environment gates; 53
  tests passed and 57 skipped.
- PostgreSQL 16 disposable integration: 42 tests passed, including the
  source/precision constraint for `REGISTERED_POSTAL_CODE` and
  `BRASILAPI_CEP_V2`.
- Optimized Next.js production build: passed.
- Immutable Demo 3 image build: passed.

Host `pnpm` was not present on this resumed shell. The repository-local locked
executables were used for host checks; the immutable deployment build executed
the repository's pinned `pnpm` install and production build successfully.

## Guarded rollout and live evidence

- Demo 3 target preflight passed before mutation.
- Migration 014 applied to the app-owned database; no producer table, workflow
  or n8n configuration was changed.
- Deployment completed with one desired, updated and available replica; all
  three app-pod containers were ready with zero restarts.
- One approved real-lead status-only smoke check returned `available` with
  precision `registered_postal_code`, valid Brazilian coordinate shape and a
  valid tight bounding box. The evidence did not print coordinates, address,
  company name or provider bodies.
- The app-owned cache had exactly one current allowlisted row for the controlled
  case with source `BRASILAPI_CEP_V2`; no address/query/raw-payload columns
  exist.
- Current app, edge and loopback-proxy logs contained zero matches for the
  controlled identifier/name and provider address-payload field names, and
  zero error lines.

## Limitation retained

A CEP coordinate is a vicinity reference, not proof of an exact building,
entrance or operating unit. The UI labels this state separately. Production
still requires its own provider capacity, identity, egress and rollout
approval; this evidence authorizes only the identified Demo 3 target.

## Close-zoom follow-up

Release `demo3-preprod-20260813-registered-address-map-004` reduced the
registered reference bounding box from approximately 900 × 660 metres to
approximately 330 × 220 metres without changing the marker coordinate or the
wider municipality fallback. The browser session-cache key was advanced so an
older viewport cannot hide the new framing.

The focused map suite passed 15 tests; the full suite remained at 113 files and
2,079 passing tests. ESLint, strict TypeScript, the optimized production build
and the immutable deployment build passed. The authenticated status-only Demo
3 smoke check confirmed `registered_postal_code`, a bounding box of
`0.003° × 0.002°`, and that the returned marker is exactly centered. One
desired, updated and available replica completed rollout.
