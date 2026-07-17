import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listDemoCommercialWorkQueue } from "./prospecta-demo-data";

describe("synthetic commercial work queue", () => {
  it("returns only synthetic producer and workspace facts", () => {
    const result = listDemoCommercialWorkQueue({
      page: 1,
      pageSize: 20,
      filters: {},
      sort: "last_analysis_desc",
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items[0]).toMatchObject({
      sources: {
        producer: { factSource: "producer_current_leads_v1" },
        workspace: { factSource: "app_lead_workspaces_v1" },
      },
    });
    for (const item of result.items) {
      expect(item.producerLead).not.toHaveProperty("strategicReport");
      expect(item.producerLead).not.toHaveProperty("evidences");
      expect(item).not.toHaveProperty("payload");
    }
  });

  it("applies only the established queue filters and preserves pagination", () => {
    const unfiltered = listDemoCommercialWorkQueue({
      page: 1,
      pageSize: 1,
      filters: {},
      sort: "last_analysis_desc",
    });
    const filtered = listDemoCommercialWorkQueue({
      page: 1,
      pageSize: 20,
      filters: {
        cnpj_normalizado: unfiltered.items[0]!.producerLead.cnpj,
        commercial_stage: "CONTACTED",
        responsible_subject: "local-demo-user",
      },
      sort: "last_analysis_desc",
    });

    expect(unfiltered.items).toHaveLength(1);
    expect(filtered).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(filtered.items[0]?.workspace).toMatchObject({
      commercial_stage: "CONTACTED",
      responsible_subject: "local-demo-user",
    });
  });
});
