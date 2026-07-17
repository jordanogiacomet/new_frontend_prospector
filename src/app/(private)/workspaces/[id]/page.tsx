"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  formatBrazilianDate,
  formatBrazilianDateTime,
  formatCnpj,
} from "../../../../lib/formatters";
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

type EditState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "success" }
  | { readonly status: "conflict" }
  | { readonly status: "unauthenticated" }
  | { readonly status: "denied" }
  | { readonly status: "error" };

type AppendState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "success" }
  | { readonly status: "unauthenticated" }
  | { readonly status: "denied" }
  | { readonly status: "error" };

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

function toDateInputValue(value: string | null): string {
  return value === null ? "" : value.slice(0, 10);
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
  const params = useParams<{ readonly id?: string }>();
  const workspaceId = typeof params.id === "string" ? params.id : "";
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    status: "loading",
  });
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft | null>(null);
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  const [activityPage, setActivityPage] = useState(defaultPage);
  const [activityReloadKey, setActivityReloadKey] = useState(0);
  const [activitiesState, setActivitiesState] = useState<ListState<LeadActivityDto>>({
    status: "loading",
  });
  const [activityDraft, setActivityDraft] = useState<ActivityDraft>({
    occurredAt: currentDatetimeLocalValue(),
    activityType: "CALL",
    activityOutcome: "",
    summary: "",
  });
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
  const [auditState, setAuditState] = useState<ListState<CommercialAuditEventDto>>({
    status: "loading",
  });

  const loadWorkspace = useCallback(async (signal?: AbortSignal): Promise<void> => {
    await Promise.resolve();

    if (signal?.aborted) {
      return;
    }

    if (workspaceId === "") {
      setWorkspaceState({ status: "not_found" });
      return;
    }

    setWorkspaceState({ status: "loading" });

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}`,
        safeGetInit(signal),
      );

      if (signal?.aborted) {
        return;
      }

      if (!response.ok) {
        setWorkspaceState(responseState(response.status));
        return;
      }

      const payload: unknown = await response.json();
      if (signal?.aborted) {
        return;
      }

      if (!isWorkspaceEnvelope(payload)) {
        setWorkspaceState({ status: "error" });
        return;
      }

      setWorkspaceState({ status: "success", workspace: payload.data });
      setWorkspaceDraft(toWorkspaceDraft(payload.data));
    } catch {
      if (!signal?.aborted) {
        setWorkspaceState({ status: "error" });
      }
    }
  }, [workspaceId]);

  useEffect(() => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      void loadWorkspace(abortController.signal);
    }, 0);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [loadWorkspace]);

  useEffect(() => {
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

        if (!response.ok) {
          setActivitiesState(listResponseState<LeadActivityDto>(response.status));
          return;
        }

        const payload: unknown = await response.json();
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
  }, [activityPage, activityReloadKey, workspaceId]);

  useEffect(() => {
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

        if (!response.ok) {
          setNotesState(listResponseState<LeadNoteDto>(response.status));
          return;
        }

        const payload: unknown = await response.json();
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
  }, [notePage, noteReloadKey, workspaceId]);

  useEffect(() => {
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

        if (!response.ok) {
          setAuditState(listResponseState<CommercialAuditEventDto>(response.status));
          return;
        }

        const payload: unknown = await response.json();
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
  }, [auditPage, workspaceId]);

  async function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (workspaceState.status !== "success" || workspaceDraft === null) {
      return;
    }

    const responsibleSubject = workspaceDraft.responsibleSubject;
    if (
      responsibleSubject !== "" &&
      (responsibleSubject !== responsibleSubject.trim() || Array.from(responsibleSubject).length > 256)
    ) {
      setEditState({ status: "error" });
      return;
    }

    if (Array.from(workspaceDraft.nextAction).length > 500) {
      setEditState({ status: "error" });
      return;
    }

    const dueAt = toUtcNoon(workspaceDraft.nextActionDueDate);
    if (workspaceDraft.nextActionDueDate !== "" && dueAt === null) {
      setEditState({ status: "error" });
      return;
    }

    const beforeSave = workspaceState.workspace;
    const optimisticWorkspace: LeadWorkspaceDto = {
      ...beforeSave,
      responsible_subject: responsibleSubject === "" ? null : responsibleSubject,
      commercial_stage: workspaceDraft.commercialStage,
      next_action: workspaceDraft.nextAction === "" ? null : workspaceDraft.nextAction,
      next_action_due_at: dueAt,
      commercial_outcome: workspaceDraft.commercialOutcome === "" ? null : workspaceDraft.commercialOutcome,
    };
    setWorkspaceState({ status: "success", workspace: optimisticWorkspace });
    setEditState({ status: "saving" });

    try {
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
        await loadWorkspace();
        setEditState({ status: "conflict" });
        return;
      }

      if (response.status === 401) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        setEditState({ status: "unauthenticated" });
        return;
      }

      if (response.status === 403) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        setEditState({ status: "denied" });
        return;
      }

      if (!response.ok) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        setEditState({ status: "error" });
        return;
      }

      const payload: unknown = await response.json();
      if (!isWorkspaceEnvelope(payload)) {
        setWorkspaceState({ status: "success", workspace: beforeSave });
        setEditState({ status: "error" });
        return;
      }

      setWorkspaceState({ status: "success", workspace: payload.data });
      setWorkspaceDraft(toWorkspaceDraft(payload.data));
      setEditState({ status: "success" });
    } catch {
      setWorkspaceState({ status: "success", workspace: beforeSave });
      setEditState({ status: "error" });
    }
  }

  async function handleActivitySubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const occurredAt = toUtcTimestamp(activityDraft.occurredAt);

    if (
      occurredAt === null ||
      Array.from(activityDraft.activityOutcome).length > 120 ||
      Array.from(activityDraft.summary).length > 1000
    ) {
      setActivityAppendState({ status: "error" });
      return;
    }

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
        setActivityAppendState({ status: "unauthenticated" });
        return;
      }

      if (response.status === 403) {
        setActivityAppendState({ status: "denied" });
        return;
      }

      if (!response.ok) {
        setActivityAppendState({ status: "error" });
        return;
      }

      const payload: unknown = await response.json();
      const appendedActivity = isRecord(payload) ? payload.data : undefined;
      if (!isActivity(appendedActivity)) {
        setActivityAppendState({ status: "error" });
        return;
      }

      setActivityPage(defaultPage);
      setActivityReloadKey((current) => current + 1);
      setActivityDraft({
        occurredAt: currentDatetimeLocalValue(),
        activityType: "CALL",
        activityOutcome: "",
        summary: "",
      });
      setActivityAppendState({ status: "success" });
    } catch {
      setActivityAppendState({ status: "error" });
    }
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (
      noteDraft === "" ||
      noteDraft !== noteDraft.trim() ||
      Array.from(noteDraft).length > 4000
    ) {
      setNoteAppendState({ status: "error" });
      return;
    }

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
        setNoteAppendState({ status: "unauthenticated" });
        return;
      }

      if (response.status === 403) {
        setNoteAppendState({ status: "denied" });
        return;
      }

      if (!response.ok) {
        setNoteAppendState({ status: "error" });
        return;
      }

      const payload: unknown = await response.json();
      const appendedNote = isRecord(payload) ? payload.data : undefined;
      if (!isNote(appendedNote)) {
        setNoteAppendState({ status: "error" });
        return;
      }

      setNotePage(defaultPage);
      setNoteReloadKey((current) => current + 1);
      setNoteDraft("");
      setNoteAppendState({ status: "success" });
    } catch {
      setNoteAppendState({ status: "error" });
    }
  }

  if (workspaceState.status === "loading") {
    return <WorkspaceLoading />;
  }

  if (workspaceState.status === "not_found") {
    return <WorkspacePageState title="Acompanhamento não encontrado" description="Este acompanhamento comercial não está disponível para sua organização." />;
  }

  if (workspaceState.status === "unauthenticated") {
    return <WorkspacePageState alert title="Acesso necessário" description="Entre para acessar este acompanhamento comercial." />;
  }

  if (workspaceState.status === "denied") {
    return <WorkspacePageState alert title="Acesso restrito" description="Você não tem acesso a este acompanhamento comercial." />;
  }

  if (workspaceState.status === "error" || workspaceDraft === null) {
    return <WorkspacePageState alert title="Não foi possível carregar o acompanhamento" description="Atualize a página para tentar novamente." />;
  }

  const workspace = workspaceState.workspace;

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="border-b border-[oklch(78%_0.025_82)] pb-8">
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
          As alterações aqui afetam somente o acompanhamento comercial e nunca a recomendação do produtor.
        </p>
      </header>

      <section className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div>
          <WorkspaceForm
            draft={workspaceDraft}
            currentStage={workspace.commercial_stage}
            editState={editState}
            onChange={setWorkspaceDraft}
            onSubmit={handleWorkspaceSubmit}
          />
        </div>
        <WorkspaceFacts workspace={workspace} />
      </section>

      <section className="mt-12 grid gap-10 xl:grid-cols-2">
        <ActivitiesPanel
          state={activitiesState}
          draft={activityDraft}
          appendState={activityAppendState}
          onDraftChange={setActivityDraft}
          onSubmit={handleActivitySubmit}
          onPageChange={setActivityPage}
        />
        <NotesPanel
          state={notesState}
          draft={noteDraft}
          appendState={noteAppendState}
          onDraftChange={setNoteDraft}
          onSubmit={handleNoteSubmit}
          onPageChange={setNotePage}
        />
      </section>

      <AuditPanel state={auditState} onPageChange={setAuditPage} />
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
  title,
  description,
}: {
  readonly alert?: boolean;
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
  onChange,
  onSubmit,
}: {
  readonly draft: WorkspaceDraft;
  readonly currentStage: CommercialStage;
  readonly editState: EditState;
  readonly onChange: (draft: WorkspaceDraft) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const errorMessage =
    editState.status === "conflict"
      ? "O acompanhamento foi alterado por outra pessoa. Os dados mais recentes foram recarregados."
      : editState.status === "unauthenticated"
        ? "Entre para salvar o acompanhamento comercial."
        : editState.status === "denied"
          ? "Você não tem acesso para salvar este acompanhamento comercial."
          : editState.status === "error"
            ? draft.responsibleSubject !== "" && draft.responsibleSubject !== draft.responsibleSubject.trim()
              ? "Informe um responsável válido ou deixe o campo vazio."
              : "Não foi possível salvar o acompanhamento comercial agora."
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
        {editState.status === "saving" ? <span className="text-sm font-semibold">Salvando…</span> : null}
      </div>

      {editState.status === "success" ? (
        <p role="status" className="mt-5 text-sm font-semibold text-[oklch(30%_0.09_150)]">
          Acompanhamento comercial salvo.
        </p>
      ) : null}
      {errorMessage !== null ? (
        <p role="alert" className="mt-5 text-sm font-semibold text-[oklch(42%_0.15_28)]">
          {errorMessage}
        </p>
      ) : null}

      <fieldset disabled={editState.status === "saving"} className="min-w-0 border-0 p-0">
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Responsável
            <input
              value={draft.responsibleSubject}
              onChange={(event) => onChange({ ...draft, responsibleSubject: event.target.value })}
              className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            />
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
              value={draft.nextAction}
              onChange={(event) => onChange({ ...draft, nextAction: event.target.value })}
              className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Prazo da próxima ação
            <input
              type="date"
              value={draft.nextActionDueDate}
              onChange={(event) => onChange({ ...draft, nextActionDueDate: event.target.value })}
              className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            />
          </label>
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
          className="mt-7 inline-flex min-h-11 items-center border border-[oklch(24%_0.035_252)] bg-[oklch(24%_0.035_252)] px-5 py-2 text-sm font-bold text-[oklch(97%_0.012_82)] transition-colors hover:bg-[oklch(35%_0.05_246)] disabled:cursor-wait disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)]"
        >
          Salvar acompanhamento
        </button>
      </fieldset>
    </form>
  );
}

function WorkspaceFacts({ workspace }: { readonly workspace: LeadWorkspaceDto }) {
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
          <dd className="mt-1 text-[oklch(43%_0.03_252)]">Prazo: {formatBrazilianDate(workspace.next_action_due_at)}</dd>
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

function ActivitiesPanel({
  state,
  draft,
  appendState,
  onDraftChange,
  onSubmit,
  onPageChange,
}: {
  readonly state: ListState<LeadActivityDto>;
  readonly draft: ActivityDraft;
  readonly appendState: AppendState;
  readonly onDraftChange: (draft: ActivityDraft) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onPageChange: (page: number) => void;
}) {
  return (
    <section aria-label="Atividades comerciais" className="border-t-2 border-[oklch(24%_0.035_252)] pt-6">
      <PanelHeading eyebrow="Histórico" title="Atividades comerciais" />
      <ListContent state={state} kind="activities" onPageChange={onPageChange}>
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
      <form onSubmit={onSubmit} className="mt-7 grid gap-4 border-t border-[oklch(82%_0.025_82)] pt-6">
        <label className="grid gap-2 text-sm font-semibold">
          Tipo de atividade
          <select value={draft.activityType} onChange={(event) => onDraftChange({ ...draft, activityType: event.target.value as CommercialActivityType })} className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal">
            {commercialActivityTypes.map((activityType) => <option key={activityType} value={activityType}>{activityTypeLabel(activityType)}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Data e horário
          <input type="datetime-local" value={draft.occurredAt} onChange={(event) => onDraftChange({ ...draft, occurredAt: event.target.value })} className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Resumo da atividade
          <textarea value={draft.summary} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} className="min-h-24 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 py-2 text-sm font-normal" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Resultado da atividade
          <input value={draft.activityOutcome} onChange={(event) => onDraftChange({ ...draft, activityOutcome: event.target.value })} className="min-h-11 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 text-sm font-normal" />
        </label>
        <AppendMessage state={appendState} success="Atividade registrada." error="Não foi possível registrar a atividade agora." />
        <button type="submit" disabled={appendState.status === "saving"} className="justify-self-start min-h-11 border-b-2 border-[oklch(45%_0.105_174)] px-1 text-sm font-bold disabled:opacity-65">
          Registrar atividade
        </button>
      </form>
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
}: {
  readonly state: ListState<LeadNoteDto>;
  readonly draft: string;
  readonly appendState: AppendState;
  readonly onDraftChange: (draft: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onPageChange: (page: number) => void;
}) {
  return (
    <section aria-label="Notas comerciais" className="border-t-2 border-[oklch(24%_0.035_252)] pt-6">
      <PanelHeading eyebrow="Registro" title="Notas comerciais" />
      <ListContent state={state} kind="notes" onPageChange={onPageChange}>
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
      <form onSubmit={onSubmit} className="mt-7 grid gap-4 border-t border-[oklch(82%_0.025_82)] pt-6">
        <label className="grid gap-2 text-sm font-semibold">
          Nova nota
          <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} className="min-h-28 border border-[oklch(66%_0.03_252)] bg-[oklch(99%_0.007_82)] px-3 py-2 text-sm font-normal" />
        </label>
        <AppendMessage state={appendState} success="Nota adicionada." error="Não foi possível adicionar a nota agora." />
        <button type="submit" disabled={appendState.status === "saving"} className="justify-self-start min-h-11 border-b-2 border-[oklch(45%_0.105_174)] px-1 text-sm font-bold disabled:opacity-65">
          Adicionar nota
        </button>
      </form>
    </section>
  );
}

function AuditPanel({
  state,
  onPageChange,
}: {
  readonly state: ListState<CommercialAuditEventDto>;
  readonly onPageChange: (page: number) => void;
}) {
  return (
    <section aria-label="Auditoria comercial" className="mt-12 border-t-2 border-[oklch(24%_0.035_252)] pt-6">
      <PanelHeading eyebrow="Somente leitura" title="Auditoria comercial" />
      <ListContent state={state} kind="audit" onPageChange={onPageChange}>
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
  error,
}: {
  readonly state: AppendState;
  readonly success: string;
  readonly error: string;
}) {
  if (state.status === "success") {
    return <p role="status" className="text-sm font-semibold text-[oklch(30%_0.09_150)]">{success}</p>;
  }

  if (state.status === "unauthenticated") {
    return <p role="alert" className="text-sm font-semibold text-[oklch(42%_0.15_28)]">Entre para registrar esta informação.</p>;
  }

  if (state.status === "denied") {
    return <p role="alert" className="text-sm font-semibold text-[oklch(42%_0.15_28)]">Você não tem acesso para registrar esta informação.</p>;
  }

  if (state.status === "error") {
    return <p role="alert" className="text-sm font-semibold text-[oklch(42%_0.15_28)]">{error}</p>;
  }

  return null;
}

function ListContent<T>({
  state,
  kind,
  onPageChange,
  children,
}: {
  readonly state: ListState<T>;
  readonly kind: "activities" | "notes" | "audit";
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
    return <p role="alert" className="mt-6 text-sm font-semibold text-[oklch(42%_0.15_28)]">{message}</p>;
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
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={!hasPrevious} aria-label={previousLabel} className="min-h-11 border-b border-[oklch(45%_0.105_174)] px-1 font-bold disabled:border-transparent disabled:text-[oklch(63%_0.02_252)]">
        ← Anterior
      </button>
      <span className="font-semibold text-[oklch(43%_0.03_252)]">
        {totalPages === null ? `Página ${page}` : `Página ${page} de ${totalPages}`}
      </span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={!hasNext} aria-label={nextLabel} className="min-h-11 border-b border-[oklch(45%_0.105_174)] px-1 font-bold disabled:border-transparent disabled:text-[oklch(63%_0.02_252)]">
        Próxima →
      </button>
    </nav>
  );
}
