import type { LeadDetail, LeadSummary } from "../../types/leads";

export function applyLeadSummaryAuditAccess(
  lead: LeadSummary,
  canReadAudit: boolean,
): LeadSummary {
  return canReadAudit ? lead : { ...lead, source_hash: null };
}

export function applyLeadDetailAuditAccess(
  lead: LeadDetail,
  canReadAudit: boolean,
): LeadDetail {
  if (canReadAudit) {
    return lead;
  }

  return {
    ...lead,
    source_hash: null,
    audit: {
      ...lead.audit,
      source_hash: null,
      idempotency_key: null,
    },
  };
}
