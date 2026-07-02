export type Nullable<T> = T | null;

export type LeadConfidenceIndicator = "normal" | "low" | "unknown";

export interface LeadAuditIdentity {
  decision_id: string;
  import_batch_id: Nullable<string>;
  lead_run_id: string;
  source_row: Nullable<number>;
  source_hash: Nullable<string>;
  agent_version: Nullable<string>;
}

export interface LeadAudit extends LeadAuditIdentity {
  idempotency_key: Nullable<string>;
  used_cache: Nullable<boolean>;
  validated_at: string;
  created_at: string;
  updated_at: Nullable<string>;
  expires_at: Nullable<string>;
}

export interface UnavailableLeadCollection {
  status: "unavailable";
  items: null;
}

export interface AvailableEmptyLeadCollection {
  status: "available";
  items: readonly [];
}

export interface MissingLeadCollection {
  status: "missing";
  items: null;
}

export interface PolicyOmittedLeadCollection {
  status: "omitted_by_policy";
  items: null;
}

export type LeadInsightCollection =
  | AvailableEmptyLeadCollection
  | MissingLeadCollection
  | UnavailableLeadCollection
  | PolicyOmittedLeadCollection;

export interface PolicyOmittedContent {
  status: "omitted_by_policy";
  content: null;
}

export interface MissingContent {
  status: "missing";
  content: null;
}

export interface UnavailableContent {
  status: "unavailable";
  content: null;
}

export type LeadSensitiveContent =
  | MissingContent
  | UnavailableContent
  | PolicyOmittedContent;

export type DataQualityNoticeCode =
  | "MISSING_VALUE"
  | "UNKNOWN_DOMAIN_VALUE"
  | "STALE_VALUE"
  | "CONTENT_WITHHELD";

export interface DataQualityNotice {
  code: DataQualityNoticeCode;
  field: string;
}

export interface LeadSummary extends LeadAuditIdentity {
  agent_version: string;
  cnpj: string;
  companyName: Nullable<string>;
  city: Nullable<string>;
  uf: Nullable<string>;
  sector: Nullable<string>;
  score: Nullable<number>;
  priority: Nullable<string>;
  recommendedAction: Nullable<string>;
  trustStatus: Nullable<string>;
  confidenceIndicator: LeadConfidenceIndicator;
  lastAnalysisAt: string;
}

export interface LeadDetail extends LeadSummary {
  legalName: Nullable<string>;
  tradeName: Nullable<string>;
  primaryCnae: Nullable<string>;
  primaryCnaeDescription: Nullable<string>;
  companySize: Nullable<string>;
  taxRegime: Nullable<string>;
  estimatedRevenue: Nullable<string>;
  employeeCount: Nullable<string>;
  branchCount: Nullable<number>;
  finalVerdict: Nullable<string>;
  recommendedActionReason: Nullable<string>;
  icpScore: Nullable<number>;
  strategicAssetScore: Nullable<number>;
  strategicTier: Nullable<string>;
  riskFlags: LeadInsightCollection;
  positiveSignals: LeadInsightCollection;
  evidences: LeadSensitiveContent;
  strategicReport: LeadSensitiveContent;
  audit: LeadAudit;
  dataQuality: DataQualityNotice[];
}

export interface LeadHistoryItem {
  decision_id: string;
  import_batch_id: Nullable<string>;
  lead_run_id: string;
  source_row: Nullable<number>;
  analyzedAt: Nullable<string>;
  recommendedAction: string;
  recommendedActionReason: Nullable<string>;
  isCurrent: boolean;
}
