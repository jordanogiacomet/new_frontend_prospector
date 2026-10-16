"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { actionErrorFeedback, type ActionErrorFeedback } from "../../lib/action-feedback";

import {
  buildLeadApproachDraft,
  type LeadApproachSource,
} from "../../lib/formatters/lead-approach-message";
import type { LeadDetail } from "../../types/leads";

interface LeadApproachMessageProps {
  readonly lead: LeadApproachSource &
    Pick<LeadDetail, "cnpj" | "lead_run_id">;
}

interface DraftState {
  readonly sourceKey: string;
  readonly value: string;
}

interface CopyState {
  readonly sourceKey: string;
  readonly status: "idle" | "copying" | "copied" | "error";
}

interface GenerationState {
  readonly sourceKey: string;
  readonly status: "idle" | "loading" | "preparing" | "success" | "error" | "unknown" | "review";
  readonly feedback?: ActionErrorFeedback;
  readonly consultOnly?: boolean;
  readonly operation?: "read" | "generate";
  readonly generatedMessage?: string;
}

export function LeadApproachMessage({ lead }: LeadApproachMessageProps) {
  const suggestion = buildLeadApproachDraft(lead);
  const canHydrate = suggestion !== null;
  const sourceMessage = suggestion?.message ?? "";
  const sourceKey = `${lead.cnpj}:${lead.lead_run_id}:${sourceMessage}`;
  const endpoint = approachEndpoint(lead);
  const [draftState, setDraftState] = useState<DraftState>(() => ({
    sourceKey,
    value: sourceMessage,
  }));
  const [copyState, setCopyState] = useState<CopyState>({
    sourceKey,
    status: "idle",
  });
  const [generationState, setGenerationState] =
    useState<GenerationState>({ sourceKey, status: "idle" });
  const messageFieldRef = useRef<HTMLTextAreaElement>(null);
  const copyingRef = useRef(false);
  const activeSourceKey = useRef(sourceKey);
  const generationRequest = useRef(0);
  const localEditRevision = useRef(0);
  const generationAbortController = useRef<AbortController | null>(null);
  const value =
    draftState.sourceKey === sourceKey
      ? draftState.value
      : sourceMessage;
  const copyStatus =
    copyState.sourceKey === sourceKey
      ? copyState.status
      : "idle";
  const generationStatus =
    generationState.sourceKey === sourceKey
      ? generationState.status
      : "idle";

  const currentGeneration = generationState.sourceKey === sourceKey ? generationState : null;
  const consultOnly = generationStatus === "preparing" || generationStatus === "unknown" || currentGeneration?.consultOnly === true;

  useEffect(() => {
    activeSourceKey.current = sourceKey;

    return () => {
      generationAbortController.current?.abort();
      generationAbortController.current = null;
    };
  }, [sourceKey]);

  useEffect(() => {
    if (!canHydrate) {
      return;
    }

    const abortController = new AbortController();
    const requestedSourceKey = sourceKey;
    const editRevisionAtRequest = localEditRevision.current;
    const generationAtRequest = generationRequest.current;

    async function hydratePersistedMessage(): Promise<void> {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: abortController.signal,
        });
        if (!response.ok) {
          return;
        }

        const payload: unknown = await response.json();
        if (
          !isApproachDraftStateEnvelope(payload) ||
          abortController.signal.aborted ||
          activeSourceKey.current !== requestedSourceKey ||
          generationRequest.current !== generationAtRequest
        ) {
          return;
        }

        if (
          payload.data.status === "ready" &&
          localEditRevision.current === editRevisionAtRequest
        ) {
          setDraftState({ sourceKey, value: payload.data.message });
          setGenerationState({ sourceKey, status: "success" });
        } else if (payload.data.status === "preparing") {
          setGenerationState({ sourceKey, status: "preparing" });
        }
      } catch {
        // Cache hydration is optional. Keep the report-grounded local draft.
      } finally {
        if (!abortController.signal.aborted && activeSourceKey.current === requestedSourceKey && generationRequest.current === generationAtRequest && generationAbortController.current === null) {
          setGenerationState((previous) => previous.sourceKey === sourceKey && previous.status === "loading"
            ? { sourceKey, status: "unknown", consultOnly: true }
            : previous);
        }
      }
    }

    void hydratePersistedMessage();

    return () => {
      abortController.abort();
    };
  }, [canHydrate, endpoint, sourceKey]);

  async function copyMessage(): Promise<void> {
    if (suggestion === null || value.trim().length === 0 || copyingRef.current) {
      return;
    }
    copyingRef.current = true;
    setCopyState({ sourceKey, status: "copying" });

    try {
      if (navigator.clipboard === undefined) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(value);
      setCopyState({ sourceKey, status: "copied" });
    } catch {
      setCopyState({ sourceKey, status: "error" });
    } finally {
      copyingRef.current = false;
    }
  }

  async function generateMessage(): Promise<void> {
    if (suggestion === null || generationAbortController.current !== null) return;

    const abortController = new AbortController();
    generationAbortController.current = abortController;
    const requestNumber = generationRequest.current + 1;
    generationRequest.current = requestNumber;
    const requestedSourceKey = sourceKey;
    const editRevisionAtRequest = localEditRevision.current;
    const method = consultOnly ? "GET" : "POST";
    setGenerationState({ sourceKey, status: "loading", operation: method === "GET" ? "read" : "generate", consultOnly });
    setCopyState({ sourceKey, status: "idle" });

    function isCurrentRequest(): boolean {
      return !abortController.signal.aborted && generationRequest.current === requestNumber && activeSourceKey.current === requestedSourceKey;
    }

    function acceptMessage(message: string): void {
      if (localEditRevision.current !== editRevisionAtRequest || (method === "GET" && localEditRevision.current > 0)) {
        setGenerationState({ sourceKey, status: "review", generatedMessage: message });
      } else {
        setDraftState({ sourceKey, value: message });
        setGenerationState({ sourceKey, status: "success" });
      }
    }

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        signal: abortController.signal,
      });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!isCurrentRequest()) return;

      if (!response.ok) {
        const feedback = actionErrorFeedback(response.status, payload, method === "GET" ? "read" : "mutation");
        setGenerationState({ sourceKey, status: feedback.kind === "unknown" ? "unknown" : "error", feedback, consultOnly: consultOnly || feedback.kind === "unknown" });
        return;
      }
      if (method === "GET") {
        if (response.status !== 200 || !isApproachDraftStateEnvelope(payload)) throw new Error("Invalid draft response");
        if (payload.data.status === "ready") acceptMessage(payload.data.message);
        else if (payload.data.status === "preparing") setGenerationState({ sourceKey, status: "preparing" });
        else if (payload.data.status === "missing") setGenerationState({ sourceKey, status: "error", feedback: { kind: "unavailable", message: "Nenhuma mensagem registrada foi encontrada nesta consulta. Seu rascunho foi mantido. Você pode decidir gerar uma nova mensagem." } });
        else setGenerationState({ sourceKey, status: "error", consultOnly: true, feedback: { kind: "unavailable", message: "A mensagem registrada está indisponível. Seu rascunho foi mantido. Consulte novamente mais tarde." } });
        return;
      }
      if (response.status === 202 && isApproachPreparingEnvelope(payload)) {
        setGenerationState({ sourceKey, status: "preparing" });
        return;
      }
      if (response.status !== 200 || !isApproachMessageEnvelope(payload)) throw new Error("Invalid generation response");
      acceptMessage(payload.data.message);
    } catch {
      if (!isCurrentRequest()) return;
      const feedback = actionErrorFeedback(0, undefined, method === "GET" ? "read" : "mutation");
      setGenerationState({ sourceKey, status: method === "GET" ? "error" : "unknown", feedback, consultOnly: true });
    } finally {
      if (generationAbortController.current === abortController) generationAbortController.current = null;
    }
  }

  return (
    <section
      aria-labelledby="lead-approach-heading"
      className="border-y-2 border-[oklch(24%_0.035_252)] py-8"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)] lg:items-end lg:gap-10">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            Abordagem assistida
          </p>
          <h2
            id="lead-approach-heading"
            className="mt-2 max-w-[18ch] font-serif text-3xl tracking-[-0.03em]"
          >
            Mensagem personalizada
          </h2>
        </div>
        <p className="max-w-[48ch] text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Rascunho construído com os dados comerciais disponíveis no relatório
          desta empresa. Ajuste o tom e confirme os fatos antes de usar.
        </p>
      </div>

      {suggestion === null ? (
        <ApproachUnavailable lead={lead} />
      ) : (
        <div className="mt-7 grid border-y border-[oklch(72%_0.035_82)] bg-[oklch(99%_0.006_82)] lg:grid-cols-[minmax(13rem,0.4fr)_minmax(0,1.6fr)]">
          <aside className="bg-[oklch(24%_0.035_252)] px-5 py-6 text-[oklch(95%_0.015_82)] sm:px-6 lg:py-8">
            <p className="text-xs font-bold tracking-[0.14em] text-[oklch(78%_0.08_174)] uppercase">
              Foco da abordagem
            </p>
            <p className="mt-4 font-serif text-2xl leading-tight tracking-[-0.025em]">
              {suggestion.companyName}
            </p>
            <div className="mt-5 grid gap-4 border-t border-[oklch(45%_0.035_252)] pt-4">
              {suggestion.contexts.map((context) => (
                <div key={`${context.basis}:${context.focus}`}>
                  <p className="text-sm leading-6 text-[oklch(85%_0.02_82)]">
                    {context.basis}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[oklch(95%_0.015_82)]">
                    {context.focus}
                  </p>
                </div>
              ))}
            </div>
          </aside>

          <div className="px-5 py-6 sm:px-7 lg:py-8">
            <label
              htmlFor="lead-approach-message"
              className="text-sm font-bold"
            >
              Mensagem de abordagem
            </label>
            <textarea
              id="lead-approach-message"
              ref={messageFieldRef}
              value={value}
              onChange={(event) => {
                localEditRevision.current += 1;
                setDraftState({
                  sourceKey,
                  value: event.target.value,
                });
                setCopyState({ sourceKey, status: "idle" });
                setGenerationState((previous) => previous.sourceKey === sourceKey && ["loading", "preparing", "unknown", "error", "review"].includes(previous.status) ? previous : { sourceKey, status: "idle" });
              }}
              className="ui-field mt-2 min-h-64 resize-y text-base leading-7"
              spellCheck
            />

            <div className="mt-5 flex flex-col gap-4 border-t border-[oklch(86%_0.02_82)] pt-5 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-[46ch] text-xs leading-5 text-[oklch(46%_0.03_252)]">
                Rascunho para revisão humana. Gerar com IA usa o provedor
                configurado e pode gerar custo. Nenhuma mensagem é enviada
                pelo Prospecta.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void generateMessage()}
                  disabled={generationStatus === "loading" || currentGeneration?.feedback?.kind === "session" || currentGeneration?.feedback?.kind === "denied"}
                  aria-busy={generationStatus === "loading"}
                  className="ui-action ui-action--primary shrink-0"
                >
                  {generationStatus === "loading"
                    ? currentGeneration?.operation === "read" ? "Consultando mensagem…" : "Gerando mensagem…"
                    : consultOnly ? "Consultar mensagem" : "Gerar com IA"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyMessage()}
                  disabled={value.trim().length === 0 || copyStatus === "copying"}
                  aria-busy={copyStatus === "copying"}
                  className="ui-action ui-action--secondary shrink-0"
                >
                  {copyStatus === "copying" ? "Copiando mensagem…" : "Copiar mensagem"}
                </button>
              </div>
            </div>

            {value.trim().length === 0 ? <p className="mt-3 text-sm">Escreva uma mensagem para habilitar a cópia.</p> : null}
            <p role="status" className={`mt-3 min-h-5 text-sm font-semibold ${copyStatus === "error" ? "text-[oklch(42%_0.12_32)]" : "text-[oklch(36%_0.09_174)]"}`}>
              {copyStatus === "copied" ? "Mensagem copiada." : copyStatus === "copying" ? "Copiando mensagem…" : copyStatus === "error" ? "Não foi possível copiar. Selecione o texto e copie manualmente." : ""}
            </p>
            {copyStatus === "error" ? <button type="button" onClick={() => { messageFieldRef.current?.focus(); messageFieldRef.current?.select(); }} className="ui-action ui-action--quiet">Selecionar texto para copiar</button> : null}
            <div role={generationStatus === "error" || generationStatus === "unknown" ? "alert" : "status"} className="mt-3 text-sm leading-6">
              {generationStatus === "success" ? "Mensagem gerada. Revise os fatos e o tom antes de usar."
                : generationStatus === "loading" ? currentGeneration?.operation === "read" ? "Consultando a mensagem registrada…" : "Aguardando a geração da mensagem. Seu rascunho continua disponível."
                : generationStatus === "preparing" ? "A mensagem já está sendo preparada. Use Consultar mensagem em instantes; essa consulta não inicia uma nova geração."
                : generationStatus === "review" ? "A mensagem gerada está disponível. Sua edição foi mantida; use a nova mensagem somente se quiser substituir o rascunho."
                : generationStatus === "unknown" ? "Não foi possível confirmar a geração. O motivo não foi informado. Seu rascunho foi mantido. Use Consultar mensagem antes de decidir gerar novamente."
                : generationStatus === "error" ? currentGeneration?.feedback?.message : ""}
              {currentGeneration?.feedback?.kind === "session" ? <Link href="/login" className="ui-action ui-action--secondary mt-3">Entrar novamente</Link> : null}
              {generationStatus === "review" && currentGeneration?.generatedMessage ? <button type="button" onClick={() => { setDraftState({ sourceKey, value: currentGeneration.generatedMessage ?? value }); setCopyState({ sourceKey, status: "idle" }); setGenerationState({ sourceKey, status: "success" }); }} className="ui-action ui-action--secondary mt-3">Usar mensagem gerada</button> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function approachEndpoint(
  lead: Pick<LeadDetail, "cnpj" | "lead_run_id">,
): string {
  return (
    `/api/leads/${encodeURIComponent(lead.cnpj)}/approach-message` +
    `?leadRunId=${encodeURIComponent(lead.lead_run_id)}`
  );
}

function isApproachMessageEnvelope(
  value: unknown,
): value is { readonly data: { readonly message: string } } {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return false;
  }

  const data = value.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string" &&
    data.message.trim().length > 0 &&
    data.message.length <= 1_000
  );
}

function isApproachPreparingEnvelope(
  value: unknown,
): value is { readonly data: { readonly status: "preparing" } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null &&
    "status" in value.data &&
    value.data.status === "preparing"
  );
}

function isApproachDraftStateEnvelope(
  value: unknown,
): value is {
  readonly data:
    | { readonly status: "ready"; readonly message: string }
    | {
        readonly status: "missing" | "preparing" | "unavailable";
        readonly message: null;
      };
} {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return false;
  }

  const data = value.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("status" in data) ||
    !("message" in data)
  ) {
    return false;
  }

  if (data.status === "ready") {
    return (
      typeof data.message === "string" &&
      data.message.trim().length > 0 &&
      data.message.length <= 1_000
    );
  }

  return (
    (data.status === "missing" ||
      data.status === "preparing" ||
      data.status === "unavailable") &&
    data.message === null
  );
}

function ApproachUnavailable({ lead }: LeadApproachMessageProps) {
  const content =
    lead.strategicReport.status === "missing"
      ? {
          title: "Relatório ainda não disponível",
          description:
            "A mensagem será montada quando esta análise tiver um relatório aprovado.",
        }
      : lead.strategicReport.status === "unavailable"
        ? {
            title: "Relatório indisponível para esta mensagem",
            description:
              "Não foi possível consultar uma base segura agora. Tente novamente mais tarde.",
          }
        : lead.strategicReport.status === "omitted_by_policy"
          ? {
              title: "Relatório retido para esta mensagem",
              description:
                "O conteúdo necessário está protegido pela política vigente e não foi usado no rascunho.",
            }
          : {
              title: "Empresa sem identificação suficiente",
              description:
                "O relatório está disponível, mas falta uma identificação segura da empresa para montar a abordagem.",
            };

  return (
    <div
      role={lead.strategicReport.status === "unavailable" ? "alert" : "status"}
      className="mt-7 grid gap-3 border-y border-[oklch(82%_0.025_82)] py-6 sm:grid-cols-[minmax(10rem,0.4fr)_minmax(0,1.6fr)] sm:gap-8"
    >
      <p className="text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
        Rascunho não gerado
      </p>
      <div>
        <h3 className="font-serif text-2xl tracking-[-0.025em]">
          {content.title}
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          {content.description}
        </p>
      </div>
    </div>
  );
}
