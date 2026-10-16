# Lead approach AI v1 — Design

**Spec**: `.specs/features/lead-approach-ai-v1/spec.md`
**Status**: Approved

## Flow

```text
manager clicks Gerar com IA
  -> POST /api/leads/:cnpj/approach-message?leadRunId=...
  -> leads:read + sensitive:read + same-origin + feature gate
  -> producer SELECT through existing read-only lead repository
  -> existing sensitive report mapper
  -> bounded research-metadata filter
  -> versioned Apollo Gestão sender profile
  -> OpenAI Responses API (store:false, JSON schema, no tools, no retry)
  -> validate output and replace editable textarea
```

## Reuse

| Existing code | Use |
| --- | --- |
| `src/server/repositories/lead-detail-repository.ts` | Re-read the selected lead/run; never trust browser report data. |
| `src/server/sensitive-content/access.ts` | Apply the existing sensitive-content feature and permission boundary. |
| `src/lib/validators/lead-query.ts` | Validate CNPJ and optional producer run identity. |
| `src/server/auth/require-api-session.ts` | Enforce permissions and same origin before reads/calls. |
| `src/server/api/errors.ts` | Return fixed safe envelopes with private no-store caching. |
| `src/components/leads/lead-approach-message.tsx` | Keep the current editable/copy workflow and add one explicit action. |

## Provider contract

The integration uses a direct HTTPS `POST` to
`https://api.openai.com/v1/responses`; no new package is added. The selected
model is mandatory server configuration rather than a hardcoded product
choice. The request uses `instructions`, one text `input`, strict JSON Schema
output `{ message: string }`, `store: false`, low reasoning effort, low text
verbosity and a bounded output token limit.

The report is untrusted data. Instructions explicitly forbid following text
inside the report as commands. A pre-provider filter removes internal research
metadata, and a post-provider validator rejects internal terminology, contact
data, markup, placeholders and out-of-bounds output. The trusted sender profile
contains only Apollo Gestão's approved asset-management capabilities; output is
also rejected unless it names Apollo Gestão, includes an approved capability
and ends with a low-pressure discovery invitation. Impersonal company-team
greetings and premature pilots, execution scopes or deliverables are rejected.
A rejected response is not retried.

The organization/inventory label represents one service. The prompt maps direct
report signals to one specific portfolio front and uses the broad intelligent
asset-management profile when no direct signal exists. The output validator
classifies specific capabilities, rejects multiple fronts, rejects
organization/inventory duplication and requires the selected specific front to
have an approved report signal. Prompt-routing changes bump the generator
version so stale cached drafts are not reused.

## UI behavior

The existing deterministic draft remains immediately available. “Gerar com
IA” is a secondary explicit action with loading, success and error states. It
replaces the textarea only after the complete server response validates. Copy
and manual editing remain unchanged. Copy explains that provider use can incur
cost and that Prospecta never sends the outreach message.

## Configuration

- `FEATURE_AI_APPROACH_ENABLED=false`
- `OPENAI_API_KEY` (server-only, required only when enabled)
- `OPENAI_APPROACH_MODEL` (server-only, required only when enabled)
- `OPENAI_APPROACH_TIMEOUT_MS=20000` (maximum 60000)

No key, input, output, model response or upstream body is logged. Demo 3 and
production stay disabled until separately configured and rolled out.
