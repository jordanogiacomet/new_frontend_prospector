# Frontend Operations Review v1 — Design

## Experience Direction

The interface is an **editorial operations desk**: a calm paper-like canvas,
ink navigation, serif company identities and restrained color reserved for
meaning. The memorable unit is the compact opportunity sheet, not a generic
dashboard card.

## Hierarchy

1. Company identity and exact producer facts.
2. Commercial stage and next action.
3. One obvious workspace action.
4. Contact discovery as optional depth.
5. Governed contact actions beside the affected person.

Filled ink actions are primary. Green outlines are secondary. Underlined text
is quiet navigation. Amber/red treatments are reserved for governance and
failure. Containers use dividers before nested cards.

## State Model

The private shell supplies a fail-closed set of actor capabilities. Queue and
contact state remains client-side and organization data continues to be loaded
only through same-origin Prospecta APIs.

The contact provider owns both attempt state and the single expanded attempt
key. Collapsing a surface keeps its in-memory result; opening another surface
only changes presentation.

Reveal and suppression use per-contact pending state so the operator can see
which person is affected. Suppression has an inline confirmation step. A new
attempt replaces idempotency keys only after an explicit recovery action.

## Responsive Strategy

- The private desktop rail is sticky within the viewport.
- Queue metadata changes to a stacked layout before the desktop rail leaves
  insufficient width.
- Dense tables keep the desktop table and receive a purpose-built mobile
  summary where the company, business status and action stay together.
- All interactive targets are at least 44 px with visible keyboard focus.

## Boundaries

The implementation does not change API routes, n8n artifacts, migrations,
producer reads or producer semantics. Local commercial scoring remains a pure
UI derivation.

