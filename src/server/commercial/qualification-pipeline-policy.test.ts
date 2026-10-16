import { describe, expect, it } from "vitest";

import {
  QualificationPipelinePolicyError,
  decideQualificationPipelineAction,
} from "./qualification-pipeline-policy";

describe("qualification pipeline policy", () => {
  it.each([1, 2, 3] as const)(
    "moves contact %i without response to follow-up with the next scheduled action",
    (contactNumber) => {
      const nextContactNumber = (contactNumber + 1) as 2 | 3 | 4;
      const scheduledAt = `2026-08-${20 + nextContactNumber}T12:00:00.000Z`;

      expect(
        decideQualificationPipelineAction({
          currentStage: "ASSIGNED",
          contactNumber,
          outcome: "NO_RESPONSE",
          nextContact: { contactNumber: nextContactNumber, scheduledAt },
        }),
      ).toEqual({
        kind: "automatic",
        reasonCode: "QUALIFICATION_NO_RESPONSE_FOLLOW_UP",
        changes: {
          commercialStage: "FOLLOW_UP",
          commercialOutcome: null,
          nextAction: `Realizar o ${nextContactNumber}º contato de qualificação`,
          nextActionDueAt: scheduledAt,
        },
      });
    },
  );

  it("uses the rescheduled contact when the lead asks to talk later", () => {
    expect(
      decideQualificationPipelineAction({
        currentStage: "CONTACTED",
        contactNumber: 2,
        outcome: "FOLLOW_UP_LATER",
        nextContact: {
          contactNumber: 3,
          scheduledAt: "2026-09-03T15:30:00.000Z",
        },
      }),
    ).toEqual({
      kind: "automatic",
      reasonCode: "QUALIFICATION_FOLLOW_UP_LATER",
      changes: {
        commercialStage: "FOLLOW_UP",
        commercialOutcome: null,
        nextAction: "Realizar o 3º contato de qualificação",
        nextActionDueAt: "2026-09-03T15:30:00.000Z",
      },
    });
  });

  it("moves a qualified lead to meeting and a not-interested lead to lost", () => {
    expect(
      decideQualificationPipelineAction({
        currentStage: "FOLLOW_UP",
        contactNumber: 2,
        outcome: "QUALIFIED",
        nextContact: null,
      }),
    ).toEqual({
      kind: "automatic",
      reasonCode: "QUALIFICATION_CONFIRMED",
      changes: {
        commercialStage: "MEETING",
        commercialOutcome: null,
        nextAction: "Agendar reunião de diagnóstico",
        nextActionDueAt: null,
      },
    });

    expect(
      decideQualificationPipelineAction({
        currentStage: "CONTACTED",
        contactNumber: 1,
        outcome: "NOT_INTERESTED",
        nextContact: null,
      }),
    ).toEqual({
      kind: "automatic",
      reasonCode: "QUALIFICATION_NOT_INTERESTED",
      changes: {
        commercialStage: "CLOSED_LOST",
        commercialOutcome: "LOST",
        nextAction: null,
        nextActionDueAt: null,
      },
    });
  });

  it.each([
    ["RESPONDED", "Revisar a resposta e confirmar a próxima etapa", "QUALIFICATION_RESPONSE_REVIEW"],
    ["OTHER_RESPONSE", "Revisar o retorno registrado e confirmar a próxima etapa", "QUALIFICATION_OTHER_RESPONSE_REVIEW"],
    ["WRONG_CONTACT", "Localizar outro decisor antes de continuar", "QUALIFICATION_WRONG_CONTACT_REVIEW"],
  ] as const)(
    "keeps the stage and records a recommendation for %s",
    (outcome, nextAction, reasonCode) => {
      expect(
        decideQualificationPipelineAction({
          currentStage: "CONTACTED",
          contactNumber: 2,
          outcome,
          nextContact: null,
        }),
      ).toEqual({
        kind: "recommendation",
        reasonCode,
        changes: { nextAction, nextActionDueAt: null },
      });
    },
  );

  it("recommends a decision after the fourth contact without response", () => {
    expect(
      decideQualificationPipelineAction({
        currentStage: "FOLLOW_UP",
        contactNumber: 4,
        outcome: "NO_RESPONSE",
        nextContact: null,
      }),
    ).toEqual({
      kind: "recommendation",
      reasonCode: "QUALIFICATION_EXHAUSTED_REVIEW",
      changes: {
        nextAction:
          "Decidir se a oportunidade deve ser pausada ou encerrada por falta de resposta",
        nextActionDueAt: null,
      },
    });
  });

  it.each(["CLOSED_WON", "CLOSED_LOST"] as const)(
    "never changes terminal stage %s",
    (currentStage) => {
      expect(
        decideQualificationPipelineAction({
          currentStage,
          contactNumber: 2,
          outcome: "QUALIFIED",
          nextContact: null,
        }),
      ).toEqual({
        kind: "unchanged",
        reasonCode: "TERMINAL_WORKSPACE_PRESERVED",
        changes: {},
      });
    },
  );

  it("rejects a follow-up decision without the next scheduled contact", () => {
    expect(() =>
      decideQualificationPipelineAction({
        currentStage: "CONTACTED",
        contactNumber: 2,
        outcome: "NO_RESPONSE",
        nextContact: null,
      }),
    ).toThrow(QualificationPipelinePolicyError);
  });
});
