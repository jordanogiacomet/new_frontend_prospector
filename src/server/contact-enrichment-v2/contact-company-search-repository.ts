import "server-only";

import { randomUUID } from "node:crypto";

import type { ContactCompanySearchStatus } from "../../types/contact-enrichment";
import {
  transaction,
  type AppDatabaseTransaction,
} from "../db/app-client";
import type { EncryptedContactData } from "./contact-data-crypto";

type StoredCompanySearchStatus = Exclude<
  ContactCompanySearchStatus,
  "SEARCH_EXPIRED"
>;

export interface ContactCompanySearchRecord {
  readonly searchRequestId: string;
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly cnpjNormalizado: string;
  readonly status: StoredCompanySearchStatus;
  readonly resultSha256: string | null;
  readonly requestedAt: Date;
  readonly updatedAt: Date;
  readonly providerOccurredAt: Date | null;
  readonly matchesExpiresAt: Date | null;
}

interface CompanySearchRow {
  readonly search_request_id: string;
  readonly organization_id: string;
  readonly actor_subject: string;
  readonly cnpj_normalizado: string;
  readonly idempotency_key_sha256: string;
  readonly input_sha256: string;
  readonly status: StoredCompanySearchStatus;
  readonly result_sha256: string | null;
  readonly requested_at: Date;
  readonly updated_at: Date;
  readonly provider_occurred_at: Date | null;
  readonly matches_expires_at: Date | null;
}

export interface PreparedCompanyMatch {
  readonly companyMatchId: string;
  readonly encryptedProviderRef: EncryptedContactData;
  readonly encryptedProfile: EncryptedContactData;
  readonly listPosition: number;
}

export interface StoredCompanyMatch {
  readonly companyMatchId: string;
  readonly searchRequestId: string;
  readonly encryptedProviderRef: EncryptedContactData | null;
  readonly encryptedProfile: EncryptedContactData | null;
  readonly obtainedAt: Date;
  readonly expiresAt: Date;
  readonly erasedAt: Date | null;
}

interface CompanyMatchRow {
  readonly company_match_id: string;
  readonly search_request_id: string;
  readonly provider_ref_key_id: string | null;
  readonly provider_ref_nonce: Buffer | null;
  readonly provider_ref_ciphertext: Buffer | null;
  readonly provider_ref_auth_tag: Buffer | null;
  readonly profile_key_id: string | null;
  readonly profile_nonce: Buffer | null;
  readonly profile_ciphertext: Buffer | null;
  readonly profile_auth_tag: Buffer | null;
  readonly obtained_at: Date;
  readonly expires_at: Date;
  readonly erased_at: Date | null;
}

const requestColumns = `
  search_request_id,
  organization_id,
  actor_subject,
  cnpj_normalizado,
  idempotency_key_sha256,
  input_sha256,
  status,
  result_sha256,
  requested_at,
  updated_at,
  provider_occurred_at,
  matches_expires_at
`;

export type RecordCompanySearchIntentResult =
  | { readonly kind: "created"; readonly request: ContactCompanySearchRecord }
  | { readonly kind: "duplicate"; readonly request: ContactCompanySearchRecord }
  | { readonly kind: "conflict" };

export async function recordCompanySearchIntent(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly cnpjNormalizado: string;
  readonly idempotencyKeySha256: string;
  readonly inputSha256: string;
}): Promise<RecordCompanySearchIntentResult> {
  return transaction(async (client) => {
    const searchRequestId = randomUUID();
    const inserted = await client.query<CompanySearchRow>({
      text: `
        INSERT INTO prospecting_app.contact_company_search_requests (
          search_request_id,
          organization_id,
          actor_subject,
          cnpj_normalizado,
          idempotency_key_sha256,
          input_sha256,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'SEARCH_REQUEST_RECORDED')
        ON CONFLICT (organization_id, idempotency_key_sha256) DO NOTHING
        RETURNING ${requestColumns}
      `,
      values: [
        searchRequestId,
        input.organizationId,
        input.actorSubject,
        input.cnpjNormalizado,
        input.idempotencyKeySha256,
        input.inputSha256,
      ],
    });

    if (inserted[0] !== undefined) {
      const request = mapCompanySearchRow(inserted[0]);
      await appendCompanySearchEvent(client, {
        organizationId: input.organizationId,
        searchRequestId,
        actorCategory: input.actorSubject,
        eventType: "COMPANY_SEARCH_REQUEST_RECORDED",
        occurredAt: request.requestedAt,
      });
      return { kind: "created", request };
    }

    const existing = await client.query<CompanySearchRow>({
      text: `
        SELECT ${requestColumns}
        FROM prospecting_app.contact_company_search_requests
        WHERE organization_id = $1 AND idempotency_key_sha256 = $2
      `,
      values: [input.organizationId, input.idempotencyKeySha256],
    });
    const row = existing[0];
    if (row === undefined || row.input_sha256 !== input.inputSha256) {
      return { kind: "conflict" };
    }
    return { kind: "duplicate", request: mapCompanySearchRow(row) };
  });
}

export async function recordCompanySearchDispatchOutcome(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly searchRequestId: string;
  readonly outcome: "acknowledged" | "unknown";
}): Promise<ContactCompanySearchRecord | null> {
  return transaction(async (client) => {
    const current = await lockCompanySearchRequest(
      client,
      input.organizationId,
      input.searchRequestId,
    );
    if (current === null) return null;
    if (current.status !== "SEARCH_REQUEST_RECORDED") return current;

    const status: StoredCompanySearchStatus =
      input.outcome === "acknowledged"
        ? "SEARCH_DISPATCHED"
        : "DISPATCH_OUTCOME_UNKNOWN";
    const occurredAt = new Date();
    const updated = await client.query<CompanySearchRow>({
      text: `
        UPDATE prospecting_app.contact_company_search_requests
        SET status = $3, updated_at = $4
        WHERE organization_id = $1 AND search_request_id = $2
        RETURNING ${requestColumns}
      `,
      values: [
        input.organizationId,
        input.searchRequestId,
        status,
        occurredAt,
      ],
    });
    const row = updated[0];
    if (row === undefined) return null;
    await appendCompanySearchEvent(client, {
      organizationId: input.organizationId,
      searchRequestId: input.searchRequestId,
      actorCategory: input.actorSubject,
      eventType: "COMPANY_SEARCH_DISPATCH_RECORDED",
      occurredAt,
    });
    return mapCompanySearchRow(row);
  });
}

export type RecordCompanySearchResult =
  | { readonly kind: "recorded"; readonly request: ContactCompanySearchRecord }
  | { readonly kind: "replayed"; readonly request: ContactCompanySearchRecord }
  | { readonly kind: "conflict" }
  | { readonly kind: "not_found" };

export async function recordCompanySearchResult(input: {
  readonly organizationId: string;
  readonly searchRequestId: string;
  readonly status:
    | "SEARCH_AVAILABLE"
    | "SEARCH_EMPTY"
    | "SEARCH_FAILED"
    | "PROVIDER_OUTCOME_UNKNOWN";
  readonly resultSha256: string;
  readonly occurredAt: Date;
  readonly expiresAt: Date | null;
  readonly matches: readonly PreparedCompanyMatch[];
}): Promise<RecordCompanySearchResult> {
  return transaction(async (client) => {
    const current = await lockCompanySearchRequest(
      client,
      input.organizationId,
      input.searchRequestId,
    );
    if (current === null) return { kind: "not_found" };
    if (current.resultSha256 !== null) {
      return current.resultSha256 === input.resultSha256 &&
        current.providerOccurredAt?.getTime() === input.occurredAt.getTime()
        ? { kind: "replayed", request: current }
        : { kind: "conflict" };
    }

    let storedMatchCount = 0;
    for (const match of input.matches) {
      const inserted = await client.query<{ readonly company_match_id: string }>({
        text: `
          INSERT INTO prospecting_app.contact_company_matches (
            company_match_id,
            organization_id,
            search_request_id,
            provider_ref_key_id,
            provider_ref_nonce,
            provider_ref_ciphertext,
            provider_ref_auth_tag,
            profile_key_id,
            profile_nonce,
            profile_ciphertext,
            profile_auth_tag,
            list_position,
            obtained_at,
            expires_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14
          )
          ON CONFLICT (organization_id, search_request_id, list_position)
          DO NOTHING
          RETURNING company_match_id
        `,
        values: [
          match.companyMatchId,
          input.organizationId,
          input.searchRequestId,
          match.encryptedProviderRef.keyId,
          match.encryptedProviderRef.nonce,
          match.encryptedProviderRef.ciphertext,
          match.encryptedProviderRef.authenticationTag,
          match.encryptedProfile.keyId,
          match.encryptedProfile.nonce,
          match.encryptedProfile.ciphertext,
          match.encryptedProfile.authenticationTag,
          match.listPosition,
          input.occurredAt,
          input.expiresAt,
        ],
      });
      storedMatchCount += inserted.length;
    }

    const effectiveStatus: StoredCompanySearchStatus =
      input.status === "SEARCH_AVAILABLE" && storedMatchCount === 0
        ? "SEARCH_EMPTY"
        : input.status;
    const effectiveExpiry =
      effectiveStatus === "SEARCH_AVAILABLE" ? input.expiresAt : null;
    const updated = await client.query<CompanySearchRow>({
      text: `
        UPDATE prospecting_app.contact_company_search_requests
        SET status = $3,
            result_sha256 = $4,
            provider_occurred_at = $5,
            matches_expires_at = $6,
            updated_at = GREATEST(updated_at, $5)
        WHERE organization_id = $1 AND search_request_id = $2
        RETURNING ${requestColumns}
      `,
      values: [
        input.organizationId,
        input.searchRequestId,
        effectiveStatus,
        input.resultSha256,
        input.occurredAt,
        effectiveExpiry,
      ],
    });
    const row = updated[0];
    if (row === undefined) return { kind: "not_found" };
    await appendCompanySearchEvent(client, {
      organizationId: input.organizationId,
      searchRequestId: input.searchRequestId,
      actorCategory: "system:n8n-company-search-v1",
      eventType: "COMPANY_SEARCH_RESULT_RECORDED",
      occurredAt: input.occurredAt,
    });
    return { kind: "recorded", request: mapCompanySearchRow(row) };
  });
}

export async function readCompanySearchRequest(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly searchRequestId: string;
  readonly occurredAt: Date;
}): Promise<{
  readonly request: ContactCompanySearchRecord;
  readonly matches: readonly StoredCompanyMatch[];
} | null> {
  return transaction(async (client) => {
    const requests = await client.query<CompanySearchRow>({
      text: `
        SELECT ${requestColumns}
        FROM prospecting_app.contact_company_search_requests
        WHERE organization_id = $1 AND search_request_id = $2
      `,
      values: [input.organizationId, input.searchRequestId],
    });
    if (requests[0] === undefined) return null;

    const matches = await client.query<CompanyMatchRow>({
      text: `
        SELECT
          company_match_id,
          search_request_id,
          provider_ref_key_id,
          provider_ref_nonce,
          provider_ref_ciphertext,
          provider_ref_auth_tag,
          profile_key_id,
          profile_nonce,
          profile_ciphertext,
          profile_auth_tag,
          obtained_at,
          expires_at,
          erased_at
        FROM prospecting_app.contact_company_matches
        WHERE organization_id = $1 AND search_request_id = $2
        ORDER BY list_position, company_match_id
        LIMIT 5
      `,
      values: [input.organizationId, input.searchRequestId],
    });
    await appendCompanySearchEvent(client, {
      organizationId: input.organizationId,
      searchRequestId: input.searchRequestId,
      actorCategory: input.actorSubject,
      eventType: "COMPANY_SEARCH_READ",
      occurredAt: input.occurredAt,
    });
    return {
      request: mapCompanySearchRow(requests[0]),
      matches: matches.map(mapCompanyMatchRow),
    };
  });
}

export async function readCompanyMatchForPreview(input: {
  readonly organizationId: string;
  readonly cnpjNormalizado: string;
  readonly companyMatchId: string;
  readonly now: Date;
}): Promise<StoredCompanyMatch | null> {
  const rows = await transaction((client) =>
    client.query<CompanyMatchRow>({
      text: `
        SELECT
          match.company_match_id,
          match.search_request_id,
          match.provider_ref_key_id,
          match.provider_ref_nonce,
          match.provider_ref_ciphertext,
          match.provider_ref_auth_tag,
          match.profile_key_id,
          match.profile_nonce,
          match.profile_ciphertext,
          match.profile_auth_tag,
          match.obtained_at,
          match.expires_at,
          match.erased_at
        FROM prospecting_app.contact_company_matches match
        INNER JOIN prospecting_app.contact_company_search_requests request
          ON request.organization_id = match.organization_id
         AND request.search_request_id = match.search_request_id
        WHERE match.organization_id = $1
          AND match.company_match_id = $2
          AND request.cnpj_normalizado = $3
          AND request.status = 'SEARCH_AVAILABLE'
          AND match.erased_at IS NULL
          AND match.expires_at > $4
      `,
      values: [
        input.organizationId,
        input.companyMatchId,
        input.cnpjNormalizado,
        input.now,
      ],
    }),
  );
  return rows[0] === undefined ? null : mapCompanyMatchRow(rows[0]);
}

export async function eraseExpiredCompanyMatches(input: {
  readonly organizationId: string;
  readonly occurredAt: Date;
}): Promise<number> {
  return transaction(async (client) => {
    const erased = await client.query<{
      readonly company_match_id: string;
      readonly search_request_id: string;
    }>({
      text: `
        UPDATE prospecting_app.contact_company_matches
        SET provider_ref_key_id = NULL,
            provider_ref_nonce = NULL,
            provider_ref_ciphertext = NULL,
            provider_ref_auth_tag = NULL,
            profile_key_id = NULL,
            profile_nonce = NULL,
            profile_ciphertext = NULL,
            profile_auth_tag = NULL,
            erased_at = $2
        WHERE organization_id = $1
          AND erased_at IS NULL
          AND expires_at <= $2
        RETURNING company_match_id, search_request_id
      `,
      values: [input.organizationId, input.occurredAt],
    });
    for (const match of erased) {
      await appendCompanySearchEvent(client, {
        organizationId: input.organizationId,
        searchRequestId: match.search_request_id,
        actorCategory: "system:contact-retention-v2",
        eventType: "COMPANY_MATCH_DATA_ERASED",
        occurredAt: input.occurredAt,
      });
    }
    return erased.length;
  });
}

async function lockCompanySearchRequest(
  client: AppDatabaseTransaction,
  organizationId: string,
  searchRequestId: string,
): Promise<ContactCompanySearchRecord | null> {
  const rows = await client.query<CompanySearchRow>({
    text: `
      SELECT ${requestColumns}
      FROM prospecting_app.contact_company_search_requests
      WHERE organization_id = $1 AND search_request_id = $2
      FOR UPDATE
    `,
    values: [organizationId, searchRequestId],
  });
  return rows[0] === undefined ? null : mapCompanySearchRow(rows[0]);
}

async function appendCompanySearchEvent(
  client: AppDatabaseTransaction,
  input: {
    readonly organizationId: string;
    readonly searchRequestId: string;
    readonly actorCategory: string;
    readonly eventType:
      | "COMPANY_SEARCH_REQUEST_RECORDED"
      | "COMPANY_SEARCH_DISPATCH_RECORDED"
      | "COMPANY_SEARCH_RESULT_RECORDED"
      | "COMPANY_SEARCH_READ"
      | "COMPANY_MATCH_CONFIRMED"
      | "COMPANY_MATCH_DATA_ERASED";
    readonly occurredAt: Date;
  },
): Promise<void> {
  await client.query({
    text: `
      INSERT INTO prospecting_app.contact_company_search_events (
        event_id,
        organization_id,
        search_request_id,
        actor_category,
        event_type,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    values: [
      randomUUID(),
      input.organizationId,
      input.searchRequestId,
      input.actorCategory,
      input.eventType,
      input.occurredAt,
    ],
  });
}

function mapCompanySearchRow(row: CompanySearchRow): ContactCompanySearchRecord {
  return {
    searchRequestId: row.search_request_id,
    organizationId: row.organization_id,
    actorSubject: row.actor_subject,
    cnpjNormalizado: row.cnpj_normalizado,
    status: row.status,
    resultSha256: row.result_sha256,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    providerOccurredAt: row.provider_occurred_at,
    matchesExpiresAt: row.matches_expires_at,
  };
}

function mapCompanyMatchRow(row: CompanyMatchRow): StoredCompanyMatch {
  return {
    companyMatchId: row.company_match_id,
    searchRequestId: row.search_request_id,
    encryptedProviderRef: encryptedFromRow(
      row.provider_ref_key_id,
      row.provider_ref_nonce,
      row.provider_ref_ciphertext,
      row.provider_ref_auth_tag,
    ),
    encryptedProfile: encryptedFromRow(
      row.profile_key_id,
      row.profile_nonce,
      row.profile_ciphertext,
      row.profile_auth_tag,
    ),
    obtainedAt: row.obtained_at,
    expiresAt: row.expires_at,
    erasedAt: row.erased_at,
  };
}

function encryptedFromRow(
  keyId: string | null,
  nonce: Buffer | null,
  ciphertext: Buffer | null,
  authenticationTag: Buffer | null,
): EncryptedContactData | null {
  if (
    keyId === null ||
    nonce === null ||
    ciphertext === null ||
    authenticationTag === null
  ) {
    return null;
  }
  return { keyId, nonce, ciphertext, authenticationTag };
}
