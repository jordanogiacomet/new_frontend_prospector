"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { usePrivateCapabilities } from "../../../components/auth/private-capabilities";
import { formatUsdEstimatedCost } from "../../../lib/formatters";
import type {
  CostCoverage,
  CostRun,
  CostRunAvailability,
} from "../../../types/costs";

interface CostOverviewMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly currency: "USD";
  readonly coverage: CostCoverage;
  readonly subtotalEstimatedUsd: string | null;
}

interface CostOverviewEnvelope {
  readonly data: readonly CostRun[];
  readonly meta: CostOverviewMeta;
}

type RequestState =
  | { readonly query: string; readonly status: "loading" }
  | {
      readonly query: string;
      readonly status: "success";
      readonly response: CostOverviewEnvelope;
      readonly refreshFailed?: boolean;
    }
  | { readonly query: string; readonly status: "unavailable" }
  | { readonly query: string; readonly status: "access-denied" }
  | { readonly query: string; readonly status: "auth-required" }
  | { readonly query: string; readonly status: "error" };

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;
const availabilityValues: ReadonlySet<string> = new Set([
  "AVAILABLE",
  "UNKNOWN",
  "AMBIGUOUS",
]);
const coverageValues: ReadonlySet<string> = new Set([
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "EMPTY",
]);
const usdDecimalPattern = /^(0|[1-9]\d{0,29})(?:\.\d{1,8})?$/;
const numberFormatter = new Intl.NumberFormat("pt-BR");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isUsdDecimal(value: unknown): value is string {
  return typeof value === "string" && usdDecimalPattern.test(value);
}

function isCostRun(value: unknown): value is CostRun {
  if (!isRecord(value) || !hasExactKeys(value, [
    "leadRunId",
    "availability",
    "estimatedCostUsd",
  ])) {
    return false;
  }

  const availability = value.availability;
  const estimatedCostUsd = value.estimatedCostUsd;

  if (!(
    typeof value.leadRunId === "string" &&
    value.leadRunId !== "" &&
    typeof availability === "string" &&
    availabilityValues.has(availability)
  )) {
    return false;
  }

  return availability === "AVAILABLE"
    ? isUsdDecimal(estimatedCostUsd)
    : estimatedCostUsd === null;
}

function isCostOverviewEnvelope(value: unknown): value is CostOverviewEnvelope {
  if (!isRecord(value) || !hasExactKeys(value, ["data", "meta"])) {
    return false;
  }

  if (!Array.isArray(value.data) || !isRecord(value.meta)) {
    return false;
  }

  const meta = value.meta;

  if (!(
    hasExactKeys(meta, [
      "page",
      "pageSize",
      "total",
      "currency",
      "coverage",
      "subtotalEstimatedUsd",
    ]) &&
    isPositiveInteger(meta.page) &&
    isPositiveInteger(meta.pageSize) &&
    isNonNegativeInteger(meta.total) &&
    meta.currency === "USD" &&
    typeof meta.coverage === "string" &&
    coverageValues.has(meta.coverage) &&
    value.data.every(isCostRun)
  )) {
    return false;
  }

  if (meta.total === 0) {
    return meta.coverage === "EMPTY" && meta.subtotalEstimatedUsd === null;
  }

  if (meta.coverage === "EMPTY") {
    return false;
  }

  return meta.coverage === "UNKNOWN"
    ? meta.subtotalEstimatedUsd === null
    : isUsdDecimal(meta.subtotalEstimatedUsd);
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

function buildCostQuery(searchParams: URLSearchParams): string {
  return new URLSearchParams({
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
  }).toString();
}

export default function CostOverviewPage() {
  const { hasPermission } = usePrivateCapabilities();
  const canReadCosts = hasPermission("costs:read");
  const searchParams = useSearchParams();
  const query = buildCostQuery(new URLSearchParams(searchParams));
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const manualRefreshRef = useRef(false);
  const [refreshState, setRefreshState] = useState<{ readonly query: string; readonly status: "idle" | "loading" | "success" }>({ query, status: "idle" });
  const refreshing = refreshState.query === query && refreshState.status === "loading";
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    query,
    status: "loading",
  }));
  const currentState: RequestState =
    requestState.query === query
      ? requestState
      : { query, status: "loading" };

  useEffect(() => {
    if (!canReadCosts) return;

    const abortController = new AbortController();
    let requestInFlight = false;

    function showReadFailure(status: "unavailable" | "error"): void {
      if (abortController.signal.aborted) return;
      setRequestState((previous) => previous.query === query && previous.status === "success"
        ? { ...previous, refreshFailed: true }
        : { query, status });
    }

    async function loadCosts(): Promise<void> {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch(`/api/costs?${query}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (!abortController.signal.aborted) {
              setRequestState({ query, status: response.status === 401 ? "auth-required" : "access-denied" });
            }
          } else {
            showReadFailure(response.status === 503 ? "unavailable" : "error");
          }
          return;
        }

        const payload: unknown = await response.json();

        if (response.status !== 200 || !isCostOverviewEnvelope(payload)) {
          throw new Error("Cost overview response is invalid.");
        }

        if (!abortController.signal.aborted) {
          setRequestState({ query, status: "success", response: payload });
          if (manualRefreshRef.current) setRefreshState({ query, status: "success" });
        }
      } catch {
        showReadFailure("error");
      } finally {
        requestInFlight = false;
        if (!abortController.signal.aborted) {
          manualRefreshRef.current = false;
          setRefreshState((previous) => previous.query === query && previous.status === "loading" ? { query, status: "idle" } : previous);
        }
      }
    }

    refreshRef.current = loadCosts;
    void loadCosts();

    return () => {
      abortController.abort();
      refreshRef.current = null;
      manualRefreshRef.current = false;
    };
  }, [query, canReadCosts]);

  function refreshCosts(): void {
    if (refreshRef.current === null || manualRefreshRef.current) return;
    manualRefreshRef.current = true;
    setRefreshState({ query, status: "loading" });
    void refreshRef.current();
  }

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
          Acompanhamento de custos
        </p>
        <h1 className="operational-title mt-4">
          Custos estimados
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Acompanhe o custo estimado das análises em dólares (USD).
          O valor considera o uso de inteligência artificial e não representa uma fatura.
        </p>
        {canReadCosts && currentState.status !== "auth-required" && currentState.status !== "access-denied" ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={refreshCosts} disabled={currentState.status === "loading" || refreshing} aria-busy={refreshing} className="ui-action ui-action--secondary">
              {refreshing ? "Atualizando custos…" : "Atualizar custos"}
            </button>
            <p role="status" className="text-sm">{refreshState.query === query && refreshState.status === "success" ? "Custos atualizados." : ""}</p>
          </div>
        ) : null}
      </header>

      <div className="mt-10">
        {!canReadCosts ? <CostsAccessDenied /> : (
          <>
            {currentState.status === "loading" ? <CostsLoading /> : null}
            {currentState.status === "unavailable" ? <CostsUnavailable /> : null}
            {currentState.status === "access-denied" ? <CostsAccessDenied /> : null}
            {currentState.status === "auth-required" ? <CostsSessionExpired /> : null}
            {currentState.status === "error" ? <CostsError /> : null}
            {currentState.status === "success" ? (
              <>
                {currentState.refreshFailed ? <p role="alert" className="mb-5 border-l-2 border-[oklch(69%_0.11_77)] pl-4 text-sm leading-6">Não foi possível atualizar os custos. O motivo não foi informado. Você está vendo a última consulta confirmada. Use Atualizar custos para consultar novamente.</p> : null}
                <CostsResponse response={currentState.response} />
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function CostsResponse({
  response,
}: {
  readonly response: CostOverviewEnvelope;
}) {
  if (response.meta.coverage === "EMPTY" || response.meta.total === 0) {
    return <CostsEmpty />;
  }

  return (
    <>
      <CostsSummary meta={response.meta} />
      {response.data.length === 0 ? (
        <CostsPageEmpty meta={response.meta} />
      ) : (
        <CostsTable runs={response.data} meta={response.meta} />
      )}
    </>
  );
}

function CostsLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando custos"
      aria-live="polite"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <span className="sr-only">Carregando custos</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="h-8 w-72 bg-[oklch(89%_0.02_82)]" />
        <div className="h-16 w-full bg-[oklch(92%_0.016_82)]" />
        <div className="h-16 w-full bg-[oklch(94%_0.012_82)]" />
      </div>
    </section>
  );
}

function CostsSummary({ meta }: { readonly meta: CostOverviewMeta }) {
  if (meta.coverage === "UNKNOWN") {
    return (
      <section className="border-y border-[oklch(82%_0.025_82)] py-8">
        <p className="text-xs font-bold tracking-normal text-[oklch(38%_0.08_62)] uppercase">
          Cobertura desconhecida
        </p>
        <h2 className="mt-3 font-serif text-3xl tracking-normal">
          Custo estimado indisponível
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Ainda não há uma estimativa confirmada para as análises consultadas.
        </p>
      </section>
    );
  }

  const isPartial = meta.coverage === "PARTIAL";

  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-8">
      <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
        {isPartial ? "Cobertura parcial" : "Cobertura completa"}
      </p>
      <dl className="mt-4 flex flex-wrap items-end justify-between gap-5">
        <div>
          <dt className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
            {isPartial ? "Subtotal estimado" : "Custo estimado"}
          </dt>
          <dd className="mt-1 font-serif text-4xl tracking-normal">
            {formatUsdEstimatedCost(meta.subtotalEstimatedUsd)}
          </dd>
        </div>
        <div className="max-w-xl">
          <dt className="sr-only">Contexto da estimativa</dt>
          <dd className="text-sm leading-6 text-[oklch(43%_0.03_252)]">
            {isPartial
              ? "A cobertura é parcial: algumas análises ainda não têm estimativa disponível."
              : "Estimativa em dólares (USD) para o uso de inteligência artificial; não é uma fatura."}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function CostsEmpty() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
        Sem estimativas
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Nenhum custo estimado disponível
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Não há análises vinculadas às suas importações nesta consulta.
        A ausência de estimativa não significa que o custo foi zero.
      </p>
    </section>
  );
}

function CostsPageEmpty({ meta }: { readonly meta: CostOverviewMeta }) {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-normal text-[oklch(45%_0.105_174)] uppercase">
        Página sem análises
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Nenhuma análise nesta página
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Use a paginação para consultar as demais análises disponíveis.
      </p>
      <CostsPagination itemsOnPage={0} meta={meta} />
    </section>
  );
}

function CostsTable({
  runs,
  meta,
}: {
  readonly runs: readonly CostRun[];
  readonly meta: CostOverviewMeta;
}) {
  return (
    <section className="mt-8" aria-label="Custos por análise">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[oklch(82%_0.025_82)] pb-4">
        <h2 className="font-serif text-2xl tracking-normal">
          Custos por análise
        </h2>
        <p className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
          {formatRunTotal(meta.total)}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          aria-label="Custos por análise"
          className="responsive-data-table w-full border-collapse text-left md:min-w-[44rem]"
        >
          <thead>
            <tr className="border-b border-[oklch(72%_0.035_82)]">
              {['Análise', 'Disponibilidade', 'Custo estimado'].map((column) => (
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
            {runs.map((run, index) => (
              <tr
                key={run.leadRunId}
                className="border-b border-[oklch(88%_0.02_82)] align-top"
              >
                <td data-label="Análise" className="max-w-80 py-5 pr-3 text-sm">
                  <div>
                    <p className="font-semibold">Análise {(meta.page - 1) * meta.pageSize + index + 1}</p>
                    <details className="mt-2">
                      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-[var(--prospecta-ink-muted)]">
                        Ver identificação
                      </summary>
                      <p className="mt-2 break-all text-[var(--prospecta-ink-muted)]">{run.leadRunId}</p>
                    </details>
                  </div>
                </td>
                <td data-label="Disponibilidade" className="px-3 py-5">
                  <AvailabilityBadge availability={run.availability} />
                </td>
                <td data-label="Custo estimado" className="py-5 pl-3 text-sm font-semibold">
                  {formatUsdEstimatedCost(run.estimatedCostUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CostsPagination itemsOnPage={runs.length} meta={meta} />
    </section>
  );
}

function AvailabilityBadge({
  availability,
}: {
  readonly availability: CostRunAvailability;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${availabilityBadgeClass(
        availability,
      )}`}
    >
      {availabilityLabel(availability)}
    </span>
  );
}

function availabilityBadgeClass(availability: CostRunAvailability): string {
  if (availability === "AVAILABLE") {
    return "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]";
  }

  if (availability === "AMBIGUOUS") {
    return "border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] text-[oklch(42%_0.09_32)]";
  }

  return "border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] text-[oklch(35%_0.08_62)]";
}

function availabilityLabel(availability: CostRunAvailability): string {
  switch (availability) {
    case "AVAILABLE":
      return "Disponível";
    case "UNKNOWN":
      return "Desconhecido";
    case "AMBIGUOUS":
      return "Ambíguo";
  }
}

function CostsPagination({
  itemsOnPage,
  meta,
}: {
  readonly itemsOnPage: number;
  readonly meta: CostOverviewMeta;
}) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const hasPrevious = meta.page > 1;
  const hasNext = meta.page < totalPages && itemsOnPage > 0;

  return (
    <nav
      aria-label="Paginação dos custos"
      className="mt-6 flex flex-wrap items-center justify-between gap-4"
    >
      {hasPrevious ? (
        <Link
          href={buildPageHref(meta.page - 1, meta.pageSize)}
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
        Página {meta.page} de {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={buildPageHref(meta.page + 1, meta.pageSize)}
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

function CostsUnavailable() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(69%_0.11_77)] bg-[oklch(96%_0.03_77)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-normal text-[oklch(38%_0.08_62)] uppercase">
        Consulta indisponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Os custos não puderam ser consultados agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(36%_0.055_62)]">
        Use Atualizar custos para consultar novamente mais tarde. Valores ausentes não serão tratados como
        zero.
      </p>
    </section>
  );
}

function CostsAccessDenied() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(69%_0.11_77)] bg-[oklch(96%_0.03_77)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-normal text-[oklch(38%_0.08_62)] uppercase">
        Acesso restrito
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Você não tem acesso aos custos.
      </h2>
      <p className="mt-4 text-sm leading-6">Seu perfil ou a configuração deste ambiente não permite esta consulta. Solicite ao responsável a verificação do acesso.</p>
    </section>
  );
}

function CostsSessionExpired() {
  return (
    <section role="alert" className="border-y border-[var(--prospecta-border)] py-10">
      <h2 className="font-serif text-3xl">Sua sessão expirou</h2>
      <p className="mt-4 text-sm text-[var(--prospecta-ink-muted)]">Entre novamente para consultar os custos.</p>
      <Link href="/login" className="ui-action ui-action--primary mt-5">Entrar novamente</Link>
    </section>
  );
}

function CostsError() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-normal text-[oklch(42%_0.09_32)] uppercase">
        Consulta não concluída
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-normal">
        Não foi possível carregar os custos agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(38%_0.045_32)]">
        O motivo não foi informado. Use Atualizar custos para consultar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
    </section>
  );
}

function formatRunTotal(total: number): string {
  return total === 1
    ? "1 análise"
    : `${numberFormatter.format(total)} análises`;
}

function buildPageHref(page: number, pageSize: number): string {
  return `/costs?${new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  }).toString()}`;
}
