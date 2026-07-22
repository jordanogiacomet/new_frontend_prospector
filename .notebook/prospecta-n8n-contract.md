# Prospecta n8n Contract
> Official import ingress runtime evidence and blocking contract gate

Entry: `tests/contract/n8n-import-webhook.contract.test.ts`
Versioned entry: `tests/contract/n8n-import-webhook-v1.contract.test.ts`
Contract: `.specs/features/prospecting-console/contracts/n8n-import-webhook.md`
Evidence: `.specs/features/prospecting-console/evidence/current-workflow-map.md`
Export: `private-workflows/EmpresaAqui_Webhook_Import_v1.json`
Versioned artifact: `integrations/n8n/prospecting-import-v1/workflow.json`

Flow: POST multipart `arquivo_csv` → extraction → normalization → parallel
response/persistence branches

Runtime target profile:
- Internal non-production HTTP is explicitly allowed for contract testing
- No authentication or replay control expected in this profile
- Production still requires HTTPS + approved server-to-server controls

Gotchas:
- Public response behavior does not attest remote workflow ID/version
- Missing/wrong/empty/malformed inputs do not have consistent safe 4xx errors
- Exact 10 MiB response timing was unstable across two runs
- Response branch does not prove durable acceptance or X4 closure
- `scripts/demo2.mjs` loads `.env.local` only before spawning Next; changing
  `N8N_IMPORT_URL` requires restarting `pnpm demo2`.
- In the internal Kubernetes target, NodePort `30098` routes to a ready n8n
  endpoint; `/webhook-test/empresaqui/import` receives only while the editor
  has `Listening for test event`, while `/webhook/empresaqui/import` is the
  deployed workflow URL.
- Demo 2 runtime check: latest app submission had a validated workflow
  acknowledgement, but the producer observation view returned no matching fact
  rows. Inspect the n8n execution's persistence branch and its PostgreSQL
  target; app-side evidence cannot distinguish a failed branch from a different
  producer database.
- Demo 2 diagnostic on 2026-07-15: the app recorded 12 submissions (7 webhook
  acknowledgements and 5 unknown outcomes), with zero durable acceptances. The
  acknowledged batch correlations exposed no X4 `ACCEPTED_ROW`,
  `TERMINAL_OUTCOME`, or `BATCH_CLOSED` fact. The related run rows were legacy
  or test observations only, so the eligible-current lead reader correctly
  returned zero. A webhook `202` is therefore not evidence of materialized
  leads in this target.
- Demo 2 n8n correction on 2026-07-15: the active internal workflow's webhook
  input name was `arquivo_csv`, while its `Extract From File` node read
  `arquivo_csv0`. The corrected `arquivo_csv` version was imported and
  published through the n8n CLI, preserving the workflow identity. A synthetic
  app submission before reload returned `202` but an invalid acknowledgement,
  so it remains an honest unknown outcome. The running n8n instance still
  needs an authenticated workflow reload; its local REST endpoint returns
  `401`, and an image restart was deliberately rolled back to avoid an
  unintended `latest` image upgrade.
- Correction to the preceding diagnostic: the owner confirmed that the active
  webhook already receives and executes imports. The temporary n8n workflow
  version was restored before reload, so no workflow change remains in effect.
  The materialized Demo 2 rows carry the producer test marker and were hidden
  by the app's production reader predicate. The remediation is app-only:
  Demo 2's protected server-side gate includes those rows in lead list, detail,
  and retained-history readers; all other runtimes preserve the strict
  predicate. This does not broaden cost, sensitive-content, batch-fact, or
  producer-write access.
- Runtime response drift observed on 2026-07-20: the authorized endpoint still
  returns `202` with the five required acknowledgement fields, but also returns
  `database_schema_changed`, `pipeline_version`, and `report_policy`, and its
  business message changed. `src/server/imports/ingress-client.ts` now
  validates and copies only the required five fields while ignoring all
  additional metadata, so none of those additions reach app persistence or
  the browser.

Versioned local state (2026-07-20):

- The current endpoint remains a legacy acknowledgement baseline; its parser
  consumes the required five fields and ignores extra producer metadata.
- The separate inactive artifact now lives under
  `integrations/n8n/prospecting-import-v1/` and returns canonical
  `ib_<64 hex>` only after one producer acceptance transaction.
- Producer acceptance uses
  `prospecta_accept_empresaqui_batch_v1(jsonb)`, a five-column read view, and
  a read-only app reconciliation path. Timeouts are never re-uploaded.
- Canonical producer migration chain:
  `db/producer/003_import_acceptance.sql` then
  `db/producer/004_import_acceptance_rollback.sql`; alternate `_v1` drafts were
  removed after semantic comparison and are not referenced by tests.
- The v1 artifact accepts only binary `arquivo_csv`; the legacy
  `arquivo_csv0` alias is deliberately rejected.
- App reconciliation requires `submitted_at <= accepted_at <=
  producer_acknowledged_at` before promotion.
- OPEN-02 is passable only through the exact
  `prospecta-producer-worker-v1` seven-field envelope. The real worker is not
  connected; the direct response-to-gate shape fails closed and leaves the
  batch open.
- Explicit close uses
  `prospecta_close_empresaqui_batch_v1(jsonb)` and does not create terminals.
- The list service reads up to 100 canonical batches with one parameterized
  producer query.
- Legacy and v1 HTTP suites are separate. The v1 gate requires HTTPS, a
  hash-bound inspection file, and a producer SELECT-only connection. Setting
  `N8N_VERSIONED_CONTRACT_REQUIRED=true` turns missing remote evidence into a
  hard failure; local runs otherwise execute the static artifact contract and
  report remote suites skipped.
- OPEN-01, OPEN-02, OPEN-03, OPEN-04, and OPEN-05 remain external gates. No
  workflow publication, target migration, cluster change, or real data use was
  performed.
- Full implementation evidence:
  `.specs/features/batch-import-n8n-alignment/evidence/local-implementation-2026-07-20.md`.

Updated: 2026-07-22
