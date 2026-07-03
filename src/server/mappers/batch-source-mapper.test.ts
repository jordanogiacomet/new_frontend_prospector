import { describe, expect, it } from "vitest";

import {
  mapBatchSourceSummary,
  type BatchSourceSummaryRow,
} from "./batch-source-mapper";

const completeRow: BatchSourceSummaryRow = {
  import_batch_id: "empresaqui_2026-07-03T12:30:00.000Z",
  first_analysis_at: "2026-07-03T09:30:00.000-03:00",
  last_analysis_at: new Date("2026-07-03T13:45:00.000Z"),
  saved_decision_count: 5,
  analyzed_company_count: 4,
};

describe("mapBatchSourceSummary", () => {
  it("maps the complete minimal aggregate contract", () => {
    expect(mapBatchSourceSummary(completeRow)).toEqual({
      import_batch_id: "empresaqui_2026-07-03T12:30:00.000Z",
      firstAnalysisAt: "2026-07-03T12:30:00.000Z",
      lastAnalysisAt: "2026-07-03T13:45:00.000Z",
      savedDecisionCount: 5,
      analyzedCompanyCount: 4,
    });
  });

  it("converts both analysis dates to canonical ISO strings", () => {
    const summary = mapBatchSourceSummary({
      ...completeRow,
      first_analysis_at: new Date("2026-07-03T08:00:00.000-03:00"),
      last_analysis_at: "2026-07-03T15:00:00.000+02:00",
    });

    expect(summary.firstAnalysisAt).toBe("2026-07-03T11:00:00.000Z");
    expect(summary.lastAnalysisAt).toBe("2026-07-03T13:00:00.000Z");
  });

  it("preserves real zero counts", () => {
    expect(
      mapBatchSourceSummary({
        ...completeRow,
        saved_decision_count: 0,
        analyzed_company_count: 0,
      }),
    ).toMatchObject({
      savedDecisionCount: 0,
      analyzedCompanyCount: 0,
    });
  });

  it.each([
    ["saved decisions", { saved_decision_count: -1 }],
    ["analyzed companies", { analyzed_company_count: -1 }],
  ])("rejects a negative %s count safely", (_case, fields) => {
    expect(() =>
      mapBatchSourceSummary({ ...completeRow, ...fields }),
    ).toThrowError("Metadados agregados de lote inválidos.");
  });

  it.each([
    ["saved decisions", { saved_decision_count: 1.5 }],
    ["analyzed companies", { analyzed_company_count: 2.5 }],
  ])("rejects a fractional %s count safely", (_case, fields) => {
    expect(() =>
      mapBatchSourceSummary({ ...completeRow, ...fields }),
    ).toThrowError("Metadados agregados de lote inválidos.");
  });

  it("preserves the batch identifier exactly", () => {
    const importBatchId =
      "empresaqui_2026-07-03T12:30:00.123456-03:00";

    expect(
      mapBatchSourceSummary({
        ...completeRow,
        import_batch_id: importBatchId,
      }).import_batch_id,
    ).toBe(importBatchId);
  });

  it("ignores fields outside the approved aggregate row", () => {
    const summary = mapBatchSourceSummary({
      ...completeRow,
      internal_note: "não expor",
      raw_manifest: { rows: 5 },
    } as BatchSourceSummaryRow);

    expect(summary).not.toHaveProperty("internal_note");
    expect(summary).not.toHaveProperty("raw_manifest");
  });

  it("contains no operational metadata", () => {
    const summary = mapBatchSourceSummary(completeRow);

    expect(summary).not.toHaveProperty("filename");
    expect(summary).not.toHaveProperty("expectedRowCount");
    expect(summary).not.toHaveProperty("receivedRowCount");
    expect(summary).not.toHaveProperty("executionMode");
    expect(summary).not.toHaveProperty("workflowVersion");
    expect(summary).not.toHaveProperty("hash");
    expect(summary).not.toHaveProperty("manifest");
  });

  it("does not infer status, percentage, or progress from counts", () => {
    const summary = mapBatchSourceSummary({
      ...completeRow,
      expected_row_count: 5,
      received_row_count: 5,
      status: "complete",
      progress: 100,
    } as BatchSourceSummaryRow);

    expect(Object.keys(summary)).toEqual([
      "import_batch_id",
      "firstAnalysisAt",
      "lastAnalysisAt",
      "savedDecisionCount",
      "analyzedCompanyCount",
    ]);
  });

  it.each([
    ["empty batch identifier", { import_batch_id: "   " }],
    ["invalid first date", { first_analysis_at: "not-a-date" }],
    ["invalid last date", { last_analysis_at: new Date(Number.NaN) }],
    ["non-numeric count", { saved_decision_count: "5" }],
  ])("fails safely for an %s", (_case, fields) => {
    expect(() =>
      mapBatchSourceSummary({
        ...completeRow,
        ...fields,
      } as BatchSourceSummaryRow),
    ).toThrowError("Metadados agregados de lote inválidos.");
  });
});
