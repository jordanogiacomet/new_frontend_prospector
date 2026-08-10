# Prospecta Contact Enrichment v1

## Status

This repository file is an **inactive Demo 3 artifact** for the exact local
non-production target. A credential-bound imported copy was separately
activated and verified with synthetic data on 2026-07-31. Do not activate,
publish, deploy, import, or bind this artifact in another target without new
operational approval.

Não ativar este artefato em outro alvo. Não publicar este artefato em outro
alvo.

`workflow.json` has `active: false`, empty `pinData`, no database node, no
producer path, no workflow identity from an environment, and no credential
binding. Its exact local ingress path is
`/webhook/prospecta/lusha/decision-makers`; its callback target is
`http://192.168.0.20:30100/api/contact-enrichment/callback`. These URLs are
approved only for the Demo 3 LAN profile and are not production endpoints.

## What the artifact describes

After Prospecta has made a durable, organization-scoped hash-only request
record, the separately activated Demo 3 copy may make one authenticated n8n
call:

1. The n8n Webhook validates its manually bound native `httpHeaderAuth`
   credential before handling the JSON body.
2. The request validator accepts only the exact versioned field set. It checks
   `request_id` and `cnpj_normalizado`, then discards CNPJ and idempotency key.
3. The workflow returns a PII-free HTTP `202` with an opaque request ID and
   `ENRICHMENT_DISPATCHED`. It contains no person, contact, email, phone,
   profile, provider response, or count.
4. The provider node calls Lusha Decision Makers using a separate
   generic `httpHeaderAuth` credential. Its body contains only a validated
   company domain and opaque request ID.
5. A third, separate `httpHeaderAuth` credential authenticates the minimal
   callback to the Demo 3 Prospecta receiver. The callback states only a safe
   withheld/unknown status and `contact_count: null`.

The workflow does **not** call Lusha Contact Enrich/Reveal. It must not expose,
persist, log, or audit PII or raw provider data. n8n execution data retention
is disabled for successful, failed, and manual executions to avoid storing
transient personal data.

## Credential configuration boundary

The exact Demo 3 imported copy has three different native n8n Header Auth
credentials bound by the accountable operator outside Git. A new import or
another target must obtain separate approval and repeat manual binding:

| Purpose | Node | Required property |
| --- | --- | --- |
| Ingress machine authentication | `Webhook Contact Enrichment v1` | Webhook `headerAuth` / `httpHeaderAuth` |
| Lusha API authentication | `Lusha Decision Makers` | HTTP Request `genericCredentialType` / `httpHeaderAuth` |
| Prospecta callback authentication | `Callback Prospecta Contact Enrichment` | HTTP Request `genericCredentialType` / `httpHeaderAuth` |

No credential may be copied into Git, placed in a workflow expression, passed
through the browser, reused implicitly between these purposes, or represented
by an environment-variable API key. Credential values remain outside Git.
Production credential scope, target, rotation process, and owner remain
independently pending.

## Idempotency and timeout truth

n8n has no app-owned ledger in this artifact. It cannot safely deduplicate a
request. The Prospecta server owns organization scope, durable
intent, input fingerprint comparison, duplicate return, `409` conflicts,
callback correlation, and append-only redacted audit.

The provider and callback nodes explicitly set `retryOnFail: false`. A timeout,
malformed response, callback failure, or missing callback remains
`PROVIDER_OUTCOME_UNKNOWN`; it is not a reason to retry or infer a successful
or empty result.

## Contact-policy gates

The sensitive-content policy separately withholds names, email addresses,
telephones, CRM history, opt-out, and do-not-call data. `sensitive:read` does
not authorize contact recovery. Before any PII exposure, obtain the remaining
approvals listed in
`.specs/features/contact-enrichment-v1/spec.md`.

The Lusha Decision Makers API requires a company domain or Lusha company ID.
CNPJ is validated for Prospecta correlation only; this package does not
authorize CNPJ lookup, domain discovery, company search fallback, contact
selection, or a reveal operation.

## Verification and rollback

Run the repository-local static contract suite only:

```sh
node_modules/.bin/vitest run --config vitest.contract.config.ts
```

It does not contact n8n or Lusha. An automated remote contract test is still
not configured; the separately approved synthetic UAT and exact-target
postconditions are recorded in
`.specs/features/contact-enrichment-v1/evidence/demo3-activation-2026-07-31.md`.

For the active Demo 3 copy, rollback disables the specific new workflow,
restarts n8n, and disables or rolls back the Prospecta feature separately. It
never modifies the current import workflow, producer data, or app audit
history. n8n 2.30.6 soft-deletes `saveData...: none` runs before pruning their
data rows; synthetic UAT therefore confirms exact workflow-scoped cleanup and
must never inspect the saved payload.
