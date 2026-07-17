import { describe, expect, it } from "vitest";

import type { LeadDetail, LeadSummary } from "../../types/leads";
import {
  applyLeadDetailAuditAccess,
  applyLeadSummaryAuditAccess,
} from "./lead-audit-access";

const summary = {
  source_hash: "synthetic-source-hash",
} as LeadSummary;

const detail = {
  ...summary,
  audit: {
    source_hash: "synthetic-source-hash",
    idempotency_key: "synthetic-idempotency-key",
  },
} as LeadDetail;

describe("lead audit access", () => {
  it("redacts internal identifiers without audit permission", () => {
    expect(applyLeadSummaryAuditAccess(summary, false)).toMatchObject({
      source_hash: null,
    });
    expect(applyLeadDetailAuditAccess(detail, false)).toMatchObject({
      source_hash: null,
      audit: {
        source_hash: null,
        idempotency_key: null,
      },
    });
  });

  it("preserves the original DTO for audit readers", () => {
    expect(applyLeadSummaryAuditAccess(summary, true)).toBe(summary);
    expect(applyLeadDetailAuditAccess(detail, true)).toBe(detail);
  });
});
