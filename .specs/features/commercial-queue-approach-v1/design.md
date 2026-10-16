# Commercial queue approach v1 — Design

**Spec**: `.specs/features/commercial-queue-approach-v1/spec.md`
**Status**: Baseline and shared-presentation extension deployed to Demo 3

## Flow

```text
GET /api/work-queue
  -> commercial:read + commercial feature
  -> producer current-lead SELECT
  -> app-owned workspace SELECT
  -> optional app-owned ready/claim-state SELECT when leads:read + sensitive:read
  -> queue items with nullable approach state + automatic-generation capability

visible priority B/C item with missing draft
  -> POST /api/leads/:cnpj/approach-message?leadRunId=...
  -> leads:read + sensitive:read + same-origin + AI gate
  -> re-read current selected producer run with sanitized report
  -> atomically claim app-owned cache identity
       ready: return cached message
       active claim: return preparing
       claim acquired: one OpenAI Responses request
  -> validate output -> mark ready -> return editable message

GET /api/leads/:cnpj/approach-message?leadRunId=...
  -> leads:read + sensitive:read
  -> app-owned cache read only; no producer read and no provider call
  -> lead and workspace hydrate the current persisted state

manual generation from any lead priority
  -> same protected POST and cache identity
  -> next GET /api/work-queue decorates that company with the exact persisted
     state/message even when its priority is D, E, R, null or unknown
```

## Reuse

| Existing code | Use |
| --- | --- |
| `src/server/lead-approach/generate-lead-approach.ts` | Preserve the one-call, `store:false`, structured-output provider contract and output validator. |
| `src/app/api/leads/[cnpj]/approach-message/route.ts` | Preserve auth-first, same-origin and server re-read behavior. |
| `src/server/commercial/work-queue-repository.ts` | Decorate the current producer page; never change membership or ranking. |
| `src/server/db/app-client.ts` | Parameterized app-owned cache queries. |
| `src/app/(private)/work-queue/page.tsx` | Trigger sequential preparation only for current visible B/C items. |
| `src/components/leads/lead-approach-message.tsx` | Reuse the response contract and human-review/copy language. |

## Components and interfaces

### App-owned draft cache

- **Migration**: `db/app/015_lead_approach_draft_cache_forward.sql`
- **Identity**: organization + CNPJ + observed run + generator version.
- **States**: `GENERATING`, `READY`, `FAILED`.
- **Concurrency**: each claim receives an attempt UUID; completion/failure can
  update only the matching attempt. Active leases and failure cooldowns prevent
  duplicate calls while allowing recovery after interruption.
- **Stored content**: validated message only; no report, prompt, raw response,
  contact, model payload or producer mutation.

### Cache repository

- **Location**: `src/server/lead-approach/lead-approach-draft-repository.ts`
- `claimLeadApproachDraft()` returns `claimed`, `ready`, `preparing` or
  `cooldown`.
- `completeLeadApproachDraft()` and `failLeadApproachDraft()` are attempt-token
  guarded.
- `listLeadApproachDraftStates()` reads exact page identities and maps expired
  leases/cooldowns to `missing`.

### Cached generation service

- **Location**: `src/server/lead-approach/prepare-lead-approach.ts`
- Claims before calling OpenAI, reuses ready messages, records safe failure
  cooldown and never retries a provider call.
- Uses a version exported beside the provider prompt so prompt changes
  intentionally invalidate prior drafts.

### Lead and workspace cache read

- The approach route also offers a permission-protected GET that reads only the
  exact app-owned cache identity.
- Lead detail hydrates a ready cached message on mount and preserves the
  explicit Generate with AI action when no draft exists.
- The commercial workspace presents the same cached message and does not
  create or regenerate one merely because the page was opened.

### Work queue DTO and route

- Every authorized current-page identity is checked for a persisted state.
  Ready, preparing and unavailable persisted states are exposed regardless of
  priority. Only an absent B/C draft is represented as `missing`; an absent
  lower-priority draft remains `null` and cannot trigger automatic generation.
- Route meta exposes `approachAutoGenerationEnabled`, true only when the new
  auto flag, existing AI flag/config and both lead/sensitive permissions pass.
- Demo data always reports automatic generation disabled.

### Queue UI

- The parent prepares missing visible items sequentially to avoid an unbounded
  burst of provider requests.
- Each eligible card shows preparing, unavailable or an editable ready draft
  with exact-copy feedback and a no-send notice.
- Local edits remain local and are not written back to the cache.

## Error handling

| Scenario | Handling | UI |
| --- | --- | --- |
| Existing ready cache | Return 200 without provider call | Editable message |
| Another active claim | Return 202 | “Mensagem em preparação” |
| Provider/validation failure | Mark failed with cooldown; safe 503 | Safe unavailable copy |
| App DB unavailable | Existing safe database mapping | Safe unavailable copy |
| Missing permissions/config | Fail before reads/calls | No automatic preparation |

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| C-minimum mapping | Exact `B` and `C` | These are the current approved tokens and the owner explicitly defined C as the floor. |
| Preparation scope | Current visible queue page | No background worker is authorized or available. |
| Concurrency control | Durable claim row + attempt token | Works across refreshes/processes and avoids duplicate provider charges. |
| Automatic rollout | Separate default-off flag | Existing explicit AI enablement does not silently authorize automatic cost on other targets. |
| Provider API | Existing Responses contract | Official OpenAI docs confirm `gpt-5.6-terra` supports Responses and Structured Outputs. |
| Presentation source | One app-owned cache identity | Lead, workspace and queue cannot diverge after a successful manual or automatic generation. |
| Lower-priority behavior | Display persisted state, never auto-create missing | Manual generation is priority-independent without broadening automatic provider spend. |
