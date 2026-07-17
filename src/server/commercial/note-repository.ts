import "server-only";

import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import {
  createLeadNoteRequestSchema,
  organizationIdSchema,
  subjectSchema,
} from "../../lib/validators/commercial";
import type {
  CommercialActorContext,
  CommercialAuditActorContext,
  CommercialAuditMetadata,
  CommercialAuditStateMetadata,
  CreateLeadNoteRequest,
  LeadNoteDto,
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

export interface AppendLeadNoteInput {
  readonly actor: CommercialAuditActorContext;
  readonly workspaceId: string;
  readonly request: unknown;
}

export interface ListLeadNotesInput {
  readonly actor: Pick<CommercialActorContext, "organizationId">;
  readonly workspaceId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export type AppendLeadNoteResult =
  | {
      readonly kind: "appended";
      readonly note: LeadNoteDto;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export type ListLeadNotesResult =
  | {
      readonly kind: "listed";
      readonly notes: readonly LeadNoteDto[];
      readonly page: number;
      readonly pageSize: number;
      readonly total: number | null;
    }
  | {
      readonly kind: "not_found";
      readonly error: typeof SAFE_NOT_FOUND_ERROR;
    };

export class LeadNoteRepositoryInputError extends Error {
  readonly code = "INVALID_LEAD_NOTE_INPUT";

  constructor() {
    super("Invalid lead note persistence input.");
    this.name = "LeadNoteRepositoryInputError";
  }
}

interface LeadWorkspaceNoteReferenceRow extends QueryResultRow {
  readonly workspace_id: string;
  readonly organization_id: string;
  readonly observed_lead_run_id: string;
}

interface LeadNoteRow extends QueryResultRow {
  readonly note_id: string;
  readonly organization_id: string;
  readonly workspace_id: string;
  readonly observed_lead_run_id: string;
  readonly author_subject: string;
  readonly body: string;
  readonly created_at: Date | string;
}

interface CountRow extends QueryResultRow {
  readonly total: number | string;
}

export async function appendLeadNote(
  input: AppendLeadNoteInput,
): Promise<AppendLeadNoteResult> {
  const actor = validateActor(input.actor);
  validateUuid(input.workspaceId);
  const request = parseCreateRequest(input.request);
  const noteId = randomUUID();

  return transaction(async (client) => {
    const [workspace] = await client.query<LeadWorkspaceNoteReferenceRow>(
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

    const [note] = await client.query<LeadNoteRow>(
      buildInsertNoteStatement({
        actor,
        workspace,
        request,
        noteId,
      }),
    );

    await client.query(
      buildInsertAuditEventStatement({
        actor,
        workspace,
        note,
      }),
    );

    return {
      kind: "appended",
      note: mapNoteRow(note),
    };
  });
}

export async function listLeadNotes(
  input: ListLeadNotesInput,
): Promise<ListLeadNotesResult> {
  const pagination = validateListInput(input);

  const [workspace] = await queryAppDatabase<LeadWorkspaceNoteReferenceRow>(
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
    buildCountNotesStatement({
      organizationId: pagination.organizationId,
      workspaceId: input.workspaceId,
    }),
  );
  const rows = await queryAppDatabase<LeadNoteRow>(
    buildListNotesStatement({
      organizationId: pagination.organizationId,
      workspaceId: input.workspaceId,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
  );

  return {
    kind: "listed",
    notes: rows.map(mapNoteRow),
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

function buildInsertNoteStatement(input: {
  readonly actor: CommercialAuditActorContext;
  readonly workspace: LeadWorkspaceNoteReferenceRow;
  readonly request: CreateLeadNoteRequest;
  readonly noteId: string;
}): SqlStatement {
  return {
    text: `
      INSERT INTO prospecting_app.lead_notes (
        note_id,
        organization_id,
        workspace_id,
        observed_lead_run_id,
        author_subject,
        body
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${noteColumns()}`,
    values: [
      input.noteId,
      input.actor.organizationId,
      input.workspace.workspace_id,
      input.workspace.observed_lead_run_id,
      input.actor.actorSubject,
      input.request.body,
    ],
  };
}

function buildCountNotesStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
}): SqlStatement {
  return {
    text: `
      SELECT count(*)::integer AS total
      FROM prospecting_app.lead_notes
      WHERE organization_id = $1
        AND workspace_id = $2`,
    values: [input.organizationId, input.workspaceId],
  };
}

function buildListNotesStatement(input: {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly page: number;
  readonly pageSize: number;
}): SqlStatement {
  return {
    text: `
      SELECT ${noteColumns()}
      FROM prospecting_app.lead_notes
      WHERE organization_id = $1
        AND workspace_id = $2
      ORDER BY created_at DESC, note_id
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
  readonly workspace: LeadWorkspaceNoteReferenceRow;
  readonly note: LeadNoteRow;
}): SqlStatement {
  const emptyStateMetadata: CommercialAuditStateMetadata = {};
  const metadata: CommercialAuditMetadata = {
    source: "app",
    workspace_id: input.workspace.workspace_id,
    note_id: input.note.note_id,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'NOTE_APPENDED', 'lead_note', $8, $9, $10, $11, $12)`,
    values: [
      randomUUID(),
      input.actor.organizationId,
      input.workspace.workspace_id,
      input.actor.actorSubject,
      input.actor.actorIssuer,
      input.actor.requestCorrelationId,
      input.actor.authorizationBasis,
      input.note.note_id,
      input.workspace.observed_lead_run_id,
      emptyStateMetadata,
      emptyStateMetadata,
      metadata,
    ],
  };
}

function noteColumns(): string {
  return `
        note_id,
        organization_id,
        workspace_id,
        observed_lead_run_id,
        author_subject,
        body,
        created_at`;
}

function parseCreateRequest(input: unknown): CreateLeadNoteRequest {
  const result = createLeadNoteRequestSchema.safeParse(input);

  if (!result.success) {
    throw new LeadNoteRepositoryInputError();
  }

  return result.data;
}

function validateActor(
  actor: CommercialAuditActorContext,
): CommercialAuditActorContext {
  if (!hasValidCommercialAuditFields(actor)) {
    throw new LeadNoteRepositoryInputError();
  }

  return {
    organizationId: parseOrganizationId(actor.organizationId),
    actorSubject: parseSubject(actor.actorSubject),
    actorIssuer: actor.actorIssuer,
    requestCorrelationId: actor.requestCorrelationId,
    authorizationBasis: actor.authorizationBasis,
  };
}

function validateListInput(input: ListLeadNotesInput): {
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
    throw new LeadNoteRepositoryInputError();
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
    throw new LeadNoteRepositoryInputError();
  }

  return result.data;
}

function parseSubject(value: string): string {
  const result = subjectSchema.safeParse(value);

  if (!result.success) {
    throw new LeadNoteRepositoryInputError();
  }

  return result.data;
}

function validateUuid(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new LeadNoteRepositoryInputError();
  }
}

function mapNoteRow(row: LeadNoteRow): LeadNoteDto {
  return {
    note_id: row.note_id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    observed_lead_run_id: row.observed_lead_run_id,
    author_subject: row.author_subject,
    body: row.body,
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
