# Decision: CSV Retention

**Status:** APPROVED IMPLEMENTATION BASELINE — production operations/data-policy
approval pending  
**Decision owner:** Repository owner for implementation; production owner
unassigned  
**Date:** 2026-07-03

## Context

The app may eventually forward an EmpresaAqui CSV to an approved producer
ingress. CSV content can contain sensitive business or personal data and must
not be retained merely for convenience.

## Decision

- Do not store CSV bytes in PostgreSQL.
- Accept one file up to 10 MiB and prefer direct server-side forwarding to the
  early-accepting producer ingress.
- If temporary storage is required, use an approved encrypted mechanism with a
  short fixed TTL and access limited to the import service role.
- Store only allowlisted metadata in `import_submissions`: sanitized filename,
  byte count, approved MIME type, SHA-256, timestamps, actor, contract version,
  and producer acceptance identifiers.
- The implementation baseline uses request-scoped memory only. Release byte
  references immediately after validated acceptance, rejection, or request
  termination.
- If later approved temporary storage is required, delete bytes after durable
  acceptance or at the TTL, whichever
  occurs first, subject to an explicit rule for unknown acceptance.
- Record deletion outcome as metadata without logging the filename path,
  contents, or download URL.
- Do not automatically retry accepted or acceptance-unknown uploads.

## Alternatives

| Option | Assessment |
| --- | --- |
| Permanent PostgreSQL byte storage | Rejected: expands exposure and backup retention |
| Permanent object storage | Rejected for MVP: no demonstrated business need |
| Browser directly uploads to n8n | Rejected: bypasses app authorization/audit boundary |
| Short-lived encrypted object storage | Acceptable only if direct forwarding is not operationally safe |

## Production Questions

- Confirm the 10 MiB limit, producer timeout, and direct-forwarding capacity.
- If direct forwarding is rejected, approve storage provider, TTL, deletion
  retry, encryption, and access controls before changing implementation.
- What happens after app timeout with unknown producer acceptance?
- Confirm whether a malware/content scan is required.
- Which fields are legally/policy-sensitive?
- Required audit and incident-response retention?

## Verification

- No raw bytes appear in PostgreSQL, logs, traces, analytics, or error reports.
- Temporary objects are encrypted, private, TTL-bound, and deletion-audited.
- Hashing is performed over the exact transmitted bytes.
- Filename sanitization prevents path or header injection.
- Tests use synthetic files only.
