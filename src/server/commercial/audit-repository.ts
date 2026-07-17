import "server-only";

import type { QueryResultRow } from "pg";

import { organizationIdSchema } from "../../lib/validators/commercial";
import {
  commercialActivityTypes,
  commercialAuditActions,
  commercialAuditTargetTypes,
  commercialOutcomes,
  commercialStages,
  type CommercialActorContext,
  type CommercialActivityType,
  type CommercialAuditAction,
  type CommercialAuditEventDto,
  type CommercialAuditMetadata,
  type CommercialAuditScalar,
  type CommercialAuditStateMetadata,
  type CommercialAuditTargetType,
  type CommercialOutcome,
  type CommercialStage,
} from "../../types/commercial";
import {
  query as queryAppDatabase,
  type SqlStatement,
} from "../db/app-client";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;

const SAFE_NOT_FOUND_ERROR = {
  code: "LEAD_WORKSPACE_NOT_FOUND",
  httpStatus: 404,
  message: "Commercial workspace was not found.",
} as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const commercialAuditStateMetadataKeys = [
  "commercial_stage",
  "responsible_subject",
  "next_action_present",
  "next_action_due_at",
  "commercial_outcome",
  "version",
  "archived_at",
  "status",
] as const;

const allowedFieldValues = [
  ...commercialAuditStateMetadataKeys,
  "next_action",
  "multiple",
] as const;

export interface ListCommercialAuditEventsInput {
  readonly actor: Pick<CommercialActorContext, "organizationId">;
  readonly workspaceId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export type ListCommercialAuditEventsResult =
  | {
      readonly kind: "listed";
      readonly auditEvents: readonly CommercialAuditEventDto[];
      readonly page: number;
      readonly pageSize: number;
      readonly total: number | null;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export class CommercialAuditRepositoryInputError extends Error {
  readonly code = "INVALID_COMMERCIAL_AUDIT_INPUT";

  constructor() {
    super("Invalid commercial audit read input.");
    this.name = "CommercialAuditRepositoryInputError";
  }
}

interface LeadWorkspaceAuditReferenceRow extends QueryResultRow {
  readonly workspace_id: string;
  readonly organization_id: string;
}

interface CommercialAuditEventRow extends QueryResultRow {
  readonly audit_event_id: string;
  readonly organization_id: string;
  readonly workspace_id: string | null;
  readonly actor_subject: string;
  readonly action: CommercialAuditAction;
  readonly target_type: CommercialAuditTargetType;
  readonly target_id: string;
  readonly observed_lead_run_id: string | null;
  readonly previous_metadata: unknown;
  readonly new_metadata: unknown;
  readonly metadata: unknown;
  readonly occurred_at: Date | string;
}

interface CountRow extends QueryResultRow {
  readonly total: number | string;
}

type MutableCommercialAuditStateMetadata = {
  -readonly [Key in keyof CommercialAuditStateMetadata]: CommercialAuditStateMetadata[Key];
};

type MutableCommercialAuditMetadata = {
  -readonly [Key in keyof CommercialAuditMetadata]: CommercialAuditMetadata[Key];
};

export async function listCommercialAuditEvents(
  input: ListCommercialAuditEventsInput,
): Promise<ListCommercialAuditEventsResult> {
  const pagination = validateListInput(input);

  const [workspace] =
    await queryAppDatabase<LeadWorkspaceAuditReferenceRow>(
      buildSelectWorkspaceStatement({
        organizationId: pagination.organizationId,
        workspaceId: input.workspaceId,
      }),
    );

  if (workspace === undefined) {
    return {
      kind: "not_found",
      error: SAFE_NOT_FOUND_ERROR,
    };
  }

  const [{ total } = { total: 0 }] = await queryAppDatabase<CountRow>(
    buildCountAuditEventsStatement({
      organizationId: pagination.organizationId,
      workspaceId: input.workspaceId,
    }),
  );
  const rows = await queryAppDatabase<CommercialAuditEventRow>(
    buildListAuditEventsStatement({
      organizationId: pagination.organizationId,
      workspaceId: input.workspaceId,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
  );

  return {
    kind: "listed",
    auditEvents: rows.map(mapCommercialAuditEventRow),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: toSafeInteger(total),
  };
}

function buildSelectWorkspaceStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
}): SqlStatement {
  return {
    text: `
      SELECT
        workspace_id,
        organization_id
      FROM prospecting_app.lead_workspaces
      WHERE organization_id = $1
        AND workspace_id = $2
        AND archived_at IS NULL
      LIMIT 1`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildCountAuditEventsStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
}): SqlStatement {
  return {
    text: `
      SELECT count(*)::integer AS total
      FROM prospecting_app.commercial_audit_events
      WHERE organization_id = $1
        AND workspace_id = $2`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildListAuditEventsStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly page: number;
  readonly pageSize: number;
}): SqlStatement {
  return {
    text: `
      SELECT ${auditEventColumns()}
      FROM prospecting_app.commercial_audit_events
      WHERE organization_id = $1
        AND workspace_id = $2
      ORDER BY occurred_at DESC, audit_event_id
      LIMIT $3
      OFFSET $4`,
    values: [
      input.organizationId,
      input.workspaceId,
      input.pageSize,
      (input.page - 1) * input.pageSize,
    ],
  };
}

function auditEventColumns(): string {
  return `
        audit_event_id,
        organization_id,
        workspace_id,
        actor_subject,
        action,
        target_type,
        target_id,
        observed_lead_run_id,
        previous_metadata,
        new_metadata,
        metadata,
        occurred_at`;
}

function validateListInput(input: ListCommercialAuditEventsInput): {
  readonly organizationId: string;
  readonly page: number;
  readonly pageSize: number;
} {
  validateUuid(input.workspaceId);

  const page = input.page ?? DEFAULT_PAGE;
  const requestedPageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE ||
    !Number.isSafeInteger(requestedPageSize) ||
    requestedPageSize < 1
  ) {
    throw new CommercialAuditRepositoryInputError();
  }

  return {
    organizationId: parseOrganizationId(input.actor.organizationId),
    page,
    pageSize: Math.min(requestedPageSize, MAX_PAGE_SIZE),
  };
}

function parseOrganizationId(value: string): string {
  const result = organizationIdSchema.safeParse(value);

  if (!result.success) {
    throw new CommercialAuditRepositoryInputError();
  }

  return result.data;
}

function validateUuid(value: string): void {
  if (!isUuid(value)) {
    throw new CommercialAuditRepositoryInputError();
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function mapCommercialAuditEventRow(
  row: CommercialAuditEventRow,
): CommercialAuditEventDto {
  return {
    audit_event_id: row.audit_event_id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    actor_subject: row.actor_subject,
    action: sanitizeAuditAction(row.action),
    target_type: sanitizeAuditTargetType(row.target_type),
    target_id: row.target_id,
    observed_lead_run_id: row.observed_lead_run_id,
    previous_metadata: sanitizeAuditStateMetadata(row.previous_metadata),
    new_metadata: sanitizeAuditStateMetadata(row.new_metadata),
    metadata: sanitizeAuditMetadata(row.metadata),
    occurred_at: toIsoString(row.occurred_at),
  };
}

function sanitizeAuditAction(
  value: unknown,
): CommercialAuditAction {
  if (isOneOf(commercialAuditActions, value)) {
    return value;
  }

  throw new CommercialAuditRepositoryInputError();
}

function sanitizeAuditTargetType(
  value: unknown,
): CommercialAuditTargetType {
  if (isOneOf(commercialAuditTargetTypes, value)) {
    return value;
  }

  throw new CommercialAuditRepositoryInputError();
}

function sanitizeAuditStateMetadata(
  value: unknown,
): CommercialAuditStateMetadata {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: MutableCommercialAuditStateMetadata = {};

  if (
    hasOwnProperty(value, "commercial_stage") &&
    (value.commercial_stage === null ||
      isCommercialStage(value.commercial_stage))
  ) {
    sanitized.commercial_stage = value.commercial_stage;
  }

  if (
    hasOwnProperty(value, "responsible_subject") &&
    isNullableBoundedString(value.responsible_subject, 256)
  ) {
    sanitized.responsible_subject = value.responsible_subject;
  }

  if (
    hasOwnProperty(value, "next_action_present") &&
    typeof value.next_action_present === "boolean"
  ) {
    sanitized.next_action_present = value.next_action_present;
  } else if (
    hasOwnProperty(value, "next_action") &&
    isNullableBoundedString(value.next_action, 500)
  ) {
    sanitized.next_action_present = value.next_action !== null;
  }

  if (
    hasOwnProperty(value, "next_action_due_at") &&
    isNullableBoundedString(value.next_action_due_at, 64)
  ) {
    sanitized.next_action_due_at = value.next_action_due_at;
  }

  if (
    hasOwnProperty(value, "commercial_outcome") &&
    (value.commercial_outcome === null ||
      isCommercialOutcome(value.commercial_outcome))
  ) {
    sanitized.commercial_outcome = value.commercial_outcome;
  }

  if (
    hasOwnProperty(value, "version") &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version >= 1
  ) {
    sanitized.version = value.version;
  }

  if (
    hasOwnProperty(value, "archived_at") &&
    isNullableBoundedString(value.archived_at, 64)
  ) {
    sanitized.archived_at = value.archived_at;
  }

  if (hasOwnProperty(value, "status") && isStatusCode(value.status)) {
    sanitized.status = value.status;
  }

  return sanitized;
}

function sanitizeAuditMetadata(value: unknown): CommercialAuditMetadata {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: MutableCommercialAuditMetadata = {};

  if (hasOwnProperty(value, "source") && value.source === "app") {
    sanitized.source = value.source;
  }

  if (hasOwnProperty(value, "field") && isAllowedField(value.field)) {
    sanitized.field = value.field;
  }

  if (
    sanitized.field !== undefined &&
    hasOwnProperty(value, "from") &&
    isAllowedAuditTransitionValue(sanitized.field, value.from)
  ) {
    sanitized.from = value.from;
  }

  if (
    sanitized.field !== undefined &&
    hasOwnProperty(value, "to") &&
    isAllowedAuditTransitionValue(sanitized.field, value.to)
  ) {
    sanitized.to = value.to;
  }

  if (
    hasOwnProperty(value, "reason_code") &&
    isReasonCode(value.reason_code)
  ) {
    sanitized.reason_code = value.reason_code;
  }

  if (hasOwnProperty(value, "workspace_id") && isUuid(value.workspace_id)) {
    sanitized.workspace_id = value.workspace_id;
  }

  if (hasOwnProperty(value, "activity_id") && isUuid(value.activity_id)) {
    sanitized.activity_id = value.activity_id;
  }

  if (hasOwnProperty(value, "note_id") && isUuid(value.note_id)) {
    sanitized.note_id = value.note_id;
  }

  if (
    hasOwnProperty(value, "import_submission_id") &&
    isUuid(value.import_submission_id)
  ) {
    sanitized.import_submission_id = value.import_submission_id;
  }

  if (
    hasOwnProperty(value, "activity_type") &&
    isCommercialActivityType(value.activity_type)
  ) {
    sanitized.activity_type = value.activity_type;
  }

  if (
    hasOwnProperty(value, "activity_outcome") &&
    isNullableBoundedString(value.activity_outcome, 120)
  ) {
    sanitized.activity_outcome = value.activity_outcome;
  }

  return sanitized;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasOwnProperty(
  input: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function isNullableBoundedString(
  value: unknown,
  maximumCodePoints: number,
): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      Array.from(value).length <= maximumCodePoints)
  );
}

function isAuditScalar(value: unknown): value is CommercialAuditScalar {
  return (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && Array.from(value).length <= 500)
  );
}

function isAllowedAuditTransitionValue(
  field: string,
  value: unknown,
): value is CommercialAuditScalar {
  return field === "next_action"
    ? typeof value === "boolean"
    : isAuditScalar(value);
}

function isReasonCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value);
}

function isCommercialStage(value: unknown): value is CommercialStage {
  return isOneOf(commercialStages, value);
}

function isCommercialOutcome(value: unknown): value is CommercialOutcome {
  return isOneOf(commercialOutcomes, value);
}

function isCommercialActivityType(
  value: unknown,
): value is CommercialActivityType {
  return isOneOf(commercialActivityTypes, value);
}

function isAllowedField(
  value: unknown,
): value is (typeof allowedFieldValues)[number] {
  return isOneOf(allowedFieldValues, value);
}

function isStatusCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value);
}

function isOneOf<Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  );
}

function toSafeInteger(value: number | string): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
