# Contact Enrichment v2 — Demo 3 and production operations

## Current state

- Repository implementation and synthetic verification: complete.
- Migrations 009 through 011: applied only to the isolated Demo 3 app-owned
  PostgreSQL database after the exact Kubernetes preflight.
- v2 workflow artifact: remains inactive and credential-free in the repository;
  the exact Demo 3 copy `PCEv2Demo3b8L3nR` is published with three native n8n
  credential bindings.
- Demo 3 release: `demo3-preprod-20260806-company-location-search-001` is
  enabled at `https://192.168.0.20:30443`; the browser still requires gateway
  authentication and the operator must trust the local public CA.
- A queue item prefills one valid domain only when the exact CNPJ has one
  distinct value in `public.crm_company_history.website_domain`. It remains
  editable and requires explicit confirmation; missing, invalid and ambiguous
  values may use either manual domain entry or an explicit company-name search.
  That search sends the known company name, available city/UF and fixed country
  `BR` through Prospecta to Lusha Prospecting Companies, returns at most five
  allowlisted matches and never retries automatically. The producer activity
  text is displayed only as a comparison reference because it is not a Lusha
  industry taxonomy ID. Results never expose a provider confidence score and
  require `Usar esta empresa` before Decision Makers. The producer role can
  read only `cnpj` and `website_domain` from that table.
- The n8n provider adapter maps app country `BR` to Lusha location country
  `Brazil` and requests page size 10, the provider minimum, while the callback
  mapper continues to expose at most five matches.
- Real contact test: authorized for one controlled company/candidate but no
  company or candidate has been selected and no real Lusha call has occurred.
- Production: preparation authorized; no target is identified, so no production
  mutation is possible.

## Demo 3 TLS edge package

The repository packages a dedicated TLS listener at
`https://192.168.0.20:30443`. The live `gitlab-nginx` controller is restricted
to its own namespace, so it cannot safely own routes in `prospecta-demo3` or
`n8n`. The versioned Demo 3 request-edge therefore terminates TLS directly:

- normal Prospecta pages and browser API calls keep mandatory Basic Auth;
- only the exact n8n v2 webhook is proxied to `n8n.n8n.svc.cluster.local` and
  remains protected by its native Header Auth credential;
- only the three exact machine callback routes omit Basic Auth and still require
  the separate callback secret in the Prospecta route;
- the legacy HTTP NodePorts `30100` and `30098` remain unchanged for their
  previously approved non-PII paths.

`scripts/prepare-demo3-contact-v2-tls.mjs --provision` creates an IP-SAN local
certificate only after the exact cluster/n8n preflight, stores its private key
only in the namespace-local Kubernetes TLS Secret, installs the public CA for
the app and n8n, and restarts n8n only when no execution is active. No key or CA
value is versioned. A repeat run validates existing material and refuses a
partial overwrite; it does not rotate certificates implicitly. The public CA
must be trusted by the operator's browser before viewing contact data.

## Demo 3 real-contact preflight

All boxes must be recorded without including contact values:

- [x] `CONTACT_CONTROLLER_LEGAL_NAME` is the real legal controller.
- [x] `CONTACT_CONTROLLER_REGISTRATION` is confirmed where applicable.
- [x] `CONTACT_PRIVACY_CONTACT` is public, monitored and able to receive rights
      and opt-out requests.
- [x] The legitimate-interest assessment records the controller approval and
      review date without inventing an individual signatory identity.
- [x] Prospecta-to-n8n ingress and n8n-to-Prospecta callbacks use the dedicated
      Demo 3 HTTPS edge with its verified IP-SAN certificate.
- [x] The imported v2 copy has three distinct native n8n credentials: ingress,
      Lusha `api_key`, and callback.
- [x] n8n save-data settings are `none`; a synthetic authenticated invalid
      execution remained invisible in execution history and its temporary
      metadata/payload rows were hard-pruned within one minute.
- [x] Migrations 009 through 011 completed in the isolated app-owned database;
      producer role remains SELECT-only and producer row counts are unchanged.
- [x] `CONTACT_DATA_ENCRYPTION_KEY_BASE64` is a generated 32-byte key in the
      secret manager, with a nonsecret key ID.
- [x] `CONTACT_SUPPRESSION_HMAC_KEY` is distinct and at least 32 random bytes.
- [x] The Demo 3 actor is explicitly present in contact read/govern subject
      allowlists. This remains a single-tester limitation, not individual
      identity evidence.
- [ ] One company and one candidate are named in an operator-only ticket; the
      ticket contains no contact channel values.
- [ ] The operator confirms the company/role relevance immediately before
      Reveal.
- [x] No waterfall provider is enabled for the request.

If any box is false, use synthetic callbacks only.

## Minimal real-contact test

1. Record preflight hashes, versions, table row counts and feature flags without
   PII.
2. Enable v2 only for the single Demo 3 actor.
3. Submit one company domain from the queue, or explicitly search by company
   name and confirm one allowlisted firmographic match. A name search may use a
   Lusha search credit and is never retried automatically.
4. Confirm a PII-free 202 and one app-owned request.
5. Explicitly open the preview, select one relevant professional candidate and
   request only the necessary channel class.
6. Verify private/unknown email, mobile/unknown/DNC phone, provider ID, billing
   and raw response are absent from UI, API logs, audit and n8n execution data.
7. Record a local all-channel suppression and verify the contact immediately
   becomes unavailable and no `mailto:`/`tel:` exists.
8. Run retention erasure for the test record and verify ciphertext columns are
   null while redacted governance events and suppression HMAC remain.
9. Disable the v2 feature and workflow.
10. Record only pass/fail, opaque request IDs, counts and timestamps as
    evidence. Never copy the contact value or screenshot the result.

There is no automatic retry at any step.

## Production preflight

Production additionally requires:

- exact hostname, namespace, Kubernetes context and kube-system UID;
- valid public/internal CA chain and HTTPS redirect/HSTS policy as appropriate;
- individual OIDC issuer/client and a reviewed role-to-permission source;
- production-specific encryption, suppression, ingress, callback and Lusha
  credentials with owner and rotation dates;
- remotely tested HMAC exact-byte canonicalization, timestamp, nonce, durable
  replay ledger and durable per-actor/per-organization rate limit;
- reviewed backup/restore and migrations 009 through 011 execution plan;
- accountable migration owner, release owner, privacy owner and incident path;
- canary cohort and success/error/latency/suppression metrics without PII;
- ANPD incident-response procedure and processor/subprocessor review.

## Rollout

1. Apply migration with feature/workflow disabled.
2. Verify grants, encryption round trip, suppression and erasure using synthetic
   rows.
3. Import inactive v2 workflow, bind production-only credentials and execute a
   synthetic contract test.
4. Enable callback receiver only, then ingress for one individual operator.
5. Enable preview for a canary cohort.
6. Enable Reveal only after preview/suppression evidence is clean.
7. Expand gradually; never enable bulk reveal or automated outreach.

## Rollback

1. Disable `FEATURE_CONTACT_DATA_ENABLED` to stop new preview, read and reveal.
2. Deactivate only the separately identified v2 workflow.
3. Revoke v2 permission bundles and credentials.
4. Preserve encrypted records until policy expiry, immediately honor active
   suppressions/rights erasure, and preserve redacted audit/suppression history.
5. Do not run the destructive migration rollback, delete audit, modify v1,
   change the import workflow, or mutate producer data.
