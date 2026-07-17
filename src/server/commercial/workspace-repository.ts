import "server-only";

import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  createLeadWorkspaceRequestSchema,
  organizationIdSchema,
  subjectSchema,
  updateLeadWorkspaceRequestSchema,
} from "../../lib/validators/commercial";
import type { Permission } from "../auth/permissions";
import {
  query as queryAppDatabase,
  transaction,
  type SqlStatement,
} from "../db/app-client";
import type {
  CommercialActorContext,
  CommercialAuditActorContext,
  CommercialAuditAction,
  CommercialAuditMetadata,
  CommercialAuditScalar,
  CommercialAuditStateMetadata,
  CommercialOutcome,
  CommercialStage,
  CreateLeadWorkspaceRequest,
  LeadWorkspaceDto,
  UpdateLeadWorkspaceRequest,
} from "../../types/commercial";

import { evaluateCommercialStageTransition } from "./transition-policy";
import { hasValidCommercialAuditFields } from "./audit-context";

const SAFE_NOT_FOUND_ERROR = {
  code: "LEAD_WORKSPACE_NOT_FOUND",
  httpStatus: 404,
  message: "Commercial workspace was not found.",
} as const;

const SAFE_ACTIVE_WORKSPACE_CONFLICT_ERROR = {
  code: "LEAD_WORKSPACE_ALREADY_EXISTS",
  httpStatus: 409,
  message: "A commercial workspace already exists for this company.",
} as const;

const SAFE_STALE_VERSION_ERROR = {
  code: "LEAD_WORKSPACE_VERSION_CONFLICT",
  httpStatus: 409,
  message: "Commercial workspace changed. Refresh before saving.",
} as const;

const SAFE_ASSIGNMENT_CONFLICT_ERROR = {
  code: "LEAD_WORKSPACE_ASSIGNMENT_CONFLICT",
  httpStatus: 409,
  message: "Commercial workspace assignment changed. Refresh before saving.",
} as const;

export interface CommercialWorkspaceActorContext
  extends CommercialAuditActorContext {
  readonly permissions?: readonly Permission[];
}

export interface CreateLeadWorkspaceInput {
  readonly actor: CommercialWorkspaceActorContext;
  readonly request: unknown;
}

export interface GetLeadWorkspaceInput {
  readonly actor: Pick<CommercialWorkspaceActorContext, "organizationId">;
  readonly workspaceId: string;
}

export interface UpdateLeadWorkspaceInput {
  readonly actor: CommercialWorkspaceActorContext;
  readonly workspaceId: string;
  readonly request: unknown;
}

export type CreateLeadWorkspaceResult =
  | {
      readonly kind: "created";
      readonly workspace: LeadWorkspaceDto;
    }
  | {
      readonly kind: "conflict";
      readonly error: typeof SAFE_ACTIVE_WORKSPACE_CONFLICT_ERROR;
    };

export type GetLeadWorkspaceResult =
  | {
      readonly kind: "found";
      readonly workspace: LeadWorkspaceDto;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export type UpdateLeadWorkspaceResult =
  | {
      readonly kind: "updated";
      readonly workspace: LeadWorkspaceDto;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    }
  | {
      readonly kind: "stale_version";
      readonly error: typeof SAFE_STALE_VERSION_ERROR;
    }
  | {
      readonly kind: "assignment_conflict";
      readonly error: typeof SAFE_ASSIGNMENT_CONFLICT_ERROR;
    }
  | {
      readonly kind: "invalid_transition";
      readonly error: {
        readonly code: "LEAD_WORKSPACE_INVALID_TRANSITION";
        readonly httpStatus: 409;
        readonly message: "Commercial stage transition is not allowed.";
        readonly reason:
          | "SAME_STAGE"
          | "TERMINAL_STAGE"
          | "UNLISTED_TRANSITION";
      };
    };

export class LeadWorkspaceRepositoryInputError extends Error {
  readonly code = "INVALID_LEAD_WORKSPACE_INPUT";

  constructor() {
    super("Invalid lead workspace persistence input.");
    this.name = "LeadWorkspaceRepositoryInputError";
  }
}

interface LeadWorkspaceRow extends QueryResultRow {
  readonly workspace_id: string;
  readonly organization_id: string;
  readonly cnpj_normalizado: string;
  readonly observed_lead_run_id: string;
  readonly responsible_subject: string | null;
  readonly commercial_stage: CommercialStage;
  readonly next_action: string | null;
  readonly next_action_due_at: Date | string | null;
  readonly commercial_outcome: CommercialOutcome | null;
  readonly version: number;
  readonly created_by_subject: string;
  readonly updated_by_subject: string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly archived_at: Date | string | null;
  readonly archived_by_subject: string | null;
}

interface WorkspaceState {
  readonly responsible_subject: string | null;
  readonly commercial_stage: CommercialStage;
  readonly next_action: string | null;
  readonly next_action_due_at: string | null;
  readonly commercial_outcome: CommercialOutcome | null;
  readonly version: number;
}

export async function createLeadWorkspace(
  input: CreateLeadWorkspaceInput,
): Promise<CreateLeadWorkspaceResult> {
  const actor = validateActor(input.actor);
  const request = parseCreateRequest(input.request);
  const workspaceId = randomUUID();
  const initialStage = initialCommercialStage(request);

  return transaction(async (client) => {
    const [created] = await client.query<LeadWorkspaceRow>(
      buildInsertWorkspaceStatement({
        actor,
        request,
        workspaceId,
        initialStage,
      }),
    );

    if (created === undefined) {
      return {
        kind: "conflict",
        error: SAFE_ACTIVE_WORKSPACE_CONFLICT_ERROR,
      };
    }

    await client.query(
      buildInsertAuditEventStatement({
        actor,
        workspace: created,
        action: "WORKSPACE_CREATED",
        previousMetadata: {},
        newMetadata: stateMetadata(created),
        metadata: {
          source: "app",
          workspace_id: created.workspace_id,
        },
      }),
    );

    return {
      kind: "created",
      workspace: mapWorkspaceRow(created),
    };
  });
}

export async function getLeadWorkspace(
  input: GetLeadWorkspaceInput,
): Promise<GetLeadWorkspaceResult> {
  const organizationId = parseOrganizationId(input.actor.organizationId);
  validateUuid(input.workspaceId);

  const [row] = await queryAppDatabase<LeadWorkspaceRow>(
    buildSelectWorkspaceStatement({
      organizationId,
      workspaceId: input.workspaceId,
      lock: false,
    }),
  );

  if (row === undefined) {
    return {
      kind: "not_found",
      error: SAFE_NOT_FOUND_ERROR,
    };
  }

  return {
    kind: "found",
    workspace: mapWorkspaceRow(row),
  };
}

export async function updateLeadWorkspace(
  input: UpdateLeadWorkspaceInput,
): Promise<UpdateLeadWorkspaceResult> {
  const actor = validateActor(input.actor);
  validateUuid(input.workspaceId);
  const request = parseUpdateRequest(input.request);

  return transaction(async (client) => {
    const [current] = await client.query<LeadWorkspaceRow>(
      buildSelectWorkspaceStatement({
        organizationId: actor.organizationId,
        workspaceId: input.workspaceId,
        lock: true,
      }),
    );

    if (current === undefined) {
      return {
        kind: "not_found",
        error: SAFE_NOT_FOUND_ERROR,
      };
    }

    if (current.version !== request.expected_version) {
      return {
        kind: "stale_version",
        error: SAFE_STALE_VERSION_ERROR,
      };
    }

    const nextState = resolveUpdateState(current, request);
    const transitionFailure = validateStageTransition(
      current,
      request,
      nextState,
    );

    if (transitionFailure !== null) {
      return transitionFailure;
    }

    if (hasAssignmentConflict(actor, current, nextState)) {
      return {
        kind: "assignment_conflict",
        error: SAFE_ASSIGNMENT_CONFLICT_ERROR,
      };
    }

    const [updated] = await client.query<LeadWorkspaceRow>(
      buildUpdateWorkspaceStatement({
        actor,
        workspaceId: current.workspace_id,
        expectedVersion: request.expected_version,
        nextState,
      }),
    );

    if (updated === undefined) {
      return {
        kind: "stale_version",
        error: SAFE_STALE_VERSION_ERROR,
      };
    }

    await client.query(
      buildInsertAuditEventStatement({
        actor,
        workspace: updated,
        action: auditActionForUpdate(current, updated),
        previousMetadata: stateMetadata(current),
        newMetadata: stateMetadata(updated),
        metadata: updateAuditMetadata(current, updated),
      }),
    );

    return {
      kind: "updated",
      workspace: mapWorkspaceRow(updated),
    };
  });
}

function buildInsertWorkspaceStatement(input: {
  readonly actor: CommercialActorContext;
  readonly request: CreateLeadWorkspaceRequest;
  readonly workspaceId: string;
  readonly initialStage: CommercialStage;
}): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.lead_workspaces (
        workspace_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        responsible_subject,
        commercial_stage,
        next_action,
        next_action_due_at,
        created_by_subject,
        updated_by_subject
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      ON CONFLICT (organization_id, cnpj_normalizado)
        WHERE archived_at IS NULL
        DO NOTHING
      RETURNING ${workspaceColumns()}`,
    values: [
      input.workspaceId,
      input.actor.organizationId,
      input.request.cnpj_normalizado,
      input.request.observed_lead_run_id,
      input.request.responsible_subject ?? null,
      input.initialStage,
      input.request.next_action ?? null,
      input.request.next_action_due_at ?? null,
      input.actor.actorSubject,
    ],
  };
}

function buildSelectWorkspaceStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly lock: boolean;
}): SqlStatement {
  return {
    text: `
      SELECT ${workspaceColumns()}
      FROM prospecting_app.lead_workspaces
      WHERE organization_id = $1
        AND workspace_id = $2
        AND archived_at IS NULL
      LIMIT 1${input.lock ? "\n      FOR UPDATE" : ""}`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildUpdateWorkspaceStatement(input: {
  readonly actor: CommercialActorContext;
  readonly workspaceId: string;
  readonly expectedVersion: number;
  readonly nextState: WorkspaceState;
}): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.lead_workspaces
      SET
        responsible_subject = $3,
        commercial_stage = $4,
        next_action = $5,
        next_action_due_at = $6,
        commercial_outcome = $7,
        version = version + 1,
        updated_by_subject = $8,
        updated_at = now()
      WHERE organization_id = $1
        AND workspace_id = $2
        AND version = $9
        AND archived_at IS NULL
      RETURNING ${workspaceColumns()}`,
    values: [
      input.actor.organizationId,
      input.workspaceId,
      input.nextState.responsible_subject,
      input.nextState.commercial_stage,
      input.nextState.next_action,
      input.nextState.next_action_due_at,
      input.nextState.commercial_outcome,
      input.actor.actorSubject,
      input.expectedVersion,
    ],
  };
}

function buildInsertAuditEventStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: LeadWorkspaceRow;
  readonly action: CommercialAuditAction;
  readonly previousMetadata: CommercialAuditStateMetadata;
  readonly newMetadata: CommercialAuditStateMetadata;
  readonly metadata: CommercialAuditMetadata;
}): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.commercial_audit_events (
        audit_event_id,
        organization_id,
        workspace_id,
        actor_subject,
        actor_issuer,
        request_correlation_id,
        authorization_basis,
        action,
        target_type,
        target_id,
        observed_lead_run_id,
        previous_metadata,
        new_metadata,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'lead_workspace', $3, $9, $10, $11, $12)`,
    values: [
      randomUUID(),
      input.actor.organizationId,
      input.workspace.workspace_id,
      input.actor.actorSubject,
      input.actor.actorIssuer,
      input.actor.requestCorrelationId,
      input.actor.authorizationBasis,
      input.action,
      input.workspace.observed_lead_run_id,
      input.previousMetadata,
      input.newMetadata,
      input.metadata,
    ],
  };
}

function workspaceColumns(): string {
  return `
        workspace_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        responsible_subject,
        commercial_stage,
        next_action,
        next_action_due_at,
        commercial_outcome,
        version,
        created_by_subject,
        updated_by_subject,
        created_at,
        updated_at,
        archived_at,
        archived_by_subject`;
}

function resolveUpdateState(
  current: LeadWorkspaceRow,
  request: UpdateLeadWorkspaceRequest,
): WorkspaceState {
  const responsibleSubject =
    request.responsible_subject === undefined
      ? current.responsible_subject
      : request.responsible_subject;
  const autoAssignsNotStartedWorkspace =
    request.commercial_stage === undefined &&
    current.responsible_subject === null &&
    responsibleSubject !== null &&
    current.commercial_stage === "NOT_STARTED";

  return {
    responsible_subject: responsibleSubject,
    commercial_stage:
      request.commercial_stage ??
      (autoAssignsNotStartedWorkspace
        ? "ASSIGNED"
        : current.commercial_stage),
    next_action:
      request.next_action === undefined
        ? current.next_action
        : request.next_action,
    next_action_due_at:
      request.next_action_due_at === undefined
        ? toIsoStringOrNull(current.next_action_due_at)
        : request.next_action_due_at,
    commercial_outcome:
      request.commercial_outcome === undefined
        ? current.commercial_outcome
        : request.commercial_outcome,
    version: current.version + 1,
  };
}

function validateStageTransition(
  current: LeadWorkspaceRow,
  request: UpdateLeadWorkspaceRequest,
  nextState: WorkspaceState,
): Extract<UpdateLeadWorkspaceResult, { kind: "invalid_transition" }> | null {
  if (
    request.commercial_stage === undefined &&
    current.commercial_stage === nextState.commercial_stage
  ) {
    return null;
  }

  const transition = evaluateCommercialStageTransition(
    current.commercial_stage,
    nextState.commercial_stage,
  );

  if (transition.success) {
    return null;
  }

  return {
    kind: "invalid_transition",
    error: {
      code: "LEAD_WORKSPACE_INVALID_TRANSITION",
      httpStatus: 409,
      message: "Commercial stage transition is not allowed.",
      reason: transition.reason,
    },
  };
}

function hasAssignmentConflict(
  actor: CommercialWorkspaceActorContext,
  current: LeadWorkspaceRow,
  nextState: WorkspaceState,
): boolean {
  if (current.responsible_subject === nextState.responsible_subject) {
    return false;
  }

  if (actor.permissions?.includes("commercial:assign")) {
    return false;
  }

  return !(
    current.responsible_subject === null &&
    nextState.responsible_subject === actor.actorSubject
  );
}

function auditActionForUpdate(
  current: LeadWorkspaceRow,
  updated: LeadWorkspaceRow,
): CommercialAuditAction {
  if (current.responsible_subject !== updated.responsible_subject) {
    return "WORKSPACE_ASSIGNED";
  }

  if (current.commercial_stage !== updated.commercial_stage) {
    return "STAGE_CHANGED";
  }

  if (
    current.next_action !== updated.next_action ||
    toIsoStringOrNull(current.next_action_due_at) !==
      toIsoStringOrNull(updated.next_action_due_at)
  ) {
    return "NEXT_ACTION_CHANGED";
  }

  return "WORKSPACE_UPDATED";
}

function updateAuditMetadata(
  current: LeadWorkspaceRow,
  updated: LeadWorkspaceRow,
): CommercialAuditMetadata {
  const changedFields = changedWorkspaceFields(current, updated);

  if (changedFields.length === 1) {
    const field = changedFields[0];

    return {
      source: "app",
      field,
      from: workspaceScalar(current, field),
      to: workspaceScalar(updated, field),
      workspace_id: updated.workspace_id,
    };
  }

  return {
    source: "app",
    field: "multiple",
    reason_code: "WORKSPACE_UPDATED",
    workspace_id: updated.workspace_id,
  };
}

function changedWorkspaceFields(
  current: LeadWorkspaceRow,
  updated: LeadWorkspaceRow,
): readonly (keyof WorkspaceState)[] {
  const fields: (keyof WorkspaceState)[] = [];

  if (current.responsible_subject !== updated.responsible_subject) {
    fields.push("responsible_subject");
  }

  if (current.commercial_stage !== updated.commercial_stage) {
    fields.push("commercial_stage");
  }

  if (current.next_action !== updated.next_action) {
    fields.push("next_action");
  }

  if (
    toIsoStringOrNull(current.next_action_due_at) !==
    toIsoStringOrNull(updated.next_action_due_at)
  ) {
    fields.push("next_action_due_at");
  }

  if (current.commercial_outcome !== updated.commercial_outcome) {
    fields.push("commercial_outcome");
  }

  return fields;
}

function workspaceScalar(
  row: LeadWorkspaceRow,
  field: keyof WorkspaceState,
): CommercialAuditScalar {
  switch (field) {
    case "responsible_subject":
      return row.responsible_subject;
    case "commercial_stage":
      return row.commercial_stage;
    case "next_action":
      return row.next_action !== null;
    case "next_action_due_at":
      return toIsoStringOrNull(row.next_action_due_at);
    case "commercial_outcome":
      return row.commercial_outcome;
    case "version":
      return row.version;
  }
}

function stateMetadata(row: LeadWorkspaceRow): CommercialAuditStateMetadata {
  return {
    commercial_stage: row.commercial_stage,
    responsible_subject: row.responsible_subject,
    next_action_present: row.next_action !== null,
    next_action_due_at: toIsoStringOrNull(row.next_action_due_at),
    commercial_outcome: row.commercial_outcome,
    version: row.version,
    archived_at: toIsoStringOrNull(row.archived_at),
  };
}

function initialCommercialStage(
  request: CreateLeadWorkspaceRequest,
): CommercialStage {
  return request.responsible_subject === undefined ||
    request.responsible_subject === null
    ? "NOT_STARTED"
    : "ASSIGNED";
}

function parseCreateRequest(input: unknown): CreateLeadWorkspaceRequest {
  const result = createLeadWorkspaceRequestSchema.safeParse(input);

  if (!result.success) {
    throw new LeadWorkspaceRepositoryInputError();
  }

  return result.data;
}

function parseUpdateRequest(input: unknown): UpdateLeadWorkspaceRequest {
  const result = updateLeadWorkspaceRequestSchema.safeParse(input);

  if (!result.success) {
    throw new LeadWorkspaceRepositoryInputError();
  }

  return result.data;
}

function validateActor(
  actor: CommercialWorkspaceActorContext,
): CommercialWorkspaceActorContext {
  if (!hasValidCommercialAuditFields(actor)) {
    throw new LeadWorkspaceRepositoryInputError();
  }

  return {
    organizationId: parseOrganizationId(actor.organizationId),
    actorSubject: parseSubject(actor.actorSubject),
    actorIssuer: actor.actorIssuer,
    requestCorrelationId: actor.requestCorrelationId,
    authorizationBasis: actor.authorizationBasis,
    permissions: actor.permissions,
  };
}

function parseOrganizationId(value: string): string {
  const result = organizationIdSchema.safeParse(value);

  if (!result.success) {
    throw new LeadWorkspaceRepositoryInputError();
  }

  return result.data;
}

function parseSubject(value: string): string {
  const result = subjectSchema.safeParse(value);

  if (!result.success) {
    throw new LeadWorkspaceRepositoryInputError();
  }

  return result.data;
}

function validateUuid(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new LeadWorkspaceRepositoryInputError();
  }
}

function mapWorkspaceRow(row: LeadWorkspaceRow): LeadWorkspaceDto {
  return {
    workspace_id: row.workspace_id,
    organization_id: row.organization_id,
    cnpj_normalizado: row.cnpj_normalizado,
    observed_lead_run_id: row.observed_lead_run_id,
    responsible_subject: row.responsible_subject,
    commercial_stage: row.commercial_stage,
    next_action: row.next_action,
    next_action_due_at: toIsoStringOrNull(row.next_action_due_at),
    commercial_outcome: row.commercial_outcome,
    version: row.version,
    created_by_subject: row.created_by_subject,
    updated_by_subject: row.updated_by_subject,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
    archived_at: toIsoStringOrNull(row.archived_at),
    archived_by_subject: row.archived_by_subject,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoStringOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}
