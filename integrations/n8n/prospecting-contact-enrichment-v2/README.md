# Prospecta Contact Enrichment v2

This is a separate, inactive, credential-free reference artifact. It must not
be activated, published, or pointed at the current Demo 3 HTTP edge. The v1
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
existing `Lusha API V3 Demo3` credential metadata, sends import material over
stdin, verifies zero active executions and zero v2 webhook registrations, and
never publishes, activates, or calls the webhook or provider. It requires n8n
2.30.6, the exact Demo 3 and n8n namespace identities from
`.env.demo3.local`, and the identified `deployment/postgres` target. Its
database preflight is a read-only transaction over allowlisted metadata; it
does not select credential data or execution payloads. The rendered callbacks
use only `https://192.168.0.20:30443`.

The artifact models four authenticated actions on one HTTPS webhook:

- `COMPANY_SEARCH` calls Lusha Prospecting Companies once with one explicitly
  submitted company name, fixed country `BR` mapped to provider value `Brazil`
  and available city/UF filters. It requests the provider minimum page size of
  10, maps at most five results, may consume an `api_search` credit, and returns
  only a safe 202;
- `PREVIEW` calls Lusha Decision Makers and returns an immediate PII-free 202;
- `PREVIEW_BY_COMPANY_ID` performs the same preview using a provider company ID
  decrypted only by the Prospecta server after explicit human confirmation;
- `REVEAL` calls Lusha Enrich for one human-selected provider contact ID and
  explicitly omits `waterfallReveal`.

Both operations callback to Prospecta using a separate native n8n Header Auth
credential. The placeholder callback host intentionally prevents activation
until a real HTTPS Prospecta target is identified. Lusha authentication must
use its own native Header Auth credential (`api_key`); no API key or credential
ID is stored in Git.

The company mapper sends only the encrypted-at-rest match profile allowlist and
never forwards provider request IDs, billing, credits, employee counts,
provider availability metadata, signals or raw errors. The contact mapper
sends only the fields in `workflow-contract.json`. It drops private
and unknown emails, mobile and unknown phones, company enrichment, billing,
coordinates, tags, previous employment, social networks other than approved
LinkedIn, provider request IDs and raw payloads. Work/direct phones with
`doNotCall: true` reach the app only so the app can create a keyed suppression;
they are never persisted reversibly or exposed.

`saveDataSuccessExecution`, `saveDataErrorExecution`, and manual execution
storage are disabled. Before any real test, an operator must remotely verify
that the target n8n version truly leaves no execution payload rows and must
record the check without inspecting or copying PII.

Production activation remains blocked because this artifact has native header
authentication and app-owned terminal idempotency but does not yet implement
the remotely verified HMAC timestamp/nonce/replay and durable rate-limit
contract required by the production profile.
