import "server-only";

import { randomUUID } from "node:crypto";

import type { ContactPreviewStatus, ContactSearchDiagnosticDto, ContactRevealProgressDto, ContactRevealStatus, ContactRevealChannel } from "../../types/contact-enrichment";
import {
  query,
  transaction,
  type AppDatabaseTransaction,
} from "../db/app-client";
import type { EncryptedContactData } from "./contact-data-crypto";
import { contactSearchDiagnosticsSchema } from "./contact-enrichment-v2-contract";
import type {
  NormalizedContactProfile,
  NormalizedRevealedChannels,
} from "./contact-data-policy";

export interface ContactPreviewRecord {
  readonly requestId: string;
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly cnpjNormalizado: string;
  readonly companyDomain: string | null;
  readonly companyMatchId: string | null;
  readonly status: ContactPreviewStatus;
  readonly resultSha256: string | null;
  readonly requestedAt: Date;
  readonly updatedAt: Date;
  readonly providerOccurredAt: Date | null;
  readonly previewExpiresAt: Date | null;
  readonly searchDiagnostics?: readonly ContactSearchDiagnosticDto[] | null;
}

interface ContactPreviewRow {
  readonly request_id: string;
  readonly organization_id: string;
  readonly actor_subject: string;
  readonly cnpj_normalizado: string;
  readonly company_domain: string | null;
  readonly company_match_id: string | null;
  readonly idempotency_key_sha256: string;
  readonly input_sha256: string;
  readonly status: ContactPreviewStatus;
  readonly result_sha256: string | null;
  readonly requested_at: Date;
  readonly updated_at: Date;
  readonly provider_occurred_at: Date | null;
  readonly preview_expires_at: Date | null;
  readonly search_diagnostics: unknown;
}

export interface PreparedContactCandidate {
  readonly contactId: string;
  readonly providerRefHmac: string;
  readonly encryptedProviderRef: EncryptedContactData;
  readonly encryptedProfile: EncryptedContactData;
  readonly canRevealWorkEmail: boolean;
  readonly canRevealBusinessPhone: boolean;
  readonly listPosition: number;
}

export interface PreparedCompanyPhoneFallback {
  readonly phoneHmac: string;
  readonly encryptedPhone: EncryptedContactData;
}

export interface StoredCompanyPhoneFallback {
  readonly requestId: string;
  readonly encryptedPhone: EncryptedContactData | null;
  readonly obtainedAt: Date;
  readonly expiresAt: Date;
  readonly erasedAt: Date | null;
  readonly suppressed: boolean;
}

interface CompanyPhoneFallbackRow {
  readonly request_id: string;
  readonly phone_data_key_id: string | null;
  readonly phone_data_nonce: Buffer | null;
  readonly phone_data_ciphertext: Buffer | null;
  readonly phone_data_auth_tag: Buffer | null;
  readonly obtained_at: Date;
  readonly expires_at: Date;
  readonly erased_at: Date | null;
  readonly suppressed: boolean;
}

export interface StoredContactCandidate {
  readonly contactId: string;
  readonly requestId: string;
  readonly providerRefHmac: string;
  readonly encryptedProviderRef: EncryptedContactData | null;
  readonly encryptedProfile: EncryptedContactData | null;
  readonly canRevealWorkEmail: boolean;
  readonly canRevealBusinessPhone: boolean;
  readonly obtainedAt: Date;
  readonly expiresAt: Date;
  readonly suppressedAt: Date | null;
  readonly erasedAt: Date | null;
  readonly encryptedChannels: EncryptedContactData | null;
  readonly workEmailHmacs: readonly string[];
  readonly businessPhoneHmacs: readonly string[];
  readonly channelExpiresAt: Date | null;
  readonly channelRevealRequestId: string | null;
  readonly channelSuppressedAt: Date | null;
  readonly channelErasedAt: Date | null;
  readonly reveal?: ContactRevealProgressDto | null;
}

interface CandidateRow {
  readonly contact_id: string;
  readonly request_id: string;
  readonly provider_ref_hmac: string;
  readonly provider_ref_key_id: string | null;
  readonly provider_ref_nonce: Buffer | null;
  readonly provider_ref_ciphertext: Buffer | null;
  readonly provider_ref_auth_tag: Buffer | null;
  readonly profile_key_id: string | null;
  readonly profile_nonce: Buffer | null;
  readonly profile_ciphertext: Buffer | null;
  readonly profile_auth_tag: Buffer | null;
  readonly can_reveal_work_email: boolean;
  readonly can_reveal_business_phone: boolean;
  readonly obtained_at: Date;
  readonly expires_at: Date;
  readonly suppressed_at: Date | null;
  readonly erased_at: Date | null;
  readonly channel_data_key_id: string | null;
  readonly channel_data_nonce: Buffer | null;
  readonly channel_data_ciphertext: Buffer | null;
  readonly channel_data_auth_tag: Buffer | null;
  readonly work_email_hmacs: string[] | null;
  readonly business_phone_hmacs: string[] | null;
  readonly channel_expires_at: Date | null;
  readonly channel_reveal_request_id: string | null;
  readonly channel_suppressed_at: Date | null;
  readonly channel_erased_at: Date | null;
  readonly latest_reveal_request_id?: string | null;
  readonly latest_reveal_status?: ContactRevealStatus | null;
  readonly latest_requested_channels?: readonly ContactRevealChannel[] | null;
  readonly latest_reveal_requested_at?: Date | null;
  readonly latest_reveal_updated_at?: Date | null;
}

const previewColumns = `
  request_id,
  organization_id,
  actor_subject,
  cnpj_normalizado,
  company_domain,
  company_match_id,
  idempotency_key_sha256,
  input_sha256,
  status,
  result_sha256,
  requested_at,
  updated_at,
  provider_occurred_at,
  preview_expires_at,
  search_diagnostics
`;

export type RecordPreviewIntentResult =
  | { readonly kind: "created"; readonly request: ContactPreviewRecord }
  | { readonly kind: "duplicate"; readonly request: ContactPreviewRecord }
  | { readonly kind: "conflict" };

export async function recordPreviewIntent(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly cnpjNormalizado: string;
  readonly companyDomain: string | null;
  readonly companyMatchId: string | null;
  readonly idempotencyKeySha256: string;
  readonly inputSha256: string;
}): Promise<RecordPreviewIntentResult> {
  return transaction(async (client) => {
    const requestId = randomUUID();
    const inserted = await client.query<ContactPreviewRow>({
      text: `
        INSERT INTO prospecting_app.contact_enrichment_v2_requests (
          request_id,
          organization_id,
          actor_subject,
          cnpj_normalizado,
          company_domain,
          company_match_id,
          idempotency_key_sha256,
          input_sha256,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'REQUEST_RECORDED')
        ON CONFLICT (organization_id, idempotency_key_sha256) DO NOTHING
        RETURNING ${previewColumns}
      `,
      values: [
        requestId,
        input.organizationId,
        input.actorSubject,
        input.cnpjNormalizado,
        input.companyDomain,
        input.companyMatchId,
        input.idempotencyKeySha256,
        input.inputSha256,
      ],
    });

    if (inserted[0] !== undefined) {
      const request = mapPreviewRow(inserted[0]);
      await appendGovernanceEvent(client, {
        organizationId: input.organizationId,
        requestId,
        actorCategory: input.actorSubject,
        eventType: "PREVIEW_REQUEST_RECORDED",
        occurredAt: request.requestedAt,
      });
      if (input.companyMatchId !== null) {
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
            SELECT
              $1,
              match.organization_id,
              match.search_request_id,
              $4,
              'COMPANY_MATCH_CONFIRMED',
              $5
            FROM prospecting_app.contact_company_matches match
            WHERE match.organization_id = $2
              AND match.company_match_id = $3
          `,
          values: [
            randomUUID(),
            input.organizationId,
            input.companyMatchId,
            input.actorSubject,
            request.requestedAt,
          ],
        });
      }
      return { kind: "created", request };
    }

    const existing = await client.query<ContactPreviewRow>({
      text: `
        SELECT ${previewColumns}
        FROM prospecting_app.contact_enrichment_v2_requests
        WHERE organization_id = $1 AND idempotency_key_sha256 = $2
      `,
      values: [input.organizationId, input.idempotencyKeySha256],
    });
    const row = existing[0];

    if (row === undefined || row.input_sha256 !== input.inputSha256) {
      return { kind: "conflict" };
    }

    return { kind: "duplicate", request: mapPreviewRow(row) };
  });
}

export async function recordPreviewDispatchOutcome(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly requestId: string;
  readonly outcome: "acknowledged" | "unknown";
}): Promise<ContactPreviewRecord | null> {
  return transaction(async (client) => {
    const current = await lockPreviewRequest(
      client,
      input.organizationId,
      input.requestId,
    );
    if (current === null) return null;
    if (current.status !== "REQUEST_RECORDED") return current;

    const status: ContactPreviewStatus =
      input.outcome === "acknowledged"
        ? "PREVIEW_DISPATCHED"
        : "DISPATCH_OUTCOME_UNKNOWN";
    const occurredAt = new Date();
    const updated = await client.query<ContactPreviewRow>({
      text: `
        UPDATE prospecting_app.contact_enrichment_v2_requests
        SET status = $3, updated_at = $4
        WHERE organization_id = $1 AND request_id = $2
        RETURNING ${previewColumns}
      `,
      values: [input.organizationId, input.requestId, status, occurredAt],
    });
    const row = updated[0];
    if (row === undefined) return null;

    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      requestId: input.requestId,
      actorCategory: input.actorSubject,
      eventType: "PREVIEW_DISPATCH_RECORDED",
      occurredAt,
    });
    return mapPreviewRow(row);
  });
}

export type RecordPreviewResult =
  | { readonly kind: "recorded"; readonly request: ContactPreviewRecord }
  | { readonly kind: "replayed"; readonly request: ContactPreviewRecord }
  | { readonly kind: "conflict" }
  | { readonly kind: "not_found" };

export async function recordPreviewResult(input: {
  readonly organizationId: string;
  readonly requestId: string;
  readonly status:
    | "PREVIEW_AVAILABLE"
    | "PREVIEW_EMPTY"
    | "PREVIEW_FAILED"
    | "PROVIDER_OUTCOME_UNKNOWN";
  readonly resultSha256: string;
  readonly occurredAt: Date;
  readonly expiresAt: Date | null;
  readonly candidates: readonly PreparedContactCandidate[];
  readonly companyPhone: PreparedCompanyPhoneFallback | null;
  readonly searchDiagnostics?: readonly ContactSearchDiagnosticDto[] | null;
}): Promise<RecordPreviewResult> {
  return transaction(async (client) => {
    const current = await lockPreviewRequest(
      client,
      input.organizationId,
      input.requestId,
    );
    if (current === null) return { kind: "not_found" };

    if (current.resultSha256 !== null) {
      return current.resultSha256 === input.resultSha256 &&
        current.providerOccurredAt?.getTime() === input.occurredAt.getTime()
        ? { kind: "replayed", request: current }
        : { kind: "conflict" };
    }

    let storedCandidateCount = 0;
    for (const candidate of input.candidates) {
      const inserted = await client.query<{ readonly contact_id: string }>({
        text: `
          INSERT INTO prospecting_app.contact_candidates (
            contact_id,
            organization_id,
            request_id,
            provider_ref_hmac,
            provider_ref_key_id,
            provider_ref_nonce,
            provider_ref_ciphertext,
            provider_ref_auth_tag,
            profile_key_id,
            profile_nonce,
            profile_ciphertext,
            profile_auth_tag,
            list_position,
            can_reveal_work_email,
            can_reveal_business_phone,
            obtained_at,
            expires_at
          )
          SELECT
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17
          WHERE NOT EXISTS (
            SELECT 1
            FROM prospecting_app.contact_suppressions suppression
            WHERE suppression.organization_id = $2
              AND suppression.identity_kind = 'provider'
              AND suppression.identity_hmac = $4
              AND suppression.channel_scope = 'all'
              AND suppression.expires_at > $16
          )
          ON CONFLICT (organization_id, request_id, provider_ref_hmac)
          DO NOTHING
          RETURNING contact_id
        `,
        values: [
          candidate.contactId,
          input.organizationId,
          input.requestId,
          candidate.providerRefHmac,
          candidate.encryptedProviderRef.keyId,
          candidate.encryptedProviderRef.nonce,
          candidate.encryptedProviderRef.ciphertext,
          candidate.encryptedProviderRef.authenticationTag,
          candidate.encryptedProfile.keyId,
          candidate.encryptedProfile.nonce,
          candidate.encryptedProfile.ciphertext,
          candidate.encryptedProfile.authenticationTag,
          candidate.listPosition,
          candidate.canRevealWorkEmail,
          candidate.canRevealBusinessPhone,
          input.occurredAt,
          input.expiresAt,
        ],
      });
      storedCandidateCount += inserted.length;
    }

    let storedCompanyPhone = false;
    if (
      input.companyPhone !== null &&
      input.candidates.length === 0 &&
      input.expiresAt !== null
    ) {
      const inserted = await client.query<{ readonly request_id: string }>({
        text: `
          INSERT INTO prospecting_app.contact_company_phone_fallbacks (
            request_id,
            organization_id,
            phone_hmac,
            phone_data_key_id,
            phone_data_nonce,
            phone_data_ciphertext,
            phone_data_auth_tag,
            obtained_at,
            expires_at
          )
          SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
          WHERE NOT EXISTS (
            SELECT 1
            FROM prospecting_app.contact_suppressions suppression
            WHERE suppression.organization_id = $2
              AND suppression.identity_kind = 'phone'
              AND suppression.identity_hmac = $3
              AND suppression.channel_scope IN ('all', 'phone')
              AND suppression.expires_at > $8
          )
          ON CONFLICT (organization_id, request_id) DO NOTHING
          RETURNING request_id
        `,
        values: [
          input.requestId,
          input.organizationId,
          input.companyPhone.phoneHmac,
          input.companyPhone.encryptedPhone.keyId,
          input.companyPhone.encryptedPhone.nonce,
          input.companyPhone.encryptedPhone.ciphertext,
          input.companyPhone.encryptedPhone.authenticationTag,
          input.occurredAt,
          input.expiresAt,
        ],
      });
      storedCompanyPhone = inserted.length > 0;
    }

    const effectiveStatus =
      input.status === "PREVIEW_AVAILABLE" &&
      storedCandidateCount === 0 &&
      !storedCompanyPhone
        ? "PREVIEW_EMPTY"
        : input.status;
    const effectiveExpiry =
      effectiveStatus === "PREVIEW_AVAILABLE" ? input.expiresAt : null;
    const updated = await client.query<ContactPreviewRow>({
      text: `
        UPDATE prospecting_app.contact_enrichment_v2_requests
        SET status = $3,
            result_sha256 = $4,
            provider_occurred_at = $5,
            preview_expires_at = $6,
            search_diagnostics = $7::jsonb,
            updated_at = GREATEST(updated_at, $5)
        WHERE organization_id = $1 AND request_id = $2
        RETURNING ${previewColumns}
      `,
      values: [
        input.organizationId,
        input.requestId,
        effectiveStatus,
        input.resultSha256,
        input.occurredAt,
        effectiveExpiry,
        input.searchDiagnostics == null ? null : JSON.stringify(input.searchDiagnostics),
      ],
    });
    const row = updated[0];
    if (row === undefined) return { kind: "not_found" };

    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      requestId: input.requestId,
      actorCategory: "system:n8n-contact-preview-v2",
      eventType: "PREVIEW_RESULT_RECORDED",
      occurredAt: input.occurredAt,
    });
    return { kind: "recorded", request: mapPreviewRow(row) };
  });
}

export async function readPreviewRequest(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly requestId: string;
  readonly occurredAt: Date;
}): Promise<{
  readonly request: ContactPreviewRecord;
  readonly candidates: readonly StoredContactCandidate[];
  readonly companyPhone: StoredCompanyPhoneFallback | null;
} | null> {
  return transaction(async (client) => {
    const requests = await client.query<ContactPreviewRow>({
      text: `
        SELECT ${previewColumns}
        FROM prospecting_app.contact_enrichment_v2_requests
        WHERE organization_id = $1 AND request_id = $2
      `,
      values: [input.organizationId, input.requestId],
    });
    const requestRow = requests[0];
    if (requestRow === undefined) return null;

    const candidates = await client.query<CandidateRow>({
      text: `
        SELECT
          candidate.contact_id,
          candidate.request_id,
          candidate.provider_ref_hmac,
          candidate.provider_ref_key_id,
          candidate.provider_ref_nonce,
          candidate.provider_ref_ciphertext,
          candidate.provider_ref_auth_tag,
          candidate.profile_key_id,
          candidate.profile_nonce,
          candidate.profile_ciphertext,
          candidate.profile_auth_tag,
          candidate.can_reveal_work_email,
          candidate.can_reveal_business_phone,
          candidate.obtained_at,
          candidate.expires_at,
          candidate.suppressed_at,
          candidate.erased_at,
          record.channel_data_key_id,
          record.channel_data_nonce,
          record.channel_data_ciphertext,
          record.channel_data_auth_tag,
          record.work_email_hmacs,
          record.business_phone_hmacs,
          record.expires_at AS channel_expires_at,
          record.reveal_request_id AS channel_reveal_request_id,
          record.suppressed_at AS channel_suppressed_at,
          record.erased_at AS channel_erased_at,
          latest_reveal.reveal_request_id AS latest_reveal_request_id,
          latest_reveal.status AS latest_reveal_status,
          latest_reveal.requested_channels AS latest_requested_channels,
          latest_reveal.requested_at AS latest_reveal_requested_at,
          latest_reveal.updated_at AS latest_reveal_updated_at
        FROM prospecting_app.contact_candidates candidate
        LEFT JOIN prospecting_app.contact_records record
          ON record.organization_id = candidate.organization_id
         AND record.contact_id = candidate.contact_id
        LEFT JOIN LATERAL (
          SELECT reveal_request_id, status, requested_channels, requested_at, updated_at
          FROM prospecting_app.contact_reveal_requests reveal
          WHERE reveal.organization_id = candidate.organization_id
            AND reveal.request_id = candidate.request_id
            AND reveal.contact_id = candidate.contact_id
          ORDER BY reveal.requested_at DESC, reveal.reveal_request_id DESC
          LIMIT 1
        ) latest_reveal ON true
        WHERE candidate.organization_id = $1
          AND candidate.request_id = $2
        ORDER BY candidate.list_position, candidate.contact_id
        LIMIT 10
      `,
      values: [input.organizationId, input.requestId],
    });
    const companyPhones = await client.query<CompanyPhoneFallbackRow>({
      text: `
        SELECT
          fallback.request_id,
          fallback.phone_data_key_id,
          fallback.phone_data_nonce,
          fallback.phone_data_ciphertext,
          fallback.phone_data_auth_tag,
          fallback.obtained_at,
          fallback.expires_at,
          fallback.erased_at,
          EXISTS (
            SELECT 1
            FROM prospecting_app.contact_suppressions suppression
            WHERE suppression.organization_id = fallback.organization_id
              AND suppression.identity_kind = 'phone'
              AND suppression.identity_hmac = fallback.phone_hmac
              AND suppression.channel_scope IN ('all', 'phone')
              AND suppression.expires_at > $3
          ) AS suppressed
        FROM prospecting_app.contact_company_phone_fallbacks fallback
        WHERE fallback.organization_id = $1
          AND fallback.request_id = $2
      `,
      values: [input.organizationId, input.requestId, input.occurredAt],
    });

    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      requestId: input.requestId,
      actorCategory: input.actorSubject,
      eventType: "PREVIEW_READ",
      occurredAt: input.occurredAt,
    });

    return {
      request: mapPreviewRow(requestRow),
      candidates: candidates.map(mapCandidateRow),
      companyPhone:
        companyPhones[0] === undefined
          ? null
          : mapCompanyPhoneFallbackRow(companyPhones[0]),
    };
  });
}

export async function readCandidateForReveal(input: {
  readonly organizationId: string;
  readonly contactId: string;
  readonly now: Date;
  readonly channels: readonly ("work_email" | "business_phone")[];
}): Promise<StoredContactCandidate | null> {
  const rows = await query<CandidateRow>({
    text: `
      SELECT
        candidate.contact_id,
        candidate.request_id,
        candidate.provider_ref_hmac,
        candidate.provider_ref_key_id,
        candidate.provider_ref_nonce,
        candidate.provider_ref_ciphertext,
        candidate.provider_ref_auth_tag,
        candidate.profile_key_id,
        candidate.profile_nonce,
        candidate.profile_ciphertext,
        candidate.profile_auth_tag,
        candidate.can_reveal_work_email,
        candidate.can_reveal_business_phone,
        candidate.obtained_at,
        candidate.expires_at,
        candidate.suppressed_at,
        candidate.erased_at,
        record.channel_data_key_id,
        record.channel_data_nonce,
        record.channel_data_ciphertext,
        record.channel_data_auth_tag,
        record.work_email_hmacs,
        record.business_phone_hmacs,
        record.expires_at AS channel_expires_at,
        record.reveal_request_id AS channel_reveal_request_id,
        record.suppressed_at AS channel_suppressed_at,
        record.erased_at AS channel_erased_at
      FROM prospecting_app.contact_candidates candidate
      LEFT JOIN prospecting_app.contact_records record
        ON record.organization_id = candidate.organization_id
       AND record.contact_id = candidate.contact_id
      WHERE candidate.organization_id = $1
        AND candidate.contact_id = $2
        AND candidate.suppressed_at IS NULL
        AND candidate.erased_at IS NULL
        AND candidate.expires_at > $3
        AND NOT EXISTS (
          SELECT 1
          FROM prospecting_app.contact_suppressions suppression
          WHERE suppression.organization_id = candidate.organization_id
            AND suppression.identity_kind = 'provider'
            AND suppression.identity_hmac = candidate.provider_ref_hmac
            AND (
              suppression.channel_scope = 'all'
              OR (
                suppression.channel_scope = 'email'
                AND 'work_email' = ANY($4::text[])
              )
              OR (
                suppression.channel_scope = 'phone'
                AND 'business_phone' = ANY($4::text[])
              )
            )
            AND suppression.expires_at > $3
        )
    `,
    values: [
      input.organizationId,
      input.contactId,
      input.now,
      input.channels,
    ],
  });

  return rows[0] === undefined ? null : mapCandidateRow(rows[0]);
}

export async function readCandidateForRevealCallback(input: {
  readonly organizationId: string;
  readonly requestId: string;
  readonly revealRequestId: string;
}): Promise<StoredContactCandidate | null> {
  const rows = await query<CandidateRow>({
    text: `
      ${candidateSelectSql}
      WHERE candidate.organization_id = $1
        AND candidate.request_id = $2
        AND candidate.contact_id = (
          SELECT reveal.contact_id
          FROM prospecting_app.contact_reveal_requests reveal
          WHERE reveal.organization_id = $1
            AND reveal.request_id = $2
            AND reveal.reveal_request_id = $3
        )
    `,
    values: [input.organizationId, input.requestId, input.revealRequestId],
  });

  return rows[0] === undefined ? null : mapCandidateRow(rows[0]);
}

export type RevealStatus = ContactRevealStatus;

export interface RevealRecord {
  readonly revealRequestId: string;
  readonly organizationId: string;
  readonly requestId: string;
  readonly contactId: string;
  readonly status: RevealStatus;
  readonly resultSha256: string | null;
  readonly providerOccurredAt: Date | null;
}

interface RevealRow {
  readonly reveal_request_id: string;
  readonly organization_id: string;
  readonly request_id: string;
  readonly contact_id: string;
  readonly actor_subject: string;
  readonly idempotency_key_sha256: string;
  readonly input_sha256: string;
  readonly requested_channels: string[];
  readonly status: RevealStatus;
  readonly result_sha256: string | null;
  readonly requested_at: Date;
  readonly updated_at: Date;
  readonly provider_occurred_at: Date | null;
}

const revealColumns = `
  reveal_request_id,
  organization_id,
  request_id,
  contact_id,
  actor_subject,
  idempotency_key_sha256,
  input_sha256,
  requested_channels,
  status,
  result_sha256,
  requested_at,
  updated_at,
  provider_occurred_at
`;

export type RecordRevealIntentResult =
  | { readonly kind: "created"; readonly reveal: RevealRecord }
  | { readonly kind: "duplicate"; readonly reveal: RevealRecord }
  | { readonly kind: "conflict" };

export async function recordRevealIntent(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly requestId: string;
  readonly contactId: string;
  readonly idempotencyKeySha256: string;
  readonly inputSha256: string;
  readonly channels: readonly ("work_email" | "business_phone")[];
}): Promise<RecordRevealIntentResult> {
  return transaction(async (client) => {
    const revealRequestId = randomUUID();
    const inserted = await client.query<RevealRow>({
      text: `
        INSERT INTO prospecting_app.contact_reveal_requests (
          reveal_request_id,
          organization_id,
          request_id,
          contact_id,
          actor_subject,
          idempotency_key_sha256,
          input_sha256,
          requested_channels,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'REQUEST_RECORDED')
        ON CONFLICT (organization_id, idempotency_key_sha256) DO NOTHING
        RETURNING ${revealColumns}
      `,
      values: [
        revealRequestId,
        input.organizationId,
        input.requestId,
        input.contactId,
        input.actorSubject,
        input.idempotencyKeySha256,
        input.inputSha256,
        input.channels,
      ],
    });
    const insertedRow = inserted[0];

    if (insertedRow !== undefined) {
      await appendGovernanceEvent(client, {
        organizationId: input.organizationId,
        requestId: input.requestId,
        contactId: input.contactId,
        revealRequestId,
        actorCategory: input.actorSubject,
        eventType: "REVEAL_REQUEST_RECORDED",
        occurredAt: insertedRow.requested_at,
      });
      return { kind: "created", reveal: mapRevealRow(insertedRow) };
    }

    const existing = await client.query<RevealRow>({
      text: `
        SELECT ${revealColumns}
        FROM prospecting_app.contact_reveal_requests
        WHERE organization_id = $1 AND idempotency_key_sha256 = $2
      `,
      values: [input.organizationId, input.idempotencyKeySha256],
    });
    const row = existing[0];
    if (row === undefined || row.input_sha256 !== input.inputSha256) {
      return { kind: "conflict" };
    }

    return { kind: "duplicate", reveal: mapRevealRow(row) };
  });
}

export async function recordRevealDispatchOutcome(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly revealRequestId: string;
  readonly outcome: "acknowledged" | "unknown";
}): Promise<RevealRecord | null> {
  return transaction(async (client) => {
    const current = await lockRevealRequest(
      client,
      input.organizationId,
      input.revealRequestId,
    );
    if (current === null) return null;
    if (current.status !== "REQUEST_RECORDED") return current;

    const status: RevealStatus =
      input.outcome === "acknowledged"
        ? "REVEAL_DISPATCHED"
        : "DISPATCH_OUTCOME_UNKNOWN";
    const occurredAt = new Date();
    const updated = await client.query<RevealRow>({
      text: `
        UPDATE prospecting_app.contact_reveal_requests
        SET status = $3, updated_at = $4
        WHERE organization_id = $1 AND reveal_request_id = $2
        RETURNING ${revealColumns}
      `,
      values: [input.organizationId, input.revealRequestId, status, occurredAt],
    });
    const row = updated[0];
    if (row === undefined) return null;

    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      requestId: row.request_id,
      contactId: row.contact_id,
      revealRequestId: input.revealRequestId,
      actorCategory: input.actorSubject,
      eventType: "REVEAL_DISPATCH_RECORDED",
      occurredAt,
    });
    return mapRevealRow(row);
  });
}

export type RecordRevealResult =
  | { readonly kind: "recorded"; readonly reveal: RevealRecord }
  | { readonly kind: "replayed"; readonly reveal: RevealRecord }
  | { readonly kind: "conflict" }
  | { readonly kind: "not_found" };

export async function recordRevealResult(input: {
  readonly organizationId: string;
  readonly requestId: string;
  readonly revealRequestId: string;
  readonly providerRefHmac: string;
  readonly status:
    | "REVEAL_AVAILABLE"
    | "REVEAL_EMPTY"
    | "REVEAL_FAILED"
    | "PROVIDER_OUTCOME_UNKNOWN";
  readonly resultSha256: string;
  readonly occurredAt: Date;
  readonly expiresAt: Date | null;
  readonly encryptedChannels: EncryptedContactData | null;
  readonly encryptedProfileUpdate?: EncryptedContactData | null;
  readonly channels: NormalizedRevealedChannels;
  readonly workEmailHmacs: readonly string[];
  readonly businessPhoneHmacs: readonly string[];
  readonly dncPhoneHmacs: readonly string[];
}): Promise<RecordRevealResult> {
  return transaction(async (client) => {
    const current = await lockRevealRequest(
      client,
      input.organizationId,
      input.revealRequestId,
    );
    if (
      current === null ||
      current.requestId !== input.requestId
    ) {
      return { kind: "not_found" };
    }
    const candidates = await client.query<{
      readonly provider_ref_hmac: string;
    }>({
      text: `
        SELECT provider_ref_hmac
        FROM prospecting_app.contact_candidates
        WHERE organization_id = $1 AND contact_id = $2
        FOR SHARE
      `,
      values: [input.organizationId, current.contactId],
    });
    if (candidates[0]?.provider_ref_hmac !== input.providerRefHmac) {
      return { kind: "conflict" };
    }
    if (current.resultSha256 !== null) {
      return current.resultSha256 === input.resultSha256 &&
        current.providerOccurredAt?.getTime() === input.occurredAt.getTime()
        ? { kind: "replayed", reveal: current }
        : { kind: "conflict" };
    }

    if (input.encryptedProfileUpdate !== null && input.encryptedProfileUpdate !== undefined) {
      await client.query({
        text: `
          UPDATE prospecting_app.contact_candidates
          SET profile_key_id = $3,
              profile_nonce = $4,
              profile_ciphertext = $5,
              profile_auth_tag = $6
          WHERE organization_id = $1
            AND contact_id = $2
            AND suppressed_at IS NULL
            AND erased_at IS NULL
        `,
        values: [
          input.organizationId,
          current.contactId,
          input.encryptedProfileUpdate.keyId,
          input.encryptedProfileUpdate.nonce,
          input.encryptedProfileUpdate.ciphertext,
          input.encryptedProfileUpdate.authenticationTag,
        ],
      });
    }

    for (const phoneHmac of input.dncPhoneHmacs) {
      await upsertSuppression(client, {
        organizationId: input.organizationId,
        identityKind: "phone",
        identityHmac: phoneHmac,
        channelScope: "phone",
        reason: "DO_NOT_CALL",
        source: "LUSHA",
        actorCategory: "system:n8n-contact-reveal-v2",
        occurredAt: input.occurredAt,
      });
    }
    if (input.dncPhoneHmacs.length > 0) {
      await upsertSuppression(client, {
        organizationId: input.organizationId,
        identityKind: "provider",
        identityHmac: input.providerRefHmac,
        channelScope: "phone",
        reason: "DO_NOT_CALL",
        source: "LUSHA",
        actorCategory: "system:n8n-contact-reveal-v2",
        occurredAt: input.occurredAt,
      });
    }

    const activeSuppressions = await client.query<{
      readonly identity_hmac: string;
    }>({
      text: `
        SELECT identity_hmac
        FROM prospecting_app.contact_suppressions
        WHERE organization_id = $1
          AND expires_at > $2
          AND (
            (identity_kind = 'provider'
              AND identity_hmac = $3
              AND (
                channel_scope = 'all'
                OR (channel_scope = 'email' AND cardinality($4::text[]) > 0)
                OR (channel_scope = 'phone' AND cardinality($5::text[]) > 0)
              ))
            OR identity_hmac = ANY($4::text[])
            OR identity_hmac = ANY($5::text[])
          )
      `,
      values: [
        input.organizationId,
        input.occurredAt,
        input.providerRefHmac,
        input.workEmailHmacs,
        input.businessPhoneHmacs,
      ],
    });
    const suppressedHmacs = new Set(
      activeSuppressions.map((row) => row.identity_hmac),
    );
    const allowedEmailHmacs = input.workEmailHmacs;
    const allowedPhoneHmacs = input.businessPhoneHmacs;
    const hasAllowedChannels =
      suppressedHmacs.size === 0 &&
      input.dncPhoneHmacs.length === 0 &&
      (allowedEmailHmacs.length > 0 || allowedPhoneHmacs.length > 0);
    const effectiveStatus =
      input.status === "REVEAL_AVAILABLE" && !hasAllowedChannels
        ? "REVEAL_EMPTY"
        : input.status;

    if (
      effectiveStatus === "REVEAL_AVAILABLE" &&
      input.encryptedChannels !== null &&
      input.expiresAt !== null
    ) {
      await client.query({
        text: `
          INSERT INTO prospecting_app.contact_records (
            contact_record_id,
            organization_id,
            contact_id,
            reveal_request_id,
            channel_data_key_id,
            channel_data_nonce,
            channel_data_ciphertext,
            channel_data_auth_tag,
            work_email_hmacs,
            business_phone_hmacs,
            obtained_at,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (organization_id, contact_id) DO UPDATE
          SET reveal_request_id = EXCLUDED.reveal_request_id,
              channel_data_key_id = EXCLUDED.channel_data_key_id,
              channel_data_nonce = EXCLUDED.channel_data_nonce,
              channel_data_ciphertext = EXCLUDED.channel_data_ciphertext,
              channel_data_auth_tag = EXCLUDED.channel_data_auth_tag,
              work_email_hmacs = EXCLUDED.work_email_hmacs,
              business_phone_hmacs = EXCLUDED.business_phone_hmacs,
              obtained_at = EXCLUDED.obtained_at,
              expires_at = EXCLUDED.expires_at,
              suppressed_at = NULL,
              erased_at = NULL
        `,
        values: [
          randomUUID(),
          input.organizationId,
          current.contactId,
          input.revealRequestId,
          input.encryptedChannels.keyId,
          input.encryptedChannels.nonce,
          input.encryptedChannels.ciphertext,
          input.encryptedChannels.authenticationTag,
          allowedEmailHmacs,
          allowedPhoneHmacs,
          input.occurredAt,
          input.expiresAt,
        ],
      });
    }

    const updated = await client.query<RevealRow>({
      text: `
        UPDATE prospecting_app.contact_reveal_requests
        SET status = $3,
            result_sha256 = $4,
            provider_occurred_at = $5,
            updated_at = GREATEST(updated_at, $5)
        WHERE organization_id = $1 AND reveal_request_id = $2
        RETURNING ${revealColumns}
      `,
      values: [
        input.organizationId,
        input.revealRequestId,
        effectiveStatus,
        input.resultSha256,
        input.occurredAt,
      ],
    });
    const row = updated[0];
    if (row === undefined) return { kind: "not_found" };

    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      requestId: input.requestId,
      contactId: current.contactId,
      revealRequestId: input.revealRequestId,
      actorCategory: "system:n8n-contact-reveal-v2",
      eventType: "REVEAL_RESULT_RECORDED",
      occurredAt: input.occurredAt,
    });
    return { kind: "recorded", reveal: mapRevealRow(row) };
  });
}

export async function suppressContact(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly contactId: string;
  readonly scope: "all" | "email" | "phone";
  readonly reason:
    | "DATA_SUBJECT_OPT_OUT"
    | "DATA_SUBJECT_OBJECTION"
    | "DO_NOT_CALL"
    | "RIGHTS_ERASURE";
  readonly occurredAt: Date;
}): Promise<"recorded" | "not_found"> {
  return transaction(async (client) => {
    const rows = await client.query<CandidateRow>({
      // Lock only the required candidate row. PostgreSQL rejects an unqualified
      // FOR UPDATE when the query also has the nullable contact_records side.
      text: `${candidateSelectSql} FOR UPDATE OF candidate`,
      values: [input.organizationId, input.contactId],
    });
    const row = rows[0];
    if (row === undefined) return "not_found";

    await upsertSuppression(client, {
      organizationId: input.organizationId,
      identityKind: "provider",
      identityHmac: row.provider_ref_hmac,
      channelScope: input.scope,
      reason: input.reason,
      source: "PROSPECTA",
      actorCategory: input.actorSubject,
      occurredAt: input.occurredAt,
    });

    const channelHmacs =
      input.scope === "email"
        ? (row.work_email_hmacs ?? [])
        : input.scope === "phone"
          ? (row.business_phone_hmacs ?? [])
          : [
              ...(row.work_email_hmacs ?? []),
              ...(row.business_phone_hmacs ?? []),
            ];
    const identityKind = input.scope === "phone" ? "phone" : "email";
    for (const identityHmac of channelHmacs) {
      await upsertSuppression(client, {
        organizationId: input.organizationId,
        identityKind:
          input.scope === "all" &&
          (row.business_phone_hmacs ?? []).includes(identityHmac)
            ? "phone"
            : identityKind,
        identityHmac,
        channelScope: input.scope,
        reason: input.reason,
        source: "PROSPECTA",
        actorCategory: input.actorSubject,
        occurredAt: input.occurredAt,
      });
    }

    await client.query({
      text: `
        UPDATE prospecting_app.contact_records
        SET channel_data_key_id = NULL,
            channel_data_nonce = NULL,
            channel_data_ciphertext = NULL,
            channel_data_auth_tag = NULL,
            suppressed_at = $3,
            erased_at = $3
        WHERE organization_id = $1
          AND contact_id = $2
          AND erased_at IS NULL
      `,
      values: [input.organizationId, input.contactId, input.occurredAt],
    });

    if (input.scope === "all") {
      await client.query({
        text: `
          UPDATE prospecting_app.contact_candidates
          SET provider_ref_key_id = NULL,
              provider_ref_nonce = NULL,
              provider_ref_ciphertext = NULL,
              provider_ref_auth_tag = NULL,
              profile_key_id = NULL,
              profile_nonce = NULL,
              profile_ciphertext = NULL,
              profile_auth_tag = NULL,
              suppressed_at = $3,
              erased_at = $3
          WHERE organization_id = $1 AND contact_id = $2
        `,
        values: [input.organizationId, input.contactId, input.occurredAt],
      });
    } else {
      await client.query({
        text: `
          UPDATE prospecting_app.contact_candidates
          SET can_reveal_work_email = CASE
                WHEN $3 = 'email' THEN false
                ELSE can_reveal_work_email
              END,
              can_reveal_business_phone = CASE
                WHEN $3 = 'phone' THEN false
                ELSE can_reveal_business_phone
              END
          WHERE organization_id = $1 AND contact_id = $2
        `,
        values: [input.organizationId, input.contactId, input.scope],
      });
    }

    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      requestId: row.request_id,
      contactId: input.contactId,
      actorCategory: input.actorSubject,
      eventType: "SUPPRESSION_RECORDED",
      occurredAt: input.occurredAt,
    });
    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      requestId: row.request_id,
      contactId: input.contactId,
      actorCategory: input.actorSubject,
      eventType: "CONTACT_ERASED",
      occurredAt: input.occurredAt,
    });
    return "recorded";
  });
}

export async function eraseExpiredContactData(input: {
  readonly organizationId: string;
  readonly occurredAt: Date;
}): Promise<{
  readonly candidates: number;
  readonly records: number;
  readonly companyPhones: number;
  readonly suppressions: number;
}> {
  return transaction(async (client) => {
    const candidates = await client.query<{
      readonly contact_id: string;
      readonly request_id: string;
    }>({
      text: `
        UPDATE prospecting_app.contact_candidates
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
        RETURNING contact_id, request_id
      `,
      values: [input.organizationId, input.occurredAt],
    });
    const records = await client.query<{
      readonly contact_id: string;
    }>({
      text: `
        UPDATE prospecting_app.contact_records
        SET channel_data_key_id = NULL,
            channel_data_nonce = NULL,
            channel_data_ciphertext = NULL,
            channel_data_auth_tag = NULL,
            erased_at = $2
        WHERE organization_id = $1
          AND erased_at IS NULL
          AND expires_at <= $2
        RETURNING contact_id
      `,
      values: [input.organizationId, input.occurredAt],
    });
    const companyPhones = await client.query<{
      readonly request_id: string;
    }>({
      text: `
        UPDATE prospecting_app.contact_company_phone_fallbacks
        SET phone_data_key_id = NULL,
            phone_data_nonce = NULL,
            phone_data_ciphertext = NULL,
            phone_data_auth_tag = NULL,
            erased_at = $2
        WHERE organization_id = $1
          AND erased_at IS NULL
          AND expires_at <= $2
        RETURNING request_id
      `,
      values: [input.organizationId, input.occurredAt],
    });

    const requestByContact = new Map(
      candidates.map((candidate) => [
        candidate.contact_id,
        candidate.request_id,
      ]),
    );
    for (const contactId of new Set([
      ...candidates.map((row) => row.contact_id),
      ...records.map((row) => row.contact_id),
    ])) {
      await appendGovernanceEvent(client, {
        organizationId: input.organizationId,
        requestId: requestByContact.get(contactId),
        contactId,
        actorCategory: "system:contact-retention-v2",
        eventType: "CONTACT_ERASED",
        occurredAt: input.occurredAt,
      });
    }
    for (const companyPhone of companyPhones) {
      await appendGovernanceEvent(client, {
        organizationId: input.organizationId,
        requestId: companyPhone.request_id,
        actorCategory: "system:contact-retention-v2",
        eventType: "CONTACT_ERASED",
        occurredAt: input.occurredAt,
      });
    }

    const suppressions = await client.query<{ readonly suppression_id: string }>({
      text: `
        DELETE FROM prospecting_app.contact_suppressions
        WHERE organization_id = $1 AND expires_at <= $2
        RETURNING suppression_id
      `,
      values: [input.organizationId, input.occurredAt],
    });

    return {
      candidates: candidates.length,
      records: records.length,
      companyPhones: companyPhones.length,
      suppressions: suppressions.length,
    };
  });
}

export async function recordContactRightsRequest(input: {
  readonly organizationId: string;
  readonly actorSubject: string;
  readonly subjectReferenceHmac: string;
  readonly requestType:
    | "CONFIRMATION"
    | "ACCESS"
    | "CORRECTION"
    | "SOURCE_INFORMATION"
    | "OPPOSITION"
    | "BLOCK"
    | "DELETION";
  readonly occurredAt: Date;
}): Promise<string> {
  return transaction(async (client) => {
    const rightsRequestId = randomUUID();
    const dueAt = new Date(
      input.occurredAt.getTime() + 15 * 24 * 60 * 60 * 1_000,
    );
    await client.query({
      text: `
        INSERT INTO prospecting_app.contact_rights_requests (
          rights_request_id,
          organization_id,
          subject_reference_hmac,
          request_type,
          status,
          actor_category,
          received_at,
          due_at
        )
        VALUES ($1, $2, $3, $4, 'VERIFIED', $5, $6, $7)
      `,
      values: [
        rightsRequestId,
        input.organizationId,
        input.subjectReferenceHmac,
        input.requestType,
        input.actorSubject,
        input.occurredAt,
        dueAt,
      ],
    });
    await appendGovernanceEvent(client, {
      organizationId: input.organizationId,
      rightsRequestId,
      actorCategory: input.actorSubject,
      eventType: "RIGHTS_REQUEST_RECORDED",
      occurredAt: input.occurredAt,
    });
    return rightsRequestId;
  });
}

const candidateSelectSql = `
  SELECT
    candidate.contact_id,
    candidate.request_id,
    candidate.provider_ref_hmac,
    candidate.provider_ref_key_id,
    candidate.provider_ref_nonce,
    candidate.provider_ref_ciphertext,
    candidate.provider_ref_auth_tag,
    candidate.profile_key_id,
    candidate.profile_nonce,
    candidate.profile_ciphertext,
    candidate.profile_auth_tag,
    candidate.can_reveal_work_email,
    candidate.can_reveal_business_phone,
    candidate.obtained_at,
    candidate.expires_at,
    candidate.suppressed_at,
    candidate.erased_at,
    record.channel_data_key_id,
    record.channel_data_nonce,
    record.channel_data_ciphertext,
    record.channel_data_auth_tag,
    record.work_email_hmacs,
    record.business_phone_hmacs,
    record.expires_at AS channel_expires_at,
    record.reveal_request_id AS channel_reveal_request_id,
    record.suppressed_at AS channel_suppressed_at,
    record.erased_at AS channel_erased_at
  FROM prospecting_app.contact_candidates candidate
  LEFT JOIN prospecting_app.contact_records record
    ON record.organization_id = candidate.organization_id
   AND record.contact_id = candidate.contact_id
  WHERE candidate.organization_id = $1 AND candidate.contact_id = $2
`;

async function lockPreviewRequest(
  client: AppDatabaseTransaction,
  organizationId: string,
  requestId: string,
): Promise<ContactPreviewRecord | null> {
  const rows = await client.query<ContactPreviewRow>({
    text: `
      SELECT ${previewColumns}
      FROM prospecting_app.contact_enrichment_v2_requests
      WHERE organization_id = $1 AND request_id = $2
      FOR UPDATE
    `,
    values: [organizationId, requestId],
  });
  return rows[0] === undefined ? null : mapPreviewRow(rows[0]);
}

async function lockRevealRequest(
  client: AppDatabaseTransaction,
  organizationId: string,
  revealRequestId: string,
): Promise<RevealRecord | null> {
  const rows = await client.query<RevealRow>({
    text: `
      SELECT ${revealColumns}
      FROM prospecting_app.contact_reveal_requests
      WHERE organization_id = $1 AND reveal_request_id = $2
      FOR UPDATE
    `,
    values: [organizationId, revealRequestId],
  });
  return rows[0] === undefined ? null : mapRevealRow(rows[0]);
}

async function upsertSuppression(
  client: AppDatabaseTransaction,
  input: {
    readonly organizationId: string;
    readonly identityKind: "provider" | "email" | "phone";
    readonly identityHmac: string;
    readonly channelScope: "all" | "email" | "phone";
    readonly reason:
      | "DATA_SUBJECT_OPT_OUT"
      | "DATA_SUBJECT_OBJECTION"
      | "DO_NOT_CALL"
      | "RIGHTS_ERASURE";
    readonly source: "PROSPECTA" | "LUSHA";
    readonly actorCategory: string;
    readonly occurredAt: Date;
  },
): Promise<void> {
  const expiresAt = new Date(
    input.occurredAt.getTime() + 1_825 * 24 * 60 * 60 * 1_000,
  );
  await client.query({
    text: `
      INSERT INTO prospecting_app.contact_suppressions (
        suppression_id,
        organization_id,
        identity_kind,
        identity_hmac,
        channel_scope,
        reason,
        source,
        actor_category,
        created_at,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (
        organization_id,
        identity_kind,
        identity_hmac,
        channel_scope
      ) DO UPDATE
      SET reason = EXCLUDED.reason,
          source = EXCLUDED.source,
          actor_category = EXCLUDED.actor_category,
          created_at = EXCLUDED.created_at,
          expires_at = EXCLUDED.expires_at
    `,
    values: [
      randomUUID(),
      input.organizationId,
      input.identityKind,
      input.identityHmac,
      input.channelScope,
      input.reason,
      input.source,
      input.actorCategory,
      input.occurredAt,
      expiresAt,
    ],
  });
}

async function appendGovernanceEvent(
  client: AppDatabaseTransaction,
  input: {
    readonly organizationId: string;
    readonly requestId?: string;
    readonly contactId?: string;
    readonly revealRequestId?: string;
    readonly rightsRequestId?: string;
    readonly actorCategory: string;
    readonly eventType: string;
    readonly occurredAt: Date;
  },
): Promise<void> {
  await client.query({
    text: `
      INSERT INTO prospecting_app.contact_governance_events (
        event_id,
        organization_id,
        request_id,
        contact_id,
        reveal_request_id,
        rights_request_id,
        actor_category,
        event_type,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    values: [
      randomUUID(),
      input.organizationId,
      input.requestId ?? null,
      input.contactId ?? null,
      input.revealRequestId ?? null,
      input.rightsRequestId ?? null,
      input.actorCategory,
      input.eventType,
      input.occurredAt,
    ],
  });
}

function mapPreviewRow(row: ContactPreviewRow): ContactPreviewRecord {
  return {
    requestId: row.request_id,
    organizationId: row.organization_id,
    actorSubject: row.actor_subject,
    cnpjNormalizado: row.cnpj_normalizado,
    companyDomain: row.company_domain,
    companyMatchId: row.company_match_id,
    status: row.status,
    resultSha256: row.result_sha256,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    providerOccurredAt: row.provider_occurred_at,
    previewExpiresAt: row.preview_expires_at,
    searchDiagnostics: row.search_diagnostics == null
      ? null
      : contactSearchDiagnosticsSchema.parse(row.search_diagnostics),
  };
}

function mapRevealRow(row: RevealRow): RevealRecord {
  return {
    revealRequestId: row.reveal_request_id,
    organizationId: row.organization_id,
    requestId: row.request_id,
    contactId: row.contact_id,
    status: row.status,
    resultSha256: row.result_sha256,
    providerOccurredAt: row.provider_occurred_at,
  };
}

function mapCandidateRow(row: CandidateRow): StoredContactCandidate {
  return {
    contactId: row.contact_id,
    requestId: row.request_id,
    providerRefHmac: row.provider_ref_hmac,
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
    canRevealWorkEmail: row.can_reveal_work_email,
    canRevealBusinessPhone: row.can_reveal_business_phone,
    obtainedAt: row.obtained_at,
    expiresAt: row.expires_at,
    suppressedAt: row.suppressed_at,
    erasedAt: row.erased_at,
    encryptedChannels: encryptedFromRow(
      row.channel_data_key_id,
      row.channel_data_nonce,
      row.channel_data_ciphertext,
      row.channel_data_auth_tag,
    ),
    workEmailHmacs: row.work_email_hmacs ?? [],
    businessPhoneHmacs: row.business_phone_hmacs ?? [],
    channelExpiresAt: row.channel_expires_at,
    channelRevealRequestId: row.channel_reveal_request_id,
    channelSuppressedAt: row.channel_suppressed_at,
    channelErasedAt: row.channel_erased_at,
    reveal: row.latest_reveal_request_id && row.latest_reveal_status &&
      row.latest_requested_channels && row.latest_reveal_requested_at && row.latest_reveal_updated_at
      ? {
          revealRequestId: row.latest_reveal_request_id,
          status: row.latest_reveal_status,
          requestedChannels: row.latest_requested_channels,
          channelsMatchResult: row.channel_reveal_request_id === row.latest_reveal_request_id,
          requestedAt: row.latest_reveal_requested_at.toISOString(),
          updatedAt: row.latest_reveal_updated_at.toISOString(),
        }
      : null,
  };
}

function mapCompanyPhoneFallbackRow(
  row: CompanyPhoneFallbackRow,
): StoredCompanyPhoneFallback {
  return {
    requestId: row.request_id,
    encryptedPhone: encryptedFromRow(
      row.phone_data_key_id,
      row.phone_data_nonce,
      row.phone_data_ciphertext,
      row.phone_data_auth_tag,
    ),
    obtainedAt: row.obtained_at,
    expiresAt: row.expires_at,
    erasedAt: row.erased_at,
    suppressed: row.suppressed,
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

// Keep the type imported in this repository to make the stored normalized
// profile contract explicit even though encryption happens in the service.
export type StoredNormalizedContactProfile = NormalizedContactProfile;
