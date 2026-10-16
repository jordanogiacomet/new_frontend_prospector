import type { ZodType } from "zod";
import { describe, expect, it } from "vitest";

import {
  commercialActivityTypes,
  commercialOutcomes,
  commercialStages,
  qualificationContactChannels,
  qualificationContactOutcomes,
} from "../../types/commercial";

import {
  cnpjNormalizadoSchema,
  commercialActivityTypeSchema,
  commercialOutcomeSchema,
  commercialStageSchema,
  createLeadActivityRequestSchema,
  createLeadNoteRequestSchema,
  createLeadWorkspaceRequestSchema,
  observedLeadRunIdSchema,
  qualificationCadenceMutationRequestSchema,
  qualificationContactChannelSchema,
  qualificationContactOutcomeSchema,
  serverControlledCommercialRequestFields,
  updateLeadWorkspaceRequestSchema,
} from "./commercial";

const syntheticCnpj = "00000000000000";
const syntheticShortLeadRunId = "lr_12ab34cd";
const syntheticLeadRunId = `lr_${"a".repeat(64)}`;
const validDateTime = "2026-07-09T12:00:00Z";

const validWorkspaceRequest = {
  cnpj_normalizado: syntheticCnpj,
  observed_lead_run_id: syntheticLeadRunId,
  responsible_subject: "synthetic-user",
  next_action: "Synthetic next action",
  next_action_due_at: validDateTime,
};

const validWorkspaceUpdateRequest = {
  expected_version: 1,
  responsible_subject: "synthetic-user",
  commercial_stage: "CONTACTED",
  next_action: "Synthetic next action",
  next_action_due_at: validDateTime,
  commercial_outcome: "NO_RESPONSE",
};

const validActivityRequest = {
  occurred_at: validDateTime,
  activity_type: "CALL",
  activity_outcome: "Synthetic outcome",
  summary: "Synthetic summary",
};

const validNoteRequest = {
  body: "Synthetic note body",
};

const validCadenceStartRequest = {
  action: "start",
  start_at: validDateTime,
  interval_days: 3,
};

const validCadenceRecordRequest = {
  action: "record_contact",
  contact_number: 1,
  occurred_at: validDateTime,
  channel: "WHATSAPP",
  outcome: "NO_RESPONSE",
  summary: "Synthetic qualification contact",
};

interface RequestSchemaFixture {
  readonly name: string;
  readonly schema: ZodType<unknown>;
  readonly validRequest: Record<string, unknown>;
}

const requestSchemaFixtures: readonly RequestSchemaFixture[] = [
  {
    name: "create workspace",
    schema: createLeadWorkspaceRequestSchema,
    validRequest: validWorkspaceRequest,
  },
  {
    name: "update workspace",
    schema: updateLeadWorkspaceRequestSchema,
    validRequest: validWorkspaceUpdateRequest,
  },
  {
    name: "create activity",
    schema: createLeadActivityRequestSchema,
    validRequest: validActivityRequest,
  },
  {
    name: "create note",
    schema: createLeadNoteRequestSchema,
    validRequest: validNoteRequest,
  },
  {
    name: "mutate qualification cadence",
    schema: qualificationCadenceMutationRequestSchema,
    validRequest: validCadenceStartRequest,
  },
];

const serverControlledFieldCases = requestSchemaFixtures.flatMap(
  (fixture) =>
    serverControlledCommercialRequestFields.map((field) => ({
      ...fixture,
      field,
    })),
);

describe("commercial enum validators", () => {
  it.each(commercialStages)("accepts approved stage %s", (stage) => {
    expect(commercialStageSchema.parse(stage)).toBe(stage);
  });

  it.each(["OPEN", "closed_won", "QUALIFIED", ""])(
    "rejects unknown stage %s",
    (stage) => {
      expect(commercialStageSchema.safeParse(stage).success).toBe(false);
    },
  );

  it.each(commercialOutcomes)("accepts approved outcome %s", (outcome) => {
    expect(commercialOutcomeSchema.parse(outcome)).toBe(outcome);
  });

  it.each(["MAYBE", "won", "CANCELLED", ""])(
    "rejects unknown outcome %s",
    (outcome) => {
      expect(commercialOutcomeSchema.safeParse(outcome).success).toBe(false);
    },
  );

  it.each(commercialActivityTypes)(
    "accepts approved activity type %s",
    (activityType) => {
      expect(commercialActivityTypeSchema.parse(activityType)).toBe(
        activityType,
      );
    },
  );

  it.each(["SMS", "chat", "VISIT", ""])(
    "rejects unknown activity type %s",
    (activityType) => {
      expect(commercialActivityTypeSchema.safeParse(activityType).success).toBe(
        false,
      );
    },
  );

  it.each(qualificationContactChannels)(
    "accepts approved qualification channel %s",
    (channel) => {
      expect(qualificationContactChannelSchema.parse(channel)).toBe(channel);
    },
  );

  it.each(qualificationContactOutcomes)(
    "accepts approved qualification outcome %s",
    (outcome) => {
      expect(qualificationContactOutcomeSchema.parse(outcome)).toBe(outcome);
    },
  );
});

describe("commercial identity validators", () => {
  it("accepts exactly 14 digits for cnpj_normalizado", () => {
    expect(cnpjNormalizadoSchema.parse(syntheticCnpj)).toBe(syntheticCnpj);
  });

  it.each([
    "0000000000000",
    "000000000000000",
    "00.000.000/0000-00",
    "abcdefghijklmn",
    "",
  ])("rejects malformed cnpj_normalizado %s", (cnpj) => {
    expect(cnpjNormalizadoSchema.safeParse(cnpj).success).toBe(false);
  });

  it.each([syntheticShortLeadRunId, syntheticLeadRunId])(
    "accepts the existing lead run id pattern %s",
    (leadRunId) => {
      expect(observedLeadRunIdSchema.parse(leadRunId)).toBe(leadRunId);
    },
  );

  it.each([
    "lr_abc",
    "lr_12ab34c",
    "lr_12ab34cde",
    `lr_${"a".repeat(63)}`,
    `lr_${"a".repeat(65)}`,
    "lr_12ab34cg",
    " lead-run",
    "",
  ])("rejects invalid observed_lead_run_id %s", (leadRunId) => {
    expect(observedLeadRunIdSchema.safeParse(leadRunId).success).toBe(false);
  });
});

describe("commercial request schemas", () => {
  it.each(serverControlledFieldCases)(
    "rejects server-controlled field $field in $name request bodies",
    ({ schema, validRequest, field }) => {
      expect(
        schema.safeParse({
          ...validRequest,
          [field]: "synthetic-server-value",
        }).success,
      ).toBe(false);
    },
  );

  it.each(requestSchemaFixtures)(
    "rejects unknown fields in $name request bodies",
    ({ schema, validRequest }) => {
      expect(
        schema.safeParse({
          ...validRequest,
          unsupported: "synthetic",
        }).success,
      ).toBe(false);
    },
  );

  it("accepts null optional commercial fields", () => {
    expect(
      createLeadWorkspaceRequestSchema.parse({
        cnpj_normalizado: syntheticCnpj,
        observed_lead_run_id: syntheticLeadRunId,
        responsible_subject: null,
        next_action: null,
        next_action_due_at: null,
      }),
    ).toEqual({
      cnpj_normalizado: syntheticCnpj,
      observed_lead_run_id: syntheticLeadRunId,
      responsible_subject: null,
      next_action: null,
      next_action_due_at: null,
    });
  });

  it("accepts a valid past date without requiring future scheduling", () => {
    expect(
      updateLeadWorkspaceRequestSchema.parse({
        expected_version: 1,
        next_action_due_at: "2024-01-01T10:00:00Z",
      }).next_action_due_at,
    ).toBe("2024-01-01T10:00:00Z");
  });

  it.each([
    "not-a-date",
    "2026-02-30T00:00:00Z",
    "2026-07-09",
    "",
  ])("rejects invalid next_action_due_at %s", (nextActionDueAt) => {
    expect(
      createLeadWorkspaceRequestSchema.safeParse({
        ...validWorkspaceRequest,
        next_action_due_at: nextActionDueAt,
      }).success,
    ).toBe(false);
  });

  it.each([
    "not-a-date",
    "2026-02-30T00:00:00Z",
    "2026-07-09",
    "",
  ])("rejects invalid occurred_at %s", (occurredAt) => {
    expect(
      createLeadActivityRequestSchema.safeParse({
        ...validActivityRequest,
        occurred_at: occurredAt,
      }).success,
    ).toBe(false);
  });

  it.each([1, 3, 30])("accepts cadence interval %i", (intervalDays) => {
    expect(
      qualificationCadenceMutationRequestSchema.safeParse({
        ...validCadenceStartRequest,
        interval_days: intervalDays,
      }).success,
    ).toBe(true);
  });

  it.each([0, 31, 1.5, "3"])(
    "rejects invalid cadence interval %s",
    (intervalDays) => {
      expect(
        qualificationCadenceMutationRequestSchema.safeParse({
          ...validCadenceStartRequest,
          interval_days: intervalDays,
        }).success,
      ).toBe(false);
    },
  );

  it("requires a next contact date only when the lead asks to talk later", () => {
    expect(
      qualificationCadenceMutationRequestSchema.safeParse({
        ...validCadenceRecordRequest,
        outcome: "FOLLOW_UP_LATER",
      }).success,
    ).toBe(false);
    expect(
      qualificationCadenceMutationRequestSchema.safeParse({
        ...validCadenceRecordRequest,
        outcome: "FOLLOW_UP_LATER",
        next_contact_at: "2026-07-15T12:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      qualificationCadenceMutationRequestSchema.safeParse({
        ...validCadenceRecordRequest,
        next_contact_at: "2026-07-15T12:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects talk-later on the fourth and out-of-range contacts", () => {
    expect(
      qualificationCadenceMutationRequestSchema.safeParse({
        ...validCadenceRecordRequest,
        contact_number: 4,
        outcome: "FOLLOW_UP_LATER",
        next_contact_at: "2026-07-15T12:00:00Z",
      }).success,
    ).toBe(false);
    for (const contactNumber of [0, 5, 1.5]) {
      expect(
        qualificationCadenceMutationRequestSchema.safeParse({
          ...validCadenceRecordRequest,
          contact_number: contactNumber,
        }).success,
      ).toBe(false);
    }
  });

  it("requires a present summary for another response", () => {
    for (const summary of [undefined, null, "", " "]) {
      expect(
        qualificationCadenceMutationRequestSchema.safeParse({
          ...validCadenceRecordRequest,
          outcome: "OTHER_RESPONSE",
          summary,
        }).success,
      ).toBe(false);
    }
    expect(
      qualificationCadenceMutationRequestSchema.safeParse({
        ...validCadenceRecordRequest,
        outcome: "OTHER_RESPONSE",
        summary: "O lead pediu uma informação adicional.",
      }).success,
    ).toBe(true);
  });
});

describe("commercial text boundaries", () => {
  it("counts Unicode code points for responsible_subject", () => {
    const exact = "🙂".repeat(256);

    expect(
      createLeadWorkspaceRequestSchema.safeParse({
        ...validWorkspaceRequest,
        responsible_subject: exact,
      }).success,
    ).toBe(true);
    expect(
      createLeadWorkspaceRequestSchema.safeParse({
        ...validWorkspaceRequest,
        responsible_subject: `${exact}🙂`,
      }).success,
    ).toBe(false);
  });

  it("counts Unicode code points for next_action", () => {
    const exact = "🙂".repeat(500);

    expect(
      createLeadWorkspaceRequestSchema.safeParse({
        ...validWorkspaceRequest,
        next_action: exact,
      }).success,
    ).toBe(true);
    expect(
      createLeadWorkspaceRequestSchema.safeParse({
        ...validWorkspaceRequest,
        next_action: `${exact}🙂`,
      }).success,
    ).toBe(false);
  });

  it("counts Unicode code points for activity_outcome", () => {
    const exact = "🙂".repeat(120);

    expect(
      createLeadActivityRequestSchema.safeParse({
        ...validActivityRequest,
        activity_outcome: exact,
      }).success,
    ).toBe(true);
    expect(
      createLeadActivityRequestSchema.safeParse({
        ...validActivityRequest,
        activity_outcome: `${exact}🙂`,
      }).success,
    ).toBe(false);
  });

  it("counts Unicode code points for summary", () => {
    const exact = "🙂".repeat(1000);

    expect(
      createLeadActivityRequestSchema.safeParse({
        ...validActivityRequest,
        summary: exact,
      }).success,
    ).toBe(true);
    expect(
      createLeadActivityRequestSchema.safeParse({
        ...validActivityRequest,
        summary: `${exact}🙂`,
      }).success,
    ).toBe(false);
  });

  it("counts Unicode code points for note body", () => {
    const exact = "🙂".repeat(4000);

    expect(
      createLeadNoteRequestSchema.safeParse({ body: exact }).success,
    ).toBe(true);
    expect(
      createLeadNoteRequestSchema.safeParse({ body: `${exact}🙂` }).success,
    ).toBe(false);
  });

  it.each(["", " ", " synthetic-user", "synthetic-user "])(
    "rejects non-present responsible_subject %s",
    (responsibleSubject) => {
      expect(
        createLeadWorkspaceRequestSchema.safeParse({
          ...validWorkspaceRequest,
          responsible_subject: responsibleSubject,
        }).success,
      ).toBe(false);
    },
  );

  it.each(["", " ", " outcome", "outcome "])(
    "rejects non-present activity_outcome %s",
    (activityOutcome) => {
      expect(
        createLeadActivityRequestSchema.safeParse({
          ...validActivityRequest,
          activity_outcome: activityOutcome,
        }).success,
      ).toBe(false);
    },
  );

  it.each(["", " ", " note", "note "])(
    "rejects non-present note body %s",
    (body) => {
      expect(createLeadNoteRequestSchema.safeParse({ body }).success).toBe(
        false,
      );
    },
  );
});
