import "server-only";

import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  createLeadActivityRequestSchema,
  organizationIdSchema,
  subjectSchema,
} from "../../lib/validators/commercial";
import type {
  CommercialActorContext,
  CommercialAuditActorContext,
  CommercialActivityType,
  CommercialAuditMetadata,
  CommercialAuditStateMetadata,
  CreateLeadActivityRequest,
  LeadActivityDto,
} from "../../types/commercial";
import {
  query as queryAppDatabase,
  transaction,
  type SqlStatement,
} from "../db/app-client";
import { hasValidCommercialAuditFields } from "./audit-context";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;

const SAFE_NOT_FOUND_ERROR = {
  code: "LEAD_WORKSPACE_NOT_FOUND",
  httpStatus: 404,
  message: "Commercial workspace was not found.",
} as const;

export interface AppendLeadActivityInput {
  readonly actor: CommercialAuditActorContext;
  readonly workspaceId: string;
  readonly request: unknown;
}

export interface ListLeadActivitiesInput {
  readonly actor: Pick<CommercialActorContext, "organizationId">;
  readonly workspaceId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export type AppendLeadActivityResult =
  | {
      readonly kind: "appended";
      readonly activity: LeadActivityDto;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export type ListLeadActivitiesResult =
  | {
      readonly kind: "listed";
      readonly activities: readonly LeadActivityDto[];
      readonly page: number;
      readonly pageSize: number;
      readonly total: number | null;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export class LeadActivityRepositoryInputError extends Error {
  readonly code = "INVALID_LEAD_ACTIVITY_INPUT";

  constructor() {
    super("Invalid lead activity persistence input.");
    this.name = "LeadActivityRepositoryInputError";
  }
}

interface LeadWorkspaceActivityReferenceRow extends QueryResultRow {
  readonly workspace_id: string;
  readonly organization_id: string;
  readonly observed_lead_run_id: string;
}

interface LeadActivityRow extends QueryResultRow {
  readonly activity_id: string;
  readonly organization_id: string;
  readonly workspace_id: string;
  readonly observed_lead_run_id: string;
  readonly actor_subject: string;
  readonly occurred_at: Date | string;
  readonly activity_type: CommercialActivityType;
  readonly activity_outcome: string | null;
  readonly summary: string | null;
  readonly created_at: Date | string;
}

interface CountRow extends QueryResultRow {
  readonly total: number | string;
}

export async function appendLeadActivity(
  input: AppendLeadActivityInput,
): Promise<AppendLeadActivityResult> {
  const actor = validateActor(input.actor);
  validateUuid(input.workspaceId);
  const request = parseCreateRequest(input.request);
  const activityId = randomUUID();

  return transaction(async (client) => {
    const [workspace] = await client.query<LeadWorkspaceActivityReferenceRow>(
      buildSelectWorkspaceStatement({
        organizationId: actor.organizationId,
        workspaceId: input.workspaceId,
        lock: true,
      }),
    );

    if (workspace === undefined) {
      return {
        kind: "not_found",
        error: SAFE_NOT_FOUND_ERROR,
      };
    }

    const [activity] = await client.query<LeadActivityRow>(
      buildInsertActivityStatement({
        actor,
        workspace,
        request,
        activityId,
      }),
    );

    await client.query(
      buildInsertAuditEventStatement({
        actor,
        workspace,
        activity,
      }),
    );

    return {
      kind: "appended",
      activity: mapActivityRow(activity),
    };
  });
}

export async function listLeadActivities(
  input: ListLeadActivitiesInput,
): Promise<ListLeadActivitiesResult> {
  const pagination = validateListInput(input);

  const [workspace] = await queryAppDatabase<LeadWorkspaceActivityReferenceRow>(
    buildSelectWorkspaceStatement({
      organizationId: pagination.organizationId,
      workspaceId: input.workspaceId,
      lock: false,
    }),
  );

  if (workspace === undefined) {
    return {
      kind: "not_found",
      error: SAFE_NOT_FOUND_ERROR,
    };
  }

  const [{ total } = { total: 0 }] = await queryAppDatabase<CountRow>(
    buildCountActivitiesStatement({
      organizationId: pagination.organizationId,
      workspaceId: input.workspaceId,
    }),
  );
  const rows = await queryAppDatabase<LeadActivityRow>(
    buildListActivitiesStatement({
      organizationId: pagination.organizationId,
      workspaceId: input.workspaceId,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
  );

  return {
    kind: "listed",
    activities: rows.map(mapActivityRow),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: toSafeInteger(total),
  };
}

function buildSelectWorkspaceStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly lock: boolean;
}): SqlStatement {
  return {
    text: `
      SELECT
        workspace_id,
        organization_id,
        observed_lead_run_id
      FROM prospecting_app.lead_workspaces
      WHERE organization_id = $1
        AND workspace_id = $2
        AND archived_at IS NULL
      LIMIT 1${input.lock ? "\n      FOR UPDATE" : ""}`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildInsertActivityStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: LeadWorkspaceActivityReferenceRow;
  readonly request: CreateLeadActivityRequest;
  readonly activityId: string;
}): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.lead_activities (
        activity_id,
        organization_id,
        workspace_id,
        observed_lead_run_id,
        actor_subject,
        occurred_at,
        activity_type,
        activity_outcome,
        summary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${activityColumns()}`,
    values: [
      input.activityId,
      input.actor.organizationId,
      input.workspace.workspace_id,
      input.workspace.observed_lead_run_id,
      input.actor.actorSubject,
      input.request.occurred_at,
      input.request.activity_type,
      input.request.activity_outcome ?? null,
      input.request.summary ?? null,
    ],
  };
}

function buildCountActivitiesStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
}): SqlStatement {
  return {
    text: `
      SELECT count(*)::integer AS total
      FROM prospecting_app.lead_activities
      WHERE organization_id = $1
        AND workspace_id = $2`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildListActivitiesStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly page: number;
  readonly pageSize: number;
}): SqlStatement {
  return {
    text: `
      SELECT ${activityColumns()}
      FROM prospecting_app.lead_activities
      WHERE organization_id = $1
        AND workspace_id = $2
      ORDER BY occurred_at DESC, activity_id
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

function buildInsertAuditEventStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: LeadWorkspaceActivityReferenceRow;
  readonly activity: LeadActivityRow;
}): SqlStatement {
  const emptyStateMetadata: CommercialAuditStateMetadata = {};
  const metadata: CommercialAuditMetadata = {
    source: "app",
    workspace_id: input.workspace.workspace_id,
    activity_id: input.activity.activity_id,
    activity_type: input.activity.activity_type,
    activity_outcome: input.activity.activity_outcome,
  };

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
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVITY_APPENDED', 'lead_activity', $8, $9, $10, $11, $12)`,
    values: [
      randomUUID(),
      input.actor.organizationId,
      input.workspace.workspace_id,
      input.actor.actorSubject,
      input.actor.actorIssuer,
      input.actor.requestCorrelationId,
      input.actor.authorizationBasis,
      input.activity.activity_id,
      input.workspace.observed_lead_run_id,
      emptyStateMetadata,
      emptyStateMetadata,
      metadata,
    ],
  };
}

function activityColumns(): string {
  return `
        activity_id,
        organization_id,
        workspace_id,
        observed_lead_run_id,
        actor_subject,
        occurred_at,
        activity_type,
        activity_outcome,
        summary,
        created_at`;
}

function parseCreateRequest(input: unknown): CreateLeadActivityRequest {
  const result = createLeadActivityRequestSchema.safeParse(input);

  if (!result.success) {
    throw new LeadActivityRepositoryInputError();
  }

  return result.data;
}

function validateActor(
  actor: CommercialAuditActorContext,
): CommercialAuditActorContext {
  if (!hasValidCommercialAuditFields(actor)) {
    throw new LeadActivityRepositoryInputError();
  }

  return {
    organizationId: parseOrganizationId(actor.organizationId),
    actorSubject: parseSubject(actor.actorSubject),
    actorIssuer: actor.actorIssuer,
    requestCorrelationId: actor.requestCorrelationId,
    authorizationBasis: actor.authorizationBasis,
  };
}

function validateListInput(input: ListLeadActivitiesInput): {
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
    throw new LeadActivityRepositoryInputError();
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
    throw new LeadActivityRepositoryInputError();
  }

  return result.data;
}

function parseSubject(value: string): string {
  const result = subjectSchema.safeParse(value);

  if (!result.success) {
    throw new LeadActivityRepositoryInputError();
  }

  return result.data;
}

function validateUuid(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new LeadActivityRepositoryInputError();
  }
}

function mapActivityRow(row: LeadActivityRow): LeadActivityDto {
  return {
    activity_id: row.activity_id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    observed_lead_run_id: row.observed_lead_run_id,
    actor_subject: row.actor_subject,
    occurred_at: toIsoString(row.occurred_at),
    activity_type: row.activity_type,
    activity_outcome: row.activity_outcome,
    summary: row.summary,
    created_at: toIsoString(row.created_at),
  };
}

function toSafeInteger(value: number | string): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
