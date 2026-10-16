# Frontend Operations Review v1

## Problem Statement

The private Prospecta interface has a coherent editorial visual language, but
its primary commercial flow has inconsistent action hierarchy and several
recoverability gaps. Queue filters use two submission models, contact actions
can become dead ends, governed mutations do not always communicate their
impact, and permissions are enforced by APIs without being reflected in the
controls shown to the operator.

## Goals

- Preserve the warm-paper, ink-blue and restrained-green visual direction.
- Make the Leads -> Commercial Queue -> Workspace path explicit.
- Give every visible action one predictable position and semantic hierarchy.
- Make queue filtering atomic from the operator's point of view.
- Keep only one contact-enrichment surface expanded at a time.
- Make contact reveal and suppression deliberate, recoverable and honest.
- Reflect exact actor permissions in the client while retaining server-side
  authorization as the security boundary.
- Improve touch targets, focus visibility and narrow-screen reading.

## Non-goals

| Item | Reason |
| --- | --- |
| Producer score/recommendation mutation | Producer facts remain immutable |
| New contact or producer API contracts | Existing approved Demo 3 routes are sufficient |
| Automatic mutation retry | Idempotency and unknown-outcome rules remain unchanged |
| Production deployment or n8n changes | This is a repository and Demo 3 UI revision |
| Decorative imagery | It would reduce scanability in this operational interface |

## Requirements

### FOR-01 — Consistent queue filters

All queue fields SHALL remain drafts until the operator submits the form. The
single `Aplicar filtros` action SHALL apply every valid field, reset pagination
and strip unsupported parameters. Active filters SHALL remain visible and
clearable.

### FOR-02 — Compact opportunity progression

Each queue item SHALL keep producer facts, commercial state and next action in
one compact opportunity sheet. Contact enrichment SHALL be progressively
disclosed, and opening one company's contact surface SHALL close the prior
surface without making an external request.

### FOR-03 — Honest contact actions

- Reveal SHALL require explicit selection of work email, business phone or
  both.
- Reveal idempotency SHALL include the selected channels.
- Suppression SHALL require explicit inline confirmation and expose a pending
  state.
- Error, conflict, empty and expired states SHALL offer a safe next action.
- Recovery SHALL create a new explicit attempt and SHALL NOT retry a prior
  mutation automatically.
- The contact-derived score SHALL be named as a local commercial calculation;
  it SHALL never imply producer-score persistence.

### FOR-04 — Permission-aware controls

The server-derived private actor permissions SHALL be made available to private
client components. Missing capability context SHALL deny controls by default.
Controls SHALL follow their exact permissions:

- `commercial:write` for commercial edits, activities and notes;
- `commercial:assign` for responsible assignment;
- `contacts:enrich`, `contacts:read`, `contacts:reveal` and
  `contacts:govern` for their respective contact actions;
- `imports:create` for the CSV form and `imports:read` for history.

API authorization remains mandatory and unchanged.

### FOR-05 — Functional workspace and import actions

- Saving an unchanged workspace SHALL not issue a PATCH.
- Empty activities/notes SHALL be blocked with field-level guidance.
- A read-only import actor SHALL be directed to registered imports instead of
  a form they cannot submit.
- Import result links SHALL describe confirmed facts and not promise inferred
  progress.

### FOR-06 — Contextual navigation

Lead detail SHALL link to the filtered commercial queue. Workspace detail SHALL
link back to the filtered queue and to the exact producer analysis using its
existing external references.

### FOR-07 — Interaction and responsive quality

Primary, secondary, quiet and governance actions SHALL share visual semantics,
focus indication and a minimum 44 px target. The private navigation SHALL
remain available on long desktop pages. Operational headings SHALL not push
the first task below the fold unnecessarily. Priority lists SHALL retain the
identity and action together on narrow screens.

## Success Criteria

- Synthetic tests cover filter submission, one-open-panel behavior, reveal
  channel selection, suppression confirmation, recovery, permissions and
  no-op workspace save.
- No browser call targets n8n, Lusha or PostgreSQL.
- Existing idempotency and safe-error tests remain green.
- Lint, typecheck, unit tests and production build pass.

