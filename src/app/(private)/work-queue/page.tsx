"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
  formatCnpj,
  formatScore,
} from "../../../lib/formatters";
import {
  getLeadActionLabel,
  getPriorityLabel,
  getTrustStatusLabel,
} from "../../../lib/lead-labels";
import { subjectSchema } from "../../../lib/validators/commercial";
import { cnpjSchema } from "../../../lib/validators/lead-query";
import {
  commercialOutcomes,
  commercialStages,
  commercialWorkQueueSorts,
  type CommercialStage,
  type CommercialWorkQueueItem,
  type LeadWorkspaceDto,
} from "../../../types/commercial";
import type { LeadSummary } from "../../../types/leads";

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;

const brazilianUfs = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const approvedPriorities = ["B", "C", "E", "R"] as const;
const approvedUfSet: ReadonlySet<string> = new Set(brazilianUfs);
const approvedPrioritySet: ReadonlySet<string> = new Set(approvedPriorities);
const approvedStageSet: ReadonlySet<string> = new Set(commercialStages);
const approvedSortSet: ReadonlySet<string> = new Set(commercialWorkQueueSorts);
const approvedOutcomeSet: ReadonlySet<string> = new Set(commercialOutcomes);

interface WorkQueueMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number | null;
  readonly provenance: {
    readonly producer: {
      readonly factSource: "producer_current_leads_v1";
      readonly availability: "AVAILABLE" | "UNAVAILABLE" | "NOT_QUERIED";
    };
    readonly workspace: {
      readonly factSource: "app_lead_workspaces_v1";
      readonly availability: "AVAILABLE";
    };
  };
}

interface WorkQueueEnvelope {
  readonly data: readonly CommercialWorkQueueItem[];
  readonly meta: WorkQueueMeta;
}

type RequestState =
  | { readonly query: string; readonly status: "loading" }
  | {
      readonly query: string;
      readonly status: "success";
      readonly response: WorkQueueEnvelope;
    }
  | { readonly query: string; readonly status: "unauthenticated" }
  | { readonly query: string; readonly status: "denied" }
  | { readonly query: string; readonly status: "error" };

interface FieldError {
  readonly source: string | null;
  readonly message: string;
}

interface DraftValue {
  readonly source: string | null;
  readonly value: string;
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

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isLeadSummary(value: unknown): value is LeadSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.decision_id) &&
    isNullableString(value.import_batch_id) &&
    isString(value.lead_run_id) &&
    isNullableNonNegativeInteger(value.source_row) &&
    isNullableString(value.source_hash) &&
    isString(value.agent_version) &&
    isString(value.cnpj) &&
    /^\d{14}$/.test(value.cnpj) &&
    isNullableString(value.companyName) &&
    isNullableString(value.city) &&
    isNullableString(value.uf) &&
    isNullableString(value.sector) &&
    (value.score === null ||
      (isNonNegativeInteger(value.score) && value.score <= 100)) &&
    isNullableString(value.priority) &&
    isNullableString(value.recommendedAction) &&
    isNullableString(value.trustStatus) &&
    (value.confidenceIndicator === "normal" ||
      value.confidenceIndicator === "low" ||
      value.confidenceIndicator === "unknown") &&
    isString(value.lastAnalysisAt)
  );
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
    approvedStageSet.has(value.commercial_stage) &&
    isNullableString(value.next_action) &&
    isNullableString(value.next_action_due_at) &&
    (value.commercial_outcome === null ||
      (isString(value.commercial_outcome) &&
        approvedOutcomeSet.has(value.commercial_outcome))) &&
    isPositiveInteger(value.version) &&
    isString(value.created_by_subject) &&
    isString(value.updated_by_subject) &&
    isString(value.created_at) &&
    isString(value.updated_at) &&
    isNullableString(value.archived_at) &&
    isNullableString(value.archived_by_subject)
  );
}

function isQueueItem(value: unknown): value is CommercialWorkQueueItem {
  if (!isRecord(value) || !isRecord(value.sources)) {
    return false;
  }

  const workspace = value.workspace;
  const producerSource = value.sources.producer;
  const workspaceSource = value.sources.workspace;

  return (
    isLeadSummary(value.producerLead) &&
    (workspace === null || isWorkspace(workspace)) &&
    isRecord(producerSource) &&
    producerSource.factSource === "producer_current_leads_v1" &&
    isRecord(workspaceSource) &&
    workspaceSource.factSource === "app_lead_workspaces_v1" &&
    (workspaceSource.state === "matched" || workspaceSource.state === "missing")
  );
}

function isWorkQueueEnvelope(value: unknown): value is WorkQueueEnvelope {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) {
    return false;
  }

  const { meta } = value;

  if (
    !isPositiveInteger(meta.page) ||
    !isPositiveInteger(meta.pageSize) ||
    (meta.total !== null && !isNonNegativeInteger(meta.total)) ||
    !isRecord(meta.provenance) ||
    !isRecord(meta.provenance.producer) ||
    !isRecord(meta.provenance.workspace)
  ) {
    return false;
  }

  return (
    meta.provenance.producer.factSource === "producer_current_leads_v1" &&
    (meta.provenance.producer.availability === "AVAILABLE" ||
      meta.provenance.producer.availability === "UNAVAILABLE" ||
      meta.provenance.producer.availability === "NOT_QUERIED") &&
    meta.provenance.workspace.factSource === "app_lead_workspaces_v1" &&
    meta.provenance.workspace.availability === "AVAILABLE" &&
    value.data.every(isQueueItem)
  );
}

function readBoundedPositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (value === null || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return fallback;
  }

  return parsed;
}

function getNormalizedCnpj(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const result = cnpjSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function getApprovedParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams({
    page: String(
      readBoundedPositiveInteger(
        searchParams.get("page"),
        defaultPage,
        maximumPage,
      ),
    ),
    pageSize: String(
      readBoundedPositiveInteger(
        searchParams.get("pageSize"),
        defaultPageSize,
        maximumPageSize,
      ),
    ),
  });
  const cnpj = getNormalizedCnpj(searchParams.get("cnpj_normalizado"));
  const uf = searchParams.get("uf");
  const priority = searchParams.get("priority");
  const stage = searchParams.get("commercial_stage");
  const responsibleSubject = searchParams.get("responsible_subject");
  const sort = searchParams.get("sort");

  if (cnpj !== undefined) {
    params.set("cnpj_normalizado", cnpj);
  }

  if (uf !== null && approvedUfSet.has(uf)) {
    params.set("uf", uf);
  }

  if (priority !== null && approvedPrioritySet.has(priority)) {
    params.set("priority", priority);
  }

  if (stage !== null && approvedStageSet.has(stage)) {
    params.set("commercial_stage", stage);
  }

  if (responsibleSubject !== null && subjectSchema.safeParse(responsibleSubject).success) {
    params.set("responsible_subject", responsibleSubject);
  }

  params.set(
    "sort",
    sort !== null && approvedSortSet.has(sort)
      ? sort
      : "last_analysis_desc",
  );

  return params;
}

function getQueueQuery(searchParams: URLSearchParams): string {
  return getApprovedParams(searchParams).toString();
}

function formatLocation(city: string | null, uf: string | null): string {
  if (city !== null && uf !== null) {
    return `${city} / ${uf}`;
  }

  return city ?? uf ?? UNAVAILABLE_LABEL;
}

function commercialStageLabel(stage: CommercialStage): string {
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

export default function CommercialWorkQueuePage() {
  const searchParams = useSearchParams();
  const query = getQueueQuery(new URLSearchParams(searchParams));
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    query,
    status: "loading",
  }));
  const currentState: RequestState =
    requestState.query === query
      ? requestState
      : { query, status: "loading" };

  useEffect(() => {
    const abortController = new AbortController();

    async function loadQueue(): Promise<void> {
      try {
        const response = await fetch(`/api/work-queue?${query}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (!abortController.signal.aborted) {
            setRequestState({
              query,
              status:
                response.status === 401
                  ? "unauthenticated"
                  : response.status === 403
                    ? "denied"
                    : "error",
            });
          }

          return;
        }

        const payload: unknown = await response.json();

        if (!isWorkQueueEnvelope(payload)) {
          throw new Error("Commercial queue response is invalid.");
        }

        if (!abortController.signal.aborted) {
          setRequestState({ query, status: "success", response: payload });
        }
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState({ query, status: "error" });
        }
      }
    }

    void loadQueue();

    return () => abortController.abort();
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
          Acompanhamento de oportunidades
        </p>
        <h1 className="mt-4 max-w-[12ch] font-serif text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.96] tracking-[-0.05em] text-balance">
          Fila comercial
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Organize o acompanhamento das empresas com fatos do produtor e do
          workspace apresentados em campos distintos.
        </p>
        <p className="mt-4 max-w-3xl border-l-2 border-[oklch(45%_0.105_174)] pl-4 text-sm leading-6 text-[oklch(43%_0.03_252)]">
          O acompanhamento comercial não altera a recomendação do produtor.
        </p>
      </header>

      <div className="mt-10">
        <CommercialQueueFilters />
      </div>

      <div className="mt-10">
        {currentState.status === "loading" ? <QueueLoading /> : null}
        {currentState.status === "unauthenticated" ? <QueueSignIn /> : null}
        {currentState.status === "denied" ? <QueueAccessDenied /> : null}
        {currentState.status === "error" ? <QueueError /> : null}
        {currentState.status === "success" ? (
          <QueueResponse response={currentState.response} query={query} />
        ) : null}
      </div>
    </div>
  );
}

function CommercialQueueFilters() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const approvedParams = getApprovedParams(new URLSearchParams(searchParams));
  const currentCnpj = approvedParams.get("cnpj_normalizado");
  const currentResponsible = approvedParams.get("responsible_subject");
  const currentUf = approvedParams.get("uf");
  const currentPriority = approvedParams.get("priority");
  const currentStage = approvedParams.get("commercial_stage");
  const [cnpjDraft, setCnpjDraft] = useState<DraftValue>(() => ({
    source: currentCnpj,
    value: currentCnpj === null ? "" : formatCnpj(currentCnpj),
  }));
  const [responsibleDraft, setResponsibleDraft] = useState<DraftValue>(() => ({
    source: currentResponsible,
    value: currentResponsible ?? "",
  }));
  const [cnpjError, setCnpjError] = useState<FieldError | null>(null);
  const [responsibleError, setResponsibleError] = useState<FieldError | null>(
    null,
  );
  const cnpjValue =
    cnpjDraft.source === currentCnpj
      ? cnpjDraft.value
      : currentCnpj === null
        ? ""
        : formatCnpj(currentCnpj);
  const responsibleValue =
    responsibleDraft.source === currentResponsible
      ? responsibleDraft.value
      : (currentResponsible ?? "");

  function navigate(
    update: (params: URLSearchParams) => URLSearchParams,
  ): void {
    const params = getApprovedParams(new URLSearchParams(searchParams));
    params.set("page", "1");
    const updatedParams = update(params);
    const canonicalParams = getApprovedParams(updatedParams);
    router.replace(`${pathname}?${canonicalParams.toString()}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const cnpjCandidate = cnpjValue.trim();
    const responsibleCandidate = responsibleValue.trim();
    const cnpjResult =
      cnpjCandidate === "" ? undefined : cnpjSchema.safeParse(cnpjCandidate);
    const responsibleResult =
      responsibleCandidate === ""
        ? undefined
        : subjectSchema.safeParse(responsibleCandidate);

    const hasInvalidCnpj = cnpjResult !== undefined && !cnpjResult.success;
    const hasInvalidResponsible =
      responsibleResult !== undefined && !responsibleResult.success;
    const normalizedCnpj =
      cnpjResult !== undefined && cnpjResult.success
        ? cnpjResult.data
        : undefined;
    const normalizedResponsible =
      responsibleResult !== undefined && responsibleResult.success
        ? responsibleResult.data
        : undefined;

    setCnpjError(
      hasInvalidCnpj
        ? {
            source: currentCnpj,
            message: "Informe um CNPJ completo com 14 dígitos.",
          }
        : null,
    );
    setResponsibleError(
      hasInvalidResponsible
        ? {
            source: currentResponsible,
            message: "Informe um responsável válido.",
          }
        : null,
    );

    if (hasInvalidCnpj || hasInvalidResponsible) {
      return;
    }

    navigate((params) => {
      let updatedParams = new URLSearchParams(params);

      if (normalizedCnpj === undefined) {
        updatedParams = withoutParam(updatedParams, "cnpj_normalizado");
      } else {
        updatedParams.set("cnpj_normalizado", normalizedCnpj);
      }

      if (normalizedResponsible === undefined) {
        updatedParams = withoutParam(updatedParams, "responsible_subject");
      } else {
        updatedParams.set("responsible_subject", normalizedResponsible);
      }

      return updatedParams;
    });
  }

  function changeSelect(
    key: "uf" | "priority" | "commercial_stage",
    value: string,
  ): void {
    navigate((params) => {
      if (value === "") {
        return withoutParam(params, key);
      }

      params.set(key, value);
      return params;
    });
  }

  function clearAllFilters(): void {
    navigate((params) => {
      return [
        "cnpj_normalizado",
        "uf",
        "priority",
        "commercial_stage",
        "responsible_subject",
      ].reduce(
        (currentParams, key) => withoutParam(currentParams, key),
        params,
      );
    });
  }

  const activeFilters = [
    currentCnpj,
    currentUf,
    currentPriority,
    currentStage,
    currentResponsible,
  ].filter((value) => value !== null);

  return (
    <section
      aria-labelledby="commercial-queue-filter-heading"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            Consulta da fila
          </p>
          <h2
            id="commercial-queue-filter-heading"
            className="mt-1 font-serif text-2xl tracking-[-0.025em]"
          >
            Refinar acompanhamento
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Ordenação aplicada: última análise primeiro.
        </p>
      </div>

      <form
        className="mt-6 grid gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(16rem,1.4fr)_minmax(11rem,0.9fr)_minmax(9rem,0.6fr)_minmax(12rem,0.85fr)_minmax(12rem,0.9fr)] lg:items-start"
        onSubmit={handleSubmit}
      >
        <FilterTextInput
          id="commercial-queue-cnpj"
          label="CNPJ"
          value={cnpjValue}
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          error={cnpjError?.source === currentCnpj ? cnpjError.message : null}
          onChange={(value) => {
            setCnpjDraft({ source: currentCnpj, value });
            setCnpjError(null);
          }}
        />

        <FilterTextInput
          id="commercial-queue-responsible"
          label="Responsável"
          value={responsibleValue}
          placeholder="Identificador do responsável"
          error={
            responsibleError?.source === currentResponsible
              ? responsibleError.message
              : null
          }
          onChange={(value) => {
            setResponsibleDraft({ source: currentResponsible, value });
            setResponsibleError(null);
          }}
        />

        <FilterSelect
          id="commercial-queue-uf"
          label="UF"
          value={currentUf ?? ""}
          onChange={(value) => changeSelect("uf", value)}
        >
          <option value="">Todas</option>
          {brazilianUfs.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="commercial-queue-priority"
          label="Prioridade do produtor"
          value={currentPriority ?? ""}
          onChange={(value) => changeSelect("priority", value)}
        >
          <option value="">Todas</option>
          {approvedPriorities.map((priority) => (
            <option key={priority} value={priority}>
              {getPriorityLabel(priority)}
            </option>
          ))}
        </FilterSelect>

        <div>
          <FilterSelect
            id="commercial-queue-stage"
            label="Estágio comercial"
            value={currentStage ?? ""}
            onChange={(value) => changeSelect("commercial_stage", value)}
          >
            <option value="">Todos</option>
            {commercialStages.map((stage) => (
              <option key={stage} value={stage}>
                {commercialStageLabel(stage)}
              </option>
            ))}
          </FilterSelect>
          <button
            type="submit"
            className="mt-5 min-h-12 w-full bg-[oklch(24%_0.045_252)] px-5 text-sm font-bold text-[oklch(97%_0.012_82)] transition-colors hover:bg-[oklch(31%_0.055_252)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)] active:bg-[oklch(19%_0.04_252)] motion-reduce:transition-none"
          >
            Aplicar filtros
          </button>
        </div>
      </form>

      {activeFilters.length > 0 ? (
        <div
          role="region"
          aria-label="Filtros ativos"
          className="mt-6 flex flex-wrap items-center gap-2 border-t border-[oklch(88%_0.02_82)] pt-5"
        >
          <span className="mr-1 text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
            Ativos
          </span>
          {currentCnpj === null ? null : (
            <ActiveFilter label={`CNPJ: ${formatCnpj(currentCnpj)}`} />
          )}
          {currentUf === null ? null : <ActiveFilter label={`UF: ${currentUf}`} />}
          {currentPriority === null ? null : (
            <ActiveFilter label={`Prioridade: ${getPriorityLabel(currentPriority)}`} />
          )}
          {currentStage === null ? null : (
            <ActiveFilter
              label={`Estágio: ${commercialStageLabel(currentStage as CommercialStage)}`}
            />
          )}
          {currentResponsible === null ? null : (
            <ActiveFilter label={`Responsável: ${currentResponsible}`} />
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-1 min-h-11 border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(36%_0.08_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)] active:text-[oklch(18%_0.04_252)] motion-reduce:transition-none"
          >
            Limpar filtros
          </button>
        </div>
      ) : null}
    </section>
  );
}

function FilterTextInput({
  id,
  label,
  value,
  inputMode,
  placeholder,
  error,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly inputMode?: "numeric";
  readonly placeholder: string;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
}) {
  const descriptionId = `${id}-${error === null ? "hint" : "error"}`;

  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-bold text-[oklch(29%_0.04_252)]"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full border border-[oklch(70%_0.035_82)] bg-[oklch(99%_0.006_82)] px-4 text-base outline-none transition-colors placeholder:text-[oklch(60%_0.025_252)] focus-visible:border-[oklch(45%_0.105_174)] focus-visible:ring-2 focus-visible:ring-[oklch(45%_0.105_174/0.24)] motion-reduce:transition-none"
      />
      {error === null ? (
        <p
          id={descriptionId}
          className="mt-2 text-xs leading-5 text-[oklch(48%_0.025_252)]"
        >
          {label === "CNPJ"
            ? "Informe os 14 dígitos, com ou sem pontuação."
            : "Use o identificador informado no acompanhamento comercial."}
        </p>
      ) : (
        <p
          id={descriptionId}
          role="alert"
          className="mt-2 text-xs font-semibold leading-5 text-[oklch(48%_0.16_28)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-bold text-[oklch(29%_0.04_252)]"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full border border-[oklch(70%_0.035_82)] bg-[oklch(99%_0.006_82)] px-3 text-base outline-none transition-colors focus-visible:border-[oklch(45%_0.105_174)] focus-visible:ring-2 focus-visible:ring-[oklch(45%_0.105_174/0.24)] motion-reduce:transition-none"
      >
        {children}
      </select>
    </div>
  );
}

function ActiveFilter({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex min-h-9 items-center border border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] px-3 text-xs font-bold text-[oklch(32%_0.09_174)]">
      {label}
    </span>
  );
}

function withoutParam(params: URLSearchParams, key: string): URLSearchParams {
  return new URLSearchParams(
    Array.from(params.entries()).filter(([currentKey]) => currentKey !== key),
  );
}

function QueueResponse({
  response,
  query,
}: {
  readonly response: WorkQueueEnvelope;
  readonly query: string;
}) {
  const producerUnavailable =
    response.meta.total === null ||
    response.meta.provenance.producer.availability === "UNAVAILABLE";

  if (producerUnavailable) {
    return <QueueUnavailable />;
  }

  if (response.meta.total === 0) {
    return <QueueEmpty />;
  }

  if (response.data.length === 0) {
    return <QueuePageEmpty meta={response.meta} query={query} />;
  }

  return (
    <QueueResults
      items={response.data}
      meta={response.meta}
      query={query}
    />
  );
}

function QueueLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando fila comercial"
      aria-live="polite"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <span className="sr-only">Carregando fila comercial</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="h-8 w-72 bg-[oklch(89%_0.02_82)]" />
        <div className="h-16 w-full bg-[oklch(92%_0.016_82)]" />
        <div className="h-16 w-full bg-[oklch(94%_0.012_82)]" />
        <div className="h-16 w-5/6 bg-[oklch(94%_0.012_82)]" />
      </div>
    </section>
  );
}

function QueueEmpty() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Fila confirmada
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Nenhuma empresa na fila comercial
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Não há empresas que correspondam à consulta atual.
      </p>
    </section>
  );
}

function QueuePageEmpty({
  meta,
  query,
}: {
  readonly meta: WorkQueueMeta;
  readonly query: string;
}) {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Página sem resultados
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Nenhuma empresa nesta página
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Revise a paginação ou os filtros para continuar a consulta.
      </p>
      <QueuePagination itemsOnPage={0} meta={meta} query={query} />
    </section>
  );
}

function QueueUnavailable() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(69%_0.11_77)] bg-[oklch(96%_0.03_77)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(38%_0.08_62)] uppercase">
        Fonte indisponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        A fila comercial não pôde ser consultada agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(36%_0.055_62)]">
        Total não disponível. Valores ausentes não serão tratados como zero.
      </p>
    </section>
  );
}

function QueueError() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(42%_0.09_32)] uppercase">
        Consulta não concluída
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Não foi possível carregar a fila comercial agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(38%_0.045_32)]">
        Atualize a página para tentar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
    </section>
  );
}

function QueueSignIn() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(69%_0.11_77)] bg-[oklch(96%_0.03_77)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(38%_0.08_62)] uppercase">
        Acesso necessário
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Entre para acessar a fila comercial.
      </h2>
    </section>
  );
}

function QueueAccessDenied() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(69%_0.11_77)] bg-[oklch(96%_0.03_77)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(38%_0.08_62)] uppercase">
        Acesso restrito
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Você não tem acesso a esta fila comercial.
      </h2>
    </section>
  );
}

function QueueResults({
  items,
  meta,
  query,
}: {
  readonly items: readonly CommercialWorkQueueItem[];
  readonly meta: WorkQueueMeta;
  readonly query: string;
}) {
  return (
    <section aria-label="Empresas na fila comercial">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[oklch(82%_0.025_82)] pb-4">
        <h2 className="font-serif text-2xl tracking-[-0.025em]">
          Empresas para acompanhamento
        </h2>
        <p className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
          {formatTotal(meta.total)}
        </p>
      </div>

      <div className="mt-5 hidden overflow-x-auto lg:block">
        <table
          aria-label="Fila comercial"
          className="w-full min-w-[82rem] border-collapse text-left"
        >
          <thead>
            <tr className="border-b border-[oklch(72%_0.035_82)]">
              {[
                "Empresa",
                "CNPJ",
                "Localidade",
                "Recomendação do produtor",
                "Estado comercial",
                "Próxima ação",
                "Última análise",
              ].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-4 text-xs font-bold tracking-[0.09em] text-[oklch(43%_0.03_252)] uppercase first:pl-0 last:pr-0"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.producerLead.decision_id}
                className="border-b border-[oklch(88%_0.02_82)] align-top transition-colors hover:bg-[oklch(95%_0.025_82)] motion-reduce:transition-none"
              >
                <td className="max-w-60 py-5 pr-3">
                  <p className="font-bold leading-5">
                    {item.producerLead.companyName ?? UNAVAILABLE_LABEL}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-[oklch(48%_0.025_252)]">
                    {item.producerLead.sector ?? UNAVAILABLE_LABEL}
                  </p>
                </td>
                <td className="px-3 py-5 text-sm whitespace-nowrap">
                  {formatCnpj(item.producerLead.cnpj)}
                </td>
                <td className="max-w-44 px-3 py-5 text-sm leading-5">
                  {formatLocation(item.producerLead.city, item.producerLead.uf)}
                </td>
                <td className="max-w-60 px-3 py-5">
                  <ProducerFacts lead={item.producerLead} />
                </td>
                <td className="max-w-60 px-3 py-5">
                  <CommercialFacts workspace={item.workspace} />
                  <WorkspaceAction
                    workspace={item.workspace}
                    companyName={item.producerLead.companyName}
                    cnpj={item.producerLead.cnpj}
                    leadRunId={item.producerLead.lead_run_id}
                  />
                </td>
                <td className="max-w-56 px-3 py-5">
                  <NextAction workspace={item.workspace} />
                </td>
                <td className="py-5 pl-3 text-sm whitespace-nowrap last:pr-0">
                  {formatBrazilianDate(item.producerLead.lastAnalysisAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        role="region"
        aria-label="Cartões da fila comercial"
        className="mt-5 grid gap-5 lg:hidden"
      >
        {items.map((item) => (
          <article
            key={item.producerLead.decision_id}
            className="border border-[oklch(82%_0.025_82)] bg-[oklch(99%_0.006_82)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-serif text-2xl tracking-[-0.025em]">
                  {item.producerLead.companyName ?? UNAVAILABLE_LABEL}
                </p>
                <p className="mt-2 text-sm text-[oklch(43%_0.03_252)]">
                  {formatCnpj(item.producerLead.cnpj)} · {" "}
                  {formatLocation(item.producerLead.city, item.producerLead.uf)}
                </p>
              </div>
              <p className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
                {formatBrazilianDate(item.producerLead.lastAnalysisAt)}
              </p>
            </div>

            <div className="mt-5 grid gap-5 border-t border-[oklch(88%_0.02_82)] pt-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-[oklch(45%_0.105_174)] uppercase">
                  Recomendação do produtor
                </p>
                <div className="mt-3">
                  <ProducerFacts lead={item.producerLead} />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-[oklch(45%_0.105_174)] uppercase">
                  Acompanhamento comercial
                </p>
                <div className="mt-3">
                  <CommercialFacts workspace={item.workspace} showHeading={false} />
                  <div className="mt-4">
                    <NextAction workspace={item.workspace} />
                  </div>
                  <WorkspaceAction
                    workspace={item.workspace}
                    companyName={item.producerLead.companyName}
                    cnpj={item.producerLead.cnpj}
                    leadRunId={item.producerLead.lead_run_id}
                  />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <QueuePagination itemsOnPage={items.length} meta={meta} query={query} />
    </section>
  );
}

function ProducerFacts({ lead }: { readonly lead: LeadSummary }) {
  return (
    <div>
      <p className="text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
        Fatos do produtor
      </p>
      <p className="mt-2 text-sm text-[oklch(43%_0.03_252)]">
        Pontuação: {formatScore(lead.score)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge label={getPriorityLabel(lead.priority)} />
        <Badge label={getTrustStatusLabel(lead.trustStatus)} />
        <Badge label={getLeadActionLabel(lead.recommendedAction)} />
      </div>
    </div>
  );
}

function CommercialFacts({
  workspace,
  showHeading = true,
}: {
  readonly workspace: LeadWorkspaceDto | null;
  readonly showHeading?: boolean;
}) {
  if (workspace === null) {
    return (
      <div>
        {showHeading ? <CommercialFactsHeading /> : null}
        <p className="mt-2 text-sm leading-5 text-[oklch(43%_0.03_252)]">
          Espaço comercial ainda não iniciado.
        </p>
      </div>
    );
  }

  return (
    <div>
      {showHeading ? <CommercialFactsHeading /> : null}
      <div className="mt-3">
        <CommercialStageBadge stage={workspace.commercial_stage} />
      </div>
      <p className="mt-3 text-sm leading-5 text-[oklch(43%_0.03_252)]">
        <span className="font-semibold">Responsável: </span>
        {workspace.responsible_subject ?? "Sem responsável"}
      </p>
    </div>
  );
}

function CommercialFactsHeading() {
  return (
    <p className="text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
      Acompanhamento comercial
    </p>
  );
}

function WorkspaceAction({
  workspace,
  companyName,
  cnpj,
  leadRunId,
}: {
  readonly workspace: LeadWorkspaceDto | null;
  readonly companyName: string | null;
  readonly cnpj: string;
  readonly leadRunId: string;
}) {
  if (workspace === null) {
    return (
      <WorkspaceStartAction
        companyName={companyName}
        cnpj={cnpj}
        leadRunId={leadRunId}
      />
    );
  }

  const companyLabel = companyName ?? "esta empresa";

  return (
    <Link
      href={`/workspaces/${encodeURIComponent(workspace.workspace_id)}`}
      aria-label={`Abrir acompanhamento comercial de ${companyLabel}`}
      className="mt-4 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
    >
      Abrir acompanhamento
      <span aria-hidden="true" className="ml-1">
        →
      </span>
    </Link>
  );
}

type WorkspaceStartState = "idle" | "submitting" | "denied" | "conflict" | "error";

function WorkspaceStartAction({
  companyName,
  cnpj,
  leadRunId,
}: {
  readonly companyName: string | null;
  readonly cnpj: string;
  readonly leadRunId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<WorkspaceStartState>("idle");
  const companyLabel = companyName ?? "esta empresa";

  async function handleStart(): Promise<void> {
    setState("submitting");

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cnpj_normalizado: cnpj,
          observed_lead_run_id: leadRunId,
        }),
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 201) {
        const payload: unknown = await response.json();

        if (isRecord(payload) && isWorkspace(payload.data)) {
          router.push(`/workspaces/${encodeURIComponent(payload.data.workspace_id)}`);
          return;
        }

        setState("error");
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setState("denied");
        return;
      }

      if (response.status === 409) {
        setState("conflict");
        return;
      }

      setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void handleStart()}
        disabled={state === "submitting"}
        aria-label={`Iniciar acompanhamento comercial de ${companyLabel}`}
        className="min-h-11 bg-[oklch(24%_0.045_252)] px-4 py-2 text-sm font-bold text-[oklch(97%_0.012_82)] transition-colors hover:bg-[oklch(31%_0.055_252)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] active:bg-[oklch(19%_0.04_252)] disabled:cursor-wait disabled:bg-[oklch(70%_0.018_252)] motion-reduce:transition-none"
      >
        {state === "submitting" ? "Iniciando..." : "Iniciar acompanhamento"}
      </button>
      {state === "denied" ? (
        <p role="alert" className="mt-3 text-sm leading-5 text-[oklch(38%_0.08_62)]">
          Você não tem permissão para iniciar este acompanhamento.
        </p>
      ) : null}
      {state === "conflict" ? (
        <p role="alert" className="mt-3 text-sm leading-5 text-[oklch(38%_0.08_62)]">
          Este acompanhamento já foi iniciado. Atualize a fila para abri-lo.
        </p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="mt-3 text-sm leading-5 text-[oklch(42%_0.09_32)]">
          Não foi possível iniciar o acompanhamento agora. Tente novamente.
        </p>
      ) : null}
    </div>
  );
}

function NextAction({ workspace }: { readonly workspace: LeadWorkspaceDto | null }) {
  return (
    <div className="text-sm leading-5">
      <p className="text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
        Próxima ação comercial
      </p>
      <p className="mt-2 font-semibold text-[oklch(24%_0.035_252)]">
        {workspace?.next_action ?? "Não definida"}
      </p>
      <p className="mt-2 text-[oklch(43%_0.03_252)]">
        Prazo: {formatBrazilianDate(workspace?.next_action_due_at ?? null)}
      </p>
    </div>
  );
}

function Badge({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex min-h-7 items-center border border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] px-2.5 py-1 text-xs font-bold leading-4 text-[oklch(32%_0.09_174)]">
      {label}
    </span>
  );
}

function CommercialStageBadge({ stage }: { readonly stage: CommercialStage }) {
  return (
    <span className="inline-flex min-h-7 items-center border border-[oklch(68%_0.11_61)] bg-[oklch(96%_0.035_61)] px-2.5 py-1 text-xs font-bold leading-4 text-[oklch(36%_0.08_52)]">
      Estágio: {commercialStageLabel(stage)}
    </span>
  );
}

function QueuePagination({
  itemsOnPage,
  meta,
  query,
}: {
  readonly itemsOnPage: number;
  readonly meta: WorkQueueMeta;
  readonly query: string;
}) {
  const totalPages =
    meta.total === null ? null : Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const hasPrevious = meta.page > 1;
  const hasNext =
    totalPages === null
      ? itemsOnPage === meta.pageSize
      : meta.page < totalPages;

  return (
    <nav
      aria-label="Paginação da fila comercial"
      className="mt-6 flex flex-wrap items-center justify-between gap-4"
    >
      {hasPrevious ? (
        <Link
          href={queuePageHref(meta.page - 1, query)}
          aria-label="Página anterior"
          className="inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
        >
          ← Anterior
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-[oklch(63%_0.02_252)]"
        >
          Anterior
        </span>
      )}

      <span className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
        {totalPages === null
          ? `Página ${meta.page}`
          : `Página ${meta.page} de ${totalPages}`}
      </span>

      {hasNext ? (
        <Link
          href={queuePageHref(meta.page + 1, query)}
          aria-label="Próxima página"
          className="inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
        >
          Próxima →
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-[oklch(63%_0.02_252)]"
        >
          Próxima
        </span>
      )}
    </nav>
  );
}

function queuePageHref(page: number, query: string): string {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  return `/work-queue?${params.toString()}`;
}

function formatTotal(total: number | null): string {
  if (total === null) {
    return "Total não disponível";
  }

  return total === 1 ? "1 empresa" : `${total} empresas`;
}
