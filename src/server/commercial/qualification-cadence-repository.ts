import "server-only";

import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  organizationIdSchema,
  qualificationCadenceMutationRequestSchema,
  subjectSchema,
} from "../../lib/validators/commercial";
import {
  qualificationContactChannels,
  qualificationContactOutcomes,
  qualificationContactStates,
  type CommercialActorContext,
  type CommercialActivityType,
  type CommercialAuditAction,
  type CommercialAuditActorContext,
  type CommercialAuditMetadata,
  type CommercialAuditStateMetadata,
  type CommercialOutcome,
  type CommercialStage,
  type QualificationCadenceDto,
  type QualificationContactChannel,
  type QualificationContactDto,
  type QualificationContactOutcome,
  type QualificationContactState,
  type RecordQualificationContactRequest,
  type StartQualificationCadenceRequest,
} from "../../types/commercial";
import {
  query as queryAppDatabase,
  transaction,
  type AppDatabaseTransaction,
  type SqlStatement,
} from "../db/app-client";
import { hasValidCommercialAuditFields } from "./audit-context";
import {
  decideQualificationPipelineAction,
  type QualificationPipelineAction,
} from "./qualification-pipeline-policy";

const SAFE_NOT_FOUND_ERROR = {
  code: "LEAD_WORKSPACE_NOT_FOUND",
  httpStatus: 404,
  message: "Commercial workspace was not found.",
} as const;

const SAFE_CONFLICT_ERROR = {
  code: "QUALIFICATION_CADENCE_CONFLICT",
  httpStatus: 409,
  message: "Qualification cadence changed. Refresh before continuing.",
} as const;

const qualificationContactNumbers = [1, 2, 3, 4] as const;
const dayMilliseconds = 24 * 60 * 60 * 1_000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GetQualificationCadenceInput {
  readonly actor: Pick<CommercialActorContext, "organizationId">;
  readonly workspaceId: string;
}

export interface StartQualificationCadenceInput {
  readonly actor: CommercialAuditActorContext;
  readonly workspaceId: string;
  readonly request: unknown;
}

export interface RecordQualificationContactInput {
  readonly actor: CommercialAuditActorContext;
  readonly workspaceId: string;
  readonly request: unknown;
}

export type GetQualificationCadenceResult =
  | { readonly kind: "found"; readonly cadence: QualificationCadenceDto }
  | { readonly kind: "not_found"; readonly error: typeof SAFE_NOT_FOUND_ERROR };

export type StartQualificationCadenceResult =
  | { readonly kind: "started"; readonly cadence: QualificationCadenceDto }
  | { readonly kind: "not_found"; readonly error: typeof SAFE_NOT_FOUND_ERROR }
  | { readonly kind: "conflict"; readonly error: typeof SAFE_CONFLICT_ERROR };

export type RecordQualificationContactResult =
  | {
      readonly kind: "recorded";
      readonly cadence: QualificationCadenceDto;
      readonly pipelineAction: QualificationPipelineAction;
    }
  | { readonly kind: "not_found"; readonly error: typeof SAFE_NOT_FOUND_ERROR }
  | { readonly kind: "conflict"; readonly error: typeof SAFE_CONFLICT_ERROR };

export class QualificationCadenceRepositoryInputError extends Error {
  readonly code = "INVALID_QUALIFICATION_CADENCE_INPUT";

  constructor() {
    super("Invalid qualification cadence persistence input.");
    this.name = "QualificationCadenceRepositoryInputError";
  }
}

export class QualificationCadenceRepositoryDataError extends Error {
  constructor() {
    super("Invalid qualification cadence persistence state.");
    this.name = "QualificationCadenceRepositoryDataError";
  }
}

interface WorkspaceReferenceRow extends QueryResultRow {
  readonly workspace_id: string;
  readonly organization_id: string;
  readonly observed_lead_run_id: string;
  readonly responsible_subject: string | null;
  readonly commercial_stage: CommercialStage;
  readonly next_action: string | null;
  readonly next_action_due_at: Date | string | null;
  readonly commercial_outcome: CommercialOutcome | null;
  readonly version: number;
}

interface QualificationContactRow extends QueryResultRow {
  readonly qualification_contact_id: string;
  readonly contact_number: number | string;
  readonly scheduled_at: Date | string;
  readonly state: QualificationContactState;
  readonly outcome: QualificationContactOutcome | null;
  readonly channel: CommercialActivityType | null;
  readonly summary: string | null;
  readonly completed_at: Date | string | null;
}

export async function getQualificationCadence(
  input: GetQualificationCadenceInput,
): Promise<GetQualificationCadenceResult> {
  const organizationId = parseOrganizationId(input.actor.organizationId);
  validateUuid(input.workspaceId);

  const [workspace] = await queryAppDatabase<WorkspaceReferenceRow>(
    buildSelectWorkspaceStatement({
      organizationId,
      workspaceId: input.workspaceId,
      lock: false,
    }),
  );
  if (workspace === undefined) {
    return { kind: "not_found", error: SAFE_NOT_FOUND_ERROR };
  }

  const rows = await queryAppDatabase<QualificationContactRow>(
    buildSelectContactsStatement({
      organizationId,
      workspaceId: input.workspaceId,
      lock: false,
    }),
  );

  return { kind: "found", cadence: mapCadence(rows) };
}

export async function startQualificationCadence(
  input: StartQualificationCadenceInput,
): Promise<StartQualificationCadenceResult> {
  const actor = validateAuditActor(input.actor);
  validateUuid(input.workspaceId);
  const request = parseStartRequest(input.request);
  const startTimestamp = Date.parse(request.start_at);
  const contactIds = qualificationContactNumbers.map(() => randomUUID());
  const activityId = randomUUID();
  const occurredAt = new Date().toISOString();

  return transaction(async (client) => {
    const workspace = await selectWorkspaceForMutation(client, {
      organizationId: actor.organizationId,
      workspaceId: input.workspaceId,
    });
    if (workspace === undefined) {
      return { kind: "not_found", error: SAFE_NOT_FOUND_ERROR };
    }

    const existing = await client.query<QualificationContactRow>(
      buildSelectContactsStatement({
        organizationId: actor.organizationId,
        workspaceId: input.workspaceId,
        lock: true,
      }),
    );
    if (existing.length > 0) {
      return { kind: "conflict", error: SAFE_CONFLICT_ERROR };
    }

    const scheduledAt = qualificationContactNumbers.map((_, index) =>
      new Date(
        startTimestamp + index * request.interval_days * dayMilliseconds,
      ).toISOString(),
    );
    await client.query(
      buildInsertContactsStatement({
        actor,
        workspace,
        contactIds,
        scheduledAt,
      }),
    );
    await appendActivityAndAudit(client, {
      actor,
      workspace,
      activityId,
      occurredAt,
      activityType: "TASK",
      activityOutcome: "Cadência de qualificação iniciada",
      summary: null,
    });

    const rows = await client.query<QualificationContactRow>(
      buildSelectContactsStatement({
        organizationId: actor.organizationId,
        workspaceId: input.workspaceId,
        lock: false,
      }),
    );

    return { kind: "started", cadence: mapCadence(rows) };
  });
}

export async function recordQualificationContact(
  input: RecordQualificationContactInput,
): Promise<RecordQualificationContactResult> {
  const actor = validateAuditActor(input.actor);
  validateUuid(input.workspaceId);
  const request = parseRecordRequest(input.request);
  const activityId = randomUUID();

  return transaction(async (client) => {
    const workspace = await selectWorkspaceForMutation(client, {
      organizationId: actor.organizationId,
      workspaceId: input.workspaceId,
    });
    if (workspace === undefined) {
      return { kind: "not_found", error: SAFE_NOT_FOUND_ERROR };
    }

    const currentRows = await client.query<QualificationContactRow>(
      buildSelectContactsStatement({
        organizationId: actor.organizationId,
        workspaceId: input.workspaceId,
        lock: true,
      }),
    );
    const currentCadence = mapCadence(currentRows);
    if (
      currentCadence.status !== "ACTIVE" ||
      currentCadence.current_contact_number !== request.contact_number
    ) {
      return { kind: "conflict", error: SAFE_CONFLICT_ERROR };
    }

    const activityOutcome = qualificationOutcomeLabel(request.outcome);
    await client.query(
      buildInsertActivityStatement({
        actor,
        workspace,
        activityId,
        occurredAt: request.occurred_at,
        activityType: request.channel,
        activityOutcome,
        summary: request.summary ?? null,
      }),
    );
    await client.query(
      buildCompleteContactStatement({
        actor,
        workspaceId: input.workspaceId,
        contactNumber: request.contact_number,
        outcome: request.outcome,
        activityId,
      }),
    );

    if (request.outcome === "FOLLOW_UP_LATER") {
      if (request.next_contact_at === undefined) {
        throw new QualificationCadenceRepositoryInputError();
      }

      await client.query(
        buildRescheduleNextContactStatement({
          actor,
          workspaceId: input.workspaceId,
          nextContactNumber: (request.contact_number + 1) as 2 | 3 | 4,
          scheduledAt: request.next_contact_at,
        }),
      );
    } else if (isTerminalOutcome(request.outcome)) {
      await client.query(
        buildCancelRemainingContactsStatement({
          actor,
          workspaceId: input.workspaceId,
          completedContactNumber: request.contact_number,
        }),
      );
    }

    await client.query(
      buildInsertAuditEventStatement({
        actor,
        workspace,
        activityId,
        activityType: request.channel,
        activityOutcome,
      }),
    );

    const rows = await client.query<QualificationContactRow>(
      buildSelectContactsStatement({
        organizationId: actor.organizationId,
        workspaceId: input.workspaceId,
        lock: false,
      }),
    );
    const cadence = mapCadence(rows);
    const nextContactNumber = request.contact_number + 1;
    const nextContact = cadence.contacts.find(
      (contact) =>
        contact.contact_number === nextContactNumber &&
        contact.state === "PENDING",
    );
    const pipelineAction = decideQualificationPipelineAction({
      currentStage: workspace.commercial_stage,
      contactNumber: request.contact_number,
      outcome: request.outcome,
      nextContact:
        nextContact === undefined || nextContact.contact_number === 1
          ? null
          : {
              contactNumber: nextContact.contact_number,
              scheduledAt: nextContact.scheduled_at,
            },
    });
    await applyQualificationPipelineAction(client, {
      actor,
      workspace,
      pipelineAction,
    });

    return { kind: "recorded", cadence, pipelineAction };
  });
}

async function applyQualificationPipelineAction(
  client: AppDatabaseTransaction,
  input: {
    readonly actor: CommercialAuditActorContext;
    readonly workspace: WorkspaceReferenceRow;
    readonly pipelineAction: QualificationPipelineAction;
  },
): Promise<void> {
  if (input.pipelineAction.kind === "unchanged") {
    return;
  }

  const nextWorkspace = applyPipelineChanges(
    input.workspace,
    input.pipelineAction,
  );
  if (!workspaceChanged(input.workspace, nextWorkspace)) {
    return;
  }

  await client.query(
    buildUpdateWorkspaceFromQualificationStatement({
      actor: input.actor,
      workspace: nextWorkspace,
    }),
  );
  await client.query(
    buildInsertWorkspacePipelineAuditStatement({
      actor: input.actor,
      previous: input.workspace,
      next: nextWorkspace,
      pipelineAction: input.pipelineAction,
    }),
  );
}

function applyPipelineChanges(
  workspace: WorkspaceReferenceRow,
  pipelineAction: QualificationPipelineAction,
): WorkspaceReferenceRow {
  const { changes } = pipelineAction;

  return {
    ...workspace,
    commercial_stage:
      changes.commercialStage ?? workspace.commercial_stage,
    next_action: Object.hasOwn(changes, "nextAction")
      ? (changes.nextAction ?? null)
      : workspace.next_action,
    next_action_due_at: Object.hasOwn(changes, "nextActionDueAt")
      ? (changes.nextActionDueAt ?? null)
      : workspace.next_action_due_at,
    commercial_outcome: Object.hasOwn(changes, "commercialOutcome")
      ? (changes.commercialOutcome ?? null)
      : workspace.commercial_outcome,
    version: workspace.version + 1,
  };
}

function workspaceChanged(
  previous: WorkspaceReferenceRow,
  next: WorkspaceReferenceRow,
): boolean {
  return (
    previous.commercial_stage !== next.commercial_stage ||
    previous.next_action !== next.next_action ||
    toIsoStringOrNull(previous.next_action_due_at) !==
      toIsoStringOrNull(next.next_action_due_at) ||
    previous.commercial_outcome !== next.commercial_outcome
  );
}

function workspaceStateMetadata(
  workspace: WorkspaceReferenceRow,
): CommercialAuditStateMetadata {
  return {
    commercial_stage: workspace.commercial_stage,
    responsible_subject: workspace.responsible_subject,
    next_action_present: workspace.next_action !== null,
    next_action_due_at: toIsoStringOrNull(workspace.next_action_due_at),
    commercial_outcome: workspace.commercial_outcome,
    version: workspace.version,
    archived_at: null,
  };
}

async function selectWorkspaceForMutation(
  client: AppDatabaseTransaction,
  input: { readonly organizationId: string; readonly workspaceId: string },
): Promise<WorkspaceReferenceRow | undefined> {
  const [workspace] = await client.query<WorkspaceReferenceRow>(
    buildSelectWorkspaceStatement({ ...input, lock: true }),
  );

  return workspace;
}

async function appendActivityAndAudit(
  client: AppDatabaseTransaction,
  input: {
    readonly actor: CommercialAuditActorContext;
    readonly workspace: WorkspaceReferenceRow;
    readonly activityId: string;
    readonly occurredAt: string;
    readonly activityType: CommercialActivityType;
    readonly activityOutcome: string;
    readonly summary: string | null;
  },
): Promise<void> {
  await client.query(buildInsertActivityStatement(input));
  await client.query(buildInsertAuditEventStatement(input));
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
        observed_lead_run_id,
        responsible_subject,
        commercial_stage,
        next_action,
        next_action_due_at,
        commercial_outcome,
        version
      FROM prospecting_app.lead_workspaces
      WHERE organization_id = $1
        AND workspace_id = $2
        AND archived_at IS NULL
      LIMIT 1${input.lock ? "\n      FOR UPDATE" : ""}`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildUpdateWorkspaceFromQualificationStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: WorkspaceReferenceRow;
}): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.lead_workspaces
      SET commercial_stage = $3,
          next_action = $4,
          next_action_due_at = $5,
          commercial_outcome = $6,
          version = version + 1,
          updated_by_subject = $7,
          updated_at = now()
      WHERE organization_id = $1
        AND workspace_id = $2
        AND archived_at IS NULL`,
    values: [
      input.actor.organizationId,
      input.workspace.workspace_id,
      input.workspace.commercial_stage,
      input.workspace.next_action,
      input.workspace.next_action_due_at,
      input.workspace.commercial_outcome,
      input.actor.actorSubject,
    ],
  };
}

function buildInsertWorkspacePipelineAuditStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly previous: WorkspaceReferenceRow;
  readonly next: WorkspaceReferenceRow;
  readonly pipelineAction: QualificationPipelineAction;
}): SqlStatement {
  const action: CommercialAuditAction =
    input.previous.commercial_stage !== input.next.commercial_stage
      ? "STAGE_CHANGED"
      : input.previous.next_action !== input.next.next_action ||
          toIsoStringOrNull(input.previous.next_action_due_at) !==
            toIsoStringOrNull(input.next.next_action_due_at)
        ? "NEXT_ACTION_CHANGED"
        : "WORKSPACE_UPDATED";
  const metadata: CommercialAuditMetadata = {
    source: "app",
    field: "multiple",
    reason_code: input.pipelineAction.reasonCode,
    workspace_id: input.next.workspace_id,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'lead_workspace', $3, $9, $10, $11, $12)`,
    values: [
      randomUUID(),
      input.actor.organizationId,
      input.next.workspace_id,
      input.actor.actorSubject,
      input.actor.actorIssuer,
      input.actor.requestCorrelationId,
      input.actor.authorizationBasis,
      action,
      input.next.observed_lead_run_id,
      workspaceStateMetadata(input.previous),
      workspaceStateMetadata(input.next),
      metadata,
    ],
  };
}

function buildSelectContactsStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly lock: boolean;
}): SqlStatement {
  return {
    text: `
      SELECT
        qualification_contact.qualification_contact_id,
        qualification_contact.contact_number,
        qualification_contact.scheduled_at,
        qualification_contact.state,
        qualification_contact.outcome,
        activity.activity_type AS channel,
        activity.summary,
        activity.occurred_at AS completed_at
      FROM prospecting_app.lead_qualification_contacts qualification_contact
      LEFT JOIN prospecting_app.lead_activities activity
        ON activity.activity_id = qualification_contact.completed_activity_id
      WHERE qualification_contact.organization_id = $1
        AND qualification_contact.workspace_id = $2
      ORDER BY qualification_contact.contact_number${
        input.lock ? "\n      FOR UPDATE OF qualification_contact" : ""
      }`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildInsertContactsStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: WorkspaceReferenceRow;
  readonly contactIds: readonly string[];
  readonly scheduledAt: readonly string[];
}): SqlStatement {
  const values: unknown[] = [];
  const rows = qualificationContactNumbers.map((contactNumber, index) => {
    const offset = index * 7;
    values.push(
      input.contactIds[index],
      input.actor.organizationId,
      input.workspace.workspace_id,
      contactNumber,
      input.scheduledAt[index],
      input.actor.actorSubject,
      input.actor.actorSubject,
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  return {
    text: `
      INSERT INTO prospecting_app.lead_qualification_contacts (
        qualification_contact_id,
        organization_id,
        workspace_id,
        contact_number,
        scheduled_at,
        created_by_subject,
        updated_by_subject
      )
      VALUES ${rows.join(",\n        ")}`,
    values,
  };
}

function buildInsertActivityStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: WorkspaceReferenceRow;
  readonly activityId: string;
  readonly occurredAt: string;
  readonly activityType: CommercialActivityType;
  readonly activityOutcome: string;
  readonly summary: string | null;
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    values: [
      input.activityId,
      input.actor.organizationId,
      input.workspace.workspace_id,
      input.workspace.observed_lead_run_id,
      input.actor.actorSubject,
      input.occurredAt,
      input.activityType,
      input.activityOutcome,
      input.summary,
    ],
  };
}

function buildCompleteContactStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspaceId: string;
  readonly contactNumber: 1 | 2 | 3 | 4;
  readonly outcome: QualificationContactOutcome;
  readonly activityId: string;
}): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.lead_qualification_contacts
      SET state = 'COMPLETED',
          outcome = $4,
          completed_activity_id = $5,
          updated_by_subject = $6,
          updated_at = now()
      WHERE organization_id = $1
        AND workspace_id = $2
        AND contact_number = $3
        AND state = 'PENDING'`,
    values: [
      input.actor.organizationId,
      input.workspaceId,
      input.contactNumber,
      input.outcome,
      input.activityId,
      input.actor.actorSubject,
    ],
  };
}

function buildRescheduleNextContactStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspaceId: string;
  readonly nextContactNumber: 2 | 3 | 4;
  readonly scheduledAt: string;
}): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.lead_qualification_contacts
      SET scheduled_at = $4,
          updated_by_subject = $5,
          updated_at = now()
      WHERE organization_id = $1
        AND workspace_id = $2
        AND contact_number = $3
        AND state = 'PENDING'`,
    values: [
      input.actor.organizationId,
      input.workspaceId,
      input.nextContactNumber,
      input.scheduledAt,
      input.actor.actorSubject,
    ],
  };
}

function buildCancelRemainingContactsStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspaceId: string;
  readonly completedContactNumber: 1 | 2 | 3 | 4;
}): SqlStatement {
  return {
    text: `
      UPDATE prospecting_app.lead_qualification_contacts
      SET state = 'CANCELLED',
          updated_by_subject = $4,
          updated_at = now()
      WHERE organization_id = $1
        AND workspace_id = $2
        AND contact_number > $3
        AND state = 'PENDING'`,
    values: [
      input.actor.organizationId,
      input.workspaceId,
      input.completedContactNumber,
      input.actor.actorSubject,
    ],
  };
}

function buildInsertAuditEventStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: WorkspaceReferenceRow;
  readonly activityId: string;
  readonly activityType: CommercialActivityType;
  readonly activityOutcome: string;
}): SqlStatement {
  const emptyMetadata: CommercialAuditStateMetadata = {};
  const metadata: CommercialAuditMetadata = {
    source: "app",
    workspace_id: input.workspace.workspace_id,
    activity_id: input.activityId,
    activity_type: input.activityType,
    activity_outcome: input.activityOutcome,
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
      input.activityId,
      input.workspace.observed_lead_run_id,
      emptyMetadata,
      emptyMetadata,
      metadata,
    ],
  };
}

function mapCadence(rows: readonly QualificationContactRow[]): QualificationCadenceDto {
  if (rows.length === 0) {
    return {
      status: "NOT_STARTED",
      current_contact_number: null,
      contacts: [],
    };
  }

  if (rows.length !== 4) {
    throw new QualificationCadenceRepositoryDataError();
  }

  const contacts = rows.map(mapContactRow);
  if (
    contacts.some(
      (contact, index) => contact.contact_number !== qualificationContactNumbers[index],
    )
  ) {
    throw new QualificationCadenceRepositoryDataError();
  }

  if (
    contacts.some(
      (contact) =>
        contact.state === "COMPLETED" && contact.outcome === "QUALIFIED",
    )
  ) {
    return { status: "QUALIFIED", current_contact_number: null, contacts };
  }

  if (
    contacts.some(
      (contact) =>
        contact.state === "COMPLETED" &&
        (contact.outcome === "NOT_INTERESTED" ||
          contact.outcome === "WRONG_CONTACT"),
    )
  ) {
    return { status: "STOPPED", current_contact_number: null, contacts };
  }

  const current = contacts.find((contact) => contact.state === "PENDING");
  if (current !== undefined) {
    return {
      status: "ACTIVE",
      current_contact_number: current.contact_number,
      contacts,
    };
  }

  return { status: "EXHAUSTED", current_contact_number: null, contacts };
}

function mapContactRow(row: QualificationContactRow): QualificationContactDto {
  const contactNumber = Number(row.contact_number);
  if (
    !qualificationContactNumbers.includes(
      contactNumber as (typeof qualificationContactNumbers)[number],
    ) ||
    !uuidPattern.test(row.qualification_contact_id) ||
    !qualificationContactStates.includes(row.state) ||
    (row.outcome !== null && !qualificationContactOutcomes.includes(row.outcome))
  ) {
    throw new QualificationCadenceRepositoryDataError();
  }

  const channel = mapQualificationChannel(row.channel);
  if (
    (row.state === "COMPLETED" &&
      (row.outcome === null || channel === null || row.completed_at === null)) ||
    (row.state !== "COMPLETED" &&
      (row.outcome !== null || channel !== null || row.completed_at !== null))
  ) {
    throw new QualificationCadenceRepositoryDataError();
  }

  return {
    qualification_contact_id: row.qualification_contact_id,
    contact_number: contactNumber as 1 | 2 | 3 | 4,
    scheduled_at: toIsoString(row.scheduled_at),
    state: row.state,
    outcome: row.outcome,
    channel,
    summary: row.state === "COMPLETED" ? row.summary : null,
    completed_at:
      row.completed_at === null ? null : toIsoString(row.completed_at),
  };
}

function mapQualificationChannel(
  value: CommercialActivityType | null,
): QualificationContactChannel | null {
  if (value === null) {
    return null;
  }

  if (qualificationContactChannels.includes(value as QualificationContactChannel)) {
    return value as QualificationContactChannel;
  }

  throw new QualificationCadenceRepositoryDataError();
}

function qualificationOutcomeLabel(outcome: QualificationContactOutcome): string {
  switch (outcome) {
    case "NO_RESPONSE":
      return "Sem resposta";
    case "RESPONDED":
      return "Respondeu";
    case "FOLLOW_UP_LATER":
      return "Pediu contato mais tarde";
    case "QUALIFIED":
      return "Lead qualificado";
    case "NOT_INTERESTED":
      return "Sem interesse";
    case "WRONG_CONTACT":
      return "Contato incorreto";
    case "OTHER_RESPONSE":
      return "Outro retorno";
  }
}

function isTerminalOutcome(outcome: QualificationContactOutcome): boolean {
  return (
    outcome === "QUALIFIED" ||
    outcome === "NOT_INTERESTED" ||
    outcome === "WRONG_CONTACT"
  );
}

function parseStartRequest(input: unknown): StartQualificationCadenceRequest {
  const result = qualificationCadenceMutationRequestSchema.safeParse(input);
  if (!result.success || result.data.action !== "start") {
    throw new QualificationCadenceRepositoryInputError();
  }

  return result.data;
}

function parseRecordRequest(
  input: unknown,
): RecordQualificationContactRequest {
  const result = qualificationCadenceMutationRequestSchema.safeParse(input);
  if (!result.success || result.data.action !== "record_contact") {
    throw new QualificationCadenceRepositoryInputError();
  }

  return result.data;
}

function validateAuditActor(
  actor: CommercialAuditActorContext,
): CommercialAuditActorContext {
  if (!hasValidCommercialAuditFields(actor)) {
    throw new QualificationCadenceRepositoryInputError();
  }

  return {
    ...actor,
    organizationId: parseOrganizationId(actor.organizationId),
    actorSubject: parseSubject(actor.actorSubject),
  };
}

function parseOrganizationId(value: string): string {
  const result = organizationIdSchema.safeParse(value);
  if (!result.success) {
    throw new QualificationCadenceRepositoryInputError();
  }

  return result.data;
}

function parseSubject(value: string): string {
  const result = subjectSchema.safeParse(value);
  if (!result.success) {
    throw new QualificationCadenceRepositoryInputError();
  }

  return result.data;
}

function validateUuid(value: string): void {
  if (!uuidPattern.test(value)) {
    throw new QualificationCadenceRepositoryInputError();
  }
}

function toIsoString(value: Date | string): string {
  const candidate = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(candidate.getTime())) {
    throw new QualificationCadenceRepositoryDataError();
  }

  return candidate.toISOString();
}

function toIsoStringOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}
