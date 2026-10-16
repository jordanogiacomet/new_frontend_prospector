import type {
  CommercialOutcome,
  CommercialStage,
  QualificationContactOutcome,
} from "../../types/commercial";

export type QualificationPipelineActionKind =
  | "automatic"
  | "recommendation"
  | "unchanged";

export interface QualificationPipelineChanges {
  readonly commercialStage?: CommercialStage;
  readonly commercialOutcome?: CommercialOutcome | null;
  readonly nextAction?: string | null;
  readonly nextActionDueAt?: string | null;
}

export interface QualificationPipelineAction {
  readonly kind: QualificationPipelineActionKind;
  readonly reasonCode:
    | "QUALIFICATION_NO_RESPONSE_FOLLOW_UP"
    | "QUALIFICATION_FOLLOW_UP_LATER"
    | "QUALIFICATION_CONFIRMED"
    | "QUALIFICATION_NOT_INTERESTED"
    | "QUALIFICATION_RESPONSE_REVIEW"
    | "QUALIFICATION_OTHER_RESPONSE_REVIEW"
    | "QUALIFICATION_WRONG_CONTACT_REVIEW"
    | "QUALIFICATION_EXHAUSTED_REVIEW"
    | "TERMINAL_WORKSPACE_PRESERVED";
  readonly changes: QualificationPipelineChanges;
}

interface QualificationPipelinePolicyInput {
  readonly currentStage: CommercialStage;
  readonly contactNumber: 1 | 2 | 3 | 4;
  readonly outcome: QualificationContactOutcome;
  readonly nextContact: {
    readonly contactNumber: 2 | 3 | 4;
    readonly scheduledAt: string;
  } | null;
}

export class QualificationPipelinePolicyError extends Error {
  constructor() {
    super("Qualification pipeline state is inconsistent.");
    this.name = "QualificationPipelinePolicyError";
  }
}

export function decideQualificationPipelineAction(
  input: QualificationPipelinePolicyInput,
): QualificationPipelineAction {
  if (
    input.currentStage === "CLOSED_WON" ||
    input.currentStage === "CLOSED_LOST"
  ) {
    return {
      kind: "unchanged",
      reasonCode: "TERMINAL_WORKSPACE_PRESERVED",
      changes: {},
    };
  }

  switch (input.outcome) {
    case "NO_RESPONSE":
      if (input.contactNumber === 4) {
        return recommendation(
          "QUALIFICATION_EXHAUSTED_REVIEW",
          "Decidir se a oportunidade deve ser pausada ou encerrada por falta de resposta",
        );
      }

      return followUpAction(
        input,
        "QUALIFICATION_NO_RESPONSE_FOLLOW_UP",
      );
    case "FOLLOW_UP_LATER":
      return followUpAction(input, "QUALIFICATION_FOLLOW_UP_LATER");
    case "QUALIFIED":
      return {
        kind: "automatic",
        reasonCode: "QUALIFICATION_CONFIRMED",
        changes: {
          commercialStage: "MEETING",
          commercialOutcome: null,
          nextAction: "Agendar reunião de diagnóstico",
          nextActionDueAt: null,
        },
      };
    case "NOT_INTERESTED":
      return {
        kind: "automatic",
        reasonCode: "QUALIFICATION_NOT_INTERESTED",
        changes: {
          commercialStage: "CLOSED_LOST",
          commercialOutcome: "LOST",
          nextAction: null,
          nextActionDueAt: null,
        },
      };
    case "RESPONDED":
      return recommendation(
        "QUALIFICATION_RESPONSE_REVIEW",
        "Revisar a resposta e confirmar a próxima etapa",
      );
    case "OTHER_RESPONSE":
      return recommendation(
        "QUALIFICATION_OTHER_RESPONSE_REVIEW",
        "Revisar o retorno registrado e confirmar a próxima etapa",
      );
    case "WRONG_CONTACT":
      return recommendation(
        "QUALIFICATION_WRONG_CONTACT_REVIEW",
        "Localizar outro decisor antes de continuar",
      );
  }
}

function followUpAction(
  input: QualificationPipelinePolicyInput,
  reasonCode:
    | "QUALIFICATION_NO_RESPONSE_FOLLOW_UP"
    | "QUALIFICATION_FOLLOW_UP_LATER",
): QualificationPipelineAction {
  const expectedNumber = input.contactNumber + 1;
  if (
    input.nextContact === null ||
    input.nextContact.contactNumber !== expectedNumber
  ) {
    throw new QualificationPipelinePolicyError();
  }

  return {
    kind: "automatic",
    reasonCode,
    changes: {
      commercialStage: "FOLLOW_UP",
      commercialOutcome: null,
      nextAction: `Realizar o ${input.nextContact.contactNumber}º contato de qualificação`,
      nextActionDueAt: input.nextContact.scheduledAt,
    },
  };
}

function recommendation(
  reasonCode: Extract<
    QualificationPipelineAction["reasonCode"],
    | "QUALIFICATION_RESPONSE_REVIEW"
    | "QUALIFICATION_OTHER_RESPONSE_REVIEW"
    | "QUALIFICATION_WRONG_CONTACT_REVIEW"
    | "QUALIFICATION_EXHAUSTED_REVIEW"
  >,
  nextAction: string,
): QualificationPipelineAction {
  return {
    kind: "recommendation",
    reasonCode,
    changes: { nextAction, nextActionDueAt: null },
  };
}
