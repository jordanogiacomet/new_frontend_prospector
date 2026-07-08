"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
} from "../../../../../lib/formatters";
import type {
  BatchObservationBasis,
  BatchObservationStatus,
  BatchStatus,
  BatchStatusBasis,
  BatchSummary,
} from "../../../../../types/imports";

interface BatchDetailEnvelope {
  readonly data: BatchSummary;
}

type RequestState =
  | {
      readonly requestKey: string;
      readonly status: "loading";
    }
  | {
      readonly requestKey: string;
      readonly status: "success";
      readonly batch: BatchSummary;
    }
  | {
      readonly requestKey: string;
      readonly status: "not_found";
    }
  | {
      readonly requestKey: string;
      readonly status: "unavailable";
    }
  | {
      readonly requestKey: string;
      readonly status: "error";
    };

const batchStatuses: ReadonlySet<string> = new Set([
  "SUBMITTED",
  "ACCEPTED",
  "PROCESSING",
  "COMPLETED",
  "INCOMPLETE",
  "NO_UPDATE",
]);

const statusBases: ReadonlySet<string> = new Set([
  "SUBMISSION_RECORDED",
  "ACCEPTANCE_CONFIRMED",
  "PRODUCER_ACTIVITY_OBSERVED",
  "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
  "PRODUCER_CLOSED_ROWS_MISSING",
  "FRESHNESS_WINDOW_EXCEEDED",
]);

const observationStatuses: ReadonlySet<string> = new Set([
  "AVAILABLE",
  "UNAVAILABLE",
  "INCONSISTENT",
]);

const observationBases: ReadonlySet<string> = new Set([
  "PRODUCER_SOURCE_UNAVAILABLE",
  "PRODUCER_EVIDENCE_CONFLICT",
  "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE",
]);

const portugueseNumberFormatter = new Intl.NumberFormat("pt-BR");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableNonNegativeInteger(
  value: unknown,
): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isBatchSummary(value: unknown): value is BatchSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.submissionId) &&
    isNullableString(value.import_batch_id) &&
    isString(value.status) &&
    batchStatuses.has(value.status) &&
    isString(value.submittedAt) &&
    isNullableString(value.acceptedAt) &&
    isNullableString(value.lastObservedAt) &&
    isNullableNonNegativeInteger(value.rowCountAccepted) &&
    isNullableNonNegativeInteger(value.terminalCount) &&
    isNullableNonNegativeInteger(value.blockedCount) &&
    isNullableNonNegativeInteger(value.failedCount) &&
    isNullableNonNegativeInteger(value.leadCount) &&
    isString(value.statusBasis) &&
    statusBases.has(value.statusBasis) &&
    isString(value.observationStatus) &&
    observationStatuses.has(value.observationStatus) &&
    (value.observationBasis === null ||
      (isString(value.observationBasis) &&
        observationBases.has(value.observationBasis)))
  );
}

function isBatchDetailEnvelope(
  value: unknown,
): value is BatchDetailEnvelope {
  return isRecord(value) && isBatchSummary(value.data);
}

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = typeof params.id === "string" ? params.id : "";
  const requestKey = batchId;
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    requestKey,
    status: "loading",
  }));
  const currentState: RequestState =
    requestState.requestKey === requestKey
      ? requestState
      : { requestKey, status: "loading" };

  useEffect(() => {
    const abortController = new AbortController();

    async function loadBatch(): Promise<void> {
      if (!isUuid(batchId)) {
        setRequestState({ requestKey, status: "not_found" });
        return;
      }

      try {
        const response = await fetch(
          `/api/imports/${encodeURIComponent(batchId)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            credentials: "same-origin",
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          const status =
            response.status === 404
              ? "not_found"
              : response.status === 503
                ? "unavailable"
                : "error";

          if (!abortController.signal.aborted) {
            setRequestState({ requestKey, status });
          }

          return;
        }

        const payload: unknown = await response.json();

        if (!isBatchDetailEnvelope(payload)) {
          throw new Error("Batch detail response is invalid.");
        }

        if (!abortController.signal.aborted) {
          setRequestState({
            requestKey,
            status: "success",
            batch: payload.data,
          });
        }
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState({ requestKey, status: "error" });
        }
      }
    }

    void loadBatch();

    return () => abortController.abort();
  }, [batchId, requestKey]);

  return (
    <div className="mx-auto w-full max-w-[90rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
          Importação registrada
        </p>
        <h1 className="mt-4 max-w-[12ch] font-serif text-5xl leading-[0.96] tracking-normal text-balance sm:text-6xl lg:text-7xl">
          Detalhe do lote
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Consulte os fatos confirmados do envio e as contagens sustentadas por
          fonte aprovada. Métricas sem evidência permanecem indisponíveis.
        </p>
        <Link
          href="/imports/batches"
          className="mt-7 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
        >
          Voltar para importações
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link>
      </header>

      <div className="mt-10">
        {currentState.status === "loading" ? <BatchDetailLoading /> : null}

        {currentState.status === "not_found" ? <BatchNotFound /> : null}

        {currentState.status === "unavailable" ? (
          <BatchDetailUnavailable />
        ) : null}

        {currentState.status === "error" ? <BatchDetailError /> : null}

        {currentState.status === "success" ? (
          <BatchDetail batch={currentState.batch} />
        ) : null}
      </div>
    </div>
  );
}

function BatchDetailLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando detalhe da importação"
      aria-live="polite"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <span className="sr-only">Carregando detalhe da importação</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="h-8 w-72 bg-[oklch(89%_0.02_82)]" />
        <div className="h-24 w-full bg-[oklch(92%_0.016_82)]" />
        <div className="h-20 w-5/6 bg-[oklch(94%_0.012_82)]" />
        <div className="h-20 w-2/3 bg-[oklch(94%_0.012_82)]" />
      </div>
    </section>
  );
}

function BatchNotFound() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
        Detalhe indisponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Importação não encontrada
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        O registro solicitado não está disponível para esta sessão.
      </p>
    </section>
  );
}

function BatchDetailUnavailable() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(69%_0.11_77)] bg-[oklch(96%_0.03_77)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-normal text-[oklch(38%_0.08_62)] uppercase">
        Fonte indisponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Dados do lote indisponíveis
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(36%_0.055_62)]">
        Atualize a página mais tarde. Valores ausentes não serão tratados como
        zero.
      </p>
    </section>
  );
}

function BatchDetailError() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-normal text-[oklch(42%_0.09_32)] uppercase">
        Consulta não concluída
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Não foi possível carregar este lote agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(38%_0.045_32)]">
        Atualize a página para tentar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
    </section>
  );
}

function BatchDetail({ batch }: { readonly batch: BatchSummary }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]">
      <section
        aria-labelledby="estado-lote"
        className="border-y border-[oklch(82%_0.025_82)] py-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
              Estado do lote
            </p>
            <h2
              id="estado-lote"
              className="mt-3 font-serif text-3xl tracking-normal"
            >
              {statusLabel(batch.status)}
            </h2>
          </div>
          <StatusBadge status={batch.status} />
        </div>

        <p className="mt-5 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          {statusNarrative(batch.status)}
        </p>

        <dl className="mt-7 grid gap-4 sm:grid-cols-2">
          <FactItem
            label="Base da situação"
            value={statusBasisLabel(batch.statusBasis)}
          />
          <FactItem
            label="Lote de importação"
            value={batch.import_batch_id ?? UNAVAILABLE_LABEL}
            breakAll
          />
          <FactItem
            label="Envio registrado"
            value={formatBrazilianDate(batch.submittedAt)}
          />
          <FactItem
            label="Aceite confirmado"
            value={formatBrazilianDate(batch.acceptedAt)}
          />
          <FactItem
            label="Última observação"
            value={formatBrazilianDate(batch.lastObservedAt)}
          />
        </dl>
      </section>

      <section
        aria-label="Contagens do lote"
        className="border-y border-[oklch(82%_0.025_82)] py-7"
      >
        <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
          Contagens
        </p>
        <h2 className="mt-3 font-serif text-3xl tracking-normal">
          Resultados conhecidos
        </h2>
        <div className="mt-7 grid gap-3 text-sm leading-6">
          <MetricLine
            label="Linhas aceitas"
            value={formatCount(batch.rowCountAccepted)}
          />
          <MetricLine
            label="Terminais"
            value={formatCount(batch.terminalCount)}
          />
          <MetricLine
            label="Leads"
            value={formatCount(batch.leadCount)}
          />
          <MetricLine
            label="Bloqueadas"
            value={formatCount(batch.blockedCount)}
          />
          <MetricLine
            label="Falhas"
            value={formatCount(batch.failedCount)}
          />
        </div>
      </section>

      <section
        aria-labelledby="proveniencia-observacoes"
        className="border-y border-[oklch(82%_0.025_82)] py-7 xl:col-span-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
              Proveniência
            </p>
            <h2
              id="proveniencia-observacoes"
              className="mt-3 font-serif text-3xl tracking-normal"
            >
              {observationHeading(batch.observationStatus)}
            </h2>
          </div>
          <ObservationBadge status={batch.observationStatus} />
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          {observationNarrative(batch.observationStatus)}
        </p>

        <dl className="mt-7 grid gap-4 sm:grid-cols-2">
          <FactItem
            label="Situação das observações"
            value={observationStatusLabel(batch.observationStatus)}
          />
          <FactItem
            label="Base das observações"
            value={
              batch.observationBasis === null
                ? "Sem restrição registrada"
                : observationBasisLabel(batch.observationBasis)
            }
          />
        </dl>
      </section>
    </div>
  );
}

function FactItem({
  label,
  value,
  breakAll = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly breakAll?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold tracking-normal text-[oklch(48%_0.025_252)] uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm font-semibold text-[oklch(24%_0.035_252)] ${
          breakAll ? "break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function MetricLine({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <p>
      <span className="text-[oklch(48%_0.025_252)]">{label}: </span>
      <span className="font-semibold text-[oklch(24%_0.035_252)]">
        {value}
      </span>
    </p>
  );
}

function StatusBadge({ status }: { readonly status: BatchStatus }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${statusBadgeClass(
        status,
      )}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function ObservationBadge({
  status,
}: {
  readonly status: BatchObservationStatus;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${observationBadgeClass(
        status,
      )}`}
    >
      {observationStatusLabel(status)}
    </span>
  );
}

function statusBadgeClass(status: BatchStatus): string {
  if (status === "COMPLETED") {
    return "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]";
  }

  if (status === "INCOMPLETE" || status === "NO_UPDATE") {
    return "border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] text-[oklch(35%_0.08_62)]";
  }

  return "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]";
}

function observationBadgeClass(
  status: BatchObservationStatus,
): string {
  if (status === "AVAILABLE") {
    return "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]";
  }

  if (status === "INCONSISTENT") {
    return "border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] text-[oklch(42%_0.09_32)]";
  }

  return "border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] text-[oklch(35%_0.08_62)]";
}

function statusLabel(status: BatchStatus): string {
  switch (status) {
    case "SUBMITTED":
      return "Envio registrado";
    case "ACCEPTED":
      return "Aceite confirmado";
    case "PROCESSING":
      return "Em acompanhamento";
    case "COMPLETED":
      return "Concluído";
    case "INCOMPLETE":
      return "Incompleto";
    case "NO_UPDATE":
      return "Sem atualização recente";
  }
}

function statusBasisLabel(statusBasis: BatchStatusBasis): string {
  switch (statusBasis) {
    case "SUBMISSION_RECORDED":
      return "registro do envio";
    case "ACCEPTANCE_CONFIRMED":
      return "aceite confirmado";
    case "PRODUCER_ACTIVITY_OBSERVED":
      return "observação aprovada";
    case "PRODUCER_CLOSED_ALL_ROWS_TERMINAL":
      return "fechamento completo aprovado";
    case "PRODUCER_CLOSED_ROWS_MISSING":
      return "fechamento com pendências";
    case "FRESHNESS_WINDOW_EXCEEDED":
      return "janela de atualização excedida";
  }
}

function statusNarrative(status: BatchStatus): string {
  switch (status) {
    case "SUBMITTED":
      return "O envio foi registrado no Prospecta. Aceite e conclusão permanecem sem comprovação aprovada.";
    case "ACCEPTED":
      return "Há aceite confirmado por fonte aprovada, sem conclusão comprovada para o lote.";
    case "PROCESSING":
      return "Há atividade observada por fonte aprovada, mas ainda não existe fechamento conclusivo.";
    case "COMPLETED":
      return "Conclusão explícita aprovada para todas as linhas aceitas.";
    case "INCOMPLETE":
      return "Há fechamento explícito, mas uma ou mais linhas não têm resultado terminal aprovado.";
    case "NO_UPDATE":
      return "Não indica falha nem conclusão. Apenas não houve observação aprovada recente.";
  }
}

function observationHeading(
  observationStatus: BatchObservationStatus,
): string {
  switch (observationStatus) {
    case "AVAILABLE":
      return "Fonte de observação disponível";
    case "UNAVAILABLE":
      return "Fonte de observação indisponível";
    case "INCONSISTENT":
      return "Evidência inconsistente";
  }
}

function observationStatusLabel(
  observationStatus: BatchObservationStatus,
): string {
  switch (observationStatus) {
    case "AVAILABLE":
      return "Observações disponíveis";
    case "UNAVAILABLE":
      return "Observações indisponíveis";
    case "INCONSISTENT":
      return "Evidência inconsistente";
  }
}

function observationBasisLabel(
  observationBasis: BatchObservationBasis,
): string {
  switch (observationBasis) {
    case "PRODUCER_SOURCE_UNAVAILABLE":
      return "fonte indisponível";
    case "PRODUCER_EVIDENCE_CONFLICT":
      return "conflito de evidências";
    case "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE":
      return "evidência acima do aceite";
  }
}

function observationNarrative(
  observationStatus: BatchObservationStatus,
): string {
  switch (observationStatus) {
    case "AVAILABLE":
      return "As observações aprovadas estão disponíveis para sustentar o estado e as contagens exibidas.";
    case "UNAVAILABLE":
      return "A fonte de observação não está disponível agora. As contagens derivadas permanecem indisponíveis.";
    case "INCONSISTENT":
      return "Há conflito nas evidências aprovadas. O Prospecta preserva o último estado comprovado e não escolhe entre fatos conflitantes.";
  }
}

function formatCount(value: number | null): string {
  if (!isNonNegativeInteger(value)) {
    return UNAVAILABLE_LABEL;
  }

  return portugueseNumberFormatter.format(value);
}
