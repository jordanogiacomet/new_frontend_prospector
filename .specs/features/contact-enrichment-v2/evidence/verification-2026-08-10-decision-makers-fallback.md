# Decision Makers priority fallback verification — 2026-08-10

Status: implemented and rolled out only to the approved Demo 3 profile.

## Cause and compatibility evidence

- A synthetic reserved-domain request using the approved in-pod credential
  returned HTTP `403` from Contacts Prospecting. No credential, provider body,
  company or contact value was printed or persisted as evidence.
- The same controlled synthetic shape returned HTTP `200` from Decision Makers
  with one company result group and zero decision makers. Provider documentation
  describes Decision Makers results as free previews.
- Existing app-owned aggregate status showed successful company V3 searches,
  isolating the current incompatibility to Contacts Prospecting entitlement.

## Verified behavior

- The preview makes one Decision Makers request for exactly the confirmed
  domain or server-decrypted provider company ID, page 0 and size 100.
- The mapper uses the aliases shared with `contact-commercial-score-v1`, keeps
  provider order and emits at most 10 strict allowlisted matches.
- Non-priority decision makers, billing, provider request IDs, company payload,
  raw response and excluded fields do not cross the callback.
- There is no provider table, reveal, retry, second page or second provider
  request. Empty copy states that the result is only a sample.

## Quality evidence

- Focused RED/GREEN: 18 unit/component tests and 13 contract tests passed.
- Lint, strict typecheck and production build passed.
- Full unit suite: 102 files and 1,991 tests passed.
- Contract suite: 45 local tests passed; 57 remote cases stayed explicitly
  skipped because their isolated targets were not configured.
- No database, route, repository or migration changed, so the unavailable
  disposable PostgreSQL integration target was not substituted with Demo 3.

## Demo 3 rollout

- Published-state preflight passed before replacement. The guarded path
  exported the prior published workflow in process memory, replaced only
  `PCEv2Demo3b8L3nR`, republished it and verified all post-conditions.
- Immutable release `demo3-preprod-20260810-decision-makers-fallback-001`
  rolled out with app and PostgreSQL ready and zero container restarts.
- Anonymous/authenticated queue smoke returned `401`/`200`; deployed assets
  contain the free-sample and separate-reveal disclosure.
- One synthetic end-to-end Prospecta request returned `202`, then reached
  `PREVIEW_EMPTY` with zero candidates through the authenticated callback.
- Final n8n state: published active version, 19 nodes, one webhook, zero active
  executions and zero saved executions for the workflow.
- No real company/contact request, contact exposure, producer mutation, new
  secret, route, migration or storage change occurred.
