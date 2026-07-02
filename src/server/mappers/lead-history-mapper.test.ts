import { describe, expect, it } from "vitest";

import {
  mapLeadHistoryItem,
  type LeadHistoryRow,
} from "./lead-history-mapper";

const completeRow: LeadHistoryRow = {
  id: "160",
  import_batch_id: "batch-synthetic-016",
  lead_run_id: "run-synthetic-016",
  source_row: 16,
  created_at: "2026-07-01T12:30:00.000Z",
  final_action: "PROSPECTAR",
  reason: "Decisão armazenada pelo produtor",
};

describe("mapLeadHistoryItem", () => {
  it("maps only approved native history columns", () => {
    expect(mapLeadHistoryItem(completeRow, "160")).toEqual({
      decision_id: "160",
      import_batch_id: "batch-synthetic-016",
      lead_run_id: "run-synthetic-016",
      source_row: 16,
      analyzedAt: "2026-07-01T12:30:00.000Z",
      recommendedAction: "PROSPECTAR",
      recommendedActionReason: "Decisão armazenada pelo produtor",
      isCurrent: true,
    });
  });

  it("preserves decision and run identifiers exactly", () => {
    const item = mapLeadHistoryItem(
      {
        ...completeRow,
        id: "000160",
        lead_run_id: " Run-ID_Case-Sensitive ",
      },
      "000160",
    );

    expect(item.decision_id).toBe("000160");
    expect(item.lead_run_id).toBe(" Run-ID_Case-Sensitive ");
  });

  it("keeps different decisions with the same run identifier distinct", () => {
    const first = mapLeadHistoryItem(
      {
        ...completeRow,
        id: "161",
        lead_run_id: "run-synthetic-shared",
      },
      "161",
    );
    const second = mapLeadHistoryItem(
      {
        ...completeRow,
        id: "162",
        lead_run_id: "run-synthetic-shared",
      },
      "161",
    );

    expect([first.decision_id, second.decision_id]).toEqual(["161", "162"]);
    expect(first.lead_run_id).toBe(second.lead_run_id);
  });

  it("marks only the exact decision identifier as current", () => {
    const exact = mapLeadHistoryItem(
      { ...completeRow, id: "Decision-Exact" },
      "Decision-Exact",
    );
    const differentCase = mapLeadHistoryItem(
      { ...completeRow, id: "decision-exact" },
      "Decision-Exact",
    );

    expect(exact.isCurrent).toBe(true);
    expect(differentCase.isCurrent).toBe(false);
  });

  it("does not use a matching run identifier to mark another decision current", () => {
    const item = mapLeadHistoryItem(
      {
        ...completeRow,
        id: "163",
        lead_run_id: "run-synthetic-current",
      },
      "164",
    );

    expect(item.lead_run_id).toBe("run-synthetic-current");
    expect(item.isCurrent).toBe(false);
  });

  it("marks no item as current when the current decision is unavailable", () => {
    expect(mapLeadHistoryItem(completeRow, null).isCurrent).toBe(false);
  });

  it("normalizes a native Date analysis timestamp", () => {
    const item = mapLeadHistoryItem(
      {
        ...completeRow,
        created_at: new Date("2026-07-01T10:00:00.000-03:00"),
      },
      null,
    );

    expect(item.analyzedAt).toBe("2026-07-01T13:00:00.000Z");
  });

  it("preserves nullable native values without defaults", () => {
    const item = mapLeadHistoryItem(
      {
        ...completeRow,
        import_batch_id: null,
        source_row: null,
        created_at: null,
        reason: null,
      },
      null,
    );

    expect(item).toMatchObject({
      import_batch_id: null,
      source_row: null,
      analyzedAt: null,
      recommendedActionReason: null,
      isCurrent: false,
    });
  });

  it("does not expose fields absent from the approved run read model", () => {
    const item = mapLeadHistoryItem(completeRow, null);

    expect(item).not.toHaveProperty("score");
    expect(item).not.toHaveProperty("finalVerdict");
    expect(item).not.toHaveProperty("priority");
    expect(item).not.toHaveProperty("trustStatus");
    expect(item).not.toHaveProperty("used_cache");
    expect(item).not.toHaveProperty("agent_version");
    expect(item).not.toHaveProperty("source_hash");
    expect(item).not.toHaveProperty("supersededAt");
    expect(item).not.toHaveProperty("supersededByDecisionId");
  });
});
