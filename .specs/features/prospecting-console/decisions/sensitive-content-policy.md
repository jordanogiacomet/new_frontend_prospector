# Decision: Sensitive Content Policy

**Status:** APPROVED CONTROL FRAMEWORK — production semantic allowlists require
LGPD/data-policy owner  
**Decision owner:** Repository owner for controls; production data-policy owner
unassigned  
**Date:** 2026-07-03

## Principle

Sensitive producer content is withheld by default. Database presence is not
authorization to expose it.

## Base Allowlist

Eligible for the standard business view after source-contract approval:

- company legal/trade name;
- CNPJ;
- city and UF;
- CNAE/sector;
- size and approved commercial ranges;
- stored score, priority, action, action reason, verdict, and trust;
- analysis date and cache indicator;
- agent version;
- batch, run, and source row in an audit section.

## Sensitive Candidate Allowlist

- risk and positive-signal plain-text items;
- evidence title, approved plain-text summary, and approved external URL;
- sanitized strategic report Markdown.

The implementation may add deny-by-default mappers and synthetic tests for
these candidates. Production exposure requires all of: `sensitive:read`, an
exact source table/column/JSON-path allowlist, business meaning, retention
rule, data-policy owner approval, and UI purpose.

Names, email addresses, phone numbers, CRM status/history, opt-out, and
do-not-call information remain withheld. They require a separate contact
policy and are not enabled by `sensitive:read` alone.

## Always Withheld from Business Responses

- raw/normalized payloads and rows;
- LLM prompts and raw responses;
- search queries;
- raw `report_json` or unsanitized Markdown;
- integrity errors, dead letters, and error payloads;
- tokens, secrets, costs, SQL, or n8n execution IDs;
- input/external snapshots;
- upload idempotency keys and hashes outside a restricted audit need.

## Rendering Rules

- Sanitize any approved Markdown/report content.
- Strip or reject active HTML.
- Allow external links only for approved `https` URLs.
- Normalize hostnames and require an exact server-configured hostname match;
  subdomains require their own entries. Apply safe link attributes.
- Do not fetch evidence URLs from the browser on the user's behalf.
- Missing/withheld content has an explicit state; it is not an empty array or
  fabricated summary.

## Logging Rules

Do not log:

- CSV contents;
- CNPJ, email, phone, contact names, CRM history;
- notes, reports, evidence bodies;
- database parameters or raw producer responses.

Operational logs use correlation IDs, safe categories, durations, counts, and
app-owned opaque identifiers.

## Production Approval Questions

- Who may access contact data and for which purpose?
- How are opt-out/do-not-call requirements enforced?
- Which report/evidence semantics are reliable enough for managers?
- Which external hosts are allowed?
- What are field-level retention and subject-request procedures?
- Is audit access a separate role?

## Verification

- DTO snapshots prove default withholding.
- Permission tests prove field-level denial.
- URL and sanitization tests cover malicious inputs.
- Logs and error envelopes contain no sensitive fixtures.
- All tests use synthetic data.
