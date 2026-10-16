# Contact Enrichment v2 verification — 2026-08-10

Status: Demo 3 company-search fallback implemented and rolled out without a
provider request.

## Behavior

- One explicit company search calls Lusha Prospecting Companies at most once
  using the normalized company name and provider country `Brazil`.
- Returned companies whose normalized city matches the lead city move first.
  When city is unavailable, normalized UF is used instead. Matching and
  nonmatching groups retain provider order.
- When no returned company matches the available local context, the first valid
  provider result remains first as fallback. At most five matches reach the
  app, and `Usar esta empresa` remains mandatory.
- There is no second provider search, automatic retry, automatic company
  selection or automatic contact preview.

## Verification and rollout

- The executable workflow contract failed against the old strict-location
  behavior and passed for local prioritization and first-result fallback.
- Full lint, strict typecheck, 1,978 unit tests, 43 local contract tests and the
  production build passed. No database or migration changed.
- Exact Demo 3 and contact-TLS preflights passed. Workflow
  `PCEv2Demo3b8L3nR` was exported for rollback, replaced under the same ID and
  republished with 19 nodes, one webhook, safe execution settings and zero
  active or saved executions.
- Immutable release `demo3-preprod-20260810-company-search-fallback-001` rolled
  out with all containers ready and zero restarts. Anonymous access returned
  `401`, authenticated queue page/API returned `200`, and invalid company
  search input returned `400` before dispatch.
- No webhook, Lusha request, provider response, real-contact operation,
  producer mutation or sensitive value was used during the rollout.
