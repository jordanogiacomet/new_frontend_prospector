# Company commercial assessment

Entry: `src/components/leads/lead-detail-summary.tsx` →
`src/lib/lead-labels.ts:getLeadCommercialAssessment()`.

- The 2026-10-06 request asks whether a company merits prospecting, in sales
  language, before seeking a contact. This is commercial guidance, not a legal
  approval or a new qualification engine.
- The conclusion maps only the five exact stored actions; unknown/null remain
  unavailable. Prototype names and case variants are not mapped as valid acts.
- Action/reason come from the correlated terminal observation; score/trust
  come from the current projection. Neither score, priority, confidence nor an
  empty risk list recalculates/replaces the action.
- Missing reasons receive an explicit absence message; existing CRM pending
  public confirmation and unconfirmed debt copy remains qualified.
- Data age has no new threshold. The date is shown; the existing stale banner
  requires an explicit source flag. Current mappers do not add that flag by age.
- The decision panel contains no contact CTA. The pipeline provides a secondary
  evaluation link and leaves contact/messaging resources under explicit choice.

Spec: `.specs/features/company-commercial-assessment-v1/`.
Verification: summary/labels/detail tests and synthetic browser B/C cases,
including high score alongside stored `NAO_ABORDAR` without overriding it.

Updated: 2026-10-06
