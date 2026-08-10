import type { LeadSummary } from "./leads";

export const commercialStages = [
  "NOT_STARTED",
  "ASSIGNED",
  "CONTACTED",
  "FOLLOW_UP",
  "MEETING",
  "PAUSED",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;

export type CommercialStage = (typeof commercialStages)[number];

export const commercialOutcomes = [
  "WON",
  "LOST",
  "NO_RESPONSE",
  "NOT_NOW",
  "DISQUALIFIED",
] as const;

export type CommercialOutcome = (typeof commercialOutcomes)[number];

export const commercialActivityTypes = [
  "CALL",
  "EMAIL",
  "WHATSAPP",
  "MEETING",
  "TASK",
  "OTHER",
] as const;

export type CommercialActivityType =
  (typeof commercialActivityTypes)[number];

export const commercialAuditActions = [
  "WORKSPACE_CREATED",
  "WORKSPACE_UPDATED",
  "WORKSPACE_ASSIGNED",
  "STAGE_CHANGED",
  "NEXT_ACTION_CHANGED",
  "ACTIVITY_APPENDED",
  "NOTE_APPENDED",
  "WORKSPACE_ARCHIVED",
  "IMPORT_SUBMISSION_RECORDED",
] as const;

export type CommercialAuditAction =
  (typeof commercialAuditActions)[number];

export const commercialAuditTargetTypes = [
  "lead_workspace",
  "lead_activity",
  "lead_note",
  "import_submission",
] as const;

export type CommercialAuditTargetType =
  (typeof commercialAuditTargetTypes)[number];

export interface CommercialActorContext {
  readonly organizationId: string;
  readonly actorSubject: string;
}

export const commercialAuthorizationBases = [
  "verified_oidc",
  "local_demo2",
  "local_demo3",
] as const;

export type CommercialAuthorizationBasis =
  (typeof commercialAuthorizationBases)[number];

export interface CommercialAuditActorContext extends CommercialActorContext {
  readonly actorIssuer: string;
  readonly requestCorrelationId: string;
  readonly authorizationBasis: CommercialAuthorizationBasis;
}

export const commercialWorkQueueSorts = ["last_analysis_desc"] as const;

export type CommercialWorkQueueSort =
  (typeof commercialWorkQueueSorts)[number];

export interface LeadWorkspaceDto {
  readonly workspace_id: string;
  readonly organization_id: string;
  readonly cnpj_normalizado: string;
  readonly observed_lead_run_id: string;
  readonly responsible_subject: string | null;
  readonly commercial_stage: CommercialStage;
  readonly next_action: string | null;
  readonly next_action_due_at: string | null;
  readonly commercial_outcome: CommercialOutcome | null;
  readonly version: number;
  readonly created_by_subject: string;
  readonly updated_by_subject: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
  readonly archived_by_subject: string | null;
}

export interface LeadActivityDto {
  readonly activity_id: string;
  readonly organization_id: string;
  readonly workspace_id: string;
  readonly observed_lead_run_id: string;
  readonly actor_subject: string;
  readonly occurred_at: string;
  readonly activity_type: CommercialActivityType;
  readonly activity_outcome: string | null;
  readonly summary: string | null;
  readonly created_at: string;
}

export interface LeadNoteDto {
  readonly note_id: string;
  readonly organization_id: string;
  readonly workspace_id: string;
  readonly observed_lead_run_id: string;
  readonly author_subject: string;
  readonly body: string;
  readonly created_at: string;
}

export interface CommercialWorkQueueWorkspaceSource {
  readonly factSource: "app_lead_workspaces_v1";
  readonly state: "matched" | "missing";
}

export interface CommercialWorkQueueProducerSource {
  readonly factSource: "producer_current_leads_v1";
}

export interface CommercialWorkQueueItem {
  readonly companyDomain: string | null;
  readonly producerLead: LeadSummary;
  readonly workspace: LeadWorkspaceDto | null;
  readonly sources: {
    readonly producer: CommercialWorkQueueProducerSource;
    readonly workspace: CommercialWorkQueueWorkspaceSource;
  };
}

export interface CommercialWorkQueueProvenance {
  readonly producer: {
    readonly factSource: "producer_current_leads_v1";
    readonly availability: "AVAILABLE" | "UNAVAILABLE" | "NOT_QUERIED";
    readonly unavailableBasis?:
      | "PRODUCER_SOURCE_UNAVAILABLE"
      | "PRODUCER_SOURCE_GUARD_EXCEEDED";
  };
  readonly workspace: {
    readonly factSource: "app_lead_workspaces_v1";
    readonly availability: "AVAILABLE";
  };
}

export interface CommercialAuditStateMetadata {
  readonly commercial_stage?: CommercialStage | null;
  readonly responsible_subject?: string | null;
  readonly next_action_present?: boolean;
  readonly next_action_due_at?: string | null;
  readonly commercial_outcome?: CommercialOutcome | null;
  readonly version?: number;
  readonly archived_at?: string | null;
  readonly status?: string;
}

export type CommercialAuditScalar = string | number | boolean | null;

export interface CommercialAuditMetadata {
  readonly field?: string;
  readonly from?: CommercialAuditScalar;
  readonly to?: CommercialAuditScalar;
  readonly reason_code?: string;
  readonly source?: string;
  readonly workspace_id?: string;
  readonly activity_id?: string;
  readonly note_id?: string;
  readonly import_submission_id?: string;
  readonly activity_type?: CommercialActivityType;
  readonly activity_outcome?: string | null;
}

export interface CommercialAuditEventDto {
  readonly audit_event_id: string;
  readonly organization_id: string;
  readonly workspace_id: string | null;
  readonly actor_subject: string;
  readonly action: CommercialAuditAction;
  readonly target_type: CommercialAuditTargetType;
  readonly target_id: string;
  readonly observed_lead_run_id: string | null;
  readonly previous_metadata: CommercialAuditStateMetadata;
  readonly new_metadata: CommercialAuditStateMetadata;
  readonly metadata: CommercialAuditMetadata;
  readonly occurred_at: string;
}

export interface CreateLeadWorkspaceRequest {
  readonly cnpj_normalizado: string;
  readonly observed_lead_run_id: string;
  readonly responsible_subject?: string | null;
  readonly next_action?: string | null;
  readonly next_action_due_at?: string | null;
}

export interface UpdateLeadWorkspaceRequest {
  readonly expected_version: number;
  readonly responsible_subject?: string | null;
  readonly commercial_stage?: CommercialStage;
  readonly next_action?: string | null;
  readonly next_action_due_at?: string | null;
  readonly commercial_outcome?: CommercialOutcome | null;
}

export interface CreateLeadActivityRequest {
  readonly occurred_at: string;
  readonly activity_type: CommercialActivityType;
  readonly activity_outcome?: string | null;
  readonly summary?: string | null;
}

export interface CreateLeadNoteRequest {
  readonly body: string;
}
