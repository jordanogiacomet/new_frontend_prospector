"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
} from "../../lib/formatters";
import { getLeadActionLabel } from "../../lib/lead-labels";
import type { LeadHistoryItem } from "../../types/leads";

const retainedHistoryCompleteness = "retained_only";
const retainedHistoryLabel = "Análises retidas encontradas";
const retainedHistoryCaveat =
  "Análises mais antigas podem não estar presentes.";

interface LeadHistoryProps {
  cnpj: string;
}

interface LeadHistoryMetadata {
  page: number;
  pageSize: number;
  total: number;
  completeness: typeof retainedHistoryCompleteness;
  label: typeof retainedHistoryLabel;
  caveat: typeof retainedHistoryCaveat;
}

interface LeadHistoryEnvelope {
  data: LeadHistoryItem[];
  meta: LeadHistoryMetadata;
}

type HistoryRequestState =
  | {
      requestKey: string;
      status: "loading";
    }
  | {
      requestKey: string;
      status: "success";
      history: LeadHistoryItem[];
      metadata: LeadHistoryMetadata;
    }
  | {
      requestKey: string;
      status: "unavailable";
    }
  | {
      requestKey: string;
      status: "error";
    }
  | {
      requestKey: string;
      status: "malformed";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSafeInteger(value: unknown, minimum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum
  );
}

function isLeadHistoryItem(value: unknown): value is LeadHistoryItem {
  return (
    isRecord(value) &&
    typeof value.decision_id === "string" &&
    isNullableString(value.import_batch_id) &&
    typeof value.lead_run_id === "string" &&
    (value.source_row === null ||
      isSafeInteger(value.source_row, Number.NEGATIVE_INFINITY)) &&
    isNullableString(value.analyzedAt) &&
    typeof value.recommendedAction === "string" &&
    isNullableString(value.recommendedActionReason) &&
    typeof value.isCurrent === "boolean"
  );
}

function isLeadHistoryMetadata(
  value: unknown,
  itemCount: number,
): value is LeadHistoryMetadata {
  return (
    isRecord(value) &&
    isSafeInteger(value.page, 1) &&
    isSafeInteger(value.pageSize, 1) &&
    value.pageSize <= 20 &&
    isSafeInteger(value.total, itemCount) &&
    value.completeness === retainedHistoryCompleteness &&
    value.label === retainedHistoryLabel &&
    value.caveat === retainedHistoryCaveat
  );
}

function isLeadHistoryEnvelope(
  value: unknown,
): value is LeadHistoryEnvelope {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isLeadHistoryItem) &&
    isLeadHistoryMetadata(value.meta, value.data.length)
  );
}

export function LeadHistory({ cnpj }: LeadHistoryProps) {
  const requestKey = cnpj;
  const [requestState, setRequestState] =
    useState<HistoryRequestState>(() => ({
      requestKey,
      status: "loading",
    }));
  const currentState: HistoryRequestState =
    requestState.requestKey === requestKey
      ? requestState
      : { requestKey, status: "loading" };

  useEffect(() => {
    const abortController = new AbortController();

    async function loadHistory(): Promise<void> {
      let response: Response;

      try {
        response = await fetch(
          `/api/leads/${encodeURIComponent(cnpj)}/history`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            credentials: "same-origin",
            signal: abortController.signal,
          },
        );
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState({ requestKey, status: "error" });
        }
        return;
      }

      if (!response.ok) {
        if (!abortController.signal.aborted) {
          setRequestState({
            requestKey,
            status:
              response.status === 503 ? "unavailable" : "error",
          });
        }
        return;
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState({ requestKey, status: "malformed" });
        }
        return;
      }

      if (!abortController.signal.aborted) {
        setRequestState(
          isLeadHistoryEnvelope(payload)
            ? {
                requestKey,
                status: "success",
                history: payload.data,
                metadata: payload.meta,
              }
            : { requestKey, status: "malformed" },
        );
      }
    }

    void loadHistory();

    return () => abortController.abort();
  }, [cnpj, requestKey]);

  return (
    <section
      aria-labelledby="lead-history-heading"
      className="border-y border-[oklch(82%_0.025_82)] py-8"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Auditoria retida
      </p>
      <h2
        id="lead-history-heading"
        className="mt-2 font-serif text-3xl tracking-[-0.03em]"
      >
        Histórico de decisões
      </h2>

      <div className="mt-6">
        <HistoryContent cnpj={cnpj} state={currentState} />
      </div>
    </section>
  );
}

interface HistoryContentProps {
  cnpj: string;
  state: HistoryRequestState;
}

function HistoryContent({ cnpj, state }: HistoryContentProps) {
  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Carregando histórico de análises"
        aria-live="polite"
        className="border-l-2 border-[oklch(72%_0.035_82)] py-2 pl-4"
      >
        <p className="text-sm text-[oklch(43%_0.03_252)]">
          Carregando histórico de análises…
        </p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <HistoryMessage
        status
        label="Histórico indisponível"
        title="Histórico indisponível"
        description="O histórico não está disponível no momento."
      />
    );
  }

  if (state.status === "error") {
    return (
      <HistoryMessage
        alert
        label="Erro ao carregar histórico"
        title="Falha na consulta"
        description="Não foi possível carregar o histórico agora."
      />
    );
  }

  if (state.status === "malformed") {
    return (
      <HistoryMessage
        alert
        label="Resposta de histórico inválida"
        title="Histórico indisponível"
        description="O histórico recebido não pôde ser apresentado com segurança."
      />
    );
  }

  return (
    <>
      <HistoryMetadata metadata={state.metadata} />

      {state.history.length === 0 ? (
        <HistoryMessage
          status
          label="Nenhuma análise retida disponível"
          title="Nenhuma análise retida disponível"
          description="Nenhuma análise retida está disponível para exibição."
        />
      ) : (
        <ol className="mt-7 grid gap-5">
          {state.history.map((item, index) => (
            <li
              key={`${item.decision_id}-${index}`}
              data-testid="lead-history-item"
            >
              <HistoryItem cnpj={cnpj} item={item} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function HistoryMetadata({
  metadata,
}: {
  metadata: LeadHistoryMetadata;
}) {
  return (
    <div className="border-l-2 border-[oklch(45%_0.105_174)] pl-4">
      <p className="text-sm font-bold">{metadata.label}</p>
      <p className="mt-1 text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {metadata.caveat}
      </p>
    </div>
  );
}

function HistoryItem({
  cnpj,
  item,
}: {
  cnpj: string;
  item: LeadHistoryItem;
}) {
  return (
    <article className="border border-[oklch(82%_0.025_82)] bg-[oklch(98%_0.008_82)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold ${
              item.isCurrent
                ? "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]"
                : "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]"
            }`}
          >
            {item.isCurrent
              ? "Análise atual"
              : "Análise substituída"}
          </p>
          <p className="mt-3 text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
            Analisada em
          </p>
          <p className="mt-1 font-serif text-2xl tabular-nums">
            {formatBrazilianDate(item.analyzedAt)}
          </p>
        </div>

        <Link
          href={`/leads/${encodeURIComponent(cnpj)}?leadRunId=${encodeURIComponent(item.lead_run_id)}`}
          aria-label="Abrir esta análise"
          className="inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 py-2 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
        >
          Abrir esta análise
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-5 border-t border-[oklch(88%_0.02_82)] pt-5 sm:grid-cols-2 xl:grid-cols-3">
        <HistoryField
          label="Ação recomendada"
          value={getLeadActionLabel(item.recommendedAction)}
        />
        <HistoryField
          label="Motivo da recomendação"
          value={item.recommendedActionReason ?? UNAVAILABLE_LABEL}
        />
        <HistoryField
          label="Identificador da decisão"
          testId="history-decision-id"
          value={item.decision_id}
        />
        <HistoryField
          label="Execução da análise"
          value={item.lead_run_id}
        />
        <HistoryField
          label="Lote de importação"
          value={item.import_batch_id ?? UNAVAILABLE_LABEL}
        />
        <HistoryField
          label="Linha de origem"
          value={
            item.source_row === null
              ? UNAVAILABLE_LABEL
              : String(item.source_row)
          }
        />
      </dl>
    </article>
  );
}

interface HistoryFieldProps {
  label: string;
  testId?: string;
  value: string;
}

function HistoryField({ label, testId, value }: HistoryFieldProps) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="mt-2 whitespace-pre-wrap text-sm leading-6 font-semibold [overflow-wrap:anywhere]"
      >
        {value}
      </dd>
    </div>
  );
}

interface HistoryMessageProps {
  alert?: boolean;
  description: string;
  label: string;
  status?: boolean;
  title: string;
}

function HistoryMessage({
  alert = false,
  description,
  label,
  status = false,
  title,
}: HistoryMessageProps) {
  return (
    <div
      role={alert ? "alert" : status ? "status" : undefined}
      aria-label={label}
      className="border border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] px-5 py-5"
    >
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {description}
      </p>
    </div>
  );
}
