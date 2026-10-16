"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { actionErrorFeedback, unknownMutationMessage } from "../../../../lib/action-feedback";

import { usePrivateCapabilities } from "../../../../components/auth/private-capabilities";
import { QualificationCadence } from "../../../../components/commercial/qualification-cadence";
import { WorkspaceApproachMessage } from "../../../../components/commercial/workspace-approach-message";
import {
  formatBrazilianDate,
  formatBrazilianDateTime,
  formatCnpj,
} from "../../../../lib/formatters";
import {
  appendReturnTo,
  resolveLeadListReturnHref,
} from "../../../../lib/navigation-return";
import {
  getCommercialFollowUpStatus,
  getFollowUpDateInputValue,
} from "../../../../lib/commercial-follow-up";
import {
  commercialActivityTypes,
  commercialOutcomes,
  commercialStages,
  type CommercialActivityType,
  type CommercialAuditEventDto,
  type CommercialOutcome,
  type CommercialStage,
  type LeadActivityDto,
  type LeadNoteDto,
  type LeadWorkspaceDto,
} from "../../../../types/commercial";

const defaultPage = 1;
const pageSize = 20;

const stages = new Set<string>(commercialStages);
const outcomes = new Set<string>(commercialOutcomes);
const activityTypes = new Set<string>(commercialActivityTypes);

const allowedCommercialStageTransitions: Readonly<
  Record<CommercialStage, readonly CommercialStage[]>
> = {
  NOT_STARTED: ["ASSIGNED"],
  ASSIGNED: ["CONTACTED", "PAUSED"],
  CONTACTED: [
    "FOLLOW_UP",
    "MEETING",
    "PAUSED",
    "CLOSED_WON",
    "CLOSED_LOST",
  ],
  FOLLOW_UP: [
    "CONTACTED",
    "MEETING",
    "PAUSED",
    "CLOSED_WON",
    "CLOSED_LOST",
  ],
  MEETING: ["FOLLOW_UP", "PAUSED", "CLOSED_WON", "CLOSED_LOST"],
  PAUSED: ["ASSIGNED", "CONTACTED", "FOLLOW_UP"],
  CLOSED_WON: [],
  CLOSED_LOST: [],
};

type WorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly workspace: LeadWorkspaceDto }
  | { readonly status: "not_found" }
  | { readonly status: "unauthenticated" }
  | { readonly status: "denied" }
  | { readonly status: "error" };

type ListState<T> =
  | { readonly status: "loading" }
  | {
      readonly status: "success";
      readonly items: readonly T[];
      readonly page: number;
      readonly pageSize: number;
      readonly total: number | null;
    }
  | { readonly status: "unauthenticated" }
  | { readonly status: "denied" }
  | { readonly status: "not_found" }
  | { readonly status: "error" };

type MutationFeedbackState =
  | { readonly status: "idle" | "saving" | "success" }
  | {
      readonly status: "conflict" | "unauthenticated" | "denied" | "validation" | "unavailable" | "unknown";
      readonly message?: string;
      readonly field?: string;
    };

type EditState = MutationFeedbackState;
type AppendState = MutationFeedbackState;

function mutationFeedback(status: number, payload: unknown): MutationFeedbackState {
  const feedback = actionErrorFeedback(status, payload, "mutation");
  return { status: feedback.kind === "session" ? "unauthenticated" : feedback.kind, message: feedback.message };
}

interface WorkspaceDraft {
  readonly responsibleSubject: string;
  readonly commercialStage: CommercialStage;
  readonly nextAction: string;
  readonly nextActionDueDate: string;
  readonly commercialOutcome: CommercialOutcome | "";
}

interface ActivityDraft {
  readonly occurredAt: string;
  readonly activityType: CommercialActivityType;
  readonly activityOutcome: string;
  readonly summary: string;
}

interface ActivityEditorState {
  readonly draft: ActivityDraft;
  readonly baseline: ActivityDraft;
}

const unsavedChangesMessage =
  "Há alterações não salvas neste acompanhamento. Deseja sair mesmo assim?";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    isString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isWorkspace(value: unknown): value is LeadWorkspaceDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.workspace_id) &&
    isString(value.organization_id) &&
    isString(value.cnpj_normalizado) &&
    /^\d{14}$/.test(value.cnpj_normalizado) &&
    isString(value.observed_lead_run_id) &&
    isNullableString(value.responsible_subject) &&
    isString(value.commercial_stage) &&
    stages.has(value.commercial_stage) &&
    isNullableString(value.next_action) &&
    isNullableTimestamp(value.next_action_due_at) &&
    (value.commercial_outcome === null ||
      (isString(value.commercial_outcome) && outcomes.has(value.commercial_outcome))) &&
    isPositiveInteger(value.version) &&
    isString(value.created_by_subject) &&
    isString(value.updated_by_subject) &&
    isTimestamp(value.created_at) &&
    isTimestamp(value.updated_at) &&
    isNullableTimestamp(value.archived_at) &&
    isNullableString(value.archived_by_subject)
  );
}

function isActivity(value: unknown): value is LeadActivityDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.activity_id) &&
    isString(value.organization_id) &&
    isString(value.workspace_id) &&
    isString(value.observed_lead_run_id) &&
    isString(value.actor_subject) &&
    isTimestamp(value.occurred_at) &&
    isString(value.activity_type) &&
    activityTypes.has(value.activity_type) &&
    isNullableString(value.activity_outcome) &&
    isNullableString(value.summary) &&
    isTimestamp(value.created_at)
  );
}

function isNote(value: unknown): value is LeadNoteDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.note_id) &&
    isString(value.organization_id) &&
    isString(value.workspace_id) &&
    isString(value.observed_lead_run_id) &&
    isString(value.author_subject) &&
    isString(value.body) &&
    isTimestamp(value.created_at)
  );
}

function isAuditEvent(value: unknown): value is CommercialAuditEventDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.audit_event_id) &&
    isString(value.organization_id) &&
    isNullableString(value.workspace_id) &&
    isString(value.actor_subject) &&
    isString(value.action) &&
    isString(value.target_type) &&
    isString(value.target_id) &&
    isNullableString(value.observed_lead_run_id) &&
    isRecord(value.previous_metadata) &&
    isRecord(value.new_metadata) &&
    isRecord(value.metadata) &&
    isTimestamp(value.occurred_at)
  );
}

function isWorkspaceEnvelope(value: unknown): value is { readonly data: LeadWorkspaceDto } {
  return isRecord(value) && isWorkspace(value.data);
}

function isPaginatedEnvelope<T>(
  value: unknown,
  itemValidator: (item: unknown) => item is T,
): value is {
  readonly data: readonly T[];
  readonly meta: { readonly page: number; readonly pageSize: number; readonly total: number | null };
} {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) {
    return false;
  }

  return (
    value.data.every(itemValidator) &&
    isPositiveInteger(value.meta.page) &&
    isPositiveInteger(value.meta.pageSize) &&
    isNullableNonNegativeInteger(value.meta.total)
  );
}

function toWorkspaceDraft(workspace: LeadWorkspaceDto): WorkspaceDraft {
  return {
    responsibleSubject: workspace.responsible_subject ?? "",
    commercialStage: workspace.commercial_stage,
    nextAction: workspace.next_action ?? "",
    nextActionDueDate: toDateInputValue(workspace.next_action_due_at),
    commercialOutcome: workspace.commercial_outcome ?? "",
  };
}

function workspaceDraftHasChanges(
  draft: WorkspaceDraft,
  workspace: LeadWorkspaceDto,
): boolean {
  return (
    (draft.responsibleSubject === "" ? null : draft.responsibleSubject) !==
      workspace.responsible_subject ||
    draft.commercialStage !== workspace.commercial_stage ||
    (draft.nextAction === "" ? null : draft.nextAction) !==
      workspace.next_action ||
    draft.nextActionDueDate !== toDateInputValue(workspace.next_action_due_at) ||
    (draft.commercialOutcome === "" ? null : draft.commercialOutcome) !==
      workspace.commercial_outcome
  );
}

function refreshWorkspaceDraft(
  draft: WorkspaceDraft | null,
  previous: LeadWorkspaceDto,
  refreshed: LeadWorkspaceDto,
): WorkspaceDraft {
  const next = toWorkspaceDraft(refreshed);
  if (draft === null) return next;
  const baseline = toWorkspaceDraft(previous);
  return {
    responsibleSubject: draft.responsibleSubject === baseline.responsibleSubject
      ? next.responsibleSubject : draft.responsibleSubject,
    commercialStage: draft.commercialStage === baseline.commercialStage
      ? next.commercialStage : draft.commercialStage,
    nextAction: draft.nextAction === baseline.nextAction
      ? next.nextAction : draft.nextAction,
    nextActionDueDate: draft.nextActionDueDate === baseline.nextActionDueDate
      ? next.nextActionDueDate : draft.nextActionDueDate,
    commercialOutcome: draft.commercialOutcome === baseline.commercialOutcome
      ? next.commercialOutcome : draft.commercialOutcome,
  };
}

function activityDraftHasChanges(
  draft: ActivityDraft,
  baseline: ActivityDraft,
): boolean {
  return (
    draft.occurredAt !== baseline.occurredAt ||
    draft.activityType !== baseline.activityType ||
    draft.activityOutcome !== baseline.activityOutcome ||
    draft.summary !== baseline.summary
  );
}

function useUnsavedChangesWarning(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleLinkClick(event: MouseEvent): void {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }

      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        link === null ||
        link.hasAttribute("download") ||
        (link.target !== "" && link.target !== "_self")
      ) {
        return;
      }

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        return;
      }

      if (!window.confirm(unsavedChangesMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [enabled]);
}

function toDateInputValue(value: string | null): string {
  return value === null ? "" : getFollowUpDateInputValue(0, new Date(value));
}

function padDatetimeComponent(value: number): string {
  return String(value).padStart(2, "0");
}

function toDatetimeLocalValue(value: Date): string {
  return `${value.getFullYear()}-${padDatetimeComponent(value.getMonth() + 1)}-${padDatetimeComponent(value.getDate())}T${padDatetimeComponent(value.getHours())}:${padDatetimeComponent(value.getMinutes())}`;
}

function currentDatetimeLocalValue(): string {
  return toDatetimeLocalValue(new Date());
}

function createActivityDraft(): ActivityDraft {
  return {
    occurredAt: currentDatetimeLocalValue(),
    activityType: "CALL",
    activityOutcome: "",
    summary: "",
  };
}

function toUtcNoon(value: string): string | null {
  if (value === "") {
    return null;
  }

  const candidate = `${value}T12:00:00.000Z`;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function toUtcTimestamp(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }

  const candidate = new Date(value);
  if (
    !Number.isFinite(candidate.getTime()) ||
    candidate.getFullYear() !== Number(match[1]) ||
    candidate.getMonth() + 1 !== Number(match[2]) ||
    candidate.getDate() !== Number(match[3]) ||
    candidate.getHours() !== Number(match[4]) ||
    candidate.getMinutes() !== Number(match[5])
  ) {
    return null;
  }

  return candidate.toISOString();
}

function stageLabel(stage: CommercialStage): string {
  switch (stage) {
    case "NOT_STARTED":
      return "Não iniciado";
    case "ASSIGNED":
      return "Atribuído";
    case "CONTACTED":
      return "Contatado";
    case "FOLLOW_UP":
      return "Acompanhamento";
    case "MEETING":
      return "Reunião";
    case "PAUSED":
      return "Pausado";
    case "CLOSED_WON":
      return "Ganho";
    case "CLOSED_LOST":
      return "Perdido";
  }
}

function outcomeLabel(outcome: CommercialOutcome): string {
  switch (outcome) {
    case "WON":
      return "Ganho";
    case "LOST":
      return "Perdido";
    case "NO_RESPONSE":
      return "Sem resposta";
    case "NOT_NOW":
      return "Não é o momento";
    case "DISQUALIFIED":
      return "Desqualificado";
  }
}

function activityTypeLabel(activityType: CommercialActivityType): string {
  switch (activityType) {
    case "CALL":
      return "Ligação";
    case "EMAIL":
      return "E-mail";
    case "WHATSAPP":
      return "WhatsApp";
    case "MEETING":
      return "Reunião";
    case "TASK":
      return "Tarefa";
    case "OTHER":
      return "Outro";
  }
}

function auditActionLabel(action: string): string {
  switch (action) {
    case "WORKSPACE_CREATED":
      return "Acompanhamento comercial iniciado";
    case "WORKSPACE_UPDATED":
      return "Acompanhamento comercial atualizado";
    case "WORKSPACE_ASSIGNED":
      return "Responsável comercial atualizado";
    case "STAGE_CHANGED":
      return "Estágio comercial atualizado";
    case "NEXT_ACTION_CHANGED":
      return "Próxima ação atualizada";
    case "ACTIVITY_APPENDED":
      return "Atividade registrada";
    case "NOTE_APPENDED":
      return "Nota adicionada";
    case "WORKSPACE_ARCHIVED":
      return "Acompanhamento comercial arquivado";
    default:
      return "Registro comercial atualizado";
  }
}

function auditChange(event: CommercialAuditEventDto): string | null {
  const field = event.metadata.field;
  const from = event.metadata.from;
  const to = event.metadata.to;

  if (field === "commercial_stage" && isString(from) && isString(to) && stages.has(from) && stages.has(to)) {
    return `De ${stageLabel(from as CommercialStage)} para ${stageLabel(to as CommercialStage)}`;
  }

  if (field === "commercial_outcome" && isString(to) && outcomes.has(to)) {
    return `Desfecho: ${outcomeLabel(to as CommercialOutcome)}`;
  }

  return null;
}

function safeGetInit(signal?: AbortSignal): RequestInit {
  return {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  };
}

function responseState(status: number): WorkspaceState {
  if (status === 401) {
    return { status: "unauthenticated" };
  }

  if (status === 403) {
    return { status: "denied" };
  }

  if (status === 404) {
    return { status: "not_found" };
  }

  return { status: "error" };
}

function listResponseState<T>(status: number): ListState<T> {
  if (status === 401) {
    return { status: "unauthenticated" };
  }

  if (status === 403) {
    return { status: "denied" };
  }

  if (status === 404) {
    return { status: "not_found" };
  }

  return { status: "error" };
}

export default function CommercialWorkspaceDetailPage() {
  const { hasPermission } = usePrivateCapabilities();
  const canRead = hasPermission("commercial:read");
  const canReadAudit = hasPermission("audit:read");
  const [accessFailure, setAccessFailure] = useState<"unauthenticated" | "denied" | null>(null);
  const handleSessionExpired = useCallback(() => setAccessFailure("unauthenticated"), []);
  const canAccess = canRead && accessFailure === null;
  const canWrite = canAccess && hasPermission("commercial:write");
  const canAssign = canWrite && hasPermission("commercial:assign");
  const canReadApproach =
    hasPermission("leads:read") && hasPermission("sensitive:read");
  const params = useParams<{ readonly id?: string }>();
  const searchParams = useSearchParams();
  const workspaceId = typeof params.id === "string" ? params.id : "";
  const workspaceLoadGeneration = useRef(0);
  const workspaceMutationPending = useRef(false);
  const activityMutationPending = useRef(false);
  const noteMutationPending = useRef(false);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    status: "loading",
  });
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft | null>(null);
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  const [workspaceRefreshState, setWorkspaceRefreshState] = useState<"idle" | "loading" | "error">("idle");
  const [activityPage, setActivityPage] = useState(defaultPage);
  const [activityReloadKey, setActivityReloadKey] = useState(0);
  const [activitiesState, setActivitiesState] = useState<ListState<LeadActivityDto>>({
    status: "loading",
  });
  const [activityEditor, setActivityEditor] = useState<ActivityEditorState>(() => {
    const initialDraft = createActivityDraft();
    return { draft: initialDraft, baseline: initialDraft };
  });
  const activityDraft = activityEditor.draft;
  const [activityAppendState, setActivityAppendState] = useState<AppendState>({
    status: "idle",
  });
  const [notePage, setNotePage] = useState(defaultPage);
  const [noteReloadKey, setNoteReloadKey] = useState(0);
  const [notesState, setNotesState] = useState<ListState<LeadNoteDto>>({
    status: "loading",
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [noteAppendState, setNoteAppendState] = useState<AppendState>({
    status: "idle",
  });
  const [auditPage, setAuditPage] = useState(defaultPage);
  const [auditReloadKey, setAuditReloadKey] = useState(0);
  const [auditState, setAuditState] = useState<ListState<CommercialAuditEventDto>>({
    status: "loading",
  });
  const workspaceIsDirty =
    workspaceState.status === "success" &&
    workspaceDraft !== null &&
    workspaceDraftHasChanges(workspaceDraft, workspaceState.workspace);
  const activityIsDirty = activityDraftHasChanges(
    activityDraft,
    activityEditor.baseline,
  );
  const hasUnsavedWork =
    workspaceIsDirty || activityIsDirty || noteDraft !== "";

  useUnsavedChangesWarning(canWrite && hasUnsavedWork);

  const loadWorkspace = useCallback(async (
    signal?: AbortSignal,
    previousWorkspace?: LeadWorkspaceDto,
  ): Promise<void> => {
    if (!canAccess) return;
    const generation = ++workspaceLoadGeneration.current;
    await Promise.resolve();

    if (signal?.aborted || generation !== workspaceLoadGeneration.current) {
      return;
    }

    if (workspaceId === "") {
      setWorkspaceState({ status: "not_found" });
      return;
    }

    if (previousWorkspace === undefined) {
      setWorkspaceState({ status: "loading" });
    } else {
      setWorkspaceRefreshState("loading");
    }

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}`,
        safeGetInit(signal),
      );

      if (signal?.aborted || generation !== workspaceLoadGeneration.current) {
        return;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setAccessFailure(response.status === 401 ? "unauthenticated" : "denied");
        }
        if (previousWorkspace !== undefined && response.status !== 401 && response.status !== 403 && response.status !== 404) {
          setWorkspaceRefreshState("error");
          return;
        }
        setWorkspaceState(responseState(response.status));
        return;
      }

      const payload: unknown = await response.json();
      if (signal?.aborted || generation !== workspaceLoadGeneration.current) {
        return;
      }

      if (!isWorkspaceEnvelope(payload) || payload.data.workspace_id !== workspaceId) {
        if (previousWorkspace !== undefined) {
          setWorkspaceRefreshState("error");
          return;
        }
        setWorkspaceState({ status: "error" });
        return;
      }

      setWorkspaceState({ status: "success", workspace: payload.data });
      setWorkspaceDraft((draft) => previousWorkspace === undefined
        ? toWorkspaceDraft(payload.data)
        : refreshWorkspaceDraft(draft, previousWorkspace, payload.data));
      setWorkspaceRefreshState("idle");
      setEditState((current) => current.status === "unknown" ? { status: "idle" } : current);
    } catch {
      if (!signal?.aborted && generation === workspaceLoadGeneration.current) {
        if (previousWorkspace === undefined) {
          setWorkspaceState({ status: "error" });
        } else {
          setWorkspaceRefreshState("error");
        }
      }
    }
  }, [canAccess, workspaceId]);

  useEffect(() => {
    if (!canAccess) return;
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      void loadWorkspace(abortController.signal);
    }, 0);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
      workspaceLoadGeneration.current += 1;
    };
  }, [canAccess, loadWorkspace]);

  useEffect(() => {
    if (!canAccess) return;
    const abortController = new AbortController();

    async function loadActivities(): Promise<void> {
      await Promise.resolve();

      if (workspaceId === "") {
        setActivitiesState({ status: "not_found" });
        return;
      }

      setActivitiesState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/activities?page=${activityPage}&pageSize=${pageSize}`,
          safeGetInit(abortController.signal),
        );

        if (abortController.signal.aborted) return;

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setAccessFailure(response.status === 401 ? "unauthenticated" : "denied");
          }
          setActivitiesState(listResponseState<LeadActivityDto>(response.status));
          return;
        }

        const payload: unknown = await response.json();
        if (abortController.signal.aborted) return;
        if (!isPaginatedEnvelope(payload, isActivity)) {
          setActivitiesState({ status: "error" });
          return;
        }

        setActivitiesState({
          status: "success",
          items: payload.data,
          page: payload.meta.page,
          pageSize: payload.meta.pageSize,
          total: payload.meta.total,
        });
      } catch {
        if (!abortController.signal.aborted) {
          setActivitiesState({ status: "error" });
        }
      }
    }

    const timeout = setTimeout(() => {
      void loadActivities();
    }, 0);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [canAccess, activityPage, activityReloadKey, workspaceId]);

  useEffect(() => {
    if (!canAccess) return;
    const abortController = new AbortController();

    async function loadNotes(): Promise<void> {
      await Promise.resolve();

      if (workspaceId === "") {
        setNotesState({ status: "not_found" });
        return;
      }

      setNotesState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/notes?page=${notePage}&pageSize=${pageSize}`,
          safeGetInit(abortController.signal),
        );

        if (abortController.signal.aborted) return;

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setAccessFailure(response.status === 401 ? "unauthenticated" : "denied");
          }
          setNotesState(listResponseState<LeadNoteDto>(response.status));
          return;
        }

        const payload: unknown = await response.json();
        if (abortController.signal.aborted) return;
        if (!isPaginatedEnvelope(payload, isNote)) {
          setNotesState({ status: "error" });
          return;
        }

        setNotesState({
          status: "success",
          items: payload.data,
          page: payload.meta.page,
          pageSize: payload.meta.pageSize,
          total: payload.meta.total,
        });
      } catch {
        if (!abortController.signal.aborted) {
          setNotesState({ status: "error" });
        }
      }
    }

    const timeout = setTimeout(() => {
      void loadNotes();
    }, 0);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [canAccess, notePage, noteReloadKey, workspaceId]);

  useEffect(() => {
    if (!canAccess || !canReadAudit) return;
    const abortController = new AbortController();

    async function loadAudit(): Promise<void> {
      await Promise.resolve();

      if (workspaceId === "") {
        setAuditState({ status: "not_found" });
        return;
      }

      setAuditState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/audit?page=${auditPage}&pageSize=${pageSize}`,
          safeGetInit(abortController.signal),
        );

        if (abortController.signal.aborted) return;

        if (!response.ok) {
          if (response.status === 401) setAccessFailure("unauthenticated");
          setAuditState(listResponseState<CommercialAuditEventDto>(response.status));
          return;
        }

        const payload: unknown = await response.json();
        if (abortController.signal.aborted) return;
        if (!isPaginatedEnvelope(payload, isAuditEvent)) {
          setAuditState({ status: "error" });
          return;
        }

        setAuditState({
          status: "success",
          items: payload.data,
          page: payload.meta.page,
          pageSize: payload.meta.pageSize,
          total: payload.meta.total,
        });
      } catch {
        if (!abortController.signal.aborted) {
          setAuditState({ status: "error" });
        }
      }
    }

    const timeout = setTimeout(() => {
      void loadAudit();
    }, 0);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [canAccess, canReadAudit, auditPage, auditReloadKey, workspaceId]);

  function handleCadenceChanged(): void {
    if (workspaceState.status === "success") {
      void loadWorkspace(undefined, workspaceState.workspace);
    }
    setActivityPage(defaultPage);
    setActivityReloadKey((current) => current + 1);
    reloadAudit();
  }

  function reloadAudit(): void {
    setAuditPage(defaultPage);
    setAuditReloadKey((current) => current + 1);
  }

  async function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canWrite || workspaceRefreshState !== "idle" || workspaceMutationPending.current || editState.status === "unknown") return;

    if (workspaceState.status !== "success" || workspaceDraft === null) {
      return;
    }

    const responsibleSubject = workspaceDraft.responsibleSubject;
    if (
      responsibleSubject !== "" &&
      (responsibleSubject !== responsibleSubject.trim() || Array.from(responsibleSubject).length > 256)
    ) {
      setEditState({ status: "validation", field: "responsible", message: "Informe um responsável válido, com até 256 caracteres, ou deixe o campo vazio." });
      return;
    }

    if (Array.from(workspaceDraft.nextAction).length > 500) {
      setEditState({ status: "validation", field: "nextAction", message: "A próxima ação deve ter até 500 caracteres. Reduza o texto antes de salvar." });
      return;
    }

    const beforeSave = workspaceState.workspace;
    const dueAt =
      workspaceDraft.nextActionDueDate === toDateInputValue(beforeSave.next_action_due_at)
        ? beforeSave.next_action_due_at
        : toUtcNoon(workspaceDraft.nextActionDueDate);
    if (workspaceDraft.nextActionDueDate !== "" && dueAt === null) {
      setEditState({ status: "validation", field: "dueDate", message: "Informe uma data válida para a próxima ação." });
      return;
    }

    const optimisticWorkspace: LeadWorkspaceDto = {
      ...beforeSave,
      responsible_subject: responsibleSubject === "" ? null : responsibleSubject,
      commercial_stage: workspaceDraft.commercialStage,
      next_action: workspaceDraft.nextAction === "" ? null : workspaceDraft.nextAction,
      next_action_due_at: dueAt,
      commercial_outcome: workspaceDraft.commercialOutcome === "" ? null : workspaceDraft.commercialOutcome,
    };
    const update = {
      expected_version: beforeSave.version,
      ...(optimisticWorkspace.responsible_subject !==
        beforeSave.responsible_subject
        ? { responsible_subject: optimisticWorkspace.responsible_subject }
        : {}),
      ...(optimisticWorkspace.commercial_stage !== beforeSave.commercial_stage
        ? { commercial_stage: optimisticWorkspace.commercial_stage }
        : {}),
      ...(optimisticWorkspace.next_action !== beforeSave.next_action
        ? { next_action: optimisticWorkspace.next_action }
        : {}),
      ...(optimisticWorkspace.next_action_due_at !==
        beforeSave.next_action_due_at
        ? { next_action_due_at: optimisticWorkspace.next_action_due_at }
        : {}),
      ...(optimisticWorkspace.commercial_outcome !==
        beforeSave.commercial_outcome
        ? { commercial_outcome: optimisticWorkspace.commercial_outcome }
        : {}),
    };

    if (Object.keys(update).length === 1) {
      setEditState({ status: "idle" });
      return;
    }

    workspaceMutationPending.current = true;
    setWorkspaceState({ status: "success", workspace: optimisticWorkspace });
    setEditState({ status: "saving" });

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify(update),
      });

      if (response.status === 409) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        await loadWorkspace(undefined, beforeSave);
        setEditState({ status: "conflict", message: "O acompanhamento foi alterado por outra pessoa. Seu rascunho foi preservado; consulte os dados atuais e revise as alterações antes de salvar." });
        return;
      }

      if (response.status === 401) {
        setAccessFailure("unauthenticated");
        return;
      }

      if (response.status === 403) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        setEditState({ status: "denied" });
        await loadWorkspace(undefined, beforeSave);
        return;
      }

      if (response.status !== 200) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        setEditState(mutationFeedback(response.status, await response.json().catch(() => null)));
        return;
      }

      const payload: unknown = await response.json();
      if (!isWorkspaceEnvelope(payload) || payload.data.workspace_id !== workspaceId || payload.data.version <= beforeSave.version) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        setEditState({ status: "unknown", message: unknownMutationMessage });
        return;
      }

      setWorkspaceState({ status: "success", workspace: payload.data });
      setWorkspaceDraft(toWorkspaceDraft(payload.data));
      setEditState({ status: "success" });
      reloadAudit();
    } catch {
      setWorkspaceState({ status: "success", workspace: beforeSave });
      setEditState({ status: "unknown", message: unknownMutationMessage });
    } finally {
      workspaceMutationPending.current = false;
    }
  }

  async function handleActivitySubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canWrite || activityMutationPending.current || activityAppendState.status === "unknown") return;
    const occurredAt = toUtcTimestamp(activityDraft.occurredAt);

    if (
      occurredAt === null ||
      Array.from(activityDraft.activityOutcome).length > 120 ||
      Array.from(activityDraft.summary).length > 1000
    ) {
      setActivityAppendState({ status: "validation", message: "Informe uma data e horário válidos, um resultado de até 120 caracteres e um resumo de até 1.000 caracteres." });
      return;
    }

    activityMutationPending.current = true;
    setActivityAppendState({ status: "saving" });

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/activities`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({
          occurred_at: occurredAt,
          activity_type: activityDraft.activityType,
          activity_outcome: activityDraft.activityOutcome === "" ? null : activityDraft.activityOutcome,
          summary: activityDraft.summary === "" ? null : activityDraft.summary,
        }),
      });

      if (response.status === 401) {
        setAccessFailure("unauthenticated");
        return;
      }

      if (response.status === 403) {
        setActivityAppendState({ status: "denied" });
        if (workspaceState.status === "success") await loadWorkspace(undefined, workspaceState.workspace);
        return;
      }

      if (response.status !== 201) {
        setActivityAppendState(mutationFeedback(response.status, await response.json().catch(() => null)));
        return;
      }

      const payload: unknown = await response.json();
      const appendedActivity = isRecord(payload) ? payload.data : undefined;
      if (!isActivity(appendedActivity) || appendedActivity.workspace_id !== workspaceId) {
        setActivityAppendState({ status: "unknown", message: unknownMutationMessage });
        return;
      }

      setActivityPage(defaultPage);
      setActivityReloadKey((current) => current + 1);
      const resetDraft = createActivityDraft();
      setActivityEditor({ draft: resetDraft, baseline: resetDraft });
      setActivityAppendState({ status: "success" });
      reloadAudit();
    } catch {
      setActivityAppendState({ status: "unknown", message: unknownMutationMessage });
    } finally {
      activityMutationPending.current = false;
    }
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canWrite || noteMutationPending.current || noteAppendState.status === "unknown") return;

    if (
      noteDraft === "" ||
      noteDraft !== noteDraft.trim() ||
      Array.from(noteDraft).length > 4000
    ) {
      setNoteAppendState({ status: "validation", field: "note", message: "Escreva uma nota com até 4.000 caracteres e remova os espaços no início e no fim." });
      return;
    }

    noteMutationPending.current = true;
    setNoteAppendState({ status: "saving" });

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/notes`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({ body: noteDraft }),
      });

      if (response.status === 401) {
        setAccessFailure("unauthenticated");
        return;
      }

      if (response.status === 403) {
        setNoteAppendState({ status: "denied" });
        if (workspaceState.status === "success") await loadWorkspace(undefined, workspaceState.workspace);
        return;
      }

      if (response.status !== 201) {
        setNoteAppendState(mutationFeedback(response.status, await response.json().catch(() => null)));
        return;
      }

      const payload: unknown = await response.json();
      const appendedNote = isRecord(payload) ? payload.data : undefined;
      if (!isNote(appendedNote) || appendedNote.workspace_id !== workspaceId) {
        setNoteAppendState({ status: "unknown", message: unknownMutationMessage });
        return;
      }

      setNotePage(defaultPage);
      setNoteReloadKey((current) => current + 1);
      setNoteDraft("");
      setNoteAppendState({ status: "success" });
      reloadAudit();
    } catch {
      setNoteAppendState({ status: "unknown", message: unknownMutationMessage });
    } finally {
      noteMutationPending.current = false;
    }
  }

  if (accessFailure === "unauthenticated") {
    return <WorkspacePageState alert signIn title="Acesso necessário" description="Entre para acessar este acompanhamento comercial." />;
  }

  if (!canRead || accessFailure === "denied") {
    return <WorkspacePageState alert title="Acesso restrito" description="Você não tem acesso a este acompanhamento comercial." />;
  }

  if (workspaceState.status === "loading") {
    return <WorkspaceLoading />;
  }

  if (workspaceState.status === "not_found") {
    return <WorkspacePageState title="Acompanhamento não encontrado" description="Este acompanhamento comercial não está disponível para sua organização." />;
  }

  if (workspaceState.status === "unauthenticated") {
    return <WorkspacePageState alert signIn title="Acesso necessário" description="Entre para acessar este acompanhamento comercial." />;
  }

  if (workspaceState.status === "denied") {
    return <WorkspacePageState alert title="Acesso restrito" description="Você não tem acesso a este acompanhamento comercial." />;
  }

  if (workspaceState.status === "error" || workspaceDraft === null) {
    return <WorkspacePageState alert title="Não foi possível carregar o acompanhamento" description="Atualize a página para tentar novamente." />;
  }

  const workspace = workspaceState.workspace;
  const leadListReturnHref = resolveLeadListReturnHref(
    searchParams.get("returnTo"),
    workspace.cnpj_normalizado,
  );
  const workspaceReturnTo = appendReturnTo(
    `/workspaces/${encodeURIComponent(workspace.workspace_id)}`,
    leadListReturnHref,
  );

  function resetWorkspaceDraft(): void {
    setWorkspaceDraft(toWorkspaceDraft(workspace));
    setEditState({ status: "idle" });
  }

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="border-b border-[oklch(78%_0.025_82)] pb-8">
        <nav aria-label="Navegação do acompanhamento" className="mb-6 flex flex-wrap gap-4">
          <Link
            href={leadListReturnHref}
            aria-label="Voltar para leads"
            className="ui-action ui-action--quiet"
          >
            ← Voltar para leads
          </Link>
          <Link
            href={appendReturnTo(
              `/leads/${encodeURIComponent(workspace.cnpj_normalizado)}?leadRunId=${encodeURIComponent(workspace.observed_lead_run_id)}`,
              workspaceReturnTo,
            )}
            aria-label="Ver avaliação da empresa"
            className="ui-action ui-action--secondary"
          >
            Ver avaliação da empresa →
          </Link>
        </nav>
        <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
          Espaço de trabalho
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-serif text-4xl tracking-[-0.035em] sm:text-5xl">
              Acompanhamento comercial
            </h1>
            <p className="mt-3 text-sm leading-6 text-[oklch(43%_0.03_252)]">
              CNPJ {formatCnpj(workspace.cnpj_normalizado)}
            </p>
          </div>
          <StageBadge stage={workspace.commercial_stage} />
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          As alterações aqui afetam somente o acompanhamento comercial. A recomendação da análise permanece a mesma.
        </p>
      </header>

      <WorkspaceTaskNavigation showApproach={canReadApproach} />

      {workspaceRefreshState === "loading" ? (
        <p role="status" className="mt-5 text-sm leading-6">Atualizando acompanhamento após a qualificação…</p>
      ) : workspaceRefreshState === "error" ? (
        <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 text-sm leading-6">
          <p>Não foi possível atualizar o acompanhamento. Seus rascunhos foram preservados.</p>
          <button type="button" className="ui-action ui-action--secondary" onClick={() => void loadWorkspace(undefined, workspace)}>Atualizar acompanhamento</button>
        </div>
      ) : null}

      <section
        id="workspace-state"
        className="mt-8 grid scroll-mt-6 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"
      >
        <div>
          {!canWrite ? (
            <p className="mb-5 border-l-2 border-[oklch(68%_0.11_61)] pl-4 text-sm font-semibold leading-6">
              Este acompanhamento está disponível somente para leitura.
            </p>
          ) : null}
          <WorkspaceForm
            draft={workspaceDraft}
            currentStage={workspace.commercial_stage}
            editState={editState}
            isDirty={workspaceDraftHasChanges(workspaceDraft, workspace)}
            canWrite={canWrite && workspaceRefreshState === "idle"}
            canAssign={canAssign}
            onChange={setWorkspaceDraft}
            onReset={resetWorkspaceDraft}
            onSubmit={handleWorkspaceSubmit}
            onReload={() => void loadWorkspace(undefined, workspace)}
          />
        </div>
        <WorkspaceFacts workspace={workspace} />
      </section>

      {canReadApproach ? (
        <WorkspaceApproachMessage
          cnpj={workspace.cnpj_normalizado}
          leadRunId={workspace.observed_lead_run_id}
          leadReturnTo={workspaceReturnTo}
          onSessionExpired={handleSessionExpired}
        />
      ) : null}

      <QualificationCadence
        workspaceId={workspace.workspace_id}
        canWrite={canWrite}
        onCadenceChanged={handleCadenceChanged}
        onSessionExpired={handleSessionExpired}
      />

      <section className="mt-12 grid gap-10 xl:grid-cols-2">
        <ActivitiesPanel
          state={activitiesState}
          draft={activityDraft}
          appendState={activityAppendState}
          onDraftChange={(draft) =>
            setActivityEditor((current) => ({ ...current, draft }))
          }
          onSubmit={handleActivitySubmit}
          onPageChange={setActivityPage}
          canWrite={canWrite}
          onReload={() => { setActivitiesState({ status: "loading" }); setActivityPage(defaultPage); setActivityReloadKey((current) => current + 1); }}
          onReviewed={() => setActivityAppendState({ status: "idle" })}
        />
        <NotesPanel
          state={notesState}
          draft={noteDraft}
          appendState={noteAppendState}
          onDraftChange={setNoteDraft}
          onSubmit={handleNoteSubmit}
          onPageChange={setNotePage}
          canWrite={canWrite}
          onReload={() => { setNotesState({ status: "loading" }); setNotePage(defaultPage); setNoteReloadKey((current) => current + 1); }}
          onReviewed={() => setNoteAppendState({ status: "idle" })}
        />
      </section>

      <AuditPanel state={canReadAudit ? auditState : { status: "denied" }} onPageChange={setAuditPage} onReload={reloadAudit} />
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando acompanhamento comercial"
      aria-live="polite"
      className="mx-auto w-full max-w-[96rem] border-y border-[oklch(82%_0.025_82)] py-8"
    >
      <span className="sr-only">Carregando acompanhamento comercial</span>
      <div aria-hidden="true" className="animate-pulse space-y-5 motion-reduce:animate-none">
        <div className="h-4 w-40 bg-[oklch(89%_0.02_82)]" />
        <div className="h-14 w-4/5 max-w-3xl bg-[oklch(91%_0.018_82)]" />
        <div className="h-5 w-64 bg-[oklch(93%_0.014_82)]" />
      </div>
    </section>
  );
}

function WorkspacePageState({
  alert = false,
  signIn = false,
  title,
  description,
}: {
  readonly alert?: boolean;
  readonly signIn?: boolean;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <section
      role={alert ? "alert" : undefined}
      className="mx-auto w-full max-w-4xl border-y border-[oklch(82%_0.025_82)] py-12"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Acompanhamento comercial
      </p>
      <h1 className="mt-3 font-serif text-4xl tracking-[-0.035em]">{title}</h1>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {description}
      </p>
      {signIn ? <Link href="/login" className="ui-action ui-action--primary mt-6">Entrar novamente</Link> : null}
    </section>
  );
}

function StageBadge({ stage }: { readonly stage: CommercialStage }) {
  return (
    <span className="inline-flex min-h-7 items-center border border-[oklch(68%_0.11_61)] bg-[oklch(96%_0.035_61)] px-2.5 py-1 text-xs font-bold leading-4 text-[oklch(36%_0.08_52)]">
      Estágio: {stageLabel(stage)}
    </span>
  );
}

function WorkspaceForm({
  draft,
  currentStage,
  editState,
  isDirty,
  canWrite,
  canAssign,
  onChange,
  onReset,
  onSubmit,
  onReload,
}: {
  readonly draft: WorkspaceDraft;
  readonly currentStage: CommercialStage;
  readonly editState: EditState;
  readonly isDirty: boolean;
  readonly canWrite: boolean;
  readonly canAssign: boolean;
  readonly onChange: (draft: WorkspaceDraft) => void;
  readonly onReset: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onReload: () => void;
}) {
  const errorMessage = "message" in editState && editState.message ? editState.message
    : editState.status === "denied" ? "Você não tem acesso para salvar este acompanhamento comercial. Solicite ao responsável a verificação do acesso."
    : null;

  return (
    <form onSubmit={onSubmit} className="border-t-2 border-[oklch(24%_0.035_252)] pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-[oklch(45%_0.105_174)] uppercase">
            Estado comercial
          </p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">Atualizar acompanhamento</h2>
        </div>
        {editState.status === "saving" ? <span role="status" className="text-sm font-semibold">Salvando acompanhamento…</span> : null}
      </div>

      {editState.status === "success" ? (
        <p role="status" className="mt-5 text-sm font-semibold text-[oklch(30%_0.09_150)]">
          Acompanhamento comercial salvo.
        </p>
      ) : null}
      {isDirty ? (
        <div
          role="status"
          className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-[oklch(36%_0.08_52)]"
        >
          <span>Alterações não salvas.</span>
          <button
            type="button"
            onClick={onReset}
            className="ui-action ui-action--quiet"
          >
            Descartar alterações
          </button>
        </div>
      ) : null}
      {errorMessage !== null && (editState.status !== "validation" || editState.field === undefined) ? (
        <p role="alert" className="mt-5 text-sm font-semibold text-[oklch(42%_0.15_28)]">
          {errorMessage}
        </p>
      ) : null}

      {editState.status === "unknown" || editState.status === "conflict" ? (
        <button type="button" onClick={onReload} className="ui-action ui-action--secondary mt-3">Consultar acompanhamento atual</button>
      ) : null}

      <fieldset disabled={editState.status === "saving" || !canWrite} className="min-w-0 border-0 p-0">
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Responsável
            <input
              disabled={!canAssign}
              aria-label="Responsável"
              aria-describedby={editState.status === "validation" && editState.field === "responsible" ? "workspace-responsible-error" : "workspace-responsible-hint"}
              aria-invalid={editState.status === "validation" && editState.field === "responsible" || undefined}
              value={draft.responsibleSubject}
              onChange={(event) => onChange({ ...draft, responsibleSubject: event.target.value })}
              className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            />
            <span id="workspace-responsible-hint" className="text-xs font-normal leading-5">Use o identificador corporativo do responsável, informado por quem administra os acessos.</span>
            {editState.status === "validation" && editState.field === "responsible" ? <span id="workspace-responsible-error" role="alert" className="text-xs font-normal">{editState.message}</span> : null}
            {!canAssign ? <span className="text-xs font-normal">Seu acesso não permite alterar o responsável. Solicite essa permissão ao responsável pelo acesso.</span> : null}
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Estágio comercial
            <select
              value={draft.commercialStage}
              onChange={(event) => onChange({ ...draft, commercialStage: event.target.value as CommercialStage })}
              className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            >
              {[currentStage, ...allowedCommercialStageTransitions[currentStage]].map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabel(stage)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            Próxima ação
            <input
              aria-describedby={editState.status === "validation" && editState.field === "nextAction" ? "workspace-next-action-error" : undefined}
              aria-invalid={editState.status === "validation" && editState.field === "nextAction" || undefined}
              value={draft.nextAction}
              onChange={(event) => onChange({ ...draft, nextAction: event.target.value })}
              placeholder="Ex.: ligar para combinar uma reunião"
              className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            />
          </label>
          {editState.status === "validation" && editState.field === "nextAction" ? <p id="workspace-next-action-error" role="alert" className="text-xs">{editState.message}</p> : null}
          <div>
            <label className="grid gap-2 text-sm font-semibold">
              Prazo da próxima ação
              <input
                type="date"
                value={draft.nextActionDueDate}
                onChange={(event) => onChange({ ...draft, nextActionDueDate: event.target.value })}
                className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
              />
            </label>
            <div role="group" aria-label="Atalhos para o prazo da próxima ação" className="mt-2 flex flex-wrap gap-1">
              {([
                { days: 0, label: "Hoje" },
                { days: 1, label: "Amanhã" },
                { days: 7, label: "Em 7 dias" },
              ] as const).map(({ days, label }) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => onChange({ ...draft, nextActionDueDate: getFollowUpDateInputValue(days) })}
                  className="ui-action ui-action--quiet text-xs"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            Desfecho comercial
            <select
              value={draft.commercialOutcome}
              onChange={(event) => onChange({ ...draft, commercialOutcome: event.target.value as CommercialOutcome | "" })}
              className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            >
              <option value="">Sem desfecho</option>
              {commercialOutcomes.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcomeLabel(outcome)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          aria-label="Salvar acompanhamento"
          disabled={editState.status === "saving" || editState.status === "unknown" || !isDirty}
          className="mt-7 inline-flex min-h-11 items-center border border-[oklch(24%_0.035_252)] bg-[oklch(24%_0.035_252)] px-5 py-2 text-sm font-bold text-[oklch(97%_0.012_82)] transition-colors hover:bg-[oklch(35%_0.05_246)] disabled:cursor-wait disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)]"
        >
          {editState.status === "saving" ? "Salvando acompanhamento…" : "Salvar acompanhamento"}
        </button>
        {editState.status === "validation" && editState.field === "dueDate" ? <p role="alert" className="mt-2 text-sm">{editState.message}</p> : null}
        {!isDirty ? <p className="mt-2 text-xs">Altere um campo para salvar o acompanhamento.</p> : null}
      </fieldset>
    </form>
  );
}

function WorkspaceFacts({ workspace }: { readonly workspace: LeadWorkspaceDto }) {
  const followUpStatus = getCommercialFollowUpStatus(workspace);
  return (
    <aside className="border-y border-[oklch(82%_0.025_82)] py-6 xl:border-t-2 xl:border-[oklch(24%_0.035_252)]">
      <p className="text-xs font-bold tracking-[0.14em] text-[oklch(48%_0.025_252)] uppercase">
        Registro do acompanhamento
      </p>
      <dl className="mt-5 grid gap-5 text-sm">
        <div>
          <dt className="text-[oklch(43%_0.03_252)]">Responsável</dt>
          <dd className="mt-1 font-semibold">{workspace.responsible_subject ?? "Sem responsável"}</dd>
        </div>
        <div>
          <dt className="text-[oklch(43%_0.03_252)]">Próxima ação</dt>
          <dd className="mt-1 font-semibold">{workspace.next_action ?? "Não definida"}</dd>
          <dd className="mt-1 text-[oklch(43%_0.03_252)]">{workspace.next_action_due_at === null ? "Sem prazo definido" : `Prazo: ${formatBrazilianDate(workspace.next_action_due_at)}`}</dd>
          {followUpStatus === "overdue" || followUpStatus === "today" ? (
            <dd className="mt-2 text-xs font-bold text-[oklch(36%_0.08_52)]">
              {followUpStatus === "overdue" ? "Prazo vencido" : "Para hoje"}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-[oklch(43%_0.03_252)]">Desfecho</dt>
          <dd className="mt-1 font-semibold">
            {workspace.commercial_outcome === null ? "Não definido" : outcomeLabel(workspace.commercial_outcome)}
          </dd>
        </div>
        <div className="border-t border-[oklch(82%_0.025_82)] pt-5 text-[oklch(43%_0.03_252)]">
          <dt>Versão {workspace.version}</dt>
          <dd className="mt-2">Criado em {formatBrazilianDate(workspace.created_at)}</dd>
          <dd className="mt-1">Atualizado em {formatBrazilianDate(workspace.updated_at)}</dd>
        </div>
      </dl>
    </aside>
  );
}

function WorkspaceTaskNavigation({
  showApproach,
}: {
  readonly showApproach: boolean;
}) {
  const tasks = [
    { href: "#workspace-state", label: "Atualizar estado comercial" },
    ...(showApproach
      ? [{ href: "#workspace-approach", label: "Revisar mensagem" }]
      : []),
    { href: "#qualification-cadence", label: "Plano de contatos" },
    { href: "#commercial-activities", label: "Registrar atividade" },
    { href: "#commercial-notes", label: "Adicionar nota" },
  ];

  return (
    <nav
      aria-label="Atalhos do acompanhamento"
      className="mt-6 border-b border-[oklch(82%_0.025_82)] pb-5"
    >
      <p className="text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
        Ir direto para
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {tasks.map((task) => (
          <li key={task.href}>
            <a href={task.href} className="ui-action ui-action--quiet">
              {task.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ActivitiesPanel({
  state,
  draft,
  appendState,
  onDraftChange,
  onSubmit,
  onPageChange,
  canWrite,
  onReload,
  onReviewed,
}: {
  readonly state: ListState<LeadActivityDto>;
  readonly draft: ActivityDraft;
  readonly appendState: AppendState;
  readonly onDraftChange: (draft: ActivityDraft) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onPageChange: (page: number) => void;
  readonly canWrite: boolean;
  readonly onReload: () => void;
  readonly onReviewed: () => void;
}) {
  const [hasConsulted, setHasConsulted] = useState(false);
  return (
    <section id="commercial-activities" aria-label="Atividades comerciais" className="scroll-mt-6 border-t-2 border-[oklch(24%_0.035_252)] pt-6">
      <PanelHeading eyebrow="Ação e histórico" title="Atividades comerciais" />
      <p className="mt-3 text-sm leading-6 text-[oklch(43%_0.03_252)]">Registre reuniões e outras ações comerciais. Os contatos registrados no plano já aparecem neste histórico.</p>
      {canWrite ? (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 border-y border-[oklch(82%_0.025_82)] py-6">
          <fieldset disabled={appendState.status === "saving"} className="grid min-w-0 gap-4 border-0 p-0">
          <label className="grid gap-2 text-sm font-semibold">
            Tipo de atividade
            <select value={draft.activityType} onChange={(event) => onDraftChange({ ...draft, activityType: event.target.value as CommercialActivityType })} className="ui-field text-sm font-normal">
              {commercialActivityTypes.map((activityType) => <option key={activityType} value={activityType}>{activityTypeLabel(activityType)}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Data e horário
            <input type="datetime-local" value={draft.occurredAt} onChange={(event) => onDraftChange({ ...draft, occurredAt: event.target.value })} className="ui-field text-sm font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Resumo da atividade
            <textarea value={draft.summary} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} placeholder="Ex.: reunião para entender a necessidade da empresa" className="ui-field min-h-24 text-sm font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Resultado da atividade
            <input value={draft.activityOutcome} onChange={(event) => onDraftChange({ ...draft, activityOutcome: event.target.value })} placeholder="Ex.: proposta solicitada" className="ui-field text-sm font-normal" />
          </label>
          </fieldset>
          <AppendMessage state={appendState} success="Atividade registrada." saving="Registrando atividade…" />
          {appendState.status === "unknown" ? (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => { setHasConsulted(true); onReload(); }} className="ui-action ui-action--quiet">Consultar atividades registradas</button>
              {hasConsulted && state.status === "success" ? <button type="button" onClick={() => { setHasConsulted(false); onReviewed(); }} className="ui-action ui-action--quiet">Conferi o histórico; preparar novo registro</button> : null}
            </div>
          ) : null}
          <button type="submit" disabled={appendState.status === "saving" || appendState.status === "unknown"} className="ui-action ui-action--secondary justify-self-start">
            {appendState.status === "saving" ? "Registrando atividade…" : "Registrar atividade"}
          </button>
        </form>
      ) : null}
      <p className="mt-7 text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
        Histórico registrado
      </p>
      <ListContent state={state} kind="activities" onPageChange={onPageChange} onReload={onReload}>
        {(items) => (
          <ol className="mt-6 divide-y divide-[oklch(84%_0.02_82)] border-y border-[oklch(84%_0.02_82)]">
            {items.map((item) => (
              <li key={item.activity_id} className="py-4 text-sm">
                <p className="font-semibold">{activityTypeLabel(item.activity_type)}</p>
                {item.summary === null ? null : <p className="mt-1 leading-6 text-[oklch(43%_0.03_252)]">{item.summary}</p>}
                {item.activity_outcome === null ? null : <p className="mt-1 text-[oklch(43%_0.03_252)]">Resultado: {item.activity_outcome}</p>}
                <p className="mt-2 text-xs font-semibold text-[oklch(48%_0.025_252)]">{formatBrazilianDateTime(item.occurred_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </ListContent>
    </section>
  );
}

function NotesPanel({
  state,
  draft,
  appendState,
  onDraftChange,
  onSubmit,
  onPageChange,
  canWrite,
  onReload,
  onReviewed,
}: {
  readonly state: ListState<LeadNoteDto>;
  readonly draft: string;
  readonly appendState: AppendState;
  readonly onDraftChange: (draft: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onPageChange: (page: number) => void;
  readonly canWrite: boolean;
  readonly onReload: () => void;
  readonly onReviewed: () => void;
}) {
  const [hasConsulted, setHasConsulted] = useState(false);
  return (
    <section id="commercial-notes" aria-label="Notas comerciais" className="scroll-mt-6 border-t-2 border-[oklch(24%_0.035_252)] pt-6">
      <PanelHeading eyebrow="Ação e histórico" title="Notas comerciais" />
      <p className="mt-3 text-sm leading-6 text-[oklch(43%_0.03_252)]">Guarde contexto interno útil para a equipe, como preferências e pontos a confirmar na próxima conversa.</p>
      {canWrite ? (
        <form onSubmit={onSubmit} className="mt-6 grid gap-4 border-y border-[oklch(82%_0.025_82)] py-6">
          <fieldset disabled={appendState.status === "saving"} className="grid min-w-0 gap-4 border-0 p-0">
          <label className="grid gap-2 text-sm font-semibold">
            Nova nota
            <textarea required maxLength={4000} aria-invalid={appendState.status === "validation" || undefined} value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Ex.: prefere conversar à tarde; confirmar a área responsável" className="ui-field min-h-28 text-sm font-normal" />
          </label>
          </fieldset>
          <AppendMessage state={appendState} success="Nota adicionada." saving="Adicionando nota…" />
          {appendState.status === "unknown" ? (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => { setHasConsulted(true); onReload(); }} className="ui-action ui-action--quiet">Consultar notas registradas</button>
              {hasConsulted && state.status === "success" ? <button type="button" onClick={() => { setHasConsulted(false); onReviewed(); }} className="ui-action ui-action--quiet">Conferi o histórico; preparar novo registro</button> : null}
            </div>
          ) : null}
          <button type="submit" disabled={appendState.status === "saving" || appendState.status === "unknown" || draft.trim() === ""} className="ui-action ui-action--secondary justify-self-start">
            {appendState.status === "saving" ? "Adicionando nota…" : "Adicionar nota"}
          </button>
          {draft.trim() === "" ? <p className="text-xs">Escreva uma nota para adicionar ao histórico.</p> : null}
        </form>
      ) : null}
      <p className="mt-7 text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
        Histórico registrado
      </p>
      <ListContent state={state} kind="notes" onPageChange={onPageChange} onReload={onReload}>
        {(items) => (
          <ol className="mt-6 divide-y divide-[oklch(84%_0.02_82)] border-y border-[oklch(84%_0.02_82)]">
            {items.map((item) => (
              <li key={item.note_id} className="py-4 text-sm leading-6">
                <p>{item.body}</p>
                <p className="mt-2 text-xs font-semibold text-[oklch(48%_0.025_252)]">{formatBrazilianDateTime(item.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </ListContent>
    </section>
  );
}

function AuditPanel({
  state,
  onPageChange,
  onReload,
}: {
  readonly state: ListState<CommercialAuditEventDto>;
  readonly onPageChange: (page: number) => void;
  readonly onReload: () => void;
}) {
  return (
    <section id="commercial-audit" aria-label="Auditoria comercial" className="mt-12 scroll-mt-6 border-t-2 border-[oklch(24%_0.035_252)] pt-6">
      <PanelHeading eyebrow="Somente leitura" title="Auditoria comercial" />
      <ListContent state={state} kind="audit" onPageChange={onPageChange} onReload={onReload}>
        {(items) => (
          <ol className="mt-6 divide-y divide-[oklch(84%_0.02_82)] border-y border-[oklch(84%_0.02_82)]">
            {items.map((item) => {
              const change = auditChange(item);
              return (
                <li key={item.audit_event_id} className="grid gap-2 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <p className="font-semibold">{auditActionLabel(item.action)}</p>
                    {change === null ? null : <p className="mt-1 text-[oklch(43%_0.03_252)]">{change}</p>}
                    <p className="mt-2 text-xs text-[oklch(48%_0.025_252)]">Registrado por: {item.actor_subject}</p>
                  </div>
                  <p className="text-xs font-semibold text-[oklch(48%_0.025_252)]">{formatBrazilianDateTime(item.occurred_at)}</p>
                </li>
              );
            })}
          </ol>
        )}
      </ListContent>
    </section>
  );
}

function PanelHeading({ eyebrow, title }: { readonly eyebrow: string; readonly title: string }) {
  return (
    <div>
      <p className="text-xs font-bold tracking-[0.14em] text-[oklch(45%_0.105_174)] uppercase">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl tracking-[-0.03em]">{title}</h2>
    </div>
  );
}

function AppendMessage({
  state,
  success,
  saving,
}: {
  readonly state: AppendState;
  readonly success: string;
  readonly saving: string;
}) {
  if (state.status === "success" || state.status === "saving") {
    return <p role="status" className="text-sm font-semibold text-[oklch(30%_0.09_150)]">{state.status === "saving" ? saving : success}</p>;
  }
  if (state.status === "idle") return null;
  const message = "message" in state && state.message ? state.message
    : state.status === "denied" ? "Você não tem acesso para registrar esta informação. Solicite ao responsável a verificação do acesso."
    : state.status === "unauthenticated" ? "Sua sessão expirou. Entre novamente para registrar esta informação."
    : unknownMutationMessage;
  return <p role="alert" className="text-sm font-semibold text-[oklch(42%_0.15_28)]">{message}</p>;
}

function ListContent<T>({
  state,
  kind,
  onPageChange,
  onReload,
  children,
}: {
  readonly state: ListState<T>;
  readonly kind: "activities" | "notes" | "audit";
  readonly onReload: () => void;
  readonly onPageChange: (page: number) => void;
  readonly children: (items: readonly T[]) => React.ReactNode;
}) {
  const labels = {
    activities: {
      loading: "Carregando atividades",
      empty: "Nenhuma atividade registrada.",
      error: "Não foi possível carregar as atividades agora.",
      unauthenticated: "Entre para acessar as atividades comerciais.",
      denied: "Você não tem acesso às atividades comerciais.",
      notFound: "Este acompanhamento comercial não está disponível.",
      next: "Próxima página de atividades",
      previous: "Página anterior de atividades",
    },
    notes: {
      loading: "Carregando notas",
      empty: "Nenhuma nota registrada.",
      error: "Não foi possível carregar as notas agora.",
      unauthenticated: "Entre para acessar as notas comerciais.",
      denied: "Você não tem acesso às notas comerciais.",
      notFound: "Este acompanhamento comercial não está disponível.",
      next: "Próxima página de notas",
      previous: "Página anterior de notas",
    },
    audit: {
      loading: "Carregando auditoria comercial",
      empty: "Nenhum registro de auditoria confirmado.",
      error: "Não foi possível carregar a auditoria comercial agora.",
      unauthenticated: "Entre para acessar a auditoria comercial.",
      denied: "Você não tem acesso à auditoria comercial.",
      notFound: "Este acompanhamento comercial não está disponível.",
      next: "Próxima página de auditoria",
      previous: "Página anterior de auditoria",
    },
  }[kind];

  if (state.status === "loading") {
    return <p role="status" aria-label={labels.loading} className="mt-6 text-sm text-[oklch(43%_0.03_252)]">{labels.loading}</p>;
  }

  if (state.status === "unauthenticated" || state.status === "denied" || state.status === "not_found" || state.status === "error") {
    const message =
      state.status === "unauthenticated"
        ? labels.unauthenticated
        : state.status === "denied"
          ? labels.denied
          : state.status === "not_found"
            ? labels.notFound
            : labels.error;
    return <div className="mt-6"><p role="alert" className="text-sm font-semibold text-[oklch(42%_0.15_28)]">{message}</p>{state.status === "error" ? <><p className="mt-2 text-xs">O motivo não foi informado. Atualize a consulta; seus rascunhos serão preservados.</p><button type="button" onClick={onReload} className="ui-action ui-action--quiet mt-3">Consultar {kind === "activities" ? "atividades" : kind === "notes" ? "notas" : "auditoria"} novamente</button></> : state.status === "unauthenticated" ? <Link href="/login" className="ui-action ui-action--quiet mt-3">Entrar novamente</Link> : state.status === "denied" ? <p className="mt-2 text-xs">Solicite ao responsável a verificação do acesso.</p> : <Link href="/leads" className="ui-action ui-action--quiet mt-3">Voltar para leads</Link>}</div>;
  }

  if (state.items.length === 0 && state.total === 0) {
    return <p className="mt-6 text-sm leading-6 text-[oklch(43%_0.03_252)]">{labels.empty}</p>;
  }

  return (
    <>
      {children(state.items)}
      <ListPagination
        page={state.page}
        pageSize={state.pageSize}
        total={state.total}
        itemsOnPage={state.items.length}
        nextLabel={labels.next}
        previousLabel={labels.previous}
        onPageChange={onPageChange}
      />
    </>
  );
}

function ListPagination({
  page,
  pageSize: itemPageSize,
  total,
  itemsOnPage,
  nextLabel,
  previousLabel,
  onPageChange,
}: {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number | null;
  readonly itemsOnPage: number;
  readonly nextLabel: string;
  readonly previousLabel: string;
  readonly onPageChange: (page: number) => void;
}) {
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / itemPageSize));
  const hasPrevious = page > 1;
  const hasNext = totalPages === null ? itemsOnPage === itemPageSize : page < totalPages;

  return (
    <nav aria-label="Paginação" className="mt-5 flex items-center justify-between gap-4 text-sm">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={!hasPrevious} aria-label={previousLabel} className="ui-action ui-action--quiet disabled:border-transparent disabled:text-[oklch(63%_0.02_252)]">
        ← Anterior
      </button>
      <span className="font-semibold text-[oklch(43%_0.03_252)]">
        {totalPages === null ? `Página ${page}` : `Página ${page} de ${totalPages}`}
      </span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={!hasNext} aria-label={nextLabel} className="ui-action ui-action--quiet disabled:border-transparent disabled:text-[oklch(63%_0.02_252)]">
        Próxima →
      </button>
    </nav>
  );
}
