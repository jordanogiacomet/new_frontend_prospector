# Prospecta n8n Contract
> Official import ingress runtime evidence and blocking contract gate

Entry: `tests/contract/n8n-import-webhook.contract.test.ts`
Contract: `.specs/features/prospecting-console/contracts/n8n-import-webhook.md`
Evidence: `.specs/features/prospecting-console/evidence/current-workflow-map.md`
Export: `private-workflows/EmpresaAqui_Webhook_Import_v1.json`

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

Gate: T018/T019 pending; T011 implemented by explicit owner override
- T012–T017 remain blocked
- App `N8N_IMPORT_URL` accepts HTTP/HTTPS only on official ingress paths

Updated: 2026-07-15
