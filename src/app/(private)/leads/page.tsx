"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { usePrivateCapabilities } from "../../../components/auth/private-capabilities";

import { LeadListFilters } from "../../../components/leads/lead-list-filters";
import { LeadTable } from "../../../components/leads/lead-table";
import { LeadViewNavigation } from "../../../components/leads/lead-view-navigation";
import type { LeadSummary } from "../../../types/leads";

type ApprovedPriority = "B" | "C" | "D" | "E" | "R";

interface LeadListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface LeadListEnvelope {
  data: LeadSummary[];
  meta: LeadListMeta;
}

type RequestState =
  | {
      query: string;
      status: "loading";
    }
  | {
      query: string;
      status: "success";
      response: LeadListEnvelope;
      refreshFailed: boolean;
    }
  | {
      query: string;
      status: "error";
    }
  | {
      readonly query: string;
      readonly status: "auth_required" | "access_denied";
    };

const approvedPriorities: ReadonlySet<string> = new Set([
  "B",
  "C",
  "D",
  "E",
  "R",
]);
const refreshIntervalMilliseconds = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isLeadSummary(value: unknown): value is LeadSummary {
  return (
    isRecord(value) &&
    ["decision_id", "lead_run_id", "agent_version", "cnpj", "lastAnalysisAt"].every(
      (field) => typeof value[field] === "string",
    ) &&
    ["import_batch_id", "source_hash", "companyName", "city", "uf", "sector", "priority", "recommendedAction", "trustStatus"].every(
      (field) => value[field] === null || typeof value[field] === "string",
    ) &&
    (value.source_row === null || Number.isSafeInteger(value.source_row)) &&
    (value.score === null || (Number.isInteger(value.score) && Number(value.score) >= 0 && Number(value.score) <= 100)) &&
    typeof value.confidenceIndicator === "string" &&
    ["normal", "low", "unknown"].includes(value.confidenceIndicator)
  );
}

function isLeadListEnvelope(value: unknown): value is LeadListEnvelope {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return false;
  }

  const meta = value.meta;

  return (
    isRecord(meta) &&
    isPositiveInteger(meta.page) &&
    isPositiveInteger(meta.pageSize) &&
    isNonNegativeInteger(meta.total) &&
    isNonNegativeInteger(meta.totalPages) &&
    value.data.every(isLeadSummary)
  );
}

function getTableFilters(searchParams: URLSearchParams): {
  cnpj?: string;
  uf?: string;
  priority?: ApprovedPriority;
} {
  const cnpj = searchParams.get("cnpj");
  const uf = searchParams.get("uf");
  const priority = searchParams.get("priority");

  return {
    cnpj: cnpj ?? undefined,
    uf: uf ?? undefined,
    priority:
      priority !== null && approvedPriorities.has(priority)
        ? (priority as ApprovedPriority)
        : undefined,
  };
}

export default function LeadListPage() {
  const { hasPermission } = usePrivateCapabilities();
  const canReadLeads = hasPermission("leads:read");
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    query,
    status: "loading",
  }));
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const manualRefreshInFlight = useRef(false);
  const [manualRefreshQuery, setManualRefreshQuery] =
    useState<string | null>(null);
  const isRefreshing = manualRefreshQuery === query;
  const currentState: RequestState =
    requestState.query === query
      ? requestState
      : { query, status: "loading" };

  useEffect(() => {
    if (!canReadLeads) return;

    const abortController = new AbortController();
    let requestInFlight = false;
    let accessStopped = false;

    async function loadLeads(): Promise<void> {
      if (requestInFlight || accessStopped) {
        return;
      }

      requestInFlight = true;
      const endpoint = query === "" ? "/api/leads" : `/api/leads?${query}`;

      try {
        const response = await fetch(endpoint, {
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

          if (!abortController.signal.aborted) {
            setRequestState((previous) =>
              response.status >= 500 &&
              previous.query === query &&
              previous.status === "success"
                ? { ...previous, refreshFailed: true }
                : { query, status: "error" },
            );
          }
          return;
        }

        const payload: unknown = await response.json().catch(() => undefined);

        if (response.status !== 200 || !isLeadListEnvelope(payload)) {
          if (!abortController.signal.aborted) {
            setRequestState({ query, status: "error" });
          }
          return;
        }

        if (!abortController.signal.aborted) {
          setRequestState({
            query,
            status: "success",
            response: payload,
            refreshFailed: false,
          });
        }
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState((previous) =>
            previous.query === query && previous.status === "success"
              ? { ...previous, refreshFailed: true }
              : { query, status: "error" },
          );
        }
      } finally {
        requestInFlight = false;
      }
    }

    refreshRef.current = loadLeads;
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadLeads();
      }
    }, refreshIntervalMilliseconds);
    void loadLeads();

    return () => {
      window.clearInterval(refreshIntervalId);
      abortController.abort();
      refreshRef.current = null;
    };
  }, [query, canReadLeads]);

  function refreshLeads(): void {
    const refresh = refreshRef.current;
    if (refresh === null || manualRefreshInFlight.current) {
      return;
    }
    manualRefreshInFlight.current = true;
    setManualRefreshQuery(query);
    void refresh().finally(() => {
      manualRefreshInFlight.current = false;
      setManualRefreshQuery((pendingQuery) =>
        pendingQuery === query ? null : pendingQuery,
      );
    });
  }

  if (!canReadLeads) {
    return <ReadAccessState status="access_denied" />;
  }
  if (currentState.status === "auth_required" || currentState.status === "access_denied") {
    return <ReadAccessState status={currentState.status} />;
  }

  const firstPageParams = new URLSearchParams(searchParams);
  firstPageParams.set("page", "1");
  const firstPageHref = `/leads?${firstPageParams.toString()}`;

  const hasActiveFilters = ["cnpj", "uf", "priority"].some((key) =>
    searchParams.has(key),
  );

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
          Análises das empresas
        </p>
        <h1 className="operational-title mt-4">
          Empresas para analisar
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Confira a ação recomendada, a confiança e os riscos antes de decidir a abordagem.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Esta lista reúne as análises disponíveis para consulta, de diferentes
          importações; não representa um inventário completo. O acompanhamento
          de cada arquivo fica em Importações.
        </p>
      </header>

      <div className="mt-6">
        <LeadViewNavigation activeView="analysis" />
      </div>

      <div className="mt-6">
        <LeadListFilters />
      </div>

      <div className="mt-6">
        {currentState.status === "loading" ? <LeadListLoading /> : null}

        {currentState.status === "error" ? (
          <LeadListError onRetry={refreshLeads} refreshing={isRefreshing} />
        ) : null}

        {currentState.status === "success" ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p
              role={currentState.refreshFailed ? "status" : undefined}
              className="max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]"
            >
              {currentState.refreshFailed
                ? "Não foi possível atualizar. Exibindo a última consulta disponível; os resultados podem ter mudado."
                : "Resultados atualizados automaticamente enquanto esta página estiver aberta."}
            </p>
            <button
              type="button"
              onClick={refreshLeads}
              disabled={isRefreshing}
              className="ui-action ui-action--secondary"
            >
              {isRefreshing ? "Atualizando…" : "Atualizar lista"}
            </button>
          </div>
        ) : null}

        {currentState.status === "success" &&
        currentState.response.data.length === 0 ? (
          currentState.response.meta.total > 0 &&
          currentState.response.meta.page > 1 ? (
            <NoLeadsOnPage firstPageHref={firstPageHref} />
          ) : hasActiveFilters ? (
            <NoMatchingLeads pageSize={currentState.response.meta.pageSize} />
          ) : (
            <NoLeadData />
          )
        ) : null}

        {currentState.status === "success" &&
        currentState.response.data.length > 0 ? (
          <LeadTable
            leads={currentState.response.data}
            pagination={currentState.response.meta}
            filters={getTableFilters(new URLSearchParams(searchParams))}
          />
        ) : null}
      </div>
    </div>
  );
}

function LeadListLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando decisões"
      aria-live="polite"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <span className="sr-only">Carregando decisões</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="h-8 w-64 bg-[oklch(89%_0.02_82)]" />
        <div className="h-12 w-full bg-[oklch(92%_0.016_82)]" />
        <div className="h-12 w-full bg-[oklch(94%_0.012_82)]" />
        <div className="h-12 w-4/5 bg-[oklch(94%_0.012_82)]" />
      </div>
    </section>
  );
}

function NoLeadData() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Base disponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Nenhuma decisão disponível
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        As empresas aparecerão aqui quando houver análises disponíveis para
        consulta. Use o roteiro para importar um arquivo ou acompanhar seu envio.
      </p>
      <Link href="/inicio" className="ui-action ui-action--secondary mt-5">
        Ver roteiro de importação e análise
      </Link>
    </section>
  );
}

function NoMatchingLeads({ pageSize }: { pageSize: number }) {
  const params = new URLSearchParams({ page: "1", pageSize: String(pageSize) });

  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Consulta sem correspondência
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Nenhum resultado para estes filtros
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Não encontramos resultados para os filtros atuais. Revise ou remova os
        critérios acima para ampliar a consulta.
      </p>
      <Link href={`/leads?${params.toString()}`} className="ui-action ui-action--secondary mt-5">
        Limpar filtros e ver empresas
      </Link>
    </section>
  );
}

function NoLeadsOnPage({ firstPageHref }: { firstPageHref: string }) {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Página sem resultados
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Esta página não tem decisões
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Há decisões disponíveis em outras páginas da consulta.
      </p>
      <Link
        href={firstPageHref}
        className="mt-6 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
      >
        Voltar à primeira página
      </Link>
    </section>
  );
}

function LeadListError({
  onRetry,
  refreshing,
}: {
  onRetry: () => void;
  refreshing: boolean;
}) {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(42%_0.09_32)] uppercase">
        Consulta indisponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Não foi possível carregar as decisões agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(38%_0.045_32)]">
        Tente novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={refreshing}
        className="ui-action ui-action--secondary mt-5"
      >
        {refreshing ? "Tentando novamente…" : "Tentar novamente"}
      </button>
    </section>
  );
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
