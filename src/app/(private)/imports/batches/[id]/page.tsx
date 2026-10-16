"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { usePrivateCapabilities } from "../../../../../components/auth/private-capabilities";
import { BatchResults } from "../../../../../components/imports/batch-results";
import { useImportCompanyNotices } from "../../../../../components/imports/import-company-notices";

import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
} from "../../../../../lib/formatters";
import { hasConfirmedBatchCounts } from "../../../../../lib/import-batch-presentation";
import { resolveBatchListReturnHref } from "../../../../../lib/navigation-return";
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
      readonly refreshFailed?: boolean;
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
    }
  | {
      readonly requestKey: string;
      readonly status: "auth_required" | "access_denied";
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
const refreshIntervalMilliseconds = 5_000;

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

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
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

function isBatchDetailEnvelope(
  value: unknown,
): value is BatchDetailEnvelope {
  return isRecord(value) && isBatchSummary(value.data);
}

export default function BatchDetailPage() {
  const { hasPermission } = usePrivateCapabilities();
  const watchImportCompanies = useImportCompanyNotices();
  const canReadImports = hasPermission("imports:read");
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnHref = resolveBatchListReturnHref(searchParams.get("returnTo"));
  const batchId = typeof params.id === "string" ? params.id : "";
  const requestKey = batchId;
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const manualRefreshRef = useRef(false);
  const [refreshState, setRefreshState] = useState<{ readonly key: string; readonly status: "idle" | "loading" | "success" }>({ key: requestKey, status: "idle" });
  const refreshing = refreshState.key === requestKey && refreshState.status === "loading";
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    requestKey,
    status: "loading",
  }));
  const currentState: RequestState =
    requestState.requestKey === requestKey
      ? requestState
      : { requestKey, status: "loading" };

  const confirmedSubmissionId = currentState.status === "success"
    ? currentState.batch.submissionId : null;
  useEffect(() => {
    if (canReadImports && confirmedSubmissionId !== null) {
      return watchImportCompanies(confirmedSubmissionId, false);
    }
  }, [canReadImports, confirmedSubmissionId, watchImportCompanies]);

  useEffect(() => {
    if (!canReadImports) return;

    const abortController = new AbortController();
    let requestInFlight = false;
    let accessStopped = false;

    function showReadFailure(status: "unavailable" | "error", preserveLastResult = true): void {
      if (abortController.signal.aborted) return;
      setRequestState((previous) =>
        preserveLastResult && previous.requestKey === requestKey && previous.status === "success"
          ? { ...previous, refreshFailed: true }
          : { requestKey, status },
      );
    }

    async function loadBatch(): Promise<void> {
      if (!isUuid(batchId)) {
        setRequestState({ requestKey, status: "not_found" });
        manualRefreshRef.current = false;
        setRefreshState({ key: requestKey, status: "idle" });
        return;
      }

      if (requestInFlight || accessStopped) {
        return;
      }

      requestInFlight = true;

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
          if (response.status === 401 || response.status === 403) {
            accessStopped = true;
            window.clearInterval(refreshIntervalId);
            if (!abortController.signal.aborted) {
              setRequestState({ requestKey, status: response.status === 401 ? "auth_required" : "access_denied" });
            }
            return;
          }

          const status =
            response.status === 404
              ? "not_found"
              : response.status === 503
                ? "unavailable"
                : "error";

          if (status === "not_found") {
            if (!abortController.signal.aborted) {
              setRequestState({ requestKey, status });
            }
          } else {
            showReadFailure(status, response.status !== 401 && response.status !== 403);
          }

          return;
        }

        const payload: unknown = await response.json();

        if (response.status !== 200 || !isBatchDetailEnvelope(payload) || payload.data.submissionId !== batchId) {
          throw new Error("Batch detail response is invalid.");
        }

        if (!abortController.signal.aborted) {
          if (manualRefreshRef.current) setRefreshState({ key: requestKey, status: "success" });
          setRequestState({
            requestKey,
            status: "success",
            batch: payload.data,
          });
        }
      } catch {
        showReadFailure("error");
      } finally {
        requestInFlight = false;
        if (!abortController.signal.aborted) {
          manualRefreshRef.current = false;
          setRefreshState((previous) => previous.key === requestKey && previous.status === "loading" ? { key: requestKey, status: "idle" } : previous);
        }
      }
    }

    refreshRef.current = loadBatch;
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadBatch();
      }
    }, refreshIntervalMilliseconds);
    void loadBatch();

    return () => {
      window.clearInterval(refreshIntervalId);
      abortController.abort();
      refreshRef.current = null;
      manualRefreshRef.current = false;
    };
  }, [batchId, requestKey, canReadImports]);

  function refreshManually(): void {
    if (refreshRef.current === null || manualRefreshRef.current) return;
    manualRefreshRef.current = true;
    setRefreshState({ key: requestKey, status: "loading" });
    void refreshRef.current();
  }

  if (!canReadImports) {
    return <ReadAccessState status="access_denied" />;
  }
  if (currentState.status === "auth_required" || currentState.status === "access_denied") {
    return <ReadAccessState status={currentState.status} />;
  }

  return (
    <div className="mx-auto w-full max-w-[90rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
          Importação registrada
        </p>
        <h1 className="operational-title mt-4">
          Acompanhar importação
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Acompanhe o envio e os resultados confirmados. Uma informação
          indisponível ainda não permite concluir o que aconteceu com a linha.
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
        <Link href={returnHref} className="ui-action ui-action--quiet mt-4">
          Voltar para importações
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[oklch(43%_0.03_252)]">
          <button
            type="button"
            disabled={currentState.status === "loading" || refreshing}
            aria-busy={refreshing}
            onClick={refreshManually}
            className="ui-action ui-action--quiet"
          >
            {refreshing ? "Atualizando situação…" : "Atualizar situação"}
          </button>
          <p>A situação é consultada automaticamente enquanto esta tela estiver aberta.</p>
          <p role="status" className="w-full">{refreshing ? "Consultando dados atualizados…" : refreshState.key === requestKey && refreshState.status === "success" ? "Situação atualizada." : ""}</p>
        </div>
      </header>

      <div className="mt-10">
        {currentState.status === "success" && currentState.refreshFailed ? (
          <p role="alert" className="mb-5 border-l-2 border-[oklch(69%_0.11_77)] pl-4 text-sm leading-6">
            A atualização não foi concluída. O motivo não foi informado. Você está vendo a última consulta confirmada.
            {" "}Use Atualizar situação para consultar novamente.
          </p>
        ) : null}
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
        O registro solicitado não está disponível para esta sessão. Volte para importações e escolha um registro disponível.
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
        Use Atualizar importações para consultar novamente mais tarde. Valores ausentes não serão tratados como
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
        O motivo não foi informado. Use Atualizar importações para consultar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
    </section>
  );
}

function BatchDetail({ batch }: { readonly batch: BatchSummary }) {
  const hasCorrelatedProducerFacts = batch.lastObservedAt !== null;
  const hasKnownCounts = hasConfirmedBatchCounts(batch);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]">
      <section
        aria-labelledby="estado-lote"
        className="border-y border-[oklch(82%_0.025_82)] py-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
              Situação da importação
            </p>
            <h2
              id="estado-lote"
              className="mt-3 font-serif text-3xl tracking-normal"
            >
              {displayStatusLabel(batch)}
            </h2>
          </div>
          <StatusBadge batch={batch} />
        </div>

        <p className="mt-5 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          {statusNarrative(batch)}
        </p>

        <dl className="mt-7 grid gap-4 sm:grid-cols-2">
          <FactItem
            label="Envio registrado"
            value={formatBrazilianDate(batch.submittedAt)}
          />
          <FactItem
            label="Última atualização"
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
          <BatchResults batch={batch} />
        </div>
      </section>

      <section
        aria-labelledby="proveniencia-observacoes"
        className="border-y border-[oklch(82%_0.025_82)] py-7 xl:col-span-2"
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
              Atualização dos dados
            </p>
            <h2
              id="proveniencia-observacoes"
              className="mt-3 font-serif text-3xl tracking-normal"
            >
              {observationHeading(
                batch.observationStatus,
                hasCorrelatedProducerFacts,
                hasKnownCounts,
              )}
            </h2>
          </div>
          <ObservationBadge
            status={batch.observationStatus}
            hasCorrelatedProducerFacts={hasCorrelatedProducerFacts}
            hasKnownCounts={hasKnownCounts}
          />
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          {observationNarrative(
            batch.observationStatus,
            hasCorrelatedProducerFacts,
            hasKnownCounts,
          )}
        </p>
      </section>

      <details className="border-y border-[oklch(82%_0.025_82)] py-5 xl:col-span-2">
        <summary className="cursor-pointer text-base font-bold">
          Detalhes da importação
        </summary>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Consulte a identificação do lote e as informações que confirmam a situação exibida.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <FactItem
            label="Situação confirmada por"
            value={batchSituationBasis(batch)}
          />
          <FactItem
            label="Identificação do lote"
            value={batch.import_batch_id ?? UNAVAILABLE_LABEL}
            breakAll
          />
          <FactItem
            label="Aceite confirmado"
            value={formatBrazilianDate(batch.acceptedAt)}
          />
          {batch.workflowReportedStartedAt === null ? null : (
            <FactItem
              label="Início do processamento informado"
              value={formatBrazilianDate(batch.workflowReportedStartedAt)}
            />
          )}
          {batch.workflowReportedClosedAt === null ? null : (
            <>
              <FactItem
                label="Encerramento informado"
                value={formatBrazilianDate(batch.workflowReportedClosedAt)}
              />
              <FactItem
                label="Linhas informadas"
                value={formatCount(batch.workflowReportedRowCount)}
              />
            </>
          )}
          <FactItem
            label="Situação da atualização"
            value={observationStatusLabel(
              batch.observationStatus,
              hasCorrelatedProducerFacts,
              hasKnownCounts,
            )}
          />
          <FactItem
            label="Detalhe da atualização"
            value={
              batch.observationBasis === null
                ? batch.observationStatus === "AVAILABLE" &&
                  !hasCorrelatedProducerFacts
                  ? "sem atualização deste lote"
                  : "Sem divergência registrada"
                : observationBasisLabel(batch.observationBasis)
            }
          />
        </dl>
      </details>
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
  status,
  hasCorrelatedProducerFacts,
  hasKnownCounts,
}: {
  readonly status: BatchObservationStatus;
  readonly hasCorrelatedProducerFacts: boolean;
  readonly hasKnownCounts: boolean;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${observationBadgeClass(
        status,
        hasCorrelatedProducerFacts,
        hasKnownCounts,
      )}`}
    >
      {observationStatusLabel(status, hasCorrelatedProducerFacts, hasKnownCounts)}
    </span>
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

function observationBadgeClass(
  status: BatchObservationStatus,
  hasCorrelatedProducerFacts: boolean,
  hasKnownCounts: boolean,
): string {
  if (status === "AVAILABLE" && hasCorrelatedProducerFacts) {
    if (!hasKnownCounts) {
      return "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]";
    }
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
      return "atividade confirmada";
    case "PRODUCER_CLOSED_ALL_ROWS_TERMINAL":
      return "todos os resultados confirmados";
    case "PRODUCER_CLOSED_ROWS_MISSING":
      return "encerramento com resultados pendentes";
    case "FRESHNESS_WINDOW_EXCEEDED":
      return "sem atualização recente";
  }
}

function statusNarrative(batch: BatchSummary): string {
  if (batch.workflowReportedClosedAt !== null) {
    return "O término do processamento deste arquivo foi informado. Esse aviso não confirma, por si só, o resultado de todas as linhas.";
  }

  if (hasWorkflowReportedStart(batch)) {
    return "O início do processamento deste arquivo foi informado. O aceite das linhas e os resultados ainda precisam de confirmação.";
  }

  switch (batch.status) {
    case "SUBMITTED":
      return "O envio foi registrado no Prospecta. O aceite das linhas e a conclusão ainda não foram confirmados.";
    case "ACCEPTED":
      return "O aceite das linhas foi confirmado. A conclusão da importação ainda não foi confirmada.";
    case "PROCESSING":
      return "Há atividade de processamento confirmada. A conclusão da importação ainda não foi confirmada.";
    case "COMPLETED":
      return "O processamento foi concluído e todas as linhas aceitas têm um resultado confirmado.";
    case "INCOMPLETE":
      return "O processamento foi encerrado, mas uma ou mais linhas ainda não têm resultado confirmado.";
    case "NO_UPDATE":
      return "Não indica falha nem conclusão. Não houve atualização confirmada dentro do prazo de acompanhamento.";
  }
}

function observationHeading(
  observationStatus: BatchObservationStatus,
  hasCorrelatedProducerFacts: boolean,
  hasKnownCounts: boolean,
): string {
  switch (observationStatus) {
    case "AVAILABLE":
      if (hasCorrelatedProducerFacts && !hasKnownCounts) {
        return "Registro de acompanhamento disponível";
      }
      return hasCorrelatedProducerFacts
        ? "Atualização confirmada"
        : "Ainda sem atualização deste lote";
    case "UNAVAILABLE":
      return "Atualização indisponível";
    case "INCONSISTENT":
      return "Dados divergentes";
  }
}

function observationStatusLabel(
  observationStatus: BatchObservationStatus,
  hasCorrelatedProducerFacts: boolean,
  hasKnownCounts: boolean,
): string {
  switch (observationStatus) {
    case "AVAILABLE":
      if (hasCorrelatedProducerFacts && !hasKnownCounts) {
        return "Atualização registrada";
      }
      return hasCorrelatedProducerFacts
        ? "Atualizações disponíveis"
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

function observationNarrative(
  observationStatus: BatchObservationStatus,
  hasCorrelatedProducerFacts: boolean,
  hasKnownCounts: boolean,
): string {
  switch (observationStatus) {
    case "AVAILABLE":
      if (hasCorrelatedProducerFacts && !hasKnownCounts) {
        return "Há registros de acompanhamento desta importação. Eles não confirmam o aceite das linhas nem os totais de resultados.";
      }
      return hasCorrelatedProducerFacts
        ? "A situação e as contagens exibidas usam somente atualizações confirmadas para esta importação."
        : "A consulta foi concluída, mas ainda não há atualização confirmada para este lote. Aceite e contagens permanecem indisponíveis.";
    case "UNAVAILABLE":
      return hasKnownCounts
        ? "Não foi possível consultar as atualizações agora. As contagens confirmadas continuam exibidas; os resultados sem confirmação permanecem indisponíveis."
        : "Não foi possível consultar as atualizações agora. As contagens permanecem indisponíveis.";
    case "INCONSISTENT":
      return "As informações recebidas são conflitantes. O Prospecta mantém a última situação confirmada até que a divergência seja esclarecida.";
  }
}

function formatCount(value: number | null): string {
  if (!isNonNegativeInteger(value)) {
    return UNAVAILABLE_LABEL;
  }

  return portugueseNumberFormatter.format(value);
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
