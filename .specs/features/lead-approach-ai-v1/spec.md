# Lead approach AI v1

Status: implemented and activated on the owner-approved Demo 3 target on
2026-08-17 with the server-only model `gpt-5.6-terra`. The low-pressure tone
and profile-fit refinements are active in release
`demo3-preprod-20260817-profile-fit-001`. Other targets remain
configuration-gated and require separate approval and credentials.

## Problem statement

The deterministic approach draft can mistake internal research commentary for
customer-facing business context. The manager also needs a more natural,
company-specific first-contact draft grounded in the approved strategic report,
while retaining human review and control over any provider call.

## Goals

- Block research metadata and internal qualification language from every local
  customer-facing draft.
- Offer one explicit AI generation action on the lead detail.
- Ground generation only in the current server-read, sanitized strategic report
  and approved company identity/sector fields.
- Present Apollo Gestão and connect one approved asset-management capability
  to the target company's context through a low-pressure discovery question.
- Preserve the editable local draft whenever generation is unavailable or
  rejected.

## Out of scope

| Capability | Reason |
| --- | --- |
| Automatic generation on page load or polling | Provider use and cost require an explicit manager action. |
| Message sending, CRM sync, n8n or outreach automation | The feature produces a reviewable draft only. |
| Draft persistence or audit storage | No new app-owned write workflow is required. |
| Web search or provider tools | The strategic report is the sole factual source. |
| Production or Demo 3 activation without owner configuration | The app must not invent a key or model choice. |

## Requirements

- `LAAI-01` — WHEN a report line describes AI, sources, research quality,
  confidence, hypothesis, validation or report status THEN the deterministic
  draft SHALL NOT reproduce it as customer-facing context.
- `LAAI-02` — WHEN the manager selects “Gerar com IA” THEN the browser SHALL
  make one same-origin request to Prospecta and SHALL NOT send report content,
  company identity or provider credentials in the request body.
- `LAAI-03` — BEFORE reading the lead or calling the provider, the route SHALL
  require `leads:read`, `sensitive:read`, same-origin and the server-only
  feature/configuration gate.
- `LAAI-04` — The server SHALL re-read the selected lead/run with sensitive
  policy mapping and SHALL send only approved identity, sector, the versioned
  sender profile and a bounded, metadata-filtered strategic report to the
  provider.
- `LAAI-05` — The provider request SHALL use the OpenAI Responses API with
  structured JSON output, `store: false`, a bounded timeout, no tools and no
  automatic retry.
- `LAAI-06` — The generated message SHALL be plain Brazilian Portuguese,
  company-specific, fact-grounded and free of internal analysis terminology,
  contact data, unverifiable claims, Markdown, HTML and placeholders.
- `LAAI-07` — WHEN generation succeeds THEN the textarea SHALL receive the
  returned message for human editing; WHEN it fails THEN the existing draft
  SHALL remain unchanged and the UI SHALL show a safe actionable message.
- `LAAI-08` — API keys, model configuration, report inputs and provider outputs
  SHALL NOT be logged, returned as errors or exposed through `NEXT_PUBLIC_*`.
- `LAAI-09` — The generated message SHALL name Apollo Gestão, explain one
  approved asset-management capability, connect it to one target-company fact
  without inventing a problem and end with a brief discovery invitation that
  does not prescribe a duration, pilot, scope, execution stages or deliverable.
- `LAAI-10` — The provider request SHALL use low reasoning effort and low text
  verbosity, while the prompt and output validator SHALL reject an impersonal
  “equipe da empresa” greeting and premature project proposals.
- `LAAI-11` — The sender profile SHALL treat organização patrimonial and
  inventário patrimonial as one service and generated copy SHALL NOT present or
  repeat them as distinct offers, benefits or stages.
- `LAAI-12` — WHEN an approved report fact directly supports estoque,
  processamento patrimonial, avaliação, impairment, vida útil or
  rastreabilidade THEN the prompt SHALL direct the model to select only the
  matching Apollo capability; WHEN no direct fit exists THEN it SHALL use the
  broad gestão inteligente de ativos profile and ask a discovery question
  instead of defaulting to inventário patrimonial.
- `LAAI-13` — The output validator SHALL reject more than one specific Apollo
  service in the same first-contact message and SHALL reject a specific service
  that has no supporting signal in the approved report context.

## Acceptance and traceability

| Requirement | Implementation | Verification | Status |
| --- | --- | --- | --- |
| LAAI-01 | Deterministic context denylist | Formatter regression test | Verified |
| LAAI-02, LAAI-07 | Lead approach component | Component interaction tests | Verified |
| LAAI-03, LAAI-04 | Authenticated lead approach route | Route tests | Verified |
| LAAI-05, LAAI-06, LAAI-08 | Server-only OpenAI service and environment gate | Service/environment tests | Verified |
| LAAI-09 | Versioned Apollo sender profile and output validator | Service prompt/output tests | Verified |
| LAAI-10 | Responses parameters, tone prompt and overreach validator | Service request/output tests plus synthetic provider evaluation | Verified locally |
| LAAI-11 | Unified patrimonial-service terminology and duplication validator | Service prompt/output regression tests | Verified locally |
| LAAI-12, LAAI-13 | Profile-to-capability routing prompt and grounded capability validator | Multi-profile synthetic service tests | Verified locally |

## Success criteria

- [x] The reported PLASFORT research-quality sentence never appears in a local or
  AI-generated customer message.
- [x] One explicit action can replace the current textarea value with a validated,
  report-grounded message.
- [x] Failure never clears or overwrites the manager's current draft.
- [x] Generated copy presents Apollo Gestão and one relevant capability, then
  asks a concrete discovery question without prescribing a project.
- [x] Lint, strict typecheck, full tests and production build pass.
- [x] Different approved report profiles select different relevant Apollo
  capabilities without a default inventory pitch.
- [x] Organização patrimonial and inventário patrimonial never appear as two
  distinct offers in an accepted message.

## Validation — 2026-08-17

- Focused formatter, environment, service, route, component and page gate:
  6 files / 155 tests passed.
- Full regression gate: 117 files / 2,151 tests passed.
- Full ESLint and strict TypeScript checks passed.
- Local contract gate: 10 files / 54 tests passed; 57 remote target cases
  remained skipped because no external target was exercised.
- Sanitized production build passed with demo bypass gates disabled for the
  command; `.env.local` was not changed.
- No real OpenAI request was made. Provider behavior was verified with
  synthetic mocked responses only.
- Release `demo3-preprod-20260817-ai-approach-001` activated the feature with
  server-only credentials and `gpt-5.6-terra`. Exact target/TLS preflights,
  immutable-image rollout and value-free `401`/`400` route smoke passed with
  both workloads Ready and zero restarts. The postflight made no OpenAI request.
- The post-release commercial-copy refinement passed 16 focused service tests,
  36 combined service/route/component tests, full lint and typecheck, 117 files
  / 2,154 tests and the sanitized production build. Release
  `demo3-preprod-20260817-ai-proposal-001` deployed the refinement after exact
  target/TLS preflights; both workloads are Ready with zero restarts and the
  value-free route smoke returned `401`/`400` without an OpenAI request.
- The sender profile is grounded in the official Apollo Gestão Empreendedora
  [company page](https://www.apollogestao.com.br/home/sobre/) and
  [solution catalog](https://www.apollogestao.com.br/solucoes/controle-patrimonial/organizacao-patrimonial/).
- The low-pressure refinement passed 18 focused service tests, full ESLint,
  strict TypeScript, 117 files / 2,156 tests and the sanitized production
  build. Two bounded evaluations called the configured OpenAI provider once
  for each of three fully synthetic companies with `store:false`; the second
  round consistently produced short Apollo introductions, one report-grounded
  capability, one concrete discovery question and no pilot or project scope.
- Release `demo3-preprod-20260817-ai-tone-001` passed the exact Demo 3 target
  and TLS preflights, built and published immutable images, and rolled out the
  app and PostgreSQL workloads `1/1` Ready with zero restarts. Runtime checks
  confirmed the enabled feature, `gpt-5.6-terra`, the bounded timeout and the
  compiled low-reasoning/low-verbosity/non-stored request without printing the
  API key. Value-free postflight returned anonymous `401` and authenticated
  invalid-input `400`, so it made no producer read for a valid lead, OpenAI
  request or message send.
- The profile-fit refinement passed 3 focused files / 76 tests, full ESLint,
  strict TypeScript, 120 files / 2,192 tests, 10 contract files / 54 tests and
  the sanitized production build. The contract gate retained 57 remote cases
  as skipped because no external target was exercised.
- Synthetic reports verified distinct messages for asset traceability, stock
  inventory and useful-life review. The service rejected an unsupported
  specific capability, two specific capabilities in one message, and the
  duplicated organization/inventory patrimonial wording.
- Generator version `apollo-profile-fit-v2` invalidates prior cached drafts.
  Release `demo3-preprod-20260817-profile-fit-001` passed exact target and
  contact-TLS preflights, immutable image publication, idempotent app-owned
  migrations and rollout. App and PostgreSQL are `1/1` Ready; all four
  containers have zero restarts.
- Runtime verification confirmed the enabled AI/automatic-queue flags,
  `gpt-5.6-terra`, the bounded timeout, configured server-only key and compiled
  profile-fit artifact without printing the key. Anonymous Leads returned
  `401` and an authenticated invalid generation request returned `400`; the
  postflight found no OpenAI request or sanitized error marker.
