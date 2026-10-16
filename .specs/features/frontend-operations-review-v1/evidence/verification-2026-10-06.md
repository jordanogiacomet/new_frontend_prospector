# Manager usability verification

Date: 2026-10-06  
Scope: local repository implementation and synthetic verification only

## Result

- Lead review starts with seven business columns; all ten retained columns
  remain available through the detail toggle.
- Analysis section links and permission-aware pipeline navigation reduce
  scrolling while retaining the exact selected run and return destination.
- Transient refresh failures retain only the current query's last successful
  result with a stale notice. Access-denied and invalid responses clear it.
- Queue attention uses persisted app-owned deadlines, explicitly covers only
  the current page, and excludes terminal/archived workspaces.
- Workspace date shortcuts modify only the protected draft. São Paulo calendar
  dates agree with displayed deadlines, and unrelated edits preserve the exact
  persisted timestamp.
- Mobile company records and the header fit narrow viewports. Import-only
  readers' home link opens their permitted batch history.
- Portuguese manager instructions: `docs/prospecta-manager-guide.md`.

## Checks

`pnpm` was invoked through `npx --yes pnpm@10` because no standalone executable
was on PATH.

| Command / check | Result |
| --- | --- |
| `pnpm lint` | Passed on final source |
| `pnpm typecheck` | Passed on final source |
| `pnpm test` | Passed on final source: 127 files, 2,333 tests |
| Final focused Vitest run for seven changed UI/helper suites | Passed: 150 tests |
| `pnpm build` with explicit synthetic server settings | Passed on final source |
| Chromium desktop/mobile smoke | Passed: 22 checks |
| `git diff --check` | Passed |

Browser verification covered 1366/1440px desktop and 375/390px mobile, compact
and expanded tables, explicit refresh, preserved filter/pagination return,
analysis jump targets, page-local overdue attention, and unavailable queue
states. The final run had no runtime errors, external requests or app
mutations. Map unavailability and unavailable queue responses were mocked
with synthetic same-origin responses; date writes were verified by component
tests because the demo actor is read-only.

Build settings explicitly disabled external integrations, AI, contact data,
maps, demo runtime gates and authentication bypass. Database URLs were
unusable synthetic loopback placeholders. Real environment files were neither
modified nor copied into evidence.

No API contract, schema, producer query, migration, n8n configuration or live
deployment changed in this usability pass. PostgreSQL and external integration
tests were not run because this pass introduced no database or integration
change. Live target authentication and rollout remain outside these checks.
