import type { CommercialStage } from "../../types/commercial";

export type CommercialStageTransitionFailureReason =
  | "SAME_STAGE"
  | "TERMINAL_STAGE"
  | "UNLISTED_TRANSITION";

export type CommercialStageTransitionResult =
  | {
      readonly success: true;
      readonly from: CommercialStage;
      readonly to: CommercialStage;
    }
  | {
      readonly success: false;
      readonly from: CommercialStage;
      readonly to: CommercialStage;
      readonly reason: CommercialStageTransitionFailureReason;
    };

export const terminalCommercialStages = [
  "CLOSED_WON",
  "CLOSED_LOST",
] as const satisfies readonly CommercialStage[];

const terminalCommercialStageSet: ReadonlySet<CommercialStage> = new Set(
  terminalCommercialStages,
);

export const allowedCommercialStageTransitions: Readonly<
  Record<CommercialStage, readonly CommercialStage[]>
> = {
  NOT_STARTED: ["ASSIGNED"],
  ASSIGNED: ["CONTACTED", "PAUSED"],
  CONTACTED: [
    "FOLLOW_UP",
    "MEETING",
    "PAUSED",
    "CLOSED_WON",
    "CLOSED_LOST",
  ],
  FOLLOW_UP: [
    "CONTACTED",
    "MEETING",
    "PAUSED",
    "CLOSED_WON",
    "CLOSED_LOST",
  ],
  MEETING: ["FOLLOW_UP", "PAUSED", "CLOSED_WON", "CLOSED_LOST"],
  PAUSED: ["ASSIGNED", "CONTACTED", "FOLLOW_UP"],
  CLOSED_WON: [],
  CLOSED_LOST: [],
};

function isTerminalCommercialStage(stage: CommercialStage): boolean {
  return terminalCommercialStageSet.has(stage);
}

export function isCommercialStageTransitionAllowed(
  from: CommercialStage,
  to: CommercialStage,
): boolean {
  return allowedCommercialStageTransitions[from].includes(to);
}

export function evaluateCommercialStageTransition(
  from: CommercialStage,
  to: CommercialStage,
): CommercialStageTransitionResult {
  if (from === to) {
    return {
      success: false,
      from,
      to,
      reason: "SAME_STAGE",
    };
  }

  if (isTerminalCommercialStage(from)) {
    return {
      success: false,
      from,
      to,
      reason: "TERMINAL_STAGE",
    };
  }

  if (isCommercialStageTransitionAllowed(from, to)) {
    return {
      success: true,
      from,
      to,
    };
  }

  return {
    success: false,
    from,
    to,
    reason: "UNLISTED_TRANSITION",
  };
}
