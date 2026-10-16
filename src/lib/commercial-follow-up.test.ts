import { describe, expect, it } from "vitest";

import type { CommercialStage } from "../types/commercial";
import {
  getCommercialFollowUpStatus,
  getFollowUpDateInputValue,
} from "./commercial-follow-up";

function workspace(
  dueAt: string | null,
  stage: CommercialStage = "FOLLOW_UP",
  archivedAt: string | null = null,
) {
  return {
    next_action_due_at: dueAt,
    commercial_stage: stage,
    archived_at: archivedAt,
  };
}

describe("commercial follow-up calendar", () => {
  it("compares calendar days in São Paulo instead of the host timezone or elapsed hours", () => {
    const now = new Date("2026-10-07T01:30:00.000Z");

    expect(getCommercialFollowUpStatus(workspace("2026-10-05T12:00:00.000Z"), now)).toBe("overdue");
    expect(getCommercialFollowUpStatus(workspace("2026-10-06T12:00:00.000Z"), now)).toBe("today");
    expect(getCommercialFollowUpStatus(workspace("2026-10-07T12:00:00.000Z"), now)).toBe("scheduled");
  });

  it("does not treat a missing or invalid deadline as overdue", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");

    expect(getCommercialFollowUpStatus(null, now)).toBe("unscheduled");
    expect(getCommercialFollowUpStatus(workspace(null), now)).toBe("unscheduled");
    expect(getCommercialFollowUpStatus(workspace("invalid"), now)).toBe("unscheduled");
    expect(getCommercialFollowUpStatus(workspace("2026-02-30T12:00:00.000Z"), now)).toBe("unscheduled");
  });

  it.each(["CLOSED_WON", "CLOSED_LOST"] as const)("keeps %s outside the pending follow-ups", (stage) => {
    expect(getCommercialFollowUpStatus(workspace("2026-01-01T12:00:00.000Z", stage))).toBe("closed");
  });

  it("keeps archived workspaces outside pending follow-ups while allowing scheduled resumptions", () => {
    const now = new Date("2026-10-06T12:00:00.000Z");

    expect(getCommercialFollowUpStatus(workspace("2026-01-01T12:00:00.000Z", "PAUSED", "2026-09-01T12:00:00.000Z"), now)).toBe("closed");
    expect(getCommercialFollowUpStatus(workspace("2026-10-06T12:00:00.000Z", "PAUSED"), now)).toBe("today");
    expect(getCommercialFollowUpStatus(workspace(null, "PAUSED"), now)).toBe("unscheduled");
  });

  it("calculates date shortcuts from the São Paulo day across year boundaries", () => {
    const now = new Date("2027-01-01T01:30:00.000Z");

    expect(getFollowUpDateInputValue(0, now)).toBe("2026-12-31");
    expect(getFollowUpDateInputValue(1, now)).toBe("2027-01-01");
    expect(getFollowUpDateInputValue(7, now)).toBe("2027-01-07");
  });
});
