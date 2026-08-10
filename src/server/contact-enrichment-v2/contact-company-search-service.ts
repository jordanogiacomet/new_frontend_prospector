import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  ContactCompanyMatchDto,
  ContactCompanySearchRequestDto,
} from "../../types/contact-enrichment";
import type { AuthorizedActor } from "../auth";
import type { ParsedServerEnv } from "../env";
import {
  CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
  contactCompanySearchCallbackSchema,
  type ContactCompanySearchCallback,
  type ContactCompanySearchRequest,
} from "./contact-enrichment-v2-contract";
import {
  createContactDataKeyMaterial,
  decryptContactJson,
  encryptContactJson,
  type ContactDataKeyMaterial,
} from "./contact-data-crypto";
import { dispatchContactCompanySearch } from "./contact-enrichment-v2-client";
import {
  eraseExpiredCompanyMatches,
  readCompanyMatchForPreview,
  readCompanySearchRequest,
  recordCompanySearchDispatchOutcome,
  recordCompanySearchIntent,
  recordCompanySearchResult,
  type ContactCompanySearchRecord,
  type PreparedCompanyMatch,
} from "./contact-company-search-repository";

export const CONTACT_COMPANY_MATCH_RETENTION_HOURS = 24 as const;

const normalizedCompanyProfileSchema = z.strictObject({
  companyName: z.string().min(1).max(200),
  companyDomain: z.string().max(253).nullable(),
  industry: z.string().max(200).nullable(),
  location: z.strictObject({
    city: z.string().max(100).nullable(),
    state: z.string().max(100).nullable(),
    country: z.string().max(100).nullable(),
  }),
});

type NormalizedCompanyProfile = z.infer<
  typeof normalizedCompanyProfileSchema
>;

export type SubmitCompanySearchResult =
  | {
      readonly kind: "created" | "duplicate";
      readonly request: ContactCompanySearchRecord;
    }
  | { readonly kind: "conflict" };

export async function submitContactCompanySearch(
  input: {
    readonly actor: AuthorizedActor;
    readonly idempotencyKey: string;
    readonly request: ContactCompanySearchRequest;
  },
  environment: ParsedServerEnv,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<SubmitCompanySearchResult> {
  const configuration = requireV2Configuration(environment);
  const normalizedRequest = {
    cnpj_normalizado: input.request.cnpj_normalizado,
    company_name: normalizeCompanyName(input.request.company_name),
    company_city: normalizeOptionalCompanyText(input.request.company_city),
    company_state: normalizeCompanyState(input.request.company_state),
    company_country_iso2: input.request.company_country_iso2,
  };
  const intent = await recordCompanySearchIntent({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    cnpjNormalizado: normalizedRequest.cnpj_normalizado,
    idempotencyKeySha256: sha256(input.idempotencyKey),
    inputSha256: canonicalSha256(normalizedRequest),
  });
  if (intent.kind !== "created") return intent;

  const dispatch = await dispatchContactCompanySearch(
    {
      contract_version: CONTACT_COMPANY_SEARCH_CONTRACT_VERSION,
      action: "COMPANY_SEARCH",
      search_request_id: intent.request.searchRequestId,
      idempotency_key: input.idempotencyKey,
      ...normalizedRequest,
    },
    configuration,
    fetchImplementation,
  );
  const request = await recordCompanySearchDispatchOutcome({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    searchRequestId: intent.request.searchRequestId,
    outcome: dispatch.kind,
  });
  return { kind: "created", request: request ?? intent.request };
}

export async function processCompanySearchCallback(
  body: unknown,
  environment: ParsedServerEnv,
): Promise<Awaited<ReturnType<typeof recordCompanySearchResult>>> {
  const callback = contactCompanySearchCallbackSchema.parse(body);
  const keys = requireContactKeys(environment);
  const occurredAt = new Date(callback.occurred_at);
  const expiresAt =
    callback.status === "SEARCH_AVAILABLE"
      ? addHours(occurredAt, CONTACT_COMPANY_MATCH_RETENTION_HOURS)
      : null;
  const matches = callback.matches.map((match, index) =>
    prepareCompanyMatch(
      environment.AUTH_ALLOWED_ORG_ID,
      callback.search_request_id,
      {
        providerCompanyId: match.provider_company_id,
        profile: {
          companyName: match.company_name,
          companyDomain: match.company_domain,
          industry: match.industry,
          location: match.location,
        },
      },
      index + 1,
      keys,
    ),
  );

  return recordCompanySearchResult({
    organizationId: environment.AUTH_ALLOWED_ORG_ID,
    searchRequestId: callback.search_request_id,
    status: callback.status,
    resultSha256: canonicalSha256(callback),
    occurredAt,
    expiresAt,
    matches,
  });
}

export async function getContactCompanySearch(
  input: {
    readonly actor: AuthorizedActor;
    readonly searchRequestId: string;
    readonly now?: Date;
  },
  environment: ParsedServerEnv,
): Promise<ContactCompanySearchRequestDto | null> {
  const now = input.now ?? new Date();
  const stored = await readCompanySearchRequest({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    searchRequestId: input.searchRequestId,
    occurredAt: now,
  });
  if (stored === null) return null;

  const keys = requireContactKeys(environment);
  const expired =
    stored.request.matchesExpiresAt !== null &&
    stored.request.matchesExpiresAt.getTime() <= now.getTime();
  const matches: ContactCompanyMatchDto[] = [];
  if (!expired) {
    for (const match of stored.matches) {
      if (
        match.erasedAt !== null ||
        match.expiresAt.getTime() <= now.getTime() ||
        match.encryptedProfile === null
      ) {
        continue;
      }
      const profile = normalizedCompanyProfileSchema.parse(
        decryptContactJson(
          match.encryptedProfile,
          companyProfileAad(
            input.actor.organizationId,
            match.searchRequestId,
            match.companyMatchId,
          ),
          keys,
        ),
      );
      matches.push({
        companyMatchId: match.companyMatchId,
        ...profile,
        source: "LUSHA",
        obtainedAt: match.obtainedAt.toISOString(),
        expiresAt: match.expiresAt.toISOString(),
      });
    }
  }

  return {
    searchRequestId: stored.request.searchRequestId,
    status: expired ? "SEARCH_EXPIRED" : stored.request.status,
    requestedAt: stored.request.requestedAt.toISOString(),
    updatedAt: stored.request.updatedAt.toISOString(),
    matchesExpiresAt:
      stored.request.matchesExpiresAt?.toISOString() ?? null,
    matches,
  };
}

export async function resolveCompanyMatchSelection(
  input: {
    readonly actor: AuthorizedActor;
    readonly cnpjNormalizado: string;
    readonly companyMatchId: string;
    readonly now?: Date;
  },
  environment: ParsedServerEnv,
): Promise<{
  readonly providerCompanyId: string;
  readonly searchRequestId: string;
} | null> {
  const stored = await readCompanyMatchForPreview({
    organizationId: input.actor.organizationId,
    cnpjNormalizado: input.cnpjNormalizado,
    companyMatchId: input.companyMatchId,
    now: input.now ?? new Date(),
  });
  if (stored?.encryptedProviderRef === null || stored === null) return null;

  const providerCompanyId = z.string().min(1).max(256).parse(
    decryptContactJson(
      stored.encryptedProviderRef,
      companyProviderAad(
        input.actor.organizationId,
        stored.searchRequestId,
        stored.companyMatchId,
      ),
      requireContactKeys(environment),
    ),
  );
  return { providerCompanyId, searchRequestId: stored.searchRequestId };
}

export async function applyCompanyMatchRetention(
  actor: AuthorizedActor,
  occurredAt = new Date(),
): Promise<number> {
  return eraseExpiredCompanyMatches({
    organizationId: actor.organizationId,
    occurredAt,
  });
}

function prepareCompanyMatch(
  organizationId: string,
  searchRequestId: string,
  match: {
    readonly providerCompanyId: string;
    readonly profile: NormalizedCompanyProfile;
  },
  listPosition: number,
  keys: ContactDataKeyMaterial,
): PreparedCompanyMatch {
  const companyMatchId = randomUUID();
  return {
    companyMatchId,
    encryptedProviderRef: encryptContactJson(
      match.providerCompanyId,
      companyProviderAad(
        organizationId,
        searchRequestId,
        companyMatchId,
      ),
      keys,
    ),
    encryptedProfile: encryptContactJson(
      match.profile,
      companyProfileAad(
        organizationId,
        searchRequestId,
        companyMatchId,
      ),
      keys,
    ),
    listPosition,
  };
}

function requireV2Configuration(environment: ParsedServerEnv) {
  if (
    !environment.FEATURE_CONTACT_DATA_ENABLED ||
    environment.N8N_CONTACT_ENRICHMENT_V2_URL === undefined ||
    environment.N8N_CONTACT_ENRICHMENT_V2_SECRET === undefined
  ) {
    throw new Error("Contact data integration is disabled.");
  }
  return {
    url: environment.N8N_CONTACT_ENRICHMENT_V2_URL,
    secret: environment.N8N_CONTACT_ENRICHMENT_V2_SECRET,
    timeoutMs: environment.CONTACT_ENRICHMENT_TIMEOUT_MS,
  };
}

function requireContactKeys(
  environment: ParsedServerEnv,
): ContactDataKeyMaterial {
  if (
    !environment.FEATURE_CONTACT_DATA_ENABLED ||
    environment.CONTACT_DATA_ENCRYPTION_KEY_BASE64 === undefined ||
    environment.CONTACT_DATA_ENCRYPTION_KEY_ID === undefined ||
    environment.CONTACT_SUPPRESSION_HMAC_KEY === undefined
  ) {
    throw new Error("Contact data policy is disabled.");
  }
  return createContactDataKeyMaterial({
    keyId: environment.CONTACT_DATA_ENCRYPTION_KEY_ID,
    encryptionKeyBase64: environment.CONTACT_DATA_ENCRYPTION_KEY_BASE64,
    suppressionKey: environment.CONTACT_SUPPRESSION_HMAC_KEY,
  });
}

function normalizeCompanyName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeOptionalCompanyText(value: string | null): string | null {
  return value === null ? null : normalizeCompanyName(value);
}

function normalizeCompanyState(value: string | null): string | null {
  return value === null ? null : value.toUpperCase();
}

function canonicalSha256(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function addHours(value: Date, hours: number): Date {
  return new Date(value.getTime() + hours * 60 * 60 * 1_000);
}

function companyProviderAad(
  organizationId: string,
  searchRequestId: string,
  companyMatchId: string,
): string {
  return `company-provider:${organizationId}:${searchRequestId}:${companyMatchId}`;
}

function companyProfileAad(
  organizationId: string,
  searchRequestId: string,
  companyMatchId: string,
): string {
  return `company-profile:${organizationId}:${searchRequestId}:${companyMatchId}`;
}

export type ValidatedContactCompanySearchCallback =
  ContactCompanySearchCallback;
