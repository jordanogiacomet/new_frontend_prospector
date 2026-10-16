import "server-only";

import type { ParsedServerEnv } from "../env";
import type {
  ContactCandidateDto,
  ContactPreviewRequestDto,
} from "../../types/contact-enrichment";
import {
  contactCandidateCallbackSchema,
  contactRevealCallbackSchema,
  type ContactPreviewCallback,
  type ContactRevealCallback,
} from "./contact-enrichment-v2-contract";
import type { ContactProviderSource } from "./contact-provider-reference";

export const CONTACT_PREVIEW_RETENTION_DAYS = 30 as const;
export const CONTACT_REVEAL_RETENTION_DAYS = 90 as const;
export const CONTACT_SUPPRESSION_RETENTION_DAYS = 1_825 as const;
export const CONTACT_ERASURE_SLA_HOURS = 24 as const;

export interface NormalizedContactProfile {
  readonly fullName: string;
  readonly jobTitle: string | null;
  readonly departments: readonly string[];
  readonly seniority: string | null;
  readonly location: {
    readonly city: string | null;
    readonly state: string | null;
    readonly country: string | null;
  };
  readonly linkedinUrl: string | null;
  readonly canRevealWorkEmail: boolean;
  readonly canRevealBusinessPhone: boolean;
}

export interface NormalizedContactCandidate extends NormalizedContactProfile {
  readonly providerContactId: string;
  readonly providerSource: ContactProviderSource;
}

export interface NormalizedRevealedChannels {
  readonly workEmails: readonly {
    readonly value: string;
    readonly confidence: string | null;
    readonly sourceUpdatedAt: string | null;
  }[];
  readonly businessPhones: readonly {
    readonly value: string;
    readonly type: "work" | "direct";
    readonly sourceUpdatedAt: string | null;
  }[];
  readonly doNotCallPhones: readonly string[];
}

export interface NormalizedContactProfileUpdate {
  readonly fullName: string;
  readonly linkedinUrl: string | null;
}

export interface NormalizedCompanyPhoneFallback {
  readonly value: string;
  readonly source: "APOLLO";
  readonly contactability: "UNKNOWN";
}

export function normalizeCompanyPhoneFallback(
  callback: ContactPreviewCallback,
): NormalizedCompanyPhoneFallback | null {
  const phone = callback.company_phone ?? null;
  if (phone === null) return null;

  return {
    value: phone.number,
    source: phone.provider_source,
    contactability: phone.contactability,
  };
}

export function normalizeContactCandidates(
  callback: ContactPreviewCallback,
): readonly NormalizedContactCandidate[] {
  return callback.candidates.map((candidate) => {
    const parsed = contactCandidateCallbackSchema.parse(candidate);

    return {
      providerContactId: parsed.provider_contact_id,
      providerSource: parsed.provider_source,
      fullName: parsed.full_name,
      jobTitle: parsed.job_title,
      departments: [...new Set(parsed.departments)],
      seniority: parsed.seniority,
      location: parsed.location,
      linkedinUrl: approvedLinkedinUrl(parsed.linkedin_url),
      canRevealWorkEmail: parsed.can_reveal_work_email,
      canRevealBusinessPhone: parsed.can_reveal_business_phone,
    };
  });
}

export function normalizeRevealedChannels(
  callback: ContactRevealCallback,
): NormalizedRevealedChannels {
  const parsed = contactRevealCallbackSchema.parse(callback);
  const workEmails = parsed.emails
    .filter((email) => email.type === "work")
    .map((email) => ({
      value: email.email.toLowerCase(),
      confidence: email.confidence,
      sourceUpdatedAt: email.update_date,
    }));
  const businessPhones = parsed.phones
    .filter(
      (phone) =>
        !phone.do_not_call &&
        (phone.type === "work" || phone.type === "direct"),
    )
    .map((phone) => ({
      value: phone.number,
      type: phone.type as "work" | "direct",
      sourceUpdatedAt: phone.update_date,
    }));
  const doNotCallPhones = parsed.phones
    .filter((phone) => phone.do_not_call)
    .map((phone) => phone.number);

  return {
    workEmails: uniqueByValue(workEmails).slice(0, 2),
    businessPhones: uniqueByValue(businessPhones).slice(0, 2),
    doNotCallPhones: [...new Set(doNotCallPhones)],
  };
}

export function normalizeContactProfileUpdate(
  callback: ContactRevealCallback,
): NormalizedContactProfileUpdate | null {
  const parsed = contactRevealCallbackSchema.parse(callback);
  if (parsed.profile_update === null) return null;

  return {
    fullName: parsed.profile_update.full_name,
    linkedinUrl: approvedLinkedinUrl(parsed.profile_update.linkedin_url),
  };
}

export function contactTransparency(
  environment: ParsedServerEnv,
): NonNullable<ContactPreviewRequestDto["transparency"]> | null {
  if (
    !environment.FEATURE_CONTACT_DATA_ENABLED ||
    environment.CONTACT_CONTROLLER_LEGAL_NAME === undefined ||
    environment.CONTACT_PRIVACY_CONTACT === undefined
  ) {
    return null;
  }

  return {
    controllerLegalName: environment.CONTACT_CONTROLLER_LEGAL_NAME,
    controllerRegistration:
      environment.CONTACT_CONTROLLER_REGISTRATION ?? null,
    purpose:
      "Contato profissional individual e relevante com decisores de empresas qualificadas na fila comercial.",
    legalBasis: "LEGITIMATE_INTEREST",
    source: "LUSHA_AND_APOLLO",
    previewRetentionDays: CONTACT_PREVIEW_RETENTION_DAYS,
    revealedRetentionDays: CONTACT_REVEAL_RETENTION_DAYS,
    privacyContact: environment.CONTACT_PRIVACY_CONTACT,
  };
}

export function candidateToDto(input: {
  readonly contactId: string;
  readonly candidate: NormalizedContactProfile;
  readonly obtainedAt: Date;
  readonly expiresAt: Date;
  readonly now: Date;
  readonly suppressed: boolean;
  readonly channels: ContactCandidateDto["channels"];
  readonly source: ContactProviderSource;
}): ContactCandidateDto {
  const expired = input.expiresAt.getTime() <= input.now.getTime();
  const unavailable = input.suppressed || expired;

  return {
    contactId: input.contactId,
    fullName: unavailable ? "Contato indisponível" : input.candidate.fullName,
    jobTitle: unavailable ? null : input.candidate.jobTitle,
    departments: unavailable ? [] : input.candidate.departments,
    seniority: unavailable ? null : input.candidate.seniority,
    location: unavailable
      ? { city: null, state: null, country: null }
      : input.candidate.location,
    linkedinUrl: unavailable ? null : input.candidate.linkedinUrl,
    canRevealWorkEmail:
      !unavailable && input.candidate.canRevealWorkEmail,
    canRevealBusinessPhone:
      !unavailable && input.candidate.canRevealBusinessPhone,
    source: input.source,
    obtainedAt: input.obtainedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    channels: unavailable ? null : input.channels,
    governanceState: input.suppressed
      ? "SUPPRESSED"
      : expired
        ? "EXPIRED"
        : "AVAILABLE",
  };
}

function approvedLinkedinUrl(value: string | null): string | null {
  if (value === null) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (
      url.protocol !== "https:" ||
      (hostname !== "linkedin.com" && hostname !== "www.linkedin.com") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith("/in/")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function uniqueByValue<Item extends { readonly value: string }>(
  values: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>();
  const unique: Item[] = [];

  for (const value of values) {
    if (!seen.has(value.value)) {
      seen.add(value.value);
      unique.push(value);
    }
  }

  return unique;
}
