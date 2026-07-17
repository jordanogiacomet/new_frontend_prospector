# Local Reset Boundary
> Limpeza local com histórico CRM preservado

Entry: `docs/db/schema.sql:public.crm_company_history` and
`docs/db/schema.sql:public.crm_lead_contact_history`

Preserve together:
- `public.crm_company_history` — parent
- `public.crm_lead_contact_history` — FK → `crm_company_history`

Generated producer candidates: `company_validation_runs`,
`company_validations`, `company_strategic_research_reports`,
`lead_import_batches`, `lead_input_rows`, `lead_processing_state`,
`lead_processing_events`, `lead_decisions`, `workflow_dead_letters`, and
`workflow_integrity_errors`.

Keep operational/reference data unless a full rebuild is intended:
`model_pricing`; review `agent_eval_cases` separately. `agent_eval_results`
are disposable test output.

Gotcha: the local app-owned target exposes `public` producer tables as well as
`prospecting_app` tables. Treat every `public` table as producer-owned; do not
mutate it through the app connection.

Policy: `AGENTS.md:Authorized local producer reset profile` permits the exact
allowlist only for an operator-run, disposable non-production reset. Prospecta
runtime roles remain read-only; reset execution requires the database owner,
not app or producer-read roles.

Updated: 2026-07-15
