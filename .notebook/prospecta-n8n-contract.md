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

Gate: T018/T019 pending; T011 implemented by explicit owner override
- T012–T017 remain blocked
- App `N8N_IMPORT_URL` accepts HTTP/HTTPS only on official ingress paths

Updated: 2026-07-06
