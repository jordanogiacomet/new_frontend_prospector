# Operational UX Flow v1

## Problem

The commercial flow loses list context between Leads, Queue and Workspace, and
the long workspace page makes the operator remember where the next task lives.
Editable workspace data can also be abandoned without a clear warning.

## Requirements

- **OUX-01 — Context continuity:** opening a lead or workspace SHALL carry the
  canonical origin URL; return links SHALL accept only approved internal app
  destinations and SHALL fall back safely.
- **OUX-02 — Task progression:** the workspace SHALL expose direct task links;
  after copying an approach message it SHALL offer qualification as the next
  explicit step.
- **OUX-03 — Work protection:** changed workspace, activity or note drafts
  SHALL trigger an unsaved-work warning on in-app link navigation and browser
  reload/close; workspace changes SHALL be visibly discardable.

## Boundaries

- No visual redesign, new dependency, API, database, producer or n8n change.
- No automatic outreach, activity completion or cadence progression.
- Return URLs never authorize access and never replace route authorization.

## Verification

- Component tests cover canonical return links, unsafe return fallback, task
  links, copy-to-qualification handoff and unsaved-work protection.
- Lint, strict typecheck, unit suite and sanitized production build pass.
