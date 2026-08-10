import "server-only";

import { randomUUID } from "node:crypto";

import {
  transaction,
  type AppDatabaseTransaction,
} from "../db/app-client";

export type ContactEnrichmentStatus =
  | "REQUEST_RECORDED"
  | "ENRICHMENT_DISPATCHED"
  | "DISPATCH_OUTCOME_UNKNOWN"
  | "COMPLETED_WITHHELD"
  | "PROVIDER_OUTCOME_UNKNOWN";

export interface ContactEnrichmentRecord {
  readonly requestId: string;
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly status: ContactEnrichmentStatus;
  readonly requestedAt: Date;
  readonly updatedAt: Date;
  readonly providerOccurredAt: Date | null;
}

interface ContactEnrichmentRow {
  readonly request_id: string;
  readonly organization_id: string;
  readonly actor_subject: string;
  readonly idempotency_key_sha256: string;
  readonly input_sha256: string;
  readonly status: ContactEnrichmentStatus;
  readonly requested_at: Date;
  readonly updated_at: Date;
  readonly provider_occurred_at: Date | null;
}

export interface RecordContactEnrichmentIntentInput {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly idempotencyKeySha256: string;
  readonly inputSha256: string;
}

export type RecordContactEnrichmentIntentResult =
  | { readonly kind: "created"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "duplicate"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "conflict" };

export interface RecordContactEnrichmentDispatchOutcomeInput {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly requestId: string;
  readonly outcome: "acknowledged" | "unknown";
}

export type RecordContactEnrichmentDispatchOutcomeResult =
  | { readonly kind: "recorded"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "unchanged"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "not_found" };

export interface RecordContactEnrichmentCallbackInput {
  readonly organizationId: string;
  readonly requestId: string;
  readonly status: "COMPLETED_WITHHELD" | "PROVIDER_OUTCOME_UNKNOWN";
  readonly occurredAt: Date;
}

export type RecordContactEnrichmentCallbackResult =
  | { readonly kind: "recorded"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "replayed"; readonly request: ContactEnrichmentRecord }
  | { readonly kind: "conflict" }
  | { readonly kind: "not_found" };

export class ContactEnrichmentRepositoryInputError extends Error {
  readonly code = "INVALID_CONTACT_ENRICHMENT_PERSISTENCE_INPUT";

  constructor() {
    super("Invalid contact enrichment persistence input.");
    this.name = "ContactEnrichmentRepositoryInputError";
  }
}

const rowColumns = `
  request_id,
  organization_id,
  actor_subject,
  idempotency_key_sha256,
  input_sha256,
  status,
  requested_at,
  updated_at,
  provider_occurred_at
`;

export async function recordContactEnrichmentIntent(
  input: RecordContactEnrichmentIntentInput,
): Promise<RecordContactEnrichmentIntentResult> {
  validateIntentInput(input);

  return transaction(async (client) => {
    const requestId = randomUUID();
    const inserted = await client.query<ContactEnrichmentRow>({
      text: `
        INSERT INTO prospecting_app.contact_enrichment_requests (
          request_id,
          organization_id,
          actor_subject,
          idempotency_key_sha256,
          input_sha256,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'REQUEST_RECORDED')
        ON CONFLICT (organization_id, idempotency_key_sha256) DO NOTHING
        RETURNING ${rowColumns}
      `,
      values: [
        requestId,
        input.organizationId,
        input.actorSubject,
        input.idempotencyKeySha256,
        input.inputSha256,
      ],
    });

    if (inserted[0] !== undefined) {
      const request = mapRow(inserted[0]);

      await appendEvent(
        client,
        request.organizationId,
        request.requestId,
        input.actorSubject,
        "REQUEST_RECORDED",
        request.requestedAt,
      );

      return { kind: "created", request };
    }

    const existing = await client.query<ContactEnrichmentRow>({
      text: `
        SELECT ${rowColumns}
        FROM prospecting_app.contact_enrichment_requests
        WHERE organization_id = $1
          AND idempotency_key_sha256 = $2
      `,
      values: [input.organizationId, input.idempotencyKeySha256],
    });
    const [existingRow] = existing;

    if (
      existingRow === undefined ||
      existingRow.input_sha256 !== input.inputSha256
    ) {
      return { kind: "conflict" };
    }

    return { kind: "duplicate", request: mapRow(existingRow) };
  });
}

export async function recordContactEnrichmentDispatchOutcome(
  input: RecordContactEnrichmentDispatchOutcomeInput,
): Promise<RecordContactEnrichmentDispatchOutcomeResult> {
  validateDispatchInput(input);

  return transaction(async (client) => {
    const current = await lockRequest(
      client,
      input.organizationId,
      input.requestId,
    );

    if (current === null) {
      return { kind: "not_found" };
    }

    if (current.status !== "REQUEST_RECORDED") {
      return { kind: "unchanged", request: current };
    }

    const status: ContactEnrichmentStatus =
      input.outcome === "acknowledged"
        ? "ENRICHMENT_DISPATCHED"
        : "DISPATCH_OUTCOME_UNKNOWN";
    const occurredAt = new Date();
    const updated = await client.query<ContactEnrichmentRow>({
      text: `
        UPDATE prospecting_app.contact_enrichment_requests
        SET status = $3, updated_at = $4
        WHERE organization_id = $1 AND request_id = $2
        RETURNING ${rowColumns}
      `,
      values: [input.organizationId, input.requestId, status, occurredAt],
    });
    const [updatedRow] = updated;

    if (updatedRow === undefined) {
      return { kind: "not_found" };
    }

    await appendEvent(
      client,
      input.organizationId,
      input.requestId,
      input.actorSubject,
      status,
      occurredAt,
    );

    return { kind: "recorded", request: mapRow(updatedRow) };
  });
}

export async function recordContactEnrichmentCallback(
  input: RecordContactEnrichmentCallbackInput,
): Promise<RecordContactEnrichmentCallbackResult> {
  validateCallbackInput(input);

  return transaction(async (client) => {
    const current = await lockRequest(
      client,
      input.organizationId,
      input.requestId,
    );

    if (current === null) {
      return { kind: "not_found" };
    }

    if (current.providerOccurredAt !== null) {
      return current.status === input.status &&
        current.providerOccurredAt.getTime() === input.occurredAt.getTime()
        ? { kind: "replayed", request: current }
        : { kind: "conflict" };
    }

    const updated = await client.query<ContactEnrichmentRow>({
      text: `
        UPDATE prospecting_app.contact_enrichment_requests
        SET status = $3,
            provider_occurred_at = $4,
            updated_at = GREATEST(updated_at, $4)
        WHERE organization_id = $1 AND request_id = $2
        RETURNING ${rowColumns}
      `,
      values: [
        input.organizationId,
        input.requestId,
        input.status,
        input.occurredAt,
      ],
    });
    const [updatedRow] = updated;

    if (updatedRow === undefined) {
      return { kind: "not_found" };
    }

    await appendEvent(
      client,
      input.organizationId,
      input.requestId,
      "system:n8n-contact-enrichment-callback",
      input.status,
      input.occurredAt,
    );

    return { kind: "recorded", request: mapRow(updatedRow) };
  });
}

async function lockRequest(
  client: AppDatabaseTransaction,
  organizationId: string,
  requestId: string,
): Promise<ContactEnrichmentRecord | null> {
  const rows = await client.query<ContactEnrichmentRow>({
    text: `
      SELECT ${rowColumns}
      FROM prospecting_app.contact_enrichment_requests
      WHERE organization_id = $1 AND request_id = $2
      FOR UPDATE
    `,
    values: [organizationId, requestId],
  });

  return rows[0] === undefined ? null : mapRow(rows[0]);
}

async function appendEvent(
  client: AppDatabaseTransaction,
  organizationId: string,
  requestId: string,
  actorCategory: string,
  eventType: ContactEnrichmentStatus,
  occurredAt: Date,
): Promise<void> {
  await client.query({
    text: `
      INSERT INTO prospecting_app.contact_enrichment_events (
        event_id,
        organization_id,
        request_id,
        actor_category,
        event_type,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    values: [
      randomUUID(),
      organizationId,
      requestId,
      actorCategory,
      eventType,
      occurredAt,
    ],
  });
}

function mapRow(row: ContactEnrichmentRow): ContactEnrichmentRecord {
  return {
    requestId: row.request_id,
    organizationId: row.organization_id,
    actorSubject: row.actor_subject,
    status: row.status,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    providerOccurredAt: row.provider_occurred_at,
  };
}

function validateIntentInput(input: RecordContactEnrichmentIntentInput): void {
  requireText(input.organizationId, 128);
  requireText(input.actorSubject, 256);
  requireSha256(input.idempotencyKeySha256);
  requireSha256(input.inputSha256);
}

function validateDispatchInput(
  input: RecordContactEnrichmentDispatchOutcomeInput,
): void {
  requireText(input.organizationId, 128);
  requireText(input.actorSubject, 256);
  requireUuid(input.requestId);

  if (input.outcome !== "acknowledged" && input.outcome !== "unknown") {
    throw new ContactEnrichmentRepositoryInputError();
  }
}

function validateCallbackInput(
  input: RecordContactEnrichmentCallbackInput,
): void {
  requireText(input.organizationId, 128);
  requireUuid(input.requestId);

  if (
    (input.status !== "COMPLETED_WITHHELD" &&
      input.status !== "PROVIDER_OUTCOME_UNKNOWN") ||
    !(input.occurredAt instanceof Date) ||
    !Number.isFinite(input.occurredAt.getTime())
  ) {
    throw new ContactEnrichmentRepositoryInputError();
  }
}

function requireText(value: unknown, maximumLength: number): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value
  ) {
    throw new ContactEnrichmentRepositoryInputError();
  }
}

function requireSha256(value: unknown): void {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new ContactEnrichmentRepositoryInputError();
  }
}

function requireUuid(value: unknown): void {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ContactEnrichmentRepositoryInputError();
  }
}
