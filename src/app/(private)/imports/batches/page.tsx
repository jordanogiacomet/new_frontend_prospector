"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { usePrivateCapabilities } from "../../../../components/auth/private-capabilities";
import { BatchResults } from "../../../../components/imports/batch-results";
import { useImportCompanyNotices } from "../../../../components/imports/import-company-notices";
import { hasConfirmedBatchCounts } from "../../../../lib/import-batch-presentation";
import { appendReturnTo } from "../../../../lib/navigation-return";

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
      readonly refreshFailed?: boolean;
    }
  | {
      readonly query: string;
      readonly status: "unavailable";
    }
  | {
      readonly query: string;
      readonly status: "error";
    }
  | {
      readonly query: string;
      readonly status: "auth_required" | "access_denied";
    };

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;
const refreshIntervalMilliseconds = 5_000;

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

function isImportSubmissionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function hasValidWorkflowCloseReport(
  closedAt: unknown,
  rowCount: unknown,
): boolean {
  return (
    (closedAt === null && rowCount === null) ||
    (isString(closedAt) && isPositiveInteger(rowCount))
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
    isNullableString(value.workflowReportedStartedAt) &&
    hasValidWorkflowCloseReport(
      value.workflowReportedClosedAt,
      value.workflowReportedRowCount,
    ) &&
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
  const { hasPermission } = usePrivateCapabilities();
  const watchImportCompanies = useImportCompanyNotices();
  const canReadImports = hasPermission("imports:read");
  const searchParams = useSearchParams();
  const query = buildBatchListQuery(new URLSearchParams(searchParams));
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const manualRefreshRef = useRef(false);
  const [refreshState, setRefreshState] = useState<{ readonly key: string; readonly status: "idle" | "loading" | "success" }>({ key: query, status: "idle" });
  const refreshing = refreshState.key === query && refreshState.status === "loading";
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    query,
    status: "loading",
  }));
  const currentState: RequestState =
    requestState.query === query
      ? requestState
      : { query, status: "loading" };
  const watchedSubmissionIdsKey =
    canReadImports && currentState.status === "success"
      ? [...new Set(currentState.response.data.map((batch) => batch.submissionId))]
          .filter(isImportSubmissionId)
          .sort()
          .join(",")
      : "";

  useEffect(() => {
    if (!canReadImports || watchedSubmissionIdsKey === "") return;
    const releases = watchedSubmissionIdsKey.split(",").map((submissionId) =>
      watchImportCompanies(submissionId, false),
    );
    return () => releases.forEach((release) => release());
  }, [canReadImports, query, watchedSubmissionIdsKey, watchImportCompanies]);

  useEffect(() => {
    if (!canReadImports) return;

    const abortController = new AbortController();
    let requestInFlight = false;
    let accessStopped = false;

    function showReadFailure(status: "unavailable" | "error", preserveLastResult = true): void {
      if (abortController.signal.aborted) return;
      setRequestState((previous) =>
        preserveLastResult && previous.query === query && previous.status === "success"
          ? { ...previous, refreshFailed: true }
          : { query, status },
      );
    }

    async function loadBatches(): Promise<void> {
      if (requestInFlight || accessStopped) {
        return;
      }

      requestInFlight = true;

      try {
        const response = await fetch(`/api/imports?${query}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            accessStopped = true;
            window.clearInterval(refreshIntervalId);
            if (!abortController.signal.aborted) {
              setRequestState({ query, status: response.status === 401 ? "auth_required" : "access_denied" });
            }
            return;
          }

          showReadFailure(
            response.status === 503 ? "unavailable" : "error",
            response.status !== 401 && response.status !== 403,
          );

          return;
        }

        const payload: unknown = await response.json();

        if (response.status !== 200 || !isBatchListEnvelope(payload)) {
          throw new Error("Batch list response is invalid.");
        }

        if (!abortController.signal.aborted) {
          if (manualRefreshRef.current) setRefreshState({ key: query, status: "success" });
          setRequestState({
            query,
            status: "success",
            response: payload,
          });
        }
      } catch {
        showReadFailure("error");
      } finally {
        requestInFlight = false;
        if (!abortController.signal.aborted) {
          manualRefreshRef.current = false;
          setRefreshState((previous) => previous.key === query && previous.status === "loading" ? { key: query, status: "idle" } : previous);
        }
      }
    }

    refreshRef.current = loadBatches;
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadBatches();
      }
    }, refreshIntervalMilliseconds);
    void loadBatches();

    return () => {
      window.clearInterval(refreshIntervalId);
      abortController.abort();
      refreshRef.current = null;
      manualRefreshRef.current = false;
    };
  }, [query, canReadImports]);

  function refreshManually(): void {
    if (refreshRef.current === null || manualRefreshRef.current) return;
    manualRefreshRef.current = true;
    setRefreshState({ key: query, status: "loading" });
    void refreshRef.current();
  }

  if (!canReadImports) {
    return <ReadAccessState status="access_denied" />;
  }
  if (currentState.status === "auth_required" || currentState.status === "access_denied") {
    return <ReadAccessState status={currentState.status} />;
  }

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
          Importações registradas
        </p>
        <h1 className="operational-title mt-4">
          Suas importações
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Veja a situação de cada envio. Abra os detalhes para acompanhar o
          processamento; resultados ainda não confirmados ficam indisponíveis.
        </p>
        {hasPermission("leads:read") ? (
          <div className="mt-6">
            <Link href="/leads" className="ui-action ui-action--secondary">
              Abrir lista geral de empresas
            </Link>
            <p className="mt-2 text-sm leading-6 text-[oklch(43%_0.03_252)]">
              A lista reúne empresas elegíveis de todas as importações.
            </p>
          </div>
        ) : null}
        {hasPermission("imports:create") ? (
          <Link href="/imports" className="ui-action ui-action--secondary mt-4">
            Importar outro arquivo
          </Link>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[oklch(43%_0.03_252)]">
          <button
            type="button"
            disabled={currentState.status === "loading" || refreshing}
            aria-busy={refreshing}
            onClick={refreshManually}
            className="ui-action ui-action--quiet"
          >
            {refreshing ? "Atualizando importações…" : "Atualizar importações"}
          </button>
          <p>A situação é consultada automaticamente enquanto esta tela estiver aberta.</p>
          <p role="status" className="w-full">{refreshing ? "Consultando dados atualizados…" : refreshState.key === query && refreshState.status === "success" ? "Importações atualizadas." : ""}</p>
        </div>
      </header>

      <div className="mt-10">
        {currentState.status === "success" && currentState.refreshFailed ? (
          <p role="alert" className="mb-5 border-l-2 border-[oklch(69%_0.11_77)] pl-4 text-sm leading-6">
            A atualização não foi concluída. O motivo não foi informado. Você está vendo a última consulta confirmada.
            {" "}Use Atualizar importações para consultar novamente.
          </p>
        ) : null}
        {currentState.status === "loading" ? <BatchListLoading /> : null}

        {currentState.status === "unavailable" ? (
          <BatchListUnavailable />
        ) : null}

        {currentState.status === "error" ? <BatchListError /> : null}

        {currentState.status === "success" &&
        currentState.response.data.length === 0 ? (
          currentState.response.meta.total !== null &&
          currentState.response.meta.total > 0 &&
          currentState.response.meta.page > 1 ? (
            <NoBatchesOnPage />
          ) : (
            <NoBatchData />
          )
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

function NoBatchesOnPage() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
        Página sem resultados
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Esta página não tem importações
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Há importações registradas em outras páginas do histórico.
      </p>
      <Link
        href="/imports/batches"
        className="mt-6 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
      >
        Voltar à primeira página
      </Link>
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
        Use Atualizar importações para consultar novamente mais tarde. Valores ausentes não serão tratados como
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
        O motivo não foi informado. Use Atualizar importações para consultar novamente. Se o problema continuar,
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
  const returnTo = buildPageHref(pagination.page, pagination.pageSize);

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
          className="responsive-data-table w-full border-collapse text-left md:min-w-[58rem]"
        >
          <thead>
            <tr className="border-b border-[oklch(72%_0.035_82)]">
              {[
                "Envio",
                "Status",
                "Atualização",
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
                <td data-label="Envio" className="py-5 pr-3 text-sm">
                  <p className="font-bold text-[oklch(24%_0.035_252)]">
                    {formatBrazilianDate(batch.submittedAt)}
                  </p>
                  <Link
                    href={appendReturnTo(
                      `/imports/batches/${encodeURIComponent(batch.submissionId)}`,
                      returnTo,
                    )}
                    aria-label={`Ver detalhes da importação enviada em ${formatBrazilianDate(batch.submittedAt)}`}
                    className="mt-4 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
                  >
                    Ver detalhes
                    <span aria-hidden="true" className="ml-1">
                      →
                    </span>
                  </Link>
                  <details className="mt-4 max-w-64 text-sm leading-6">
                    <summary className="cursor-pointer font-semibold text-[oklch(43%_0.03_252)]">
                      Detalhes da importação
                    </summary>
                    <div className="mt-3 grid gap-3 text-[oklch(48%_0.025_252)]">
                      <p>Situação: {batchSituationBasis(batch)}</p>
                      <p>
                        Identificação do lote:
                        <span className="mt-1 block break-all">
                          {batch.import_batch_id ?? UNAVAILABLE_LABEL}
                        </span>
                      </p>
                      <MetricLine
                        label="Aceite confirmado"
                        value={formatBrazilianDate(batch.acceptedAt)}
                      />
                    </div>
                  </details>
                </td>
                <td data-label="Status" className="px-3 py-5">
                  <StatusBadge batch={batch} />
                  {workflowReportedStatusAt(batch) === null ? null : (
                    <p className="mt-2 text-xs font-semibold text-[oklch(48%_0.025_252)]">
                      {formatBrazilianDate(
                        workflowReportedStatusAt(batch),
                      )}
                    </p>
                  )}
                </td>
                <td data-label="Atualização" className="max-w-64 px-3 py-5 text-sm leading-6">
                  <MetricLine
                    label="Última"
                    value={formatBrazilianDate(batch.lastObservedAt)}
                  />
                  <p className="mt-1">
                    <ObservationBadge batch={batch} returnTo={returnTo} />
                  </p>
                  {batch.observationBasis === null ? null : (
                    <p className="mt-2 leading-5 text-[oklch(48%_0.025_252)]">
                      Situação: {observationBasisLabel(batch.observationBasis)}
                    </p>
                  )}
                </td>
                <td data-label="Resultados" className="py-5 pl-3 text-sm leading-6 last:pr-0">
                  <BatchResults batch={batch} />
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

function StatusBadge({ batch }: { readonly batch: BatchSummary }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${statusBadgeClass(
        batch.status,
        batch.workflowReportedClosedAt !== null,
      )}`}
    >
      {displayStatusLabel(batch)}
    </span>
  );
}

function ObservationBadge({
  batch,
  returnTo,
}: {
  readonly batch: BatchSummary;
  readonly returnTo: string;
}) {
  return (
    <Link
      href={appendReturnTo(
        `/imports/batches/${encodeURIComponent(batch.submissionId)}`,
        returnTo,
      )}
      aria-label={`Ver atualização da importação enviada em ${formatBrazilianDate(batch.submittedAt)}`}
      className={`inline-flex min-h-11 cursor-pointer items-center border px-2.5 py-1 text-xs font-bold leading-4 transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none ${observationBadgeClass(
        batch.observationStatus,
        batch.lastObservedAt !== null,
        hasConfirmedBatchCounts(batch),
      )}`}
    >
      {observationStatusLabel(batch.observationStatus, batch.lastObservedAt !== null, hasConfirmedBatchCounts(batch))}
    </Link>
  );
}

function statusBadgeClass(
  status: BatchStatus,
  workflowReportedClosed: boolean,
): string {
  if (status === "COMPLETED" || workflowReportedClosed) {
    return "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]";
  }

  if (status === "INCOMPLETE" || status === "NO_UPDATE") {
    return "border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] text-[oklch(35%_0.08_62)]";
  }

  return "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]";
}

function displayStatusLabel(batch: BatchSummary): string {
  if (batch.workflowReportedClosedAt !== null) {
    return "Processamento encerrado";
  }

  if (hasWorkflowReportedStart(batch)) {
    return "Processamento iniciado";
  }

  return statusLabel(batch.status);
}

function batchSituationBasis(batch: BatchSummary): string {
  if (batch.workflowReportedClosedAt !== null) {
    return "encerramento informado";
  }

  if (hasWorkflowReportedStart(batch)) {
    return "início do processamento informado";
  }

  return statusBasisLabel(batch.statusBasis);
}

function hasWorkflowReportedStart(batch: BatchSummary): boolean {
  return (
    batch.status === "SUBMITTED" &&
    batch.workflowReportedStartedAt !== null
  );
}

function workflowReportedStatusAt(batch: BatchSummary): string | null {
  return (
    batch.workflowReportedClosedAt ??
    (hasWorkflowReportedStart(batch)
      ? batch.workflowReportedStartedAt
      : null)
  );
}

function observationBadgeClass(
  status: BatchObservationStatus,
  hasCorrelatedProducerFacts: boolean,
  hasKnownCounts: boolean,
): string {
  if (status === "AVAILABLE" && hasCorrelatedProducerFacts) {
    return hasKnownCounts
      ? "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]"
      : "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]";
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
      return "atividade confirmada";
    case "PRODUCER_CLOSED_ALL_ROWS_TERMINAL":
      return "todos os resultados confirmados";
    case "PRODUCER_CLOSED_ROWS_MISSING":
      return "encerramento com resultados pendentes";
    case "FRESHNESS_WINDOW_EXCEEDED":
      return "sem atualização recente";
  }
}

function observationStatusLabel(
  observationStatus: BatchObservationStatus,
  hasCorrelatedProducerFacts: boolean,
  hasKnownCounts: boolean,
): string {
  switch (observationStatus) {
    case "AVAILABLE":
      return hasCorrelatedProducerFacts
        ? hasKnownCounts
          ? "Atualizações disponíveis"
          : "Atualização registrada"
        : "Sem atualização deste lote";
    case "UNAVAILABLE":
      return "Atualização indisponível";
    case "INCONSISTENT":
      return "Dados divergentes";
  }
}

function observationBasisLabel(
  observationBasis: BatchObservationBasis,
): string {
  switch (observationBasis) {
    case "PRODUCER_SOURCE_UNAVAILABLE":
      return "consulta indisponível";
    case "PRODUCER_EVIDENCE_CONFLICT":
      return "informações conflitantes";
    case "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE":
      return "resultados acima das linhas aceitas";
  }
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

function ReadAccessState({ status }: { readonly status: "auth_required" | "access_denied" }) {
  const expired = status === "auth_required";
  return (
    <section role="alert" className="mx-auto w-full max-w-4xl border-y border-[oklch(82%_0.025_82)] py-10">
      <p className="text-xs font-bold uppercase text-[oklch(45%_0.105_174)]">{expired ? "Acesso expirado" : "Acesso restrito"}</p>
      <h1 className="operational-title mt-4">{expired ? "Sua sessão expirou" : "Acesso não autorizado"}</h1>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {expired ? "Entre novamente para continuar. As consultas foram interrompidas." : "Seu perfil não permite esta consulta. Solicite ao responsável a verificação do seu acesso."}
      </p>
      <Link href={expired ? "/login" : "/inicio"} className="ui-action ui-action--primary mt-6">
        {expired ? "Entrar novamente" : "Voltar ao início"}
      </Link>
    </section>
  );
}
