"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { actionErrorFeedback, unknownMutationMessage } from "../../lib/action-feedback";
import { formatBrazilianDateTime } from "../../lib/formatters";
import {
  commercialStages,
  qualificationCadenceStatuses,
  qualificationContactChannels,
  qualificationContactOutcomes,
  qualificationContactStates,
  type QualificationCadenceDto,
  type QualificationCadenceStatus,
  type QualificationContactChannel,
  type QualificationContactDto,
  type QualificationContactOutcome,
  type QualificationPipelineActionDto,
} from "../../types/commercial";

interface QualificationCadenceProps {
  readonly workspaceId: string;
  readonly canWrite: boolean;
  readonly onCadenceChanged?: () => void;
  readonly onSessionExpired?: () => void;
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly cadence: QualificationCadenceDto }
  | { readonly status: "unauthenticated" | "denied" | "not_found" | "error" };

type MutationState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | {
      readonly status: "success";
      readonly pipelineAction: QualificationPipelineActionDto | null;
    }
  | {
      readonly status:
        | "conflict"
        | "unauthenticated"
        | "denied"
        | "validation"
        | "unavailable"
        | "unknown";
      readonly message?: string;
    };

interface ContactDraft {
  readonly occurredAt: string;
  readonly channel: QualificationContactChannel;
  readonly outcome: QualificationContactOutcome | "";
  readonly summary: string;
  readonly nextContactAt: string;
}

const cadenceStatuses = new Set<string>(qualificationCadenceStatuses);
const contactStates = new Set<string>(qualificationContactStates);
const contactChannels = new Set<string>(qualificationContactChannels);
const contactOutcomes = new Set<string>(qualificationContactOutcomes);
const pipelineCommercialStages = new Set<string>(commercialStages);
const contactNumbers = [1, 2, 3, 4] as const;

export function QualificationCadence({
  workspaceId,
  canWrite,
  onCadenceChanged,
  onSessionExpired,
}: QualificationCadenceProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [mutationState, setMutationState] = useState<MutationState>({
    status: "idle",
  });
  const mutationPending = useRef(false);
  const [hasConsultedMutation, setHasConsultedMutation] = useState(false);
  const loadGeneration = useRef(0);
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "error">("idle");
  const [startDate, setStartDate] = useState(currentDateInputValue);
  const [intervalDays, setIntervalDays] = useState("3");
  const [contactDraft, setContactDraft] = useState<ContactDraft>(createContactDraft);

  const loadCadence = useCallback(async (signal?: AbortSignal, preserveDraft = false): Promise<void> => {
    const generation = ++loadGeneration.current;
    await Promise.resolve();
    if (signal?.aborted || generation !== loadGeneration.current) {
      return;
    }

    if (preserveDraft) setRefreshState("loading");
    else setLoadState({ status: "loading" });

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/qualification-cadence`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal,
        },
      );

      if (signal?.aborted || generation !== loadGeneration.current) {
        return;
      }

      if (!response.ok) {
        if (response.status === 401) onSessionExpired?.();
        if (preserveDraft && response.status !== 401 && response.status !== 403 && response.status !== 404) setRefreshState("error");
        else setLoadState(responseLoadState(response.status));
        return;
      }

      const payload: unknown = await response.json();
      if (signal?.aborted || generation !== loadGeneration.current) {
        return;
      }

      const cadence = parseCadenceEnvelope(payload);
      if (cadence === null) {
        if (preserveDraft) setRefreshState("error");
        else setLoadState({ status: "error" });
        return;
      }

      setLoadState({ status: "ready", cadence });
      setRefreshState("idle");
      if (preserveDraft) {
        setHasConsultedMutation(true);
        setMutationState((current) => current.status === "unknown" ? current : { status: "idle" });
      }
    } catch {
      if (!signal?.aborted && generation === loadGeneration.current) {
        if (preserveDraft) setRefreshState("error");
        else setLoadState({ status: "error" });
      }
    }
  }, [onSessionExpired, workspaceId]);

  useEffect(() => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      void loadCadence(abortController.signal);
    }, 0);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [loadCadence]);

  async function startCadence(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canWrite || mutationPending.current || mutationState.status === "unknown" || refreshState !== "idle" || loadState.status !== "ready") {
      return;
    }

    const startAt = toUtcNoon(startDate);
    const parsedInterval = Number(intervalDays);
    if (
      startAt === null ||
      !Number.isInteger(parsedInterval) ||
      parsedInterval < 1 ||
      parsedInterval > 30
    ) {
      setMutationState({ status: "validation", message: "Informe uma data válida para o primeiro contato e um intervalo de 1 a 30 dias." });
      return;
    }

    await mutateCadence(
      {
        action: "start",
        start_at: startAt,
        interval_days: parsedInterval,
      },
      201,
    );
  }

  async function recordContact(
    event: FormEvent<HTMLFormElement>,
    contactNumber: 1 | 2 | 3 | 4,
  ): Promise<void> {
    event.preventDefault();
    if (
      !canWrite || mutationPending.current || mutationState.status === "unknown" || refreshState !== "idle" ||
      loadState.status !== "ready" ||
      loadState.cadence.current_contact_number !== contactNumber
    ) {
      return;
    }

    const occurredAt = toUtcTimestamp(contactDraft.occurredAt);
    const nextContactAt = toUtcTimestamp(contactDraft.nextContactAt);
    if (
      occurredAt === null ||
      contactDraft.outcome === "" ||
      Array.from(contactDraft.summary).length > 1_000 ||
      (contactDraft.outcome === "OTHER_RESPONSE" &&
        contactDraft.summary.trim() === "") ||
      (contactDraft.outcome === "FOLLOW_UP_LATER" &&
        (contactNumber === 4 ||
          nextContactAt === null ||
          Date.parse(nextContactAt) <= Date.parse(occurredAt)))
    ) {
      setMutationState({ status: "validation", message: occurredAt === null
        ? "Informe uma data e horário válidos para a tentativa."
        : contactDraft.outcome === ""
          ? "Selecione o que aconteceu no contato antes de registrar."
          : contactDraft.outcome === "OTHER_RESPONSE" && contactDraft.summary.trim() === ""
            ? "Descreva a resposta recebida no resumo do contato."
            : Array.from(contactDraft.summary).length > 1_000
              ? "Reduza o resumo do contato para até 1.000 caracteres."
              : "Informe uma data futura para o próximo contato; o quarto contato encerra o plano." });
      return;
    }

    await mutateCadence(
      {
        action: "record_contact",
        contact_number: contactNumber,
        occurred_at: occurredAt,
        channel: contactDraft.channel,
        outcome: contactDraft.outcome,
        summary: contactDraft.summary === "" ? null : contactDraft.summary,
        ...(contactDraft.outcome === "FOLLOW_UP_LATER"
          ? { next_contact_at: nextContactAt }
          : {}),
      },
      200,
    );
  }

  async function mutateCadence(
    body: Record<string, unknown>,
    expectedStatus: 200 | 201,
  ): Promise<void> {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setHasConsultedMutation(false);
    setMutationState({ status: "saving" });

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/qualification-cadence`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify(body),
        },
      );

      if (response.status !== expectedStatus) {
        if (response.status === 401) onSessionExpired?.();
        const feedback = actionErrorFeedback(response.status, await response.json().catch(() => null), "mutation");
        setMutationState({ status: feedback.kind === "session" ? "unauthenticated" : feedback.kind, message: feedback.message });
        return;
      }

      const payload: unknown = await response.json();
      const mutation = parseCadenceMutationEnvelope(payload, expectedStatus);
      if (mutation === null) {
        setMutationState({ status: "unknown", message: unknownMutationMessage });
        return;
      }

      setLoadState({ status: "ready", cadence: mutation.cadence });
      setContactDraft(createContactDraft());
      setMutationState({
        status: "success",
        pipelineAction: mutation.pipelineAction,
      });
      onCadenceChanged?.();
    } catch {
      setMutationState({ status: "unknown", message: unknownMutationMessage });
    } finally {
      mutationPending.current = false;
    }
  }

  return (
    <section
      id="qualification-cadence"
      aria-labelledby="qualification-cadence-heading"
      className="mt-12 border-t-2 border-[oklch(24%_0.035_252)] pt-7"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,0.75fr)_minmax(18rem,1.25fr)] md:items-end md:gap-10">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-[oklch(45%_0.105_174)] uppercase">
            Rotina comercial
          </p>
          <h2
            id="qualification-cadence-heading"
            className="mt-2 font-serif text-3xl tracking-[-0.03em]"
          >
            Plano de contatos
          </h2>
        </div>
        <p className="text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Planeje até quatro tentativas. Depois de cada contato, registre a
          resposta recebida; ela também aparecerá no histórico de atividades.
          As mensagens e ligações são feitas por você, no canal escolhido.
        </p>
      </div>

      <div className="mt-7">
        {refreshState === "loading" ? <p role="status" className="mb-4 text-sm">Consultando o plano atual; o rascunho será preservado…</p> : null}
        {refreshState === "error" ? <div className="mb-4 flex flex-wrap gap-3"><p role="alert" className="text-sm">Não foi possível consultar o plano atual. O motivo não foi informado. Seu rascunho foi preservado; consulte novamente antes de registrar.</p><button type="button" onClick={() => void loadCadence(undefined, true)} className="ui-action ui-action--quiet">Consultar plano novamente</button></div> : null}
        {loadState.status === "loading" ? (
          <p aria-live="polite" className="text-sm leading-6">
            Consultando plano de contatos…
          </p>
        ) : loadState.status === "ready" ? (
          <CadenceContent
            cadence={loadState.cadence}
            canWrite={canWrite}
            mutationBlocked={refreshState !== "idle"}
            hasConsultedMutation={hasConsultedMutation && refreshState === "idle"}
            onReviewed={() => { setHasConsultedMutation(false); setMutationState({ status: "idle" }); }}
            startDate={startDate}
            intervalDays={intervalDays}
            contactDraft={contactDraft}
            mutationState={mutationState}
            onStartDateChange={setStartDate}
            onIntervalDaysChange={setIntervalDays}
            onContactDraftChange={setContactDraft}
            onStart={startCadence}
            onRecord={recordContact}
            onReload={() => void loadCadence(undefined, true)}
          />
        ) : (
          <LoadError state={loadState.status} onRetry={() => void loadCadence()} />
        )}
      </div>
    </section>
  );
}

function CadenceContent({
  cadence,
  canWrite,
  mutationBlocked,
  hasConsultedMutation,
  onReviewed,
  startDate,
  intervalDays,
  contactDraft,
  mutationState,
  onStartDateChange,
  onIntervalDaysChange,
  onContactDraftChange,
  onStart,
  onRecord,
  onReload,
}: {
  readonly cadence: QualificationCadenceDto;
  readonly canWrite: boolean;
  readonly mutationBlocked: boolean;
  readonly hasConsultedMutation: boolean;
  readonly onReviewed: () => void;
  readonly startDate: string;
  readonly intervalDays: string;
  readonly contactDraft: ContactDraft;
  readonly mutationState: MutationState;
  readonly onStartDateChange: (value: string) => void;
  readonly onIntervalDaysChange: (value: string) => void;
  readonly onContactDraftChange: (value: ContactDraft) => void;
  readonly onStart: (event: FormEvent<HTMLFormElement>) => void;
  readonly onRecord: (
    event: FormEvent<HTMLFormElement>,
    contactNumber: 1 | 2 | 3 | 4,
  ) => void;
  readonly onReload: () => void;
}) {
  if (cadence.status === "NOT_STARTED") {
    if (!canWrite) {
      return (
        <p className="border-l-2 border-[oklch(68%_0.11_61)] pl-4 text-sm leading-6">
          Nenhum plano de contatos foi iniciado para esta empresa.
        </p>
      );
    }

    return (
      <form
        onSubmit={onStart}
        className="grid gap-5 border-y border-[oklch(82%_0.025_82)] py-6 sm:grid-cols-2"
      >
        <fieldset disabled={mutationState.status === "saving"} className="contents">
        <label className="grid gap-2 text-sm font-semibold">
          Data do 1º contato
          <input
            required
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="ui-field text-sm font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Intervalo entre contatos (dias)
          <input
            required
            type="number"
            min="1"
            max="30"
            step="1"
            value={intervalDays}
            onChange={(event) => onIntervalDaysChange(event.target.value)}
            className="ui-field text-sm font-normal"
          />
        </label>
        <p className="text-sm leading-6 text-[oklch(43%_0.03_252)] sm:col-span-2">
          Serão planejadas quatro tentativas. As datas podem mudar quando a
          pessoa pedir para falar em outro momento.
        </p>
        </fieldset>
        <MutationMessage state={mutationState} onReload={onReload} hasConsulted={hasConsultedMutation} onReviewed={onReviewed} />
        <button
          type="submit"
          disabled={mutationBlocked || mutationState.status === "saving" || mutationState.status === "unknown"}
          className="ui-action ui-action--secondary justify-self-start sm:col-span-2"
        >
          {mutationState.status === "saving" ? "Criando plano de contatos…" : "Criar plano de 4 contatos"}
        </button>
      </form>
    );
  }

  return (
    <div>
      {!canWrite ? (
        <p className="mb-5 border-l-2 border-[oklch(68%_0.11_61)] pl-4 text-sm font-semibold leading-6">
          Plano de contatos disponível somente para leitura.
        </p>
      ) : null}
      {cadence.status !== "ACTIVE" ? <MutationMessage state={mutationState} onReload={onReload} hasConsulted={hasConsultedMutation} onReviewed={onReviewed} /> : null}
      <p className="mb-4 text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {cadenceStatusDescription(cadence.status)}
      </p>
      <div className="border-y border-[oklch(72%_0.025_82)]">
        {cadence.contacts.map((contact) => {
          const isCurrent =
            cadence.status === "ACTIVE" &&
            cadence.current_contact_number === contact.contact_number;

          return (
            <details
              key={contact.qualification_contact_id}
              open={isCurrent}
              data-testid={`qualification-contact-${contact.contact_number}`}
              className="group border-b border-[oklch(82%_0.025_82)] last:border-b-0"
            >
              <summary className="grid min-h-14 cursor-pointer list-none items-center gap-2 px-1 py-3 text-sm marker:hidden sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-5">
                <span className="font-bold text-[oklch(34%_0.11_252)]">
                  {ordinal(contact.contact_number)} Contato de qualificação
                </span>
                <span className="text-[oklch(43%_0.03_252)]">
                  {formatBrazilianDateTime(contact.scheduled_at)}
                </span>
                <span className="flex items-center gap-3">
                  <ContactStateBadge contact={contact} isCurrent={isCurrent} />
                  <span
                    aria-hidden="true"
                    className="text-xs transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </span>
              </summary>
              <div className="border-t border-[oklch(88%_0.018_82)] bg-[oklch(98%_0.01_82)] px-4 py-5 sm:px-6">
                {contact.state === "COMPLETED" ? (
                  <CompletedContact contact={contact} />
                ) : contact.state === "CANCELLED" ? (
                  <p className="text-sm leading-6 text-[oklch(43%_0.03_252)]">
                    Esta tentativa foi encerrada porque a qualificação já teve
                    um desfecho.
                  </p>
                ) : isCurrent && canWrite ? (
                  <ContactForm
                    contactNumber={contact.contact_number}
                    mutationBlocked={mutationBlocked}
                    hasConsultedMutation={hasConsultedMutation}
                    onReviewed={onReviewed}
                    draft={contactDraft}
                    mutationState={mutationState}
                    onChange={onContactDraftChange}
                    onSubmit={onRecord}
                    onReload={onReload}
                  />
                ) : (
                  <p className="text-sm leading-6 text-[oklch(43%_0.03_252)]">
                    {isCurrent
                      ? "Aguardando o registro desta tentativa."
                      : "Esta tentativa será liberada após o contato anterior."}
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function ContactForm({
  contactNumber,
  mutationBlocked,
  hasConsultedMutation,
  onReviewed,
  draft,
  mutationState,
  onChange,
  onSubmit,
  onReload,
}: {
  readonly contactNumber: 1 | 2 | 3 | 4;
  readonly mutationBlocked: boolean;
  readonly hasConsultedMutation: boolean;
  readonly onReviewed: () => void;
  readonly draft: ContactDraft;
  readonly mutationState: MutationState;
  readonly onChange: (value: ContactDraft) => void;
  readonly onSubmit: (
    event: FormEvent<HTMLFormElement>,
    contactNumber: 1 | 2 | 3 | 4,
  ) => void;
  readonly onReload: () => void;
}) {
  return (
    <form
      onSubmit={(event) => onSubmit(event, contactNumber)}
      className="grid gap-4 sm:grid-cols-2"
    >
      <fieldset disabled={mutationState.status === "saving"} className="contents">
      <label className="grid gap-2 text-sm font-semibold">
        Canal utilizado
        <select
          value={draft.channel}
          onChange={(event) =>
            onChange({
              ...draft,
              channel: event.target.value as QualificationContactChannel,
            })
          }
          className="ui-field text-sm font-normal"
        >
          {qualificationContactChannels.map((channel) => (
            <option key={channel} value={channel}>
              {channelLabel(channel)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Data e horário da tentativa
        <input
          required
          type="datetime-local"
          value={draft.occurredAt}
          onChange={(event) =>
            onChange({ ...draft, occurredAt: event.target.value })
          }
          className="ui-field text-sm font-normal"
        />
      </label>
      <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
        O que aconteceu?
        <select
          required
          value={draft.outcome}
          onChange={(event) =>
            onChange({
              ...draft,
              outcome: event.target.value as QualificationContactOutcome | "",
              nextContactAt:
                event.target.value === "FOLLOW_UP_LATER"
                  ? draft.nextContactAt
                  : "",
            })
          }
          className="ui-field text-sm font-normal"
        >
          <option value="">Selecione a resposta recebida</option>
          {qualificationContactOutcomes
            .filter(
              (outcome) =>
                contactNumber < 4 || outcome !== "FOLLOW_UP_LATER",
            )
            .map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcomeLabel(outcome)}
              </option>
            ))}
        </select>
      </label>
      {draft.outcome === "FOLLOW_UP_LATER" && contactNumber < 4 ? (
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
          Novo dia e horário do próximo contato
          <input
            required
            type="datetime-local"
            value={draft.nextContactAt}
            onChange={(event) =>
              onChange({ ...draft, nextContactAt: event.target.value })
            }
            className="ui-field text-sm font-normal sm:max-w-sm"
          />
        </label>
      ) : null}
      <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
        Resumo do contato
        <textarea
          required={draft.outcome === "OTHER_RESPONSE"}
          maxLength={1_000}
          value={draft.summary}
          onChange={(event) =>
            onChange({ ...draft, summary: event.target.value })
          }
          placeholder="Registre o contexto útil para a próxima tentativa."
          className="ui-field min-h-24 resize-y text-sm font-normal"
        />
      </label>
      </fieldset>
      {draft.outcome === "" ? <p className="text-xs sm:col-span-2">Selecione a resposta recebida para registrar este contato.</p> : null}
      <MutationMessage state={mutationState} onReload={onReload} hasConsulted={hasConsultedMutation} onReviewed={onReviewed} />
      <button
        type="submit"
        disabled={mutationBlocked || mutationState.status === "saving" || mutationState.status === "unknown" || draft.outcome === ""}
        className="ui-action ui-action--secondary justify-self-start sm:col-span-2"
      >
        {mutationState.status === "saving" ? "Registrando contato…" : `Registrar ${ordinal(contactNumber)} contato`}
      </button>
    </form>
  );
}

function CompletedContact({ contact }: { readonly contact: QualificationContactDto }) {
  if (
    contact.outcome === null ||
    contact.channel === null ||
    contact.completed_at === null
  ) {
    return null;
  }

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-[oklch(43%_0.03_252)]">Resposta recebida</dt>
        <dd className="mt-1 font-semibold">{outcomeLabel(contact.outcome)}</dd>
      </div>
      <div>
        <dt className="text-[oklch(43%_0.03_252)]">Canal</dt>
        <dd className="mt-1 font-semibold">{channelLabel(contact.channel)}</dd>
      </div>
      <div>
        <dt className="text-[oklch(43%_0.03_252)]">Registrado em</dt>
        <dd className="mt-1 font-semibold">
          {formatBrazilianDateTime(contact.completed_at)}
        </dd>
      </div>
      {contact.summary === null ? null : (
        <div className="sm:col-span-3">
          <dt className="text-[oklch(43%_0.03_252)]">Resumo</dt>
          <dd className="mt-1 leading-6">{contact.summary}</dd>
        </div>
      )}
    </dl>
  );
}

function ContactStateBadge({
  contact,
  isCurrent,
}: {
  readonly contact: QualificationContactDto;
  readonly isCurrent: boolean;
}) {
  const label = isCurrent
    ? "Contato atual"
    : contact.state === "COMPLETED"
      ? "Concluído"
      : contact.state === "CANCELLED"
        ? "Encerrado"
        : "Agendado";

  return (
    <span
      className={`inline-flex min-h-6 items-center border px-2 text-[0.67rem] font-bold tracking-[0.08em] uppercase ${
        isCurrent
          ? "border-[oklch(45%_0.105_174)] bg-[oklch(93%_0.035_174)] text-[oklch(30%_0.075_174)]"
          : "border-[oklch(76%_0.025_82)] text-[oklch(43%_0.03_252)]"
      }`}
    >
      {label}
    </span>
  );
}

function MutationMessage({
  state,
  onReload,
  hasConsulted,
  onReviewed,
}: {
  readonly state: MutationState;
  readonly onReload: () => void;
  readonly hasConsulted: boolean;
  readonly onReviewed: () => void;
}) {
  if (state.status === "idle" || state.status === "saving") {
    return state.status === "saving" ? (
      <p role="status" className="text-sm sm:col-span-2">
        Salvando plano de contatos…
      </p>
    ) : null;
  }

  if (state.status === "success") {
    if (state.pipelineAction !== null) {
      return (
        <p
          role="status"
          aria-label="Resultado do acompanhamento"
          className="border-l-2 border-[oklch(45%_0.105_174)] pl-3 text-sm font-semibold leading-6 text-[oklch(30%_0.09_150)] sm:col-span-2"
        >
          {pipelineActionMessage(state.pipelineAction)}
        </p>
      );
    }

    return (
      <p role="status" className="text-sm font-semibold text-[oklch(30%_0.09_150)] sm:col-span-2">
        Plano de contatos atualizado.
      </p>
    );
  }

  const message = state.message ?? (
    state.status === "conflict"
      ? "O plano mudou em outra tela. Consulte o plano atual e revise seu rascunho antes de continuar."
      : state.status === "unauthenticated"
        ? "Sua sessão expirou. Entre novamente para atualizar o plano de contatos."
        : state.status === "denied"
          ? "Você não tem acesso para atualizar o plano de contatos. Solicite ao responsável a verificação do acesso."
          : unknownMutationMessage
  );

  return (
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
      <p role="alert" className="text-sm font-semibold text-[oklch(42%_0.15_28)]">
        {message}
      </p>
      {state.status === "conflict" || state.status === "unknown" ? (
        <button type="button" onClick={onReload} className="ui-action ui-action--quiet">
          Consultar plano atual
        </button>
      ) : null}
      {state.status === "unknown" && hasConsulted ? <button type="button" onClick={onReviewed} className="ui-action ui-action--quiet">Conferi o plano; preparar novo registro</button> : null}
    </div>
  );
}

function LoadError({
  state,
  onRetry,
}: {
  readonly state: Exclude<LoadState["status"], "loading" | "ready">;
  readonly onRetry: () => void;
}) {
  const message =
    state === "unauthenticated"
      ? "Sua sessão expirou. Entre novamente para consultar o plano de contatos."
      : state === "denied"
        ? "Você não tem acesso a este plano de contatos. Solicite ao responsável a verificação do acesso."
        : state === "not_found"
          ? "Este acompanhamento não está mais disponível. Volte para leads e escolha uma empresa disponível."
          : "Não foi possível consultar o plano de contatos agora.";

  return (
    <div className="flex flex-wrap items-center gap-4 border-l-2 border-[oklch(68%_0.11_61)] pl-4">
      <p role="alert" className="text-sm leading-6">
        {message}
      </p>
      {state === "error" ? (
        <button type="button" onClick={onRetry} className="ui-action ui-action--quiet">
          Tentar novamente
        </button>
      ) : state === "unauthenticated" ? (
        <Link href="/login" className="ui-action ui-action--quiet">Entrar novamente</Link>
      ) : state === "not_found" ? (
        <Link href="/leads" className="ui-action ui-action--quiet">Voltar para leads</Link>
      ) : null}
    </div>
  );
}

function cadenceStatusDescription(status: QualificationCadenceStatus): string {
  switch (status) {
    case "NOT_STARTED":
      return "O plano de contatos ainda não foi iniciado.";
    case "ACTIVE":
      return "Registre o contato atual para liberar a próxima tentativa.";
    case "QUALIFIED":
      return "Empresa qualificada. As tentativas restantes foram encerradas.";
    case "STOPPED":
      return "Plano encerrado conforme a resposta recebida.";
    case "EXHAUSTED":
      return "As quatro tentativas foram concluídas.";
  }
}

function channelLabel(channel: QualificationContactChannel): string {
  switch (channel) {
    case "CALL":
      return "Ligação";
    case "EMAIL":
      return "E-mail";
    case "WHATSAPP":
      return "WhatsApp";
    case "OTHER":
      return "Outro canal";
  }
}

function outcomeLabel(outcome: QualificationContactOutcome): string {
  switch (outcome) {
    case "NO_RESPONSE":
      return "Sem resposta";
    case "RESPONDED":
      return "Respondeu; continuar qualificando";
    case "FOLLOW_UP_LATER":
      return "Pediu para falar mais tarde";
    case "QUALIFIED":
      return "Qualificado para avançar";
    case "NOT_INTERESTED":
      return "Sem interesse";
    case "WRONG_CONTACT":
      return "Contato incorreto";
    case "OTHER_RESPONSE":
      return "Outro retorno";
  }
}

function ordinal(contactNumber: 1 | 2 | 3 | 4): string {
  return `${contactNumber}º`;
}

function createContactDraft(): ContactDraft {
  return {
    occurredAt: currentDatetimeLocalValue(),
    channel: "WHATSAPP",
    outcome: "",
    summary: "",
    nextContactAt: "",
  };
}

function currentDateInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function currentDatetimeLocalValue(): string {
  const now = new Date();
  return `${currentDateInputValue()}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toUtcNoon(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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

function responseLoadState(status: number): LoadState {
  if (status === 401) return { status: "unauthenticated" };
  if (status === 403) return { status: "denied" };
  if (status === 404) return { status: "not_found" };
  return { status: "error" };
}


function parseCadenceEnvelope(value: unknown): QualificationCadenceDto | null {
  if (!isRecord(value) || !isCadence(value.data)) {
    return null;
  }

  return value.data;
}

function parseCadenceMutationEnvelope(
  value: unknown,
  expectedStatus: 200 | 201,
): {
  readonly cadence: QualificationCadenceDto;
  readonly pipelineAction: QualificationPipelineActionDto | null;
} | null {
  const cadence = parseCadenceEnvelope(value);
  if (cadence === null || !isRecord(value) || !isRecord(value.meta)) {
    return null;
  }

  if (expectedStatus === 201) {
    return value.meta.result === "started"
      ? { cadence, pipelineAction: null }
      : null;
  }

  const pipelineAction = parsePipelineAction(value.meta.pipelineAction);
  return value.meta.result === "recorded" && pipelineAction !== null
    ? { cadence, pipelineAction }
    : null;
}

function parsePipelineAction(
  value: unknown,
): QualificationPipelineActionDto | null {
  if (
    !isRecord(value) ||
    (value.kind !== "automatic" &&
      value.kind !== "recommendation" &&
      value.kind !== "unchanged") ||
    (value.commercial_stage !== null &&
      (typeof value.commercial_stage !== "string" ||
        !pipelineCommercialStages.has(value.commercial_stage)))
  ) {
    return null;
  }

  if (value.kind === "automatic" && value.commercial_stage === null) {
    return null;
  }

  return {
    kind: value.kind,
    commercial_stage: value.commercial_stage as
      | QualificationPipelineActionDto["commercial_stage"],
  };
}

function pipelineActionMessage(action: QualificationPipelineActionDto): string {
  if (action.kind === "recommendation") {
    return "A etapa foi mantida e uma próxima ação foi recomendada para sua decisão.";
  }

  if (action.kind === "unchanged") {
    return "A oportunidade já estava encerrada; a etapa comercial foi preservada.";
  }

  return `Etapa comercial atualizada automaticamente para ${commercialStageLabel(action.commercial_stage)}.`;
}

function commercialStageLabel(
  stage: QualificationPipelineActionDto["commercial_stage"],
): string {
  switch (stage) {
    case "NOT_STARTED":
      return "Não iniciado";
    case "ASSIGNED":
      return "Preparação";
    case "CONTACTED":
      return "Contato realizado";
    case "FOLLOW_UP":
      return "Acompanhamento";
    case "MEETING":
      return "Reunião";
    case "PAUSED":
      return "Em espera";
    case "CLOSED_WON":
      return "Ganho";
    case "CLOSED_LOST":
      return "Perdido";
    case null:
      return "Etapa mantida";
  }
}

function isCadence(value: unknown): value is QualificationCadenceDto {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    !cadenceStatuses.has(value.status) ||
    !Array.isArray(value.contacts)
  ) {
    return false;
  }

  if (value.status === "NOT_STARTED") {
    return value.current_contact_number === null && value.contacts.length === 0;
  }

  if (
    value.contacts.length !== 4 ||
    !value.contacts.every(
      (contact, index) =>
        isQualificationContact(contact) && contact.contact_number === index + 1,
    )
  ) {
    return false;
  }

  if (value.status === "ACTIVE") {
    return (
      contactNumbers.includes(
        value.current_contact_number as (typeof contactNumbers)[number],
      ) &&
      value.contacts.some(
        (contact) =>
          contact.contact_number === value.current_contact_number &&
          contact.state === "PENDING",
      )
    );
  }

  return value.current_contact_number === null;
}

function isQualificationContact(value: unknown): value is QualificationContactDto {
  if (!isRecord(value)) {
    return false;
  }

  const state = value.state;
  const completed = state === "COMPLETED";
  return (
    typeof value.qualification_contact_id === "string" &&
    contactNumbers.includes(
      value.contact_number as (typeof contactNumbers)[number],
    ) &&
    isTimestamp(value.scheduled_at) &&
    typeof state === "string" &&
    contactStates.has(state) &&
    (value.outcome === null ||
      (typeof value.outcome === "string" && contactOutcomes.has(value.outcome))) &&
    (value.channel === null ||
      (typeof value.channel === "string" && contactChannels.has(value.channel))) &&
    (value.summary === null || typeof value.summary === "string") &&
    (value.completed_at === null || isTimestamp(value.completed_at)) &&
    (completed
      ? value.outcome !== null &&
        value.channel !== null &&
        value.completed_at !== null
      : value.outcome === null &&
        value.channel === null &&
        value.completed_at === null)
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
