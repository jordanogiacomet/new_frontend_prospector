"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
} from "../../../../lib/formatters";
import type {
  BatchObservationBasis,
  BatchObservationStatus,
  BatchStatus,
  BatchStatusBasis,
  BatchSummary,
} from "../../../../types/imports";

interface BatchListMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number | null;
}

interface BatchListEnvelope {
  readonly data: readonly BatchSummary[];
  readonly meta: BatchListMeta;
}

type RequestState =
  | {
      readonly query: string;
      readonly status: "loading";
    }
  | {
      readonly query: string;
      readonly status: "success";
      readonly response: BatchListEnvelope;
    }
  | {
      readonly query: string;
      readonly status: "unavailable";
    }
  | {
      readonly query: string;
      readonly status: "error";
    };

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;

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

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableNonNegativeInteger(
  value: unknown,
): value is number | null {
  return value === null || isNonNegativeInteger(value);
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

function isBatchListEnvelope(value: unknown): value is BatchListEnvelope {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return false;
  }

  const meta = value.meta;

  return (
    isRecord(meta) &&
    isPositiveInteger(meta.page) &&
    isPositiveInteger(meta.pageSize) &&
    (meta.total === null || isNonNegativeInteger(meta.total)) &&
    value.data.every(isBatchSummary)
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

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    return fallback;
  }

  return parsed;
}

function buildBatchListQuery(searchParams: URLSearchParams): string {
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

  return params.toString();
}

export default function BatchListPage() {
  const searchParams = useSearchParams();
  const query = buildBatchListQuery(new URLSearchParams(searchParams));
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

    async function loadBatches(): Promise<void> {
      try {
        const response = await fetch(`/api/imports?${query}`, {
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
                response.status === 503 ? "unavailable" : "error",
            });
          }

          return;
        }

        const payload: unknown = await response.json();

        if (!isBatchListEnvelope(payload)) {
          throw new Error("Batch list response is invalid.");
        }

        if (!abortController.signal.aborted) {
          setRequestState({
            query,
            status: "success",
            response: payload,
          });
        }
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState({ query, status: "error" });
        }
      }
    }

    void loadBatches();

    return () => abortController.abort();
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
          Importações registradas
        </p>
        <h1 className="mt-4 max-w-[12ch] font-serif text-5xl leading-[0.96] tracking-normal text-balance sm:text-6xl lg:text-7xl">
          Lotes enviados
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Acompanhe os envios registrados e as contagens confirmadas pelas
          fontes aprovadas. Métricas sem evidência ficam indisponíveis.
        </p>
        <Link
          href="/imports"
          className="mt-7 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
        >
          Enviar novo CSV
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link>
      </header>

      <div className="mt-10">
        {currentState.status === "loading" ? <BatchListLoading /> : null}

        {currentState.status === "unavailable" ? (
          <BatchListUnavailable />
        ) : null}

        {currentState.status === "error" ? <BatchListError /> : null}

        {currentState.status === "success" &&
        currentState.response.data.length === 0 ? (
          <NoBatchData />
        ) : null}

        {currentState.status === "success" &&
        currentState.response.data.length > 0 ? (
          <BatchListTable
            batches={currentState.response.data}
            pagination={currentState.response.meta}
          />
        ) : null}
      </div>
    </div>
  );
}

function BatchListLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando importações"
      aria-live="polite"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <span className="sr-only">Carregando importações</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="h-8 w-72 bg-[oklch(89%_0.02_82)]" />
        <div className="h-14 w-full bg-[oklch(92%_0.016_82)]" />
        <div className="h-14 w-full bg-[oklch(94%_0.012_82)]" />
        <div className="h-14 w-5/6 bg-[oklch(94%_0.012_82)]" />
      </div>
    </section>
  );
}

function NoBatchData() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
        Histórico de importações
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Nenhuma importação registrada
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Os lotes aparecerão aqui depois que um CSV for enviado pelo Prospecta.
      </p>
    </section>
  );
}

function BatchListUnavailable() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(69%_0.11_77)] bg-[oklch(96%_0.03_77)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-normal text-[oklch(38%_0.08_62)] uppercase">
        Fonte indisponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        As importações não puderam ser consultadas agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(36%_0.055_62)]">
        Atualize a página mais tarde. Valores ausentes não serão tratados como
        zero.
      </p>
    </section>
  );
}

function BatchListError() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-normal text-[oklch(42%_0.09_32)] uppercase">
        Consulta não concluída
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Não foi possível carregar as importações agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(38%_0.045_32)]">
        Atualize a página para tentar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
    </section>
  );
}

function BatchListTable({
  batches,
  pagination,
}: {
  readonly batches: readonly BatchSummary[];
  readonly pagination: BatchListMeta;
}) {
  return (
    <section aria-label="Importações registradas">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[oklch(82%_0.025_82)] pb-4">
        <h2 className="font-serif text-2xl tracking-normal">
          Registros de envio
        </h2>
        <p className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
          {formatTotal(pagination.total)}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          aria-label="Importações registradas"
          className="w-full min-w-[82rem] border-collapse text-left"
        >
          <thead>
            <tr className="border-b border-[oklch(72%_0.035_82)]">
              {[
                "Envio",
                "Status",
                "Lote",
                "Aceite",
                "Observação",
                "Resultados",
              ].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-4 text-xs font-bold tracking-normal text-[oklch(43%_0.03_252)] uppercase first:pl-0 last:pr-0"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr
                key={batch.submissionId}
                className="border-b border-[oklch(88%_0.02_82)] align-top transition-colors hover:bg-[oklch(95%_0.025_82)] motion-reduce:transition-none"
              >
                <td className="py-5 pr-3 text-sm">
                  <p className="font-bold text-[oklch(24%_0.035_252)]">
                    {formatBrazilianDate(batch.submittedAt)}
                  </p>
                  <p className="mt-2 max-w-56 leading-5 text-[oklch(48%_0.025_252)]">
                    Base: {statusBasisLabel(batch.statusBasis)}
                  </p>
                </td>
                <td className="px-3 py-5">
                  <StatusBadge status={batch.status} />
                </td>
                <td className="max-w-60 px-3 py-5 text-sm">
                  <span className="block break-all">
                    {batch.import_batch_id ?? UNAVAILABLE_LABEL}
                  </span>
                </td>
                <td className="px-3 py-5 text-sm leading-6">
                  <MetricLine
                    label="Data"
                    value={formatBrazilianDate(batch.acceptedAt)}
                  />
                  <MetricLine
                    label="Linhas aceitas"
                    value={formatCount(batch.rowCountAccepted)}
                  />
                </td>
                <td className="max-w-64 px-3 py-5 text-sm leading-6">
                  <MetricLine
                    label="Última"
                    value={formatBrazilianDate(batch.lastObservedAt)}
                  />
                  <p className="mt-1">
                    <ObservationBadge status={batch.observationStatus} />
                  </p>
                  {batch.observationBasis === null ? null : (
                    <p className="mt-2 leading-5 text-[oklch(48%_0.025_252)]">
                      Base: {observationBasisLabel(batch.observationBasis)}
                    </p>
                  )}
                </td>
                <td className="py-5 pl-3 text-sm leading-6 last:pr-0">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BatchPagination
        batchesOnPage={batches.length}
        pagination={pagination}
      />
    </section>
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

function BatchPagination({
  batchesOnPage,
  pagination,
}: {
  readonly batchesOnPage: number;
  readonly pagination: BatchListMeta;
}) {
  const totalPages =
    pagination.total === null
      ? null
      : Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  const hasPrevious = pagination.page > 1;
  const hasNext =
    totalPages === null
      ? batchesOnPage === pagination.pageSize
      : pagination.page < totalPages;

  return (
    <nav
      aria-label="Paginação das importações"
      className="mt-6 flex flex-wrap items-center justify-between gap-4"
    >
      {hasPrevious ? (
        <Link
          href={buildPageHref(
            pagination.page - 1,
            pagination.pageSize,
          )}
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
          ? `Página ${pagination.page}`
          : `Página ${pagination.page} de ${totalPages}`}
      </span>

      {hasNext ? (
        <Link
          href={buildPageHref(
            pagination.page + 1,
            pagination.pageSize,
          )}
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

function formatCount(value: number | null): string {
  if (!isNonNegativeInteger(value)) {
    return UNAVAILABLE_LABEL;
  }

  return portugueseNumberFormatter.format(value);
}

function formatTotal(total: number | null): string {
  if (total === null) {
    return "Total indisponível";
  }

  if (total === 1) {
    return "1 importação";
  }

  return `${portugueseNumberFormatter.format(total)} importações`;
}

function buildPageHref(targetPage: number, pageSize: number): string {
  const params = new URLSearchParams({
    page: String(targetPage),
    pageSize: String(pageSize),
  });

  return `/imports/batches?${params.toString()}`;
}
