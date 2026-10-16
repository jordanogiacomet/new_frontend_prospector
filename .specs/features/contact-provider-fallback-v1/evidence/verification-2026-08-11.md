# Contact Provider Fallback v1 — Demo 3 rollout 2026-08-11

Status: repository gates passed and the guarded Demo 3 rollout completed. A
provider-call UAT remains an explicit operator action.

## Preflight correction

- The first read-only published preflight reached the exact Demo 3 n8n target
  but rejected the approved 19-node predecessor's current Lusha binding name.
- Safe metadata inspection showed the expected seven non-Apollo bindings. No
  credential value or provider response was read.
- A RED contract reproduced the missing `withoutApollo(currentBindings)`
  compatibility case; the minimum validator change made all four preparation
  contracts pass.
- The repeated published preflight passed without cluster or n8n mutation.

## Repository gates

- Focused workflow/preparation contracts: 2 files and 16 tests passed.
- ESLint, Next route generation, strict TypeScript and `git diff --check`
  passed.
- Unit/component/route suite: 104 files and 2,014 tests passed.
- Contract suite: 8 files and 48 tests passed; 2 remote suites and 57 cases
  remained skipped behind their configured gates.
- Production build passed with development and Demo 2 flags explicitly false.

## Rollout and postflight

- Workflow `PCEv2Demo3b8L3nR` was exported in process memory for rollback,
  unpublished, replaced under the same ID and republished by the guarded
  operator script. No workflow execution was requested.
- Postflight confirmed 29 nodes, one webhook registration, safe credential
  bindings, zero saved executions and zero active executions.
- Immutable app/database/edge/proxy release
  `demo3-preprod-20260811-apollo-fallback-001` rolled out after the exact
  Kubernetes and TLS preflights.
- The app Deployment and PostgreSQL StatefulSet are each 1/1 Ready. All four
  release containers have zero restarts.
- The deployer's built-in HTTP and HTTPS smoke passed: private resources deny
  anonymous access and accept the release-scoped gateway credential.
- App-owned migrations replayed idempotently. No producer table, grant, score,
  recommendation or workflow was mutated.

## Deliberately not exercised

- No Prospecta contact POST, n8n webhook execution, Lusha call or Apollo call
  was made during rollout; no provider credit was consumed.
- The Apollo credential value remained only in n8n and was never printed,
  decrypted, copied to Git, shell history or application configuration.
- Credential metadata and workflow binding are verified. Runtime key validity
  and API access remain unverified until the operator explicitly submits a
  controlled company preview; Reveal remains a separate human action.
