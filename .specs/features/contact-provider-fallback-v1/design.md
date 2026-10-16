# Contact Provider Fallback v1 — Design

## Flow

```text
confirmed domain/company
  -> Prospecta preview intent
  -> n8n Lusha Decision Makers
     -> candidates: existing callback
     -> valid empty: Apollo Organization Enrichment by exact domain
        -> exact primary_domain only
        -> Apollo People Search by exact organization ID
        -> existing authenticated preview callback
```

Provider errors and acceptance-unknown states bypass the Apollo branch and
produce the existing safe status.

## Provider identity

New provider references are encrypted as `{ source, providerContactId }` under
the existing candidate AAD. Existing ciphertext that decrypts to a plain
string is interpreted as a Lusha reference. Suppression fingerprints use the
legacy raw Lusha ID for compatibility and a source-prefixed Apollo ID to avoid
cross-provider collisions.

No database column or producer grant changes are required.

## Workflow

The separate v2 n8n artifact gains:

- an empty-result branch after the strict Lusha mapper;
- an Apollo Organization Enrichment request using its own native Header Auth
  credential;
- a strict mapper that validates the returned `primary_domain` and constructs
  a People Search using only the exact returned organization ID;
- a strict People Search mapper that admits only allowlisted masked preview
  fields;
- a provider-specific reveal branch using Apollo People Enrichment;
- a shared authenticated Prospecta callback.

The n8n requests use `x-api-key` only through credential binding. Repository
artifacts contain no key. Execution-data persistence remains disabled.

## Reveal boundary

Apollo enrichment uses only `id`, `reveal_personal_emails=false`,
`reveal_phone_number=false`, `run_waterfall_email=false` and
`run_waterfall_phone=false`. Only the returned work email is mapped. Phone is
unavailable for Apollo candidates and is rejected by Prospecta before dispatch.
The free Apollo preview exposes a provider-obfuscated name and no LinkedIn URL;
the selected enrichment may update only factual full name and approved
LinkedIn. The encrypted profile update and reveal result commit in the same
app-owned transaction.

## Rollout

1. Import/replace the workflow inactive after all four exact credentials exist.
2. Verify node count, URLs, credential bindings and no-execution-data settings.
3. Publish by guarded same-ID replacement only after the current workflow is
   rollback-exported and no execution is active.
4. Roll back to the prior immutable workflow and app image without deleting
   app-owned history.
