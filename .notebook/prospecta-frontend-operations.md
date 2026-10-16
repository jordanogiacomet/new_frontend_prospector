# Prospecta frontend operations

## Stable direction

- Preserve the warm paper, dark ink, and restrained green visual language.
- Operational page titles use compact sans-serif hierarchy; company names and
  analytical content may retain the editorial serif voice.
- Shared action styles live in `src/app/globals.css` as `ui-action` variants;
  fields use `ui-field`.

## Interaction contracts

- Queue filters are drafts until the single `Aplicar filtros` submission.
- Active filters remain individually removable and reset pagination.
- Contact-enrichment disclosure is coordinated by company attempt key so only
  one surface is open at a time, while collapsed state remains in memory.
- Reveal never assumes a channel. The actor selects email and/or phone before
  the request, and the selected channels participate in idempotency.
- Suppression is destructive: require inline confirmation, show pending state,
  and prevent duplicate submission.
- Recovery from contact errors consults the existing request by GET. Unknown
  mutations retain their attempt and idempotency key; never retry automatically.
- Capability UI denies by default. Rendering a button never replaces the
  server route's authorization check.
- Workspace saves with no changes are disabled and must not create PATCH or
  audit traffic.
- Lead rows carry their canonical filtered page into detail; lead detail
  accepts only `/leads` or one UUID workspace as a return destination.
- Queue cards carry the canonical filtered queue into existing and newly
  created workspaces. Workspace return accepts only `/work-queue` and falls
  back to the exact company filter.
- Workspace task shortcuts are fragment links and do not discard drafts.
  Copying the persisted approach exposes qualification as the next explicit
  step; it never records or sends the contact automatically.
- Changed workspace, activity and note drafts warn on same-tab link navigation
  and browser reload/close. The commercial-state form also offers an explicit
  discard action.

## Responsive pattern

- Data-heavy lists keep one semantic table on wide screens.
- Below the medium breakpoint, `responsive-data-table` converts each row into
  a labelled vertical record using cell `data-label` values.

## Manager review and follow-up

- `src/components/leads/lead-table.tsx:LeadTable()` starts with seven business
  columns. CNPJ and sector remain under the company; the explicit detail
  toggle restores all retained columns. The company cell has one content
  wrapper for the mobile labelled-grid layout.
- Lead list/detail retain only the same query's successful response during a
  transient network/server refresh failure and show an explicit stale notice.
  Denied, not-found and malformed responses clear the displayed data.
  Manual refresh shares the existing single-request guard.
- Lead section anchors preserve selected-run and return context. The pipeline
  CTA uses `commercial:read`, matching the global capability boundary.
- `src/lib/commercial-follow-up.ts` owns São Paulo calendar-day status and
  deadline shortcuts. Queue attention counts are explicitly current-page
  counts; terminal/archived workspaces are excluded.
- Workspace deadline shortcuts change the protected draft only. An unrelated
  workspace save preserves the exact existing deadline timestamp; a new date
  uses the existing UTC-noon persistence convention.
- The private shell keeps the pipeline selected inside a workspace and marks
  all import routes consistently. Since the manager MVP on 2026-10-06, the
  brand points to `/inicio`, where independent permissions control import,
  batch history and review shortcuts. The Importações navigation link still
  sends import-read-only actors to batch history.
- Manager handoff instructions are in `docs/prospecta-manager-guide.md`.

## Verification snapshot

The subsequent import-and-analysis manager MVP passed 2,377 tests in 129 files,
lint, strict typecheck, a sanitized production build and 132 synthetic browser
checks on 2026-10-06. It was not deployed, following the owner's instruction
to leave infrastructure for later. Evidence is under
`.specs/features/manager-import-analysis-mvp-v1/evidence/verification-2026-10-06.md`.

The 2026-10-06 manager usability pass passed 2,333 tests across 127 files,
lint, strict typecheck, a sanitized production build, and 22 synthetic
Chromium checks at desktop and mobile widths. It was not deployed. Evidence
is under `.specs/features/frontend-operations-review-v1/evidence/verification-2026-10-06.md`.

The 2026-08-18 operational UX pass passed 2,267 unit tests, lint, strict
typecheck and a sanitized production build. It was not deployed. Its evidence
lives under `.specs/quick/006-operational-ux-flow-v1/`. The prior deployed
review evidence remains under
`.specs/features/frontend-operations-review-v1/evidence/`.

Updated: 2026-10-06
