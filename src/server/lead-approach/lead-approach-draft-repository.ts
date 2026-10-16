import "server-only";

import type { QueryResultRow } from "pg";

import {
  cnpjNormalizadoSchema,
  observedLeadRunIdSchema,
  organizationIdSchema,
  subjectSchema,
} from "../../lib/validators/commercial";
import { query } from "../db/app-client";

const maximumGeneratorVersionLength = 64;
const maximumMessageLength = 1_600;
const maximumListSize = 100;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface LeadApproachDraftIdentity {
  readonly organizationId: string;
  readonly cnpjNormalizado: string;
  readonly observedLeadRunId: string;
  readonly generatorVersion: string;
}

interface LeadApproachDraftRow extends QueryResultRow {
  readonly status: "GENERATING" | "READY" | "FAILED";
  readonly generation_attempt_id: string | null;
  readonly message: string | null;
  readonly lease_expires_at: Date | string | null;
  readonly retry_after: Date | string | null;
}

interface ListedLeadApproachDraftRow extends LeadApproachDraftRow {
  readonly cnpj_normalizado: string;
  readonly observed_lead_run_id: string;
}

interface UpdatedRow extends QueryResultRow {
  readonly updated: boolean;
}

export type LeadApproachDraftClaimResult =
  | {
      readonly kind: "claimed";
      readonly generationAttemptId: string;
    }
  | { readonly kind: "ready"; readonly message: string }
  | { readonly kind: "preparing" }
  | { readonly kind: "cooldown" };

interface ListedLeadApproachDraftIdentity {
  readonly cnpjNormalizado: string;
  readonly observedLeadRunId: string;
}

export type ListedLeadApproachDraftState =
  ListedLeadApproachDraftIdentity &
    (
      | { readonly status: "ready"; readonly message: string }
      | {
          readonly status: "preparing" | "unavailable" | "missing";
          readonly message: null;
        }
    );

export async function claimLeadApproachDraft(
  input: LeadApproachDraftIdentity & {
    readonly approachDraftId: string;
    readonly generationAttemptId: string;
    readonly requestedBySubject: string;
    readonly now: Date;
    readonly leaseExpiresAt: Date;
  },
): Promise<LeadApproachDraftClaimResult> {
  validateIdentity(input);
  validateUuid(input.approachDraftId);
  validateUuid(input.generationAttemptId);
  parseSubject(input.requestedBySubject);
  validateIncreasingTimes(input.now, input.leaseExpiresAt);

  const claimed = await query<LeadApproachDraftRow>({
    text: `
      INSERT INTO prospecting_app.lead_approach_drafts (
        approach_draft_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        generator_version,
        status,
        generation_attempt_id,
        requested_by_subject,
        lease_expires_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'GENERATING', $6, $7, $9, $8, $8)
      ON CONFLICT (
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        generator_version
      ) DO UPDATE
      SET status = 'GENERATING',
          generation_attempt_id = EXCLUDED.generation_attempt_id,
          message = NULL,
          requested_by_subject = EXCLUDED.requested_by_subject,
          lease_expires_at = EXCLUDED.lease_expires_at,
          retry_after = NULL,
          updated_at = $8
      WHERE (
          lead_approach_drafts.status = 'GENERATING'
          AND lead_approach_drafts.lease_expires_at <= $8
        ) OR (
          lead_approach_drafts.status = 'FAILED'
          AND lead_approach_drafts.retry_after <= $8
        )
      RETURNING
        status,
        generation_attempt_id,
        message,
        lease_expires_at,
        retry_after
    `,
    values: [
      input.approachDraftId,
      input.organizationId,
      input.cnpjNormalizado,
      input.observedLeadRunId,
      input.generatorVersion,
      input.generationAttemptId,
      input.requestedBySubject,
      input.now,
      input.leaseExpiresAt,
    ],
  });

  if (claimed[0] !== undefined) {
    if (
      claimed[0].status !== "GENERATING" ||
      claimed[0].generation_attempt_id !== input.generationAttemptId
    ) {
      throw new LeadApproachDraftRepositoryStateError();
    }

    return {
      kind: "claimed",
      generationAttemptId: input.generationAttemptId,
    };
  }

  const existing = await findLeadApproachDraft(input);
  if (existing === null) {
    throw new LeadApproachDraftRepositoryStateError();
  }

  return mapClaimState(existing, input.now);
}

export async function completeLeadApproachDraft(
  input: LeadApproachDraftIdentity & {
    readonly generationAttemptId: string;
    readonly message: string;
    readonly now: Date;
  },
): Promise<boolean> {
  validateIdentity(input);
  validateUuid(input.generationAttemptId);
  validateMessage(input.message);
  validateDate(input.now);

  const rows = await query<UpdatedRow>({
    text: `
      UPDATE prospecting_app.lead_approach_drafts
      SET status = 'READY',
          generation_attempt_id = NULL,
          message = $6,
          lease_expires_at = NULL,
          retry_after = NULL,
          updated_at = $7
      WHERE organization_id = $1
        AND cnpj_normalizado = $2
        AND observed_lead_run_id = $3
        AND generator_version = $4
        AND status = 'GENERATING'
        AND generation_attempt_id = $5
      RETURNING TRUE AS updated
    `,
    values: [
      input.organizationId,
      input.cnpjNormalizado,
      input.observedLeadRunId,
      input.generatorVersion,
      input.generationAttemptId,
      input.message,
      input.now,
    ],
  });

  return rows[0]?.updated === true;
}

export async function failLeadApproachDraft(
  input: LeadApproachDraftIdentity & {
    readonly generationAttemptId: string;
    readonly now: Date;
    readonly retryAfter: Date;
  },
): Promise<boolean> {
  validateIdentity(input);
  validateUuid(input.generationAttemptId);
  validateIncreasingTimes(input.now, input.retryAfter);

  const rows = await query<UpdatedRow>({
    text: `
      UPDATE prospecting_app.lead_approach_drafts
      SET status = 'FAILED',
          generation_attempt_id = NULL,
          message = NULL,
          lease_expires_at = NULL,
          retry_after = $7,
          updated_at = $6
      WHERE organization_id = $1
        AND cnpj_normalizado = $2
        AND observed_lead_run_id = $3
        AND generator_version = $4
        AND status = 'GENERATING'
        AND generation_attempt_id = $5
      RETURNING TRUE AS updated
    `,
    values: [
      input.organizationId,
      input.cnpjNormalizado,
      input.observedLeadRunId,
      input.generatorVersion,
      input.generationAttemptId,
      input.now,
      input.retryAfter,
    ],
  });

  return rows[0]?.updated === true;
}

export async function listLeadApproachDraftStates(input: {
  readonly organizationId: string;
  readonly generatorVersion: string;
  readonly identities: readonly {
    readonly cnpjNormalizado: string;
    readonly observedLeadRunId: string;
  }[];
  readonly now: Date;
}): Promise<readonly ListedLeadApproachDraftState[]> {
  const organizationId = parseOrganizationId(input.organizationId);
  const generatorVersion = parseGeneratorVersion(input.generatorVersion);
  validateDate(input.now);

  if (
    !Array.isArray(input.identities) ||
    input.identities.length > maximumListSize
  ) {
    throw new LeadApproachDraftRepositoryInputError();
  }

  const identities = input.identities.map((identity) => ({
    cnpjNormalizado: parseCnpj(identity.cnpjNormalizado),
    observedLeadRunId: parseObservedLeadRunId(identity.observedLeadRunId),
  }));
  if (identities.length === 0) {
    return [];
  }

  const rows = await query<ListedLeadApproachDraftRow>({
    text: `
      WITH requested_identity AS (
        SELECT cnpj_normalizado, observed_lead_run_id
        FROM unnest($3::text[], $4::text[])
          AS requested(cnpj_normalizado, observed_lead_run_id)
      )
      SELECT
        draft.cnpj_normalizado,
        draft.observed_lead_run_id,
        draft.status,
        draft.generation_attempt_id,
        draft.message,
        draft.lease_expires_at,
        draft.retry_after
      FROM prospecting_app.lead_approach_drafts AS draft
      INNER JOIN requested_identity AS requested
        ON requested.cnpj_normalizado = draft.cnpj_normalizado
        AND requested.observed_lead_run_id = draft.observed_lead_run_id
      WHERE draft.organization_id = $1
        AND draft.generator_version = $2
      ORDER BY draft.cnpj_normalizado, draft.observed_lead_run_id
    `,
    values: [
      organizationId,
      generatorVersion,
      identities.map((identity) => identity.cnpjNormalizado),
      identities.map((identity) => identity.observedLeadRunId),
    ],
  });

  return rows.map((row) => mapListedState(row, input.now));
}

async function findLeadApproachDraft(
  identity: LeadApproachDraftIdentity,
): Promise<LeadApproachDraftRow | null> {
  const rows = await query<LeadApproachDraftRow>({
    text: `
      SELECT
        status,
        generation_attempt_id,
        message,
        lease_expires_at,
        retry_after
      FROM prospecting_app.lead_approach_drafts
      WHERE organization_id = $1
        AND cnpj_normalizado = $2
        AND observed_lead_run_id = $3
        AND generator_version = $4
    `,
    values: [
      identity.organizationId,
      identity.cnpjNormalizado,
      identity.observedLeadRunId,
      identity.generatorVersion,
    ],
  });

  return rows[0] ?? null;
}

function mapClaimState(
  row: LeadApproachDraftRow,
  now: Date,
): LeadApproachDraftClaimResult {
  if (row.status === "READY") {
    validateMessage(row.message);
    return { kind: "ready", message: row.message };
  }
  if (row.status === "GENERATING") {
    const leaseExpiresAt = parseStoredDate(row.lease_expires_at);
    if (leaseExpiresAt.getTime() <= now.getTime()) {
      throw new LeadApproachDraftRepositoryStateError();
    }
    return { kind: "preparing" };
  }
  if (row.status === "FAILED") {
    const retryAfter = parseStoredDate(row.retry_after);
    if (retryAfter.getTime() <= now.getTime()) {
      throw new LeadApproachDraftRepositoryStateError();
    }
    return { kind: "cooldown" };
  }

  throw new LeadApproachDraftRepositoryStateError();
}

function mapListedState(
  row: ListedLeadApproachDraftRow,
  now: Date,
): ListedLeadApproachDraftState {
  const identity = {
    cnpjNormalizado: parseCnpj(row.cnpj_normalizado),
    observedLeadRunId: parseObservedLeadRunId(row.observed_lead_run_id),
  };

  if (row.status === "READY") {
    validateMessage(row.message);
    return { ...identity, status: "ready", message: row.message };
  }
  if (row.status === "GENERATING") {
    const leaseExpiresAt = parseStoredDate(row.lease_expires_at);
    return {
      ...identity,
      status: leaseExpiresAt.getTime() > now.getTime() ? "preparing" : "missing",
      message: null,
    };
  }
  if (row.status === "FAILED") {
    const retryAfter = parseStoredDate(row.retry_after);
    return {
      ...identity,
      status: retryAfter.getTime() > now.getTime() ? "unavailable" : "missing",
      message: null,
    };
  }

  throw new LeadApproachDraftRepositoryStateError();
}

function validateIdentity(input: LeadApproachDraftIdentity): void {
  parseOrganizationId(input.organizationId);
  parseCnpj(input.cnpjNormalizado);
  parseObservedLeadRunId(input.observedLeadRunId);
  parseGeneratorVersion(input.generatorVersion);
}

function parseOrganizationId(value: string): string {
  return parseSchema(organizationIdSchema, value);
}

function parseCnpj(value: string): string {
  return parseSchema(cnpjNormalizadoSchema, value);
}

function parseObservedLeadRunId(value: string): string {
  return parseSchema(observedLeadRunIdSchema, value);
}

function parseSubject(value: string): string {
  return parseSchema(subjectSchema, value);
}

function parseGeneratorVersion(value: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    Array.from(value).length < 1 ||
    Array.from(value).length > maximumGeneratorVersionLength
  ) {
    throw new LeadApproachDraftRepositoryInputError();
  }
  return value;
}

function parseSchema<Output>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: Output } },
  value: unknown,
): Output {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new LeadApproachDraftRepositoryInputError();
  }
  return result.data as Output;
}

function validateUuid(value: string): void {
  if (!uuidPattern.test(value)) {
    throw new LeadApproachDraftRepositoryInputError();
  }
}

function validateMessage(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    Array.from(value).length < 1 ||
    Array.from(value).length > maximumMessageLength
  ) {
    throw new LeadApproachDraftRepositoryInputError();
  }
}

function validateDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new LeadApproachDraftRepositoryInputError();
  }
}

function validateIncreasingTimes(start: Date, end: Date): void {
  validateDate(start);
  validateDate(end);
  if (end.getTime() <= start.getTime()) {
    throw new LeadApproachDraftRepositoryInputError();
  }
}

function parseStoredDate(value: Date | string | null): Date {
  const parsed = value instanceof Date ? value : new Date(value ?? "invalid");
  validateDate(parsed);
  return parsed;
}

export class LeadApproachDraftRepositoryInputError extends Error {
  constructor() {
    super("Invalid lead approach draft repository input.");
    this.name = "LeadApproachDraftRepositoryInputError";
  }
}

export class LeadApproachDraftRepositoryStateError extends Error {
  constructor() {
    super("Invalid lead approach draft state.");
    this.name = "LeadApproachDraftRepositoryStateError";
  }
}
