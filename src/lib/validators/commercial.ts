import { z } from "zod";

import {
  commercialActivityTypes,
  commercialOutcomes,
  commercialStages,
} from "../../types/commercial";

import { leadRunIdPattern } from "./lead-query";

export const serverControlledCommercialRequestFields = [
  "organizationId",
  "organization_id",
  "actorSubject",
  "actor_subject",
  "authorSubject",
  "author_subject",
  "createdBySubject",
  "created_by_subject",
  "updatedBySubject",
  "updated_by_subject",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
] as const;

const serverControlledFieldMarker =
  "__server_controlled_commercial_request_field__";

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasOwnProperty(
  input: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function rejectServerControlledRequestFields(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  for (const field of serverControlledCommercialRequestFields) {
    if (hasOwnProperty(input, field)) {
      return {
        ...input,
        [serverControlledFieldMarker]: field,
      };
    }
  }

  return input;
}

function strictCommercialRequestObject<Shape extends z.ZodRawShape>(
  shape: Shape,
) {
  return z.preprocess(
    rejectServerControlledRequestFields,
    z.strictObject(shape),
  );
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isPresentTrimmedText(
  value: string,
  maximumCodePoints: number,
): boolean {
  return (
    value === value.trim() &&
    codePointLength(value) >= 1 &&
    codePointLength(value) <= maximumCodePoints
  );
}

function presentTextSchema(maximumCodePoints: number): z.ZodString {
  return z.string().refine(
    (value) => isPresentTrimmedText(value, maximumCodePoints),
    `Must be present text with at most ${maximumCodePoints} Unicode code points`,
  );
}

function nullableOptionalPresentTextSchema(
  maximumCodePoints: number,
): z.ZodOptional<z.ZodNullable<z.ZodString>> {
  return presentTextSchema(maximumCodePoints).nullable().optional();
}

function nullableOptionalTextSchema(
  maximumCodePoints: number,
): z.ZodOptional<z.ZodNullable<z.ZodString>> {
  return z
    .string()
    .refine(
      (value) => codePointLength(value) <= maximumCodePoints,
      `Must have at most ${maximumCodePoints} Unicode code points`,
    )
    .nullable()
    .optional();
}

const dateTimeSchema = z.iso.datetime({ offset: true });
const nullableOptionalDateTimeSchema = dateTimeSchema.nullable().optional();

export const commercialStageSchema = z.enum(commercialStages);
export const commercialOutcomeSchema = z.enum(commercialOutcomes);
export const commercialActivityTypeSchema = z.enum(commercialActivityTypes);

export const organizationIdSchema = presentTextSchema(128);
export const subjectSchema = presentTextSchema(256);
export const responsibleSubjectSchema =
  nullableOptionalPresentTextSchema(256);

export const cnpjNormalizadoSchema = z.string().regex(/^\d{14}$/);

export const observedLeadRunIdSchema = z
  .string()
  .regex(leadRunIdPattern)
  .refine(
    (value) => isPresentTrimmedText(value, 128),
    "Must be a present lead run identifier",
  );

export const nextActionSchema = nullableOptionalTextSchema(500);

export const activityOutcomeSchema =
  nullableOptionalPresentTextSchema(120);

export const activitySummarySchema = nullableOptionalTextSchema(1000);

export const noteBodySchema = presentTextSchema(4000);

export const createLeadWorkspaceRequestSchema = strictCommercialRequestObject({
  cnpj_normalizado: cnpjNormalizadoSchema,
  observed_lead_run_id: observedLeadRunIdSchema,
  responsible_subject: responsibleSubjectSchema,
  next_action: nextActionSchema,
  next_action_due_at: nullableOptionalDateTimeSchema,
});

export const updateLeadWorkspaceRequestSchema = strictCommercialRequestObject({
  expected_version: z.int().min(1),
  responsible_subject: responsibleSubjectSchema,
  commercial_stage: commercialStageSchema.optional(),
  next_action: nextActionSchema,
  next_action_due_at: nullableOptionalDateTimeSchema,
  commercial_outcome: commercialOutcomeSchema.nullable().optional(),
});

export const createLeadActivityRequestSchema = strictCommercialRequestObject({
  occurred_at: dateTimeSchema,
  activity_type: commercialActivityTypeSchema,
  activity_outcome: activityOutcomeSchema,
  summary: activitySummarySchema,
});

export const createLeadNoteRequestSchema = strictCommercialRequestObject({
  body: noteBodySchema,
});

export type CreateLeadWorkspaceRequestInput = z.infer<
  typeof createLeadWorkspaceRequestSchema
>;
export type UpdateLeadWorkspaceRequestInput = z.infer<
  typeof updateLeadWorkspaceRequestSchema
>;
export type CreateLeadActivityRequestInput = z.infer<
  typeof createLeadActivityRequestSchema
>;
export type CreateLeadNoteRequestInput = z.infer<
  typeof createLeadNoteRequestSchema
>;
