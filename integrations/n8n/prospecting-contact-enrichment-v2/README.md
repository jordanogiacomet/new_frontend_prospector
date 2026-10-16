# Prospecta Contact Enrichment v2

This is a separate, inactive, credential-free reference artifact. It must not
be activated or published directly and must never use the Demo 3 HTTP edge.
Only the derived, credential-bound copy on the exact approved Demo 3 HTTPS
profile may be prepared or replaced by the guarded operator helper. The v1
workflow and the producer import workflow are unchanged.

The repository includes a fail-closed Demo 3 operator helper. Its default and
explicit preflight modes are read-only:

```sh
pnpm demo3:contact-v2:n8n
pnpm demo3:contact-v2:n8n -- --preflight
```

After the exact Kubernetes/n8n preflight passes, an accountable operator may
prepare only the inactive Demo 3 copy with:

```sh
pnpm demo3:contact-v2:n8n -- --import-inactive
```

This imports two derived Demo 3 Header Auth credentials and the inactive
workflow into the same n8n project as the exact v1 workflow. It reuses only the
existing `Lusha API V3 Demo3` and `Apollo API Demo3` credential metadata, sends import material over
stdin, verifies zero active executions and zero v2 webhook registrations, and
never publishes, activates, or calls the webhook or provider. It requires n8n
2.30.6, the exact Demo 3 and n8n namespace identities from
`.env.demo3.local`, and the identified `deployment/postgres` target. Its
database preflight is a read-only transaction over allowlisted metadata; it
does not select credential data or execution payloads. The rendered callbacks
use only `https://192.168.0.20:30443`.

When that exact derived workflow is already published, use the separate
published-state preflight and replacement modes:

```sh
pnpm demo3:contact-v2:n8n -- --preflight-published
pnpm demo3:contact-v2:n8n -- --replace-published
```

The replacement mode requires zero active executions, exports the one
published workflow in process memory for rollback, unpublishes only its fixed
ID, imports the reviewed derived artifact, republishes it and verifies exact
node, credential, endpoint, execution-saving and webhook metadata. Any failed
post-condition restores and republishes the prior export. Neither mode invokes
the webhook, Lusha or Apollo.

The artifact models four authenticated actions on one HTTPS webhook:

- `COMPANY_SEARCH` calls Lusha Prospecting Companies once with one explicitly
  submitted company name, fixed country `BR` mapped to provider value `Brazil`
  and the provider minimum page size of 10. City/UF do not exclude results: the
  mapper moves local matches first while preserving provider order and, when
  none matches, keeps the provider's first result as fallback. It maps at most
  five results, may consume one `api_search` request, never retries
  automatically, and returns only a safe 202;
- `PREVIEW` makes one Lusha Decision Makers request for the exact confirmed
  domain and one ranked sample of up to 100 free previews. It returns at most
  10 contacts under `contact-asset-targeting-v1`: physical/fixed-asset roles
  first, accounting/controller/finance roles second, and explicitly relevant
  asset/inventory/stock operations roles third. It preserves provider order
  inside each tier and removes duplicate provider IDs before the cap. Missing
  or unrelated job titles are withheld; generic HR, marketing, sales or
  operations contacts are never substituted. Personal-wealth responsibilities
  veto every tier, including mixed titles mentioning personal patrimônio,
  wealth management or private banking. Mixed titles with explicit physical
  asset responsibility remain eligible under the same alias policy.
  It returns an immediate PII-free
  202, does not write a provider
  table, request a second page or retry. Only after a structurally valid empty
  raw Lusha sample, `NO_MATCHES`, and a confirmed domain, it calls Apollo Organization
  Enrichment once, requires an exact returned `primary_domain`, and performs
  one free People Search using that exact organization ID. Organization
  Enrichment consumes one Apollo credit when a company is found. Apollo
  person previews use the same title policy, are masked and contain no LinkedIn,
  e-mail or phone value. When that raw People Search sample is also empty,
  the mapper may return one sanitized
  corporate phone already present in the exact organization response, without
  making another request. It is labeled with unknown contactability and is not
  a decision maker;
- `PREVIEW_BY_COMPANY_ID` performs the same sampled preview using a provider
  company ID decrypted only by the Prospecta server after explicit human
  confirmation. `NO_MATCHES` means only that the raw sample was empty;
  `NO_RELEVANT_MATCHES` means that valid people were present but none had an
  approved job title. Search tiers do not change the existing versioned
  commercial score;
- `REVEAL` calls the matching provider for one human-selected contact. Lusha
  Enrich keeps its current allowlist. Apollo People Enrichment permits only a
  selected work-email reveal; personal email, phone and both waterfall options
  are explicitly false. The selected result may also update only that
  candidate's encrypted factual name and approved LinkedIn URL in the same
  app-owned transaction.

Both operations callback to Prospecta using a separate native n8n Header Auth
credential. The placeholder callback host intentionally prevents activation
until a real HTTPS Prospecta target is identified. Lusha authentication must
use its own native Header Auth credential (`api_key`). Apollo uses a separate
native Header Auth credential named `Apollo API Demo3`, with header `x-api-key`.
No API key or credential ID is stored in Git.

The company mapper sends only the encrypted-at-rest match profile allowlist and
never forwards provider request IDs, billing, credits, employee counts,
provider availability metadata, signals or raw errors. The contact mapper
sends only the fields in `workflow-contract.json`. It drops private
and unknown emails, mobile and unknown person phones, company enrichment other
than the exact corporate-phone fallback, billing,
coordinates, tags, previous employment, social networks other than approved
LinkedIn, provider request IDs and raw payloads. Work/direct phones with
`doNotCall: true` reach the app only so the app can create a keyed suppression;
they are never persisted reversibly or exposed.

Company-search and contact-preview callbacks optionally include
`search_diagnostics`: at most four records containing only an allowlisted
provider, stage and code. They distinguish a confirmed empty sample, denied
access, rate limiting, a confirmed provider error, an invalid response and an
unconfirmed outcome. A structured transport timeout is reported separately
without claiming that the provider did not process the request. Missing domains
and exact-company mismatches explain why Apollo was not consulted for people.
Malformed or uncorrelated Lusha responses never trigger Apollo; malformed
nonempty Apollo people responses never become an empty sample or corporate-phone
fallback. Valid people excluded by the title policy produce `PREVIEW_EMPTY`
with `NO_RELEVANT_MATCHES` only at `CONTACT_PREVIEW`; this never triggers Apollo
or the corporate-phone fallback. A confirmed empty sample does not establish that the company has no
contacts. Previous callbacks without this optional field remain valid.

LinkedIn-first discovery is the intended next provider direction. Its API,
approved search permissions and response contract are not yet identified; this
inactive reference therefore retains the current Lusha/Apollo call order and
adds no LinkedIn request, credential or activation.

The error mapping follows official [Lusha API documentation](https://www.lusha.com/docs/),
[Apollo key access](https://docs.apollo.io/docs/create-api-key) and
[Apollo rate limits](https://docs.apollo.io/reference/rate-limits): `401`/`403`
are reported as access denied, and `429` as a request limit. No credit balance,
subscription cause, raw error message, request ID or status code is sent to
Prospecta. These diagnostics add no provider call or automatic retry.

`saveDataSuccessExecution`, `saveDataErrorExecution`, and manual execution
storage are disabled. Before any real test, an operator must remotely verify
that the target n8n version truly leaves no execution payload rows and must
record the check without inspecting or copying PII.

Production activation remains blocked because this artifact has native header
authentication and app-owned terminal idempotency but does not yet implement
the remotely verified HMAC timestamp/nonce/replay and durable rate-limit
contract required by the production profile.
