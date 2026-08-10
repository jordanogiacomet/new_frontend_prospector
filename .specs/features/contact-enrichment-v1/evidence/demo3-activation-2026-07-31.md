# Demo 3 Contact Enrichment Activation Evidence — 2026-07-31

## Scope

- Exact local pre-production app target: `http://192.168.0.20:30100`.
- Exact n8n ingress: `POST http://192.168.0.20:30098/webhook/prospecta/lusha/decision-makers`.
- Prospecta release: `demo3-preprod-20260731-contact-enrichment-v1-001`.
- Synthetic-only CNPJ and reserved `.example` company domains.
- No contact value, provider response, secret, execution ID, or real-data value
  was inspected or recorded as evidence.

## Deployment and isolation

- The Demo 3 preflight matched the configured Kubernetes context, HTTPS API
  server, `kube-system` UID, and non-production namespace marker before
  mutation.
- Immutable app, edge, proxy, and PostgreSQL images rolled out Ready with zero
  container restarts; app-owned migration `009` was applied.
- Runtime grants allowed only the reviewed request-ledger operations. Producer
  data and the current producer workflow were not mutated.
- The reference workflow remained inactive. The separate contact-enrichment
  workflow was imported with three operator-managed native n8n credentials;
  the repository artifact remains `active: false` and credential-free.

## Synthetic UAT

| Case | Observed result | Provider dispatch |
| --- | --- | --- |
| Missing ingress authentication | `403` | None |
| Incorrect ingress authentication | `403` | None |
| Authenticated empty request | `400` | None |
| First app request before Code-node fix | `202`, then honest `DISPATCH_OUTCOME_UNKNOWN` | None; validation node stopped before Lusha |
| Corrected app request | `202 ENRICHMENT_DISPATCHED`, then authenticated `PROVIDER_OUTCOME_UNKNOWN` callback | One synthetic Decision Makers attempt |
| Identical idempotency replay | `200` with original safe record | None |
| Same idempotency key with changed input | `409` | None |

The provider outcome was intentionally not inspected. The terminal unknown
state is truthful for a reserved synthetic domain and exposed no contact.
After UAT, the PII-free app ledger contained two requests: one
`DISPATCH_OUTCOME_UNKNOWN` and one `PROVIDER_OUTCOME_UNKNOWN`. Duplicate and
conflict tests added neither a request nor an n8n execution.

## Retention and cleanup evidence

n8n 2.30.6 honored `saveDataSuccessExecution: none` and
`saveDataErrorExecution: none` by soft-deleting completed runs, but its pruner
did not immediately remove the associated execution-data row. Exact,
workflow-scoped cleanup removed:

- two interrupted synthetic executions from the pre-fix attempt;
- one authenticated-invalid synthetic execution after the fix; and
- one corrected synthetic provider execution after callback completion.

Final postcondition: zero execution rows and zero execution-data rows for the
new workflow. One stale webhook-registration row created for the new workflow
during the first import was also removed while it was inactive; reimporting
the artifact can recreate this metadata. No existing workflow history or
producer/app-owned business record was deleted. The app-owned ledger and its
append-only events were preserved.

## Final state and rollback

- New workflow: active on only the exact approved path.
- Reference workflow: inactive and unchanged.
- Commercial-queue button: unchanged and does not call the API.
- Contact PII: zero storage and zero exposure.
- Rollback: unpublish the new n8n workflow and restart n8n; roll back the Demo
  3 immutable app release separately while preserving app-owned ledger/audit
  history and producer data.

This evidence authorizes only synthetic testing in the exact Demo 3 profile.
It is not approval for real contacts, contact reveal, production, or another
network target.
