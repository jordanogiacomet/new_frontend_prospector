# Sensitive Content — Internal Test Profile

**Status:** approved by repository owner for the identified internal test
profile on 2026-07-13; disabled by default and not production approval.

## Purpose and owner

The repository owner is the accountable data-policy owner for this narrow
internal test profile. The purpose is a manager's read-only review of the
stored qualification rationale. This decision neither authorizes production
exposure nor contact, CRM, export, or producer mutation.

## Retention and access

- Prospecta stores none of this content. It is read only for the authenticated
  response and sent with `Cache-Control: private, no-store`.
- A non-null producer `expires_at` that is in the past withholds all candidate
  content. A null `expires_at` is treated as producer-managed retention but
  does not create an app-side copy.
- Server responses expose it only when both
  `FEATURE_SENSITIVE_CONTENT_ENABLED` and the actor's `sensitive:read`
  permission are present.
- The Demo 2 development actor receives `sensitive:read` only under the
  existing local-development/full-access guard and only while the feature is
  explicitly enabled. Production identity/permission sourcing remains gated.

## Exact source and JSON allowlist

| UI field | Source | Accepted path and shape | Exposed value |
| --- | --- | --- | --- |
| Risks | `public.company_validations.risk_flags` | root array, `$[*]`, each item a bounded plain-text string | approved items only |
| Positive signals | `public.company_validations.positive_signals` | root array, `$[*]`, each item a bounded plain-text string | approved items only |
| Evidence | `public.company_validations.evidences` | root array, `$[*].title`, `$[*].summary?`, `$[*].url?` | title, sanitized plain-text summary, allowed HTTPS URL |
| Strategic report | `public.company_strategic_research_reports.report_markdown` | exactly one row with matching `lead_run_id` and CNPJ, `integrity_status = 'OK'`, and non-expired `expires_at` | Markdown reduced to sanitized plain text; links and images removed |

Collections are limited to 12 items. Plain-text items are normalized,
bounded, and rejected when they contain active HTML, control characters,
email addresses, phone-number-like content, or URLs. Evidence titles and
summaries use the same checks. Any unrecognized JSON shape is an unavailable
source state, not a best-effort interpretation.

Evidence URLs are optional. They require `https`, no credentials or explicit
port, and an exact normalized hostname in `SENSITIVE_URL_HOSTS`. When no host
is configured, evidence title/summary can remain visible but every URL is
withheld. The browser never prefetches or proxies a URL; rendered links use
safe external-link attributes.

For this synthetic test profile only, a strategic report is available only
after the exact-run relation returns one `OK` report. Active HTML, control
characters, contact-like data, bare unsafe protocols, images, and Markdown
links are rejected or removed before the response is mapped. `report_json`
and every other strategic-report column remain unavailable to the app.

## Explicit denylist

Never select, map, or return `raw_payload`, `search_queries`, `agent_summary`,
`apollo_fit_reason`, `strategic_reason`, any `crm_*` column or `crm_history`,
`integrity_error`, `llm_usage`, tokens, model names, run keys, child task IDs,
stage event IDs, or raw evidence/report JSON. Strategic reports outside the
narrowly approved Markdown field remain withheld.

The separate cost-control feature remains disabled by default. It may later
return only the estimated USD decimal from
`public.company_validation_runs.llm_estimated_cost_usd` and an approved
coverage state, after `costs:read`, `FEATURE_COSTS_ENABLED`, and the
server-only exact-subject allowlist all pass. It never returns the tokens used
to classify coverage, model/pricing data, `llm_usage`, or another cost field.
The sensitive-content routes in this profile do not select the cost value.

## Minimum producer grant boundary

The operator must grant `prospecta_producer_read` only the source columns
used by the current list/detail/history queries plus the three approved JSON
columns above. Do not grant `SELECT` on entire producer tables, write
privileges, execution privileges, or access to a producer view/function. The
following statement is an operator-run test-target action; Prospecta never
applies it:

```sql
GRANT USAGE ON SCHEMA public TO prospecta_producer_read;

GRANT SELECT (
  id, cnpj, cnpj_normalizado, razao_social, nome_fantasia, cidade, uf,
  cnae_principal, cnae_descricao, porte_empresa, regime_tributario,
  faturamento_estimado, quadro_funcionarios, quantidade_filiais, source_hash,
  trust_score, trust_verdict, trust_status, priority, validated_at, expires_at,
  agent_version, icp_score, strategic_asset_score, strategic_tier, used_cache,
  created_at, updated_at, last_lead_run_id, last_import_batch_id,
  last_source_row, integrity_status, risk_flags, positive_signals, evidences
) ON public.company_validations TO prospecta_producer_read;

GRANT SELECT (
  id, import_batch_id, source_row, cnpj_normalizado, final_action,
  processing_result, reason, run_created_at, lead_run_id, idempotency_key,
  integrity_status, test_case_id
) ON public.company_validation_runs TO prospecta_producer_read;

GRANT SELECT (
  lead_run_id, cnpj, report_markdown, integrity_status, expires_at
) ON public.company_strategic_research_reports TO prospecta_producer_read;
```

Before the separate cost-control reader is enabled, the producer operator must
approve and validate a distinct least-privilege grant for exactly
`import_batch_id`, `lead_run_id`, `llm_total_tokens`, and
`llm_estimated_cost_usd`, plus server-only `test_case_id` and `source_row` to
apply the approved production-run predicate, on
`public.company_validation_runs`. The application never applies that grant,
and `llm_total_tokens`, `test_case_id`, and `source_row` remain server-only.

## Verification

- Unit and route tests use synthetic JSON only.
- Tests cover permission and feature denial before sensitive columns are
  selected, expiration withholding, malformed JSON, PII/active-HTML rejection,
  exact-host HTTPS URL handling, and safe rendered links.
- A test-target smoke check may validate only connection, role identity, table
  privilege, and response status. It must not log or fixture real lead content.
