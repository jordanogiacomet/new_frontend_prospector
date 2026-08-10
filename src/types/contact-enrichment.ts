export type ContactPreviewStatus =
  | "REQUEST_RECORDED"
  | "PREVIEW_DISPATCHED"
  | "DISPATCH_OUTCOME_UNKNOWN"
  | "PREVIEW_AVAILABLE"
  | "PREVIEW_EMPTY"
  | "PREVIEW_FAILED"
  | "PROVIDER_OUTCOME_UNKNOWN";

export interface ContactLocationDto {
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
}

export interface ContactCandidateDto {
  readonly contactId: string;
  readonly fullName: string;
  readonly jobTitle: string | null;
  readonly departments: readonly string[];
  readonly seniority: string | null;
  readonly location: ContactLocationDto;
  readonly linkedinUrl: string | null;
  readonly canRevealWorkEmail: boolean;
  readonly canRevealBusinessPhone: boolean;
  readonly source: "LUSHA";
  readonly obtainedAt: string;
  readonly expiresAt: string;
  readonly channels: {
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
  } | null;
  readonly governanceState: "AVAILABLE" | "SUPPRESSED" | "EXPIRED";
}

export interface ContactPreviewRequestDto {
  readonly requestId: string;
  readonly status: ContactPreviewStatus;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly previewExpiresAt: string | null;
  readonly candidates: readonly ContactCandidateDto[] | null;
  readonly transparency: {
    readonly controllerLegalName: string;
    readonly controllerRegistration: string | null;
    readonly purpose: string;
    readonly legalBasis: "LEGITIMATE_INTEREST";
    readonly source: "LUSHA";
    readonly previewRetentionDays: 30;
    readonly revealedRetentionDays: 90;
    readonly privacyContact: string;
  } | null;
}

export type ContactCompanySearchStatus =
  | "SEARCH_REQUEST_RECORDED"
  | "SEARCH_DISPATCHED"
  | "DISPATCH_OUTCOME_UNKNOWN"
  | "SEARCH_AVAILABLE"
  | "SEARCH_EMPTY"
  | "SEARCH_FAILED"
  | "PROVIDER_OUTCOME_UNKNOWN"
  | "SEARCH_EXPIRED";

export interface ContactCompanyMatchDto {
  readonly companyMatchId: string;
  readonly companyName: string;
  readonly companyDomain: string | null;
  readonly industry: string | null;
  readonly location: ContactLocationDto;
  readonly source: "LUSHA";
  readonly obtainedAt: string;
  readonly expiresAt: string;
}

export interface ContactCompanySearchRequestDto {
  readonly searchRequestId: string;
  readonly status: ContactCompanySearchStatus;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly matchesExpiresAt: string | null;
  readonly matches: readonly ContactCompanyMatchDto[];
}
