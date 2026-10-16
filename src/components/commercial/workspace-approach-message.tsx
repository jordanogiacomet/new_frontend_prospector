"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { actionErrorFeedback, type ActionErrorFeedback } from "../../lib/action-feedback";

import { appendReturnTo } from "../../lib/navigation-return";

interface WorkspaceApproachMessageProps {
  readonly cnpj: string;
  readonly leadRunId: string;
  readonly leadReturnTo?: string;
  readonly onSessionExpired?: () => void;
}

type LoadedDraftState =
  | { readonly status: "loading" | "missing" | "preparing" | "unavailable" | "error" }
  | { readonly status: "ready"; readonly message: string };

interface KeyedDraftState {
  readonly sourceKey: string;
  readonly state: LoadedDraftState;
}

export function WorkspaceApproachMessage({
  cnpj,
  leadRunId,
  leadReturnTo,
  onSessionExpired,
}: WorkspaceApproachMessageProps) {
  const sourceKey = `${cnpj}:${leadRunId}`;
  const [draftState, setDraftState] = useState<KeyedDraftState>({
    sourceKey,
    state: { status: "loading" },
  });
  const [editedMessage, setEditedMessage] = useState<{
    readonly sourceKey: string;
    readonly value: string;
  } | null>(null);
  const [copyState, setCopyState] = useState<{ readonly sourceKey: string; readonly status: "idle" | "copying" | "copied" | "error" }>({ sourceKey, status: "idle" });
  const copyStatus = copyState.sourceKey === sourceKey ? copyState.status : "idle";
  const copyingRef = useRef(false);
  const messageFieldRef = useRef<HTMLTextAreaElement>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const refreshInFlight = useRef(false);
  const [refreshKey, setRefreshKey] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<{ readonly sourceKey: string; readonly feedback: ActionErrorFeedback } | null>(null);
  const feedback = feedbackState?.sourceKey === sourceKey ? feedbackState.feedback : null;
  const refreshing = refreshKey === sourceKey;
  const currentState =
    draftState.sourceKey === sourceKey
      ? draftState.state
      : { status: "loading" as const };
  const message =
    editedMessage?.sourceKey === sourceKey
      ? editedMessage.value
      : currentState.status === "ready"
        ? currentState.message
        : "";

  useEffect(() => {
    const abortController = new AbortController();
    let requestInFlight = false;

    function showReadFailure(feedback: ActionErrorFeedback): void {
      if (abortController.signal.aborted) return;
      setFeedbackState({ sourceKey, feedback });
      setDraftState((previous) => previous.sourceKey === sourceKey && previous.state.status === "ready" && feedback.kind !== "session" && feedback.kind !== "denied"
        ? previous
        : { sourceKey, state: { status: "error" } });
    }

    async function loadPersistedDraft(): Promise<void> {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch(
          `/api/leads/${encodeURIComponent(cnpj)}/approach-message?leadRunId=${encodeURIComponent(leadRunId)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            credentials: "same-origin",
            signal: abortController.signal,
          },
        );
        if (!response.ok) {
          if (response.status === 401 && !abortController.signal.aborted) onSessionExpired?.();
          const payload: unknown = await response.json().catch(() => undefined);
          showReadFailure(actionErrorFeedback(response.status, payload, "read"));
          return;
        }

        const payload: unknown = await response.json();
        const parsed = parseDraftEnvelope(payload);
        if (response.status !== 200 || parsed === null) {
          throw new Error("Invalid approach cache response");
        }

        if (!abortController.signal.aborted) {
          setDraftState({ sourceKey, state: parsed });
          setFeedbackState(null);
        }
      } catch {
        showReadFailure(actionErrorFeedback(0, undefined, "read"));
      } finally {
        requestInFlight = false;
        if (!abortController.signal.aborted) {
          refreshInFlight.current = false;
          setRefreshKey((previous) => previous === sourceKey ? null : previous);
        }
      }
    }

    refreshRef.current = loadPersistedDraft;
    void loadPersistedDraft();

    return () => {
      abortController.abort();
      refreshRef.current = null;
      refreshInFlight.current = false;
    };
  }, [cnpj, leadRunId, onSessionExpired, sourceKey]);

  function refreshDraft(): void {
    if (refreshRef.current === null || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshKey(sourceKey);
    void refreshRef.current();
  }

  async function copyMessage(): Promise<void> {
    if (message.trim().length === 0 || copyingRef.current) {
      return;
    }

    copyingRef.current = true;
    setCopyState({ sourceKey, status: "copying" });
    try {
      if (navigator.clipboard === undefined) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(message);
      setCopyState({ sourceKey, status: "copied" });
    } catch {
      setCopyState({ sourceKey, status: "error" });
    } finally {
      copyingRef.current = false;
    }
  }

  return (
    <section
      id="workspace-approach"
      aria-labelledby="workspace-approach-heading"
      className="mt-12 border-y-2 border-[oklch(24%_0.035_252)] py-7"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,0.7fr)_minmax(18rem,1.3fr)] md:items-end md:gap-10">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-[oklch(45%_0.105_174)] uppercase">
            Abordagem assistida
          </p>
          <h2
            id="workspace-approach-heading"
            className="mt-2 font-serif text-3xl tracking-[-0.03em]"
          >
            Mensagem personalizada
          </h2>
        </div>
        <p className="text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Esta é a mesma mensagem preparada na avaliação da empresa e no
          acompanhamento. Revise e copie para usar no canal escolhido.
        </p>
      </div>

      <div className="mt-6">
        {currentState.status === "loading" ? (
          <p role="status" className="text-sm leading-6">
            Consultando mensagem…
          </p>
        ) : currentState.status === "ready" ? (
          <div>
            <label htmlFor="workspace-approach-message" className="text-sm font-bold">
              Mensagem de abordagem
            </label>
            <textarea
              id="workspace-approach-message"
              ref={messageFieldRef}
              value={message}
              onChange={(event) => {
                setEditedMessage({ sourceKey, value: event.target.value });
                setCopyState({ sourceKey, status: "idle" });
              }}
              className="ui-field mt-2 min-h-56 resize-y text-base leading-7"
              spellCheck
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-[oklch(46%_0.03_252)]">
                Ajustes feitos aqui ficam somente nesta tela. Copie após revisar
                os fatos e o tom.
              </p>
              <button
                type="button"
                onClick={() => void copyMessage()}
                disabled={message.trim().length === 0 || copyStatus === "copying"}
                aria-busy={copyStatus === "copying"}
                className="ui-action ui-action--secondary"
              >
                {copyStatus === "copying" ? "Copiando mensagem…" : "Copiar mensagem"}
              </button>
            </div>
            <div
              role="status"
              className={`mt-3 min-h-5 text-sm font-semibold ${
                copyStatus === "error"
                  ? "text-[oklch(42%_0.12_32)]"
                  : "text-[oklch(36%_0.09_174)]"
              }`}
            >
              {copyStatus === "copied" ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span>Mensagem copiada.</span>
                  <a
                    href="#qualification-cadence"
                    className="ui-action ui-action--quiet"
                  >
                    Próximo: registrar no plano de contatos
                  </a>
                </div>
              ) : copyStatus === "error" ? (
                "Não foi possível copiar. Selecione o texto e copie manualmente."
              ) : copyStatus === "copying" ? "Copiando mensagem…" : null}
            </div>
            {copyStatus === "error" ? <button type="button" onClick={() => { messageFieldRef.current?.focus(); messageFieldRef.current?.select(); }} className="ui-action ui-action--quiet">Selecionar texto para copiar</button> : null}
            {message.trim().length === 0 ? <p className="mt-3 text-sm">Escreva uma mensagem para habilitar a cópia.</p> : null}
          </div>
        ) : currentState.status === "missing" ? (
          <div className="flex flex-col items-start gap-4 border-l-2 border-[oklch(68%_0.11_61)] pl-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6">
              Ainda não há uma mensagem preparada para esta empresa.
            </p>
            <Link
              href={
                leadReturnTo === undefined
                  ? `/leads/${encodeURIComponent(cnpj)}?leadRunId=${encodeURIComponent(leadRunId)}`
                  : appendReturnTo(
                      `/leads/${encodeURIComponent(cnpj)}?leadRunId=${encodeURIComponent(leadRunId)}`,
                      leadReturnTo,
                    )
              }
              className="ui-action ui-action--secondary shrink-0"
            >
              Ver avaliação da empresa
            </Link>
          </div>
        ) : currentState.status === "preparing" ? (
          <p role="status" className="text-sm leading-6">
            A mensagem está sendo preparada. Use Consultar mensagem em instantes
            para verificar se ela está pronta.
          </p>
        ) : currentState.status === "unavailable" ? (
          <p role="alert" className="text-sm leading-6">
            A mensagem está temporariamente indisponível. Tente novamente mais
            tarde.
          </p>
        ) : null}
        {feedback ? <div role="alert" className="mt-4 border-l-2 border-[oklch(69%_0.11_77)] pl-4 text-sm leading-6">
          <p>{feedback.message}</p>
          {feedback.kind === "session" ? <Link href="/login" className="ui-action ui-action--secondary mt-3">Entrar novamente</Link> : null}
        </div> : null}
        {currentState.status !== "loading" && feedback?.kind !== "session" && feedback?.kind !== "denied" ? <button type="button" onClick={refreshDraft} disabled={refreshing} aria-busy={refreshing} className="ui-action ui-action--quiet mt-4">{refreshing ? "Consultando mensagem…" : "Consultar mensagem"}</button> : null}
      </div>
    </section>
  );
}

function parseDraftEnvelope(value: unknown): LoadedDraftState | null {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return null;
  }

  const data = value.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("status" in data) ||
    !("message" in data)
  ) {
    return null;
  }

  if (data.status === "ready") {
    return typeof data.message === "string" &&
      data.message.trim().length > 0 &&
      data.message.length <= 1_000
      ? { status: "ready", message: data.message }
      : null;
  }

  return (data.status === "missing" ||
    data.status === "preparing" ||
    data.status === "unavailable") &&
    data.message === null
    ? { status: data.status }
    : null;
}
