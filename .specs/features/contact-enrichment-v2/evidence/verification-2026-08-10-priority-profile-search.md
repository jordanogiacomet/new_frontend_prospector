# Priority profile search v1 verification — 2026-08-10

Status: implemented and rolled out only to the approved Demo 3 profile.

## Verified behavior

- The contact preview uses one Lusha v3 Contacts Prospecting request.
- A domain preview filters `companies.include.domains`; a confirmed company
  match filters `companies.include.ids`.
- `contacts.include.jobTitles` equals the title aliases exported by
  `contact-commercial-score-v1`.
- Page size is 10, partial previews and DNC exclusion are enabled, provider
  table persistence and channel reveal are absent, and automatic retry plus
  generic Decision Makers fallback are disabled.
- The strict mapper accepts the flat prospecting preview and emits only the
  existing candidate allowlist. Provider request ID, billing, raw response and
  company payload do not cross the callback.
- The UI discloses possible search-credit use and describes empty results as
  limited to the current query. The producer score remains unchanged.

## Quality evidence

- Focused RED/GREEN checks: 18 unit/component tests and 13 contract tests.
- Full lint and strict typecheck passed.
- Full unit suite: 102 files and 1,991 tests passed.
- Contract suite: 45 local tests passed; 57 remote cases stayed explicitly
  skipped because their isolated targets were not configured.
- Production build passed with local demo gates explicitly disabled. The
  initial build correctly rejected stale Demo 2 development flags.
- PostgreSQL integration was not run because
  `PROSPECTA_APP_TEST_DATABASE_URL` was absent. No database, repository, route
  or migration changed in this feature; the real Demo 3 database was not used
  as a disposable test target.

## Demo 3 rollout

- Published-state preflight matched the approved cluster, namespace UIDs,
  n8n 2.30.6, workflow/credential ownership, HTTPS callbacks, safe execution
  settings and zero active executions.
- The guarded operator path exported the prior published workflow in process
  memory, replaced only `PCEv2Demo3b8L3nR`, republished it and verified the
  post-conditions. Two earlier conservative attempts stopped and restored the
  prior export when n8n retained its webhook registration while unpublished;
  the final guard records that version-specific behavior without permitting a
  second registration.
- Postflight: 19 nodes, one priority-profile provider node, no legacy Decision
  Makers node, exact Contacts Prospecting HTTPS endpoint, one webhook, safe
  execution settings and zero saved/active executions.
- Immutable application release
  `demo3-preprod-20260810-priority-profile-search-001` rolled out with one ready
  replica and zero container restarts. Anonymous queue access returned `401`,
  authenticated access returned `200`, and the deployed client assets contain
  the priority-search button and billing disclosure.
- No webhook request, provider request, contact operation, Lusha credit,
  producer mutation, new secret or real-contact evidence was used during the
  rollout.
