# Contact Provider Fallback v1 — verification 2026-08-10

Status: repository implementation verified; Demo 3 rollout blocked safely by
the missing exact Apollo credential metadata.

## Safety facts

- No Lusha, Apollo or n8n webhook request was made.
- No provider credit was consumed.
- No credential value was read, printed, written or committed.
- No workflow, deployment, database or producer relation was mutated.
- Tests used only synthetic companies, domains, people and contact channels.

## RED evidence

Before implementation, the focused executable contracts failed on the absent
Apollo workflow branches, provider source, encrypted reference shape, request
fields and UI copy. The implementation was then completed against those
pre-existing failing assertions.

## Repository gates

Repository-local binaries were used because `pnpm` and `corepack` are absent
from this shell. No dependency or lockfile changed.

| Gate | Result |
| --- | --- |
| Focused provider/policy/repository/UI tests | 27 passed |
| Focused workflow/preparation contracts | 16 passed |
| `node_modules/.bin/eslint .` | Passed |
| `node_modules/.bin/next typegen` plus strict `tsc` | Passed |
| `node_modules/.bin/vitest run` | 104 files and 2,014 tests passed |
| Full contract suite | 8 files and 48 tests passed; 2 remote suites and 57 tests skipped by their configured gates |
| Production build with all demo-only flags disabled for the process | Passed; contact v2 routes remained dynamic server routes |
| `git diff --check`, JSON parse and Node syntax checks | Passed |

The first unmodified build attempt failed closed while reading the existing
local environment because production forbids its development/Demo 2 flags.
Repeating the documented build gate with those flags explicitly false passed.

## Contract facts verified

- Apollo is unreachable from the browser.
- Apollo starts only after a structurally valid `PREVIEW_EMPTY` Lusha result.
- Lusha failure or unknown outcome bypasses Apollo.
- Organization Enrichment accepts only the confirmed domain and People Search
  starts only after an exact returned `primary_domain`, using the returned
  Apollo organization ID.
- Authentication failure is `PREVIEW_FAILED`; timeout/5xx acceptance remains
  `PROVIDER_OUTCOME_UNKNOWN`; provider HTTP nodes never retry automatically.
- Preview names may be obfuscated and never include Apollo channel values or
  LinkedIn.
- Human-selected Apollo reveal permits only work email, disables personal
  email, phone and waterfall, and may update only the selected factual name and
  approved LinkedIn profile.
- Provider source and ID are encrypted together; legacy scalar references
  remain Lusha-compatible and Apollo suppression identities are namespaced.
- Raw provider payloads, pagination, billing, credits, private email, phone and
  provider request IDs are excluded from callbacks and persistence.

## Read-only Demo 3 preflight

Command:

```text
node scripts/prepare-demo3-contact-v2-n8n.mjs --preflight-published
```

Result: failed closed before any mutation with
`Apollo credential metadata is not exact`.

Required operator action: create one native n8n Header Auth credential named
exactly `Apollo API Demo3`, header `x-api-key`, restrict its allowed domain to
`api.apollo.io`, and confirm the `organizations_enrich`,
`mixed_people_api_search` and `people_match` scopes. The key must remain only
inside n8n. After that, repeat the published preflight before considering the
separately guarded replacement.
