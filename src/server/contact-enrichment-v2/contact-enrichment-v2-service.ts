import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import type { AuthorizedActor } from "../auth";
import type { ParsedServerEnv } from "../env";
import {
  CONTACT_PREVIEW_BY_COMPANY_ID_CONTRACT_VERSION,
  CONTACT_PREVIEW_CONTRACT_VERSION,
  CONTACT_REVEAL_CONTRACT_VERSION,
  contactPreviewCallbackSchema,
  contactRevealCallbackSchema,
  type ContactPreviewCallback,
  type ContactPreviewRequest,
  type ContactRevealCallback,
  type ContactRevealRequest,
} from "./contact-enrichment-v2-contract";
import {
  createContactDataKeyMaterial,
  decryptContactJson,
  encryptContactJson,
  contactSuppressionFingerprint,
  type ContactDataKeyMaterial,
  type EncryptedContactData,
} from "./contact-data-crypto";
import {
  CONTACT_PREVIEW_RETENTION_DAYS,
  CONTACT_REVEAL_RETENTION_DAYS,
  candidateToDto,
  contactTransparency,
  normalizeCompanyPhoneFallback,
  normalizeContactCandidates,
  normalizeContactProfileUpdate,
  normalizeRevealedChannels,
  type NormalizedContactCandidate,
  type NormalizedCompanyPhoneFallback,
  type NormalizedContactProfile,
  type NormalizedRevealedChannels,
} from "./contact-data-policy";
import {
  dispatchContactPreview,
  dispatchContactPreviewByCompanyId,
  dispatchContactReveal,
} from "./contact-enrichment-v2-client";
import {
  applyCompanyMatchRetention,
  resolveCompanyMatchSelection,
} from "./contact-company-search-service";
import {
  createProviderReference,
  parseProviderReference,
  providerIdentityValue,
  type ContactProviderSource,
} from "./contact-provider-reference";
import {
  eraseExpiredContactData,
  readCandidateForReveal,
  readCandidateForRevealCallback,
  readPreviewRequest,
  recordPreviewDispatchOutcome,
  recordPreviewIntent,
  recordPreviewResult,
  recordRevealDispatchOutcome,
  recordRevealIntent,
  recordRevealResult,
  recordContactRightsRequest,
  suppressContact,
  type ContactPreviewRecord,
  type PreparedContactCandidate,
  type PreparedCompanyPhoneFallback,
  type RevealRecord,
} from "./contact-enrichment-v2-repository";
import type {
  ContactCandidateDto,
  ContactPreviewRequestDto,
} from "../../types/contact-enrichment";

const normalizedCandidateSchema = z.strictObject({
  fullName: z.string(),
  jobTitle: z.string().nullable(),
  departments: z.array(z.string()),
  seniority: z.string().nullable(),
  location: z.strictObject({
    city: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
  }),
  linkedinUrl: z.string().nullable(),
  canRevealWorkEmail: z.boolean(),
  canRevealBusinessPhone: z.boolean(),
});

const normalizedChannelsSchema = z.strictObject({
  workEmails: z.array(
    z.strictObject({
      value: z.email(),
      confidence: z.string().nullable(),
      sourceUpdatedAt: z.string().nullable(),
    }),
  ),
  businessPhones: z.array(
    z.strictObject({
      value: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
      type: z.enum(["work", "direct"]),
      sourceUpdatedAt: z.string().nullable(),
    }),
  ),
});

const normalizedCompanyPhoneSchema = z.strictObject({
  value: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  source: z.literal("APOLLO"),
  contactability: z.literal("UNKNOWN"),
});

export type SubmitPreviewResult =
  | {
      readonly kind: "created" | "duplicate";
      readonly request: ContactPreviewRecord;
    }
  | { readonly kind: "conflict" }
  | { readonly kind: "unavailable" };

export async function submitContactPreview(
  input: {
    readonly actor: AuthorizedActor;
    readonly idempotencyKey: string;
    readonly request: ContactPreviewRequest;
  },
  environment: ParsedServerEnv,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<SubmitPreviewResult> {
  const configuration = requireV2Configuration(environment);
  const inputSha256 = canonicalSha256(input.request);
  const idempotencyKeySha256 = sha256(input.idempotencyKey);
  const usesDomain = "company_domain" in input.request;
  const selectedCompany = usesDomain
    ? null
    : await resolveCompanyMatchSelection(
        {
          actor: input.actor,
          cnpjNormalizado: input.request.cnpj_normalizado,
          companyMatchId: input.request.company_match_id,
        },
        environment,
      );
  if (!usesDomain && selectedCompany === null) {
    return { kind: "unavailable" };
  }
  const intent = await recordPreviewIntent({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    cnpjNormalizado: input.request.cnpj_normalizado,
    companyDomain: usesDomain ? input.request.company_domain : null,
    companyMatchId: usesDomain ? null : input.request.company_match_id,
    idempotencyKeySha256,
    inputSha256,
  });

  if (intent.kind !== "created") return intent;

  const commonRequest = {
    request_id: intent.request.requestId,
    idempotency_key: input.idempotencyKey,
    cnpj_normalizado: input.request.cnpj_normalizado,
  };
  let dispatch;
  if (usesDomain) {
    dispatch = await dispatchContactPreview(
        {
          contract_version: CONTACT_PREVIEW_CONTRACT_VERSION,
          action: "PREVIEW",
          ...commonRequest,
          company_domain: input.request.company_domain,
        },
        configuration,
        fetchImplementation,
      );
  } else {
    if (selectedCompany === null) return { kind: "unavailable" };
    dispatch = await dispatchContactPreviewByCompanyId(
        {
          contract_version:
            CONTACT_PREVIEW_BY_COMPANY_ID_CONTRACT_VERSION,
          action: "PREVIEW_BY_COMPANY_ID",
          ...commonRequest,
          provider_company_id: selectedCompany.providerCompanyId,
          fallback_company_domain: selectedCompany.companyDomain,
        },
        configuration,
        fetchImplementation,
      );
  }
  const request = await recordPreviewDispatchOutcome({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    requestId: intent.request.requestId,
    outcome: dispatch.kind,
  });

  return { kind: "created", request: request ?? intent.request };
}

export async function processPreviewCallback(
  body: unknown,
  environment: ParsedServerEnv,
): Promise<Awaited<ReturnType<typeof recordPreviewResult>>> {
  const callback = contactPreviewCallbackSchema.parse(body);
  const keys = requireContactKeys(environment);
  const candidates = normalizeContactCandidates(callback);
  const companyPhone = normalizeCompanyPhoneFallback(callback);
  const occurredAt = new Date(callback.occurred_at);
  const expiresAt =
    callback.status === "PREVIEW_AVAILABLE"
      ? addDays(occurredAt, CONTACT_PREVIEW_RETENTION_DAYS)
      : null;
  const prepared = candidates.map((candidate, index) =>
    prepareCandidate(
      environment.AUTH_ALLOWED_ORG_ID,
      callback.request_id,
      candidate,
      index + 1,
      keys,
    ),
  );

  return recordPreviewResult({
    organizationId: environment.AUTH_ALLOWED_ORG_ID,
    requestId: callback.request_id,
    status: callback.status,
    searchDiagnostics: callback.search_diagnostics ?? null,
    resultSha256: canonicalSha256(callback),
    occurredAt,
    expiresAt,
    candidates: prepared,
    companyPhone:
      companyPhone === null
        ? null
        : prepareCompanyPhone(
            environment.AUTH_ALLOWED_ORG_ID,
            callback.request_id,
            companyPhone,
            keys,
          ),
  });
}

export async function getContactPreview(
  input: {
    readonly actor: AuthorizedActor;
    readonly requestId: string;
    readonly now?: Date;
  },
  environment: ParsedServerEnv,
): Promise<ContactPreviewRequestDto | null> {
  const now = input.now ?? new Date();
  const stored = await readPreviewRequest({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    requestId: input.requestId,
    occurredAt: now,
  });
  if (stored === null) return null;

  const transparency = contactTransparency(environment);
  const keys = requireContactKeys(environment);
  const candidates: ContactCandidateDto[] = [];
  let companyPhoneFallback: ContactPreviewRequestDto["companyPhoneFallback"] =
    null;

  if (transparency !== null) {
    for (const storedCandidate of stored.candidates) {
      const suppressed =
        storedCandidate.suppressedAt !== null ||
        storedCandidate.erasedAt !== null;
      const expired = storedCandidate.expiresAt.getTime() <= now.getTime();
      let candidate: NormalizedContactProfile = unavailableCandidate();
      let providerSource: ContactProviderSource = "LUSHA";

      if (!suppressed && !expired && storedCandidate.encryptedProfile !== null) {
        candidate = normalizedCandidateSchema.parse(
          decryptContactJson(
            storedCandidate.encryptedProfile,
            candidateProfileAad(
              input.actor.organizationId,
              stored.request.requestId,
              storedCandidate.contactId,
            ),
            keys,
          ),
        );
        if (storedCandidate.encryptedProviderRef !== null) {
          providerSource = parseProviderReference(
            decryptContactJson(
              storedCandidate.encryptedProviderRef,
              candidateProviderAad(
                input.actor.organizationId,
                stored.request.requestId,
                storedCandidate.contactId,
              ),
              keys,
            ),
          ).source;
        }
      }

      let channels: ContactCandidateDto["channels"] = null;
      if (
        !suppressed &&
        !expired &&
        storedCandidate.encryptedChannels !== null &&
        storedCandidate.channelRevealRequestId !== null &&
        storedCandidate.channelExpiresAt !== null &&
        storedCandidate.channelExpiresAt.getTime() > now.getTime() &&
        storedCandidate.channelSuppressedAt === null &&
        storedCandidate.channelErasedAt === null
      ) {
        channels = normalizedChannelsSchema.parse(
          decryptContactJson(
            storedCandidate.encryptedChannels,
            contactChannelsAad(
              input.actor.organizationId,
              storedCandidate.channelRevealRequestId,
            ),
            keys,
          ),
        );
      }

      candidates.push(
        { ...candidateToDto({
          contactId: storedCandidate.contactId,
          candidate,
          obtainedAt: storedCandidate.obtainedAt,
          expiresAt: storedCandidate.expiresAt,
          now,
          suppressed,
          channels,
          source: providerSource,
        }), reveal: storedCandidate.reveal ? {
          revealRequestId: storedCandidate.reveal.revealRequestId,
          status: storedCandidate.reveal.status,
          requestedChannels: storedCandidate.reveal.requestedChannels,
          requestedAt: storedCandidate.reveal.requestedAt,
          updatedAt: storedCandidate.reveal.updatedAt,
          channelsMatchResult: storedCandidate.reveal.channelsMatchResult,
        } : null },
      );
    }

    if (stored.companyPhone !== null) {
      const expired = stored.companyPhone.expiresAt.getTime() <= now.getTime();
      const unavailable =
        stored.companyPhone.suppressed ||
        stored.companyPhone.erasedAt !== null ||
        expired;
      let phoneValue: string | null = null;
      if (!unavailable && stored.companyPhone.encryptedPhone !== null) {
        phoneValue = normalizedCompanyPhoneSchema.parse(
          decryptContactJson(
            stored.companyPhone.encryptedPhone,
            companyPhoneAad(
              input.actor.organizationId,
              stored.request.requestId,
            ),
            keys,
          ),
        ).value;
      }
      companyPhoneFallback = {
        value: phoneValue,
        source: "APOLLO",
        contactability: "UNKNOWN",
        obtainedAt: stored.companyPhone.obtainedAt.toISOString(),
        expiresAt: stored.companyPhone.expiresAt.toISOString(),
        governanceState: stored.companyPhone.suppressed
          ? "SUPPRESSED"
          : expired || stored.companyPhone.erasedAt !== null
            ? "EXPIRED"
            : "AVAILABLE",
      };
    }
  }

  return {
    requestId: stored.request.requestId,
    status: stored.request.status,
    requestedAt: stored.request.requestedAt.toISOString(),
    updatedAt: stored.request.updatedAt.toISOString(),
    previewExpiresAt:
      stored.request.previewExpiresAt?.toISOString() ?? null,
    candidates: transparency === null ? null : candidates,
    companyPhoneFallback:
      transparency === null ? null : companyPhoneFallback,
    transparency,
    searchDiagnostics: stored.request.searchDiagnostics ?? null,
  };
}

export type SubmitRevealResult =
  | { readonly kind: "created" | "duplicate"; readonly reveal: RevealRecord }
  | { readonly kind: "conflict" }
  | { readonly kind: "unavailable" };

export async function submitContactReveal(
  input: {
    readonly actor: AuthorizedActor;
    readonly requestId: string;
    readonly idempotencyKey: string;
    readonly request: ContactRevealRequest;
    readonly now?: Date;
  },
  environment: ParsedServerEnv,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<SubmitRevealResult> {
  const now = input.now ?? new Date();
  const configuration = requireV2Configuration(environment);
  const keys = requireContactKeys(environment);
  const candidate = await readCandidateForReveal({
    organizationId: input.actor.organizationId,
    contactId: input.request.contact_id,
    now,
    channels: input.request.channels,
  });
  if (
    candidate === null ||
    candidate.requestId !== input.requestId ||
    candidate.encryptedProviderRef === null ||
    (input.request.channels.includes("work_email") &&
      !candidate.canRevealWorkEmail) ||
    (input.request.channels.includes("business_phone") &&
      !candidate.canRevealBusinessPhone)
  ) {
    return { kind: "unavailable" };
  }

  const providerReference = parseProviderReference(
    decryptContactJson(
      candidate.encryptedProviderRef,
      candidateProviderAad(
        input.actor.organizationId,
        input.requestId,
        candidate.contactId,
      ),
      keys,
    ),
  );
  if (
    providerReference.source === "APOLLO" &&
    input.request.channels.includes("business_phone")
  ) {
    return { kind: "unavailable" };
  }
  const canonicalInput = {
    request_id: input.requestId,
    contact_id: input.request.contact_id,
    channels: [...input.request.channels].sort(),
  };
  const intent = await recordRevealIntent({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    requestId: input.requestId,
    contactId: input.request.contact_id,
    idempotencyKeySha256: sha256(input.idempotencyKey),
    inputSha256: canonicalSha256(canonicalInput),
    channels: input.request.channels,
  });
  if (intent.kind !== "created") return intent;

  const reveal = input.request.channels.map((channel) =>
    channel === "work_email" ? ("emails" as const) : ("phones" as const),
  );
  const dispatch = await dispatchContactReveal(
    {
      contract_version: CONTACT_REVEAL_CONTRACT_VERSION,
      action: "REVEAL",
      request_id: input.requestId,
      reveal_request_id: intent.reveal.revealRequestId,
      idempotency_key: input.idempotencyKey,
      provider_contact_id: providerReference.providerContactId,
      provider_source: providerReference.source,
      reveal,
    },
    configuration,
    fetchImplementation,
  );
  const recorded = await recordRevealDispatchOutcome({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    revealRequestId: intent.reveal.revealRequestId,
    outcome: dispatch.kind,
  });
  return { kind: "created", reveal: recorded ?? intent.reveal };
}

export async function processRevealCallback(
  body: unknown,
  environment: ParsedServerEnv,
): Promise<Awaited<ReturnType<typeof recordRevealResult>>> {
  const callback = contactRevealCallbackSchema.parse(body);
  const keys = requireContactKeys(environment);
  const occurredAt = new Date(callback.occurred_at);
  const channels = normalizeRevealedChannels(callback);
  const profileUpdate = normalizeContactProfileUpdate(callback);
  const storedCandidate =
    callback.provider_source === "APOLLO" && profileUpdate !== null
      ? await readCandidateForRevealCallback({
          organizationId: environment.AUTH_ALLOWED_ORG_ID,
          requestId: callback.request_id,
          revealRequestId: callback.reveal_request_id,
        })
      : null;
  let encryptedProfileUpdate: EncryptedContactData | null = null;
  if (
    storedCandidate !== null &&
    storedCandidate.encryptedProfile !== null &&
    storedCandidate.suppressedAt === null &&
    storedCandidate.erasedAt === null &&
    storedCandidate.expiresAt.getTime() > occurredAt.getTime() &&
    profileUpdate !== null
  ) {
    const currentProfile = normalizedCandidateSchema.parse(
      decryptContactJson(
        storedCandidate.encryptedProfile,
        candidateProfileAad(
          environment.AUTH_ALLOWED_ORG_ID,
          callback.request_id,
          storedCandidate.contactId,
        ),
        keys,
      ),
    );
    encryptedProfileUpdate = encryptContactJson(
      {
        ...currentProfile,
        fullName: profileUpdate.fullName,
        linkedinUrl: profileUpdate.linkedinUrl,
      },
      candidateProfileAad(
        environment.AUTH_ALLOWED_ORG_ID,
        callback.request_id,
        storedCandidate.contactId,
      ),
      keys,
    );
  }
  const providerRefHmac = contactSuppressionFingerprint(
    "provider",
    providerIdentityValue(
      createProviderReference(
        callback.provider_source,
        callback.provider_contact_id,
      ),
    ),
    keys,
  );
  const workEmailHmacs = channels.workEmails.map((email) =>
    contactSuppressionFingerprint("email", email.value, keys),
  );
  const businessPhoneHmacs = channels.businessPhones.map((phone) =>
    contactSuppressionFingerprint("phone", phone.value, keys),
  );
  const dncPhoneHmacs = channels.doNotCallPhones.map((phone) =>
    contactSuppressionFingerprint("phone", phone, keys),
  );
  const safeChannels = {
    workEmails: channels.workEmails,
    businessPhones: channels.businessPhones,
  };
  const hasChannels =
    safeChannels.workEmails.length > 0 ||
    safeChannels.businessPhones.length > 0;
  const expiresAt = hasChannels
    ? addDays(occurredAt, CONTACT_REVEAL_RETENTION_DAYS)
    : null;
  const encryptedChannels = hasChannels
    ? encryptContactJson(
        safeChannels,
        contactChannelsAad(
          environment.AUTH_ALLOWED_ORG_ID,
          callback.reveal_request_id,
        ),
        keys,
      )
    : null;

  return recordRevealResult({
    organizationId: environment.AUTH_ALLOWED_ORG_ID,
    requestId: callback.request_id,
    revealRequestId: callback.reveal_request_id,
    providerRefHmac,
    status: callback.status,
    resultSha256: canonicalSha256(callback),
    occurredAt,
    expiresAt,
    encryptedChannels,
    encryptedProfileUpdate,
    channels,
    workEmailHmacs,
    businessPhoneHmacs,
    dncPhoneHmacs,
  });
}

export async function applyContactSuppression(
  input: {
    readonly actor: AuthorizedActor;
    readonly contactId: string;
    readonly scope: "all" | "email" | "phone";
    readonly reason:
      | "DATA_SUBJECT_OPT_OUT"
      | "DATA_SUBJECT_OBJECTION"
      | "DO_NOT_CALL"
      | "RIGHTS_ERASURE";
  },
): Promise<"recorded" | "not_found"> {
  return suppressContact({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    contactId: input.contactId,
    scope: input.scope,
    reason: input.reason,
    occurredAt: new Date(),
  });
}

export async function applyContactRetention(
  actor: AuthorizedActor,
  now: Date = new Date(),
) {
  const [contacts, companyMatches] = await Promise.all([
    eraseExpiredContactData({
      organizationId: actor.organizationId,
      occurredAt: now,
    }),
    applyCompanyMatchRetention(actor, now),
  ]);
  return { ...contacts, companyMatches };
}

export async function createContactRightsRequest(
  input: {
    readonly actor: AuthorizedActor;
    readonly subjectKind: "provider" | "email" | "phone";
    readonly subjectValue: string;
    readonly requestType:
      | "CONFIRMATION"
      | "ACCESS"
      | "CORRECTION"
      | "SOURCE_INFORMATION"
      | "OPPOSITION"
      | "BLOCK"
      | "DELETION";
  },
  environment: ParsedServerEnv,
): Promise<string> {
  const keys = requireContactKeys(environment);
  return recordContactRightsRequest({
    organizationId: input.actor.organizationId,
    actorSubject: input.actor.subject,
    subjectReferenceHmac: contactSuppressionFingerprint(
      input.subjectKind,
      input.subjectValue,
      keys,
    ),
    requestType: input.requestType,
    occurredAt: new Date(),
  });
}

function prepareCandidate(
  organizationId: string,
  requestId: string,
  candidate: NormalizedContactCandidate,
  listPosition: number,
  keys: ContactDataKeyMaterial,
): PreparedContactCandidate {
  const contactId = randomUUID();
  const { providerContactId, providerSource, ...profile } = candidate;
  const providerReference = createProviderReference(
    providerSource,
    providerContactId,
  );

  return {
    contactId,
    providerRefHmac: contactSuppressionFingerprint(
      "provider",
      providerIdentityValue(providerReference),
      keys,
    ),
    encryptedProviderRef: encryptContactJson(
      providerReference,
      candidateProviderAad(organizationId, requestId, contactId),
      keys,
    ),
    encryptedProfile: encryptContactJson(
      profile,
      candidateProfileAad(organizationId, requestId, contactId),
      keys,
    ),
    canRevealWorkEmail: candidate.canRevealWorkEmail,
    canRevealBusinessPhone: candidate.canRevealBusinessPhone,
    listPosition,
  };
}

function prepareCompanyPhone(
  organizationId: string,
  requestId: string,
  phone: NormalizedCompanyPhoneFallback,
  keys: ContactDataKeyMaterial,
): PreparedCompanyPhoneFallback {
  return {
    phoneHmac: contactSuppressionFingerprint("phone", phone.value, keys),
    encryptedPhone: encryptContactJson(
      phone,
      companyPhoneAad(organizationId, requestId),
      keys,
    ),
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

function canonicalSha256(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);
}

function candidateProviderAad(
  organizationId: string,
  requestId: string,
  contactId: string,
): string {
  return `candidate-provider:${organizationId}:${requestId}:${contactId}`;
}

function candidateProfileAad(
  organizationId: string,
  requestId: string,
  contactId: string,
): string {
  return `candidate-profile:${organizationId}:${requestId}:${contactId}`;
}

function contactChannelsAad(
  organizationId: string,
  revealRequestId: string,
): string {
  return `contact-channels:${organizationId}:${revealRequestId}`;
}

function companyPhoneAad(
  organizationId: string,
  requestId: string,
): string {
  return `company-phone:${organizationId}:${requestId}`;
}

function unavailableCandidate(): NormalizedContactProfile {
  return {
    fullName: "Contato indisponível",
    jobTitle: null,
    departments: [],
    seniority: null,
    location: { city: null, state: null, country: null },
    linkedinUrl: null,
    canRevealWorkEmail: false,
    canRevealBusinessPhone: false,
  };
}

// Ensure callback types remain part of this service's public boundary.
export type ValidatedContactPreviewCallback = ContactPreviewCallback;
export type ValidatedContactRevealCallback = ContactRevealCallback;
export type ValidatedRevealedChannels = NormalizedRevealedChannels;
