import { describe, expect, it } from "vitest";

import { commercialStages } from "../../types/commercial";

import {
  allowedCommercialStageTransitions,
  evaluateCommercialStageTransition,
  isCommercialStageTransitionAllowed,
  terminalCommercialStages,
} from "./transition-policy";

const allowedTransitionCases = Object.entries(
  allowedCommercialStageTransitions,
).flatMap(([from, toStages]) =>
  toStages.map((to) => ({
    from: from as keyof typeof allowedCommercialStageTransitions,
    to,
  })),
);

const unlistedTransitionCases = [
  { from: "NOT_STARTED", to: "CONTACTED" },
  { from: "NOT_STARTED", to: "PAUSED" },
  { from: "ASSIGNED", to: "FOLLOW_UP" },
  { from: "ASSIGNED", to: "CLOSED_WON" },
  { from: "CONTACTED", to: "ASSIGNED" },
  { from: "FOLLOW_UP", to: "ASSIGNED" },
  { from: "MEETING", to: "CONTACTED" },
  { from: "PAUSED", to: "MEETING" },
] as const;

const terminalReopenCases = terminalCommercialStages.flatMap((from) =>
  commercialStages
    .filter((to) => to !== from)
    .map((to) => ({
      from,
      to,
    })),
);

describe("commercial stage transition policy", () => {
  it.each(allowedTransitionCases)(
    "allows $from to $to",
    ({ from, to }) => {
      expect(isCommercialStageTransitionAllowed(from, to)).toBe(true);
      expect(evaluateCommercialStageTransition(from, to)).toEqual({
        success: true,
        from,
        to,
      });
    },
  );

  it.each(unlistedTransitionCases)(
    "rejects unlisted transition $from to $to",
    ({ from, to }) => {
      expect(isCommercialStageTransitionAllowed(from, to)).toBe(false);
      expect(evaluateCommercialStageTransition(from, to)).toEqual({
        success: false,
        from,
        to,
        reason: "UNLISTED_TRANSITION",
      });
    },
  );

  it.each(terminalReopenCases)(
    "does not reopen terminal stage $from to $to",
    ({ from, to }) => {
      expect(isCommercialStageTransitionAllowed(from, to)).toBe(false);
      expect(evaluateCommercialStageTransition(from, to)).toEqual({
        success: false,
        from,
        to,
        reason: "TERMINAL_STAGE",
      });
    },
  );

  it.each(commercialStages)(
    "does not treat same stage %s as a valid transition",
    (stage) => {
      expect(isCommercialStageTransitionAllowed(stage, stage)).toBe(false);
      expect(evaluateCommercialStageTransition(stage, stage)).toEqual({
        success: false,
        from: stage,
        to: stage,
        reason: "SAME_STAGE",
      });
    },
  );
});
