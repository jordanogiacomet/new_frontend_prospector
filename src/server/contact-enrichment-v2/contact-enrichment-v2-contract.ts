import "server-only";

import { z } from "zod";

import { CONTACT_SEARCH_DIAGNOSTIC_CODES } from "../../types/contact-enrichment";
import { contactProviderSourceSchema } from "./contact-provider-reference";

export const contactSearchDiagnosticsSchema = z
  .array(z.strictObject({
    provider: contactProviderSourceSchema,
    stage: z.enum(["COMPANY_SEARCH", "CONTACT_PREVIEW", "COMPANY_MATCH"]),
    code: z.enum(CONTACT_SEARCH_DIAGNOSTIC_CODES),
  }))
  .min(1)
  .max(4)
  .superRefine((diagnostics, context) => {
    const stages = new Set<string>();
    for (const [index, diagnostic] of diagnostics.entries()) {
      const key = `${diagnostic.provider}:${diagnostic.stage}`;
      if (stages.has(key) ||
        (diagnostic.code === "NO_RELEVANT_MATCHES" && diagnostic.stage !== "CONTACT_PREVIEW") ||
        (diagnostic.provider === "LUSHA" && diagnostic.stage === "COMPANY_MATCH") ||
        (diagnostic.provider === "APOLLO" && diagnostic.stage === "COMPANY_SEARCH")) {
        context.addIssue({ code: "custom", path: [index], message: "Invalid diagnostic stage." });
      }
      stages.add(key);
    }
  });

export const CONTACT_PREVIEW_CONTRACT_VERSION =
  "prospecta-contact-enrichment-preview-v2" as const;
export const CONTACT_REVEAL_CONTRACT_VERSION =
  "prospecta-contact-enrichment-reveal-v2" as const;
export const CONTACT_COMPANY_SEARCH_CONTRACT_VERSION =
  "prospecta-contact-company-search-v2" as const;
export const CONTACT_PREVIEW_BY_COMPANY_ID_CONTRACT_VERSION =
  "prospecta-contact-enrichment-preview-by-company-id-v1" as const;

export const companyDomainSchema = z
  .string()
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
  );

const exactText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim() === value)
    .refine((value) => !/[\u0000-\u001f\u007f<>]/.test(value));

const optionalText = (maximum: number) => exactText(maximum).nullable();

export const companyNameSchema = exactText(200);
const companyCitySchema = optionalText(100);
const companyStateSchema = z.string().regex(/^[A-Z]{2}$/).nullable();
const companyCountryIso2Schema = z.literal("BR");

export const contactPreviewRequestSchema = z.union([
  z.strictObject({
    cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
    company_domain: companyDomainSchema,
  }),
  z.strictObject({
    cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
    company_match_id: z.uuid(),
  }),
]);

export type ContactPreviewRequest = z.infer<
  typeof contactPreviewRequestSchema
>;

export const contactPreviewN8nRequestSchema = z.strictObject({
  contract_version: z.literal(CONTACT_PREVIEW_CONTRACT_VERSION),
  action: z.literal("PREVIEW"),
  request_id: z.uuid(),
  idempotency_key: exactText(128),
  cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
  company_domain: companyDomainSchema,
});

export const contactPreviewN8nResponseSchema = z.strictObject({
  contract_version: z.literal(CONTACT_PREVIEW_CONTRACT_VERSION),
  request_id: z.uuid(),
  status: z.literal("PREVIEW_DISPATCHED"),
});

export const contactPreviewByCompanyIdN8nRequestSchema = z.strictObject({
  contract_version: z.literal(
    CONTACT_PREVIEW_BY_COMPANY_ID_CONTRACT_VERSION,
  ),
  action: z.literal("PREVIEW_BY_COMPANY_ID"),
  request_id: z.uuid(),
  idempotency_key: exactText(128),
  cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
  provider_company_id: exactText(256),
  fallback_company_domain: companyDomainSchema.nullable().optional().default(null),
});

export const contactPreviewByCompanyIdN8nResponseSchema = z.strictObject({
  contract_version: z.literal(
    CONTACT_PREVIEW_BY_COMPANY_ID_CONTRACT_VERSION,
  ),
  request_id: z.uuid(),
  status: z.literal("PREVIEW_DISPATCHED"),
});

export const contactCompanySearchRequestSchema = z.strictObject({
  cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
  company_name: companyNameSchema,
  company_city: companyCitySchema,
  company_state: companyStateSchema,
  company_country_iso2: companyCountryIso2Schema,
});

export type ContactCompanySearchRequest = z.infer<
  typeof contactCompanySearchRequestSchema
>;

export const contactCompanySearchN8nRequestSchema = z.strictObject({
  contract_version: z.literal(CONTACT_COMPANY_SEARCH_CONTRACT_VERSION),
  action: z.literal("COMPANY_SEARCH"),
  search_request_id: z.uuid(),
  idempotency_key: exactText(128),
  cnpj_normalizado: z.string().regex(/^[0-9]{14}$/),
  company_name: companyNameSchema,
  company_city: companyCitySchema,
  company_state: companyStateSchema,
  company_country_iso2: companyCountryIso2Schema,
});

export const contactCompanySearchN8nResponseSchema = z.strictObject({
  contract_version: z.literal(CONTACT_COMPANY_SEARCH_CONTRACT_VERSION),
  search_request_id: z.uuid(),
  status: z.literal("SEARCH_DISPATCHED"),
});

export const contactCompanyMatchCallbackSchema = z.strictObject({
  provider_company_id: exactText(256),
  company_name: companyNameSchema,
  company_domain: companyDomainSchema.nullable(),
  industry: optionalText(200),
  location: z.strictObject({
    city: optionalText(100),
    state: optionalText(100),
    country: optionalText(100),
  }),
});

export const contactCompanySearchCallbackSchema = z
  .strictObject({
    contract_version: z.literal(CONTACT_COMPANY_SEARCH_CONTRACT_VERSION),
    search_request_id: z.uuid(),
    status: z.enum([
      "SEARCH_AVAILABLE",
      "SEARCH_EMPTY",
      "SEARCH_FAILED",
      "PROVIDER_OUTCOME_UNKNOWN",
    ]),
    occurred_at: z.iso.datetime({ offset: true }),
    matches: z.array(contactCompanyMatchCallbackSchema).max(5),
    search_diagnostics: contactSearchDiagnosticsSchema.optional(),
  })
  .superRefine((value, context) => {
    const expectsMatches = value.status === "SEARCH_AVAILABLE";
    if (expectsMatches !== (value.matches.length > 0)) {
      context.addIssue({
        code: "custom",
        path: ["matches"],
        message: "Company-match presence must match terminal status.",
      });
    }
    if (value.search_diagnostics?.some((diagnostic) =>
      diagnostic.provider !== "LUSHA" || diagnostic.stage !== "COMPANY_SEARCH")) {
      context.addIssue({ code: "custom", path: ["search_diagnostics"], message: "Invalid company-search diagnostic." });
    }
  });

export type ContactCompanySearchCallback = z.infer<
  typeof contactCompanySearchCallbackSchema
>;

export const contactCandidateCallbackSchema = z.strictObject({
  provider_contact_id: exactText(256),
  provider_source: contactProviderSourceSchema.optional().default("LUSHA"),
  full_name: exactText(200),
  job_title: optionalText(200),
  departments: z.array(exactText(100)).max(5),
  seniority: optionalText(100),
  location: z.strictObject({
    city: optionalText(100),
    state: optionalText(100),
    country: optionalText(100),
  }),
  linkedin_url: z.url().max(500).nullable(),
  can_reveal_work_email: z.boolean(),
  can_reveal_business_phone: z.boolean(),
});

export const contactCompanyPhoneCallbackSchema = z.strictObject({
  number: exactText(32).regex(/^\+[1-9][0-9]{7,14}$/),
  provider_source: z.literal("APOLLO"),
  contactability: z.literal("UNKNOWN"),
});

const previewTerminalStatus = z.enum([
  "PREVIEW_AVAILABLE",
  "PREVIEW_EMPTY",
  "PREVIEW_FAILED",
  "PROVIDER_OUTCOME_UNKNOWN",
]);

export const contactPreviewCallbackSchema = z
  .strictObject({
    contract_version: z.literal(CONTACT_PREVIEW_CONTRACT_VERSION),
    request_id: z.uuid(),
    status: previewTerminalStatus,
    occurred_at: z.iso.datetime({ offset: true }),
    candidates: z.array(contactCandidateCallbackSchema).max(10),
    company_phone: contactCompanyPhoneCallbackSchema.nullable().optional(),
    search_diagnostics: contactSearchDiagnosticsSchema.optional(),
  })
  .superRefine((value, context) => {
    const companyPhone = value.company_phone ?? null;
    const hasAvailableResult =
      value.candidates.length > 0 || companyPhone !== null;

    if ((value.status === "PREVIEW_AVAILABLE") !== hasAvailableResult) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Preview result presence must match terminal status.",
      });
    }
    if (value.candidates.length > 0 && companyPhone !== null) {
      context.addIssue({
        code: "custom",
        path: ["company_phone"],
        message: "Company phone is allowed only when no candidate was found.",
      });
    }
    if (value.search_diagnostics?.some((diagnostic) => diagnostic.stage === "COMPANY_SEARCH")) {
      context.addIssue({ code: "custom", path: ["search_diagnostics"], message: "Invalid contact-preview diagnostic." });
    }
  });

export type ContactPreviewCallback = z.infer<
  typeof contactPreviewCallbackSchema
>;

export const contactRevealRequestSchema = z.strictObject({
  contact_id: z.uuid(),
  channels: z
    .array(z.enum(["work_email", "business_phone"]))
    .min(1)
    .max(2)
    .refine((channels) => new Set(channels).size === channels.length),
});

export type ContactRevealRequest = z.infer<
  typeof contactRevealRequestSchema
>;

export const contactRevealN8nRequestSchema = z.strictObject({
  contract_version: z.literal(CONTACT_REVEAL_CONTRACT_VERSION),
  action: z.literal("REVEAL"),
  request_id: z.uuid(),
  reveal_request_id: z.uuid(),
  idempotency_key: exactText(128),
  provider_contact_id: exactText(256),
  provider_source: contactProviderSourceSchema.optional().default("LUSHA"),
  reveal: z
    .array(z.enum(["emails", "phones"]))
    .min(1)
    .max(2)
    .refine((channels) => new Set(channels).size === channels.length),
  waterfall_reveal: z.never().optional(),
});

export const contactRevealN8nResponseSchema = z.strictObject({
  contract_version: z.literal(CONTACT_REVEAL_CONTRACT_VERSION),
  reveal_request_id: z.uuid(),
  status: z.literal("REVEAL_DISPATCHED"),
});

const providerEmailSchema = z.strictObject({
  email: z.email().max(320),
  type: z.enum(["work", "private", "unknown"]),
  confidence: optionalText(32),
  update_date: z.iso.date().nullable(),
});

const providerPhoneSchema = z.strictObject({
  number: exactText(32).regex(/^\+[1-9][0-9]{7,14}$/),
  type: z.enum(["mobile", "direct", "work", "unknown"]),
  do_not_call: z.boolean(),
  update_date: z.iso.date().nullable(),
});

const providerProfileUpdateSchema = z.strictObject({
  full_name: exactText(200),
  linkedin_url: z.url().max(500).nullable(),
});

export const contactRevealCallbackSchema = z
  .strictObject({
    contract_version: z.literal(CONTACT_REVEAL_CONTRACT_VERSION),
    request_id: z.uuid(),
    reveal_request_id: z.uuid(),
    status: z.enum([
      "REVEAL_AVAILABLE",
      "REVEAL_EMPTY",
      "REVEAL_FAILED",
      "PROVIDER_OUTCOME_UNKNOWN",
    ]),
    occurred_at: z.iso.datetime({ offset: true }),
    provider_contact_id: exactText(256),
    provider_source: contactProviderSourceSchema.optional().default("LUSHA"),
    profile_update: providerProfileUpdateSchema.nullable().optional().default(null),
    emails: z.array(providerEmailSchema).max(10),
    phones: z.array(providerPhoneSchema).max(10),
  })
  .superRefine((value, context) => {
    const hasAnyValue = value.emails.length > 0 || value.phones.length > 0;

    if ((value.status === "REVEAL_AVAILABLE") !== hasAnyValue) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Revealed values must match terminal status.",
      });
    }
  });

export type ContactRevealCallback = z.infer<
  typeof contactRevealCallbackSchema
>;

export const contactSuppressionRequestSchema = z.strictObject({
  scope: z.enum(["all", "email", "phone"]),
  reason: z.enum([
    "DATA_SUBJECT_OPT_OUT",
    "DATA_SUBJECT_OBJECTION",
    "DO_NOT_CALL",
    "RIGHTS_ERASURE",
  ]),
});

export const contactRightsRequestSchema = z.strictObject({
  subject_kind: z.enum(["provider", "email", "phone"]),
  subject_value: exactText(320),
  request_type: z.enum([
    "CONFIRMATION",
    "ACCESS",
    "CORRECTION",
    "SOURCE_INFORMATION",
    "OPPOSITION",
    "BLOCK",
    "DELETION",
  ]),
});
