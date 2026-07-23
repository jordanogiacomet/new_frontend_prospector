"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { LeadViewNavigation } from "../../../../components/leads/lead-view-navigation";
import { OutsideAnalysisTable } from "../../../../components/leads/outside-analysis-table";
import type { OutsideAnalysisCompany } from "../../../../types/leads";

interface OutsideAnalysisMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface OutsideAnalysisEnvelope {
  data: OutsideAnalysisCompany[];
  meta: OutsideAnalysisMeta;
}

type RequestState =
  | {
      query: string;
      status: "loading";
    }
  | {
      query: string;
      status: "success";
      response: OutsideAnalysisEnvelope;
    }
  | {
      query: string;
      status: "error";
    };

const refreshIntervalMilliseconds = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isOutsideAnalysisEnvelope(
  value: unknown,
): value is OutsideAnalysisEnvelope {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return false;
  }

  const meta = value.meta;

  return (
    isRecord(meta) &&
    isPositiveInteger(meta.page) &&
    isPositiveInteger(meta.pageSize) &&
    isNonNegativeInteger(meta.total) &&
    isNonNegativeInteger(meta.totalPages)
  );
}

export default function OutsideAnalysisPage() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
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
    let requestInFlight = false;

    async function loadCompanies(): Promise<void> {
      if (requestInFlight) {
        return;
      }

      requestInFlight = true;
      const endpoint =
        query === ""
          ? "/api/leads/outside-analysis"
          : `/api/leads/outside-analysis?${query}`;

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error("Outside-analysis request failed.");
        }

        const payload: unknown = await response.json();

        if (!isOutsideAnalysisEnvelope(payload)) {
          throw new Error("Outside-analysis response is invalid.");
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
      } finally {
        requestInFlight = false;
      }
    }

    void loadCompanies();
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadCompanies();
      }
    }, refreshIntervalMilliseconds);

    return () => {
      window.clearInterval(refreshIntervalId);
      abortController.abort();
    };
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
          Decisões pelo CRM
        </p>
        <h1 className="mt-4 max-w-[14ch] font-serif text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.96] tracking-[-0.05em] text-balance">
          Fora da análise
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Esta visão reúne empresas direcionadas por uma decisão registrada pelo
          CRM sem entrarem na análise pública. O motivo exibido é o motivo
          armazenado na decisão atual.
        </p>
      </header>

      <div className="mt-10">
        <LeadViewNavigation activeView="outside-analysis" />
      </div>

      <div className="mt-10">
        {currentState.status === "loading" ? (
          <OutsideAnalysisLoading />
        ) : null}

        {currentState.status === "error" ? (
          <OutsideAnalysisError />
        ) : null}

        {currentState.status === "success" &&
        currentState.response.data.length === 0 ? (
          currentState.response.meta.total > 0 &&
          currentState.response.meta.page > 1 ? (
            <NoDecisionsOnPage />
          ) : (
            <NoOutsideAnalysisData />
          )
        ) : null}

        {currentState.status === "success" &&
        currentState.response.data.length > 0 ? (
          <OutsideAnalysisTable
            companies={currentState.response.data}
            pagination={currentState.response.meta}
          />
        ) : null}
      </div>
    </div>
  );
}

function OutsideAnalysisLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando decisões do CRM"
      aria-live="polite"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <span className="sr-only">Carregando decisões do CRM</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-4 motion-reduce:animate-none"
      >
        <div className="h-8 w-72 bg-[oklch(89%_0.02_82)]" />
        <div className="h-16 w-full bg-[oklch(92%_0.016_82)]" />
        <div className="h-16 w-full bg-[oklch(94%_0.012_82)]" />
        <div className="h-16 w-4/5 bg-[oklch(94%_0.012_82)]" />
      </div>
    </section>
  );
}

function NoOutsideAnalysisData() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Visão disponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Nenhuma decisão do CRM disponível
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        As empresas aparecerão aqui quando houver uma decisão registrada pelo
        CRM fora da análise pública.
      </p>
    </section>
  );
}

function NoDecisionsOnPage() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Página sem resultados
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Esta página não tem decisões do CRM
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Há decisões disponíveis em outras páginas da consulta.
      </p>
      <Link
        href="/leads/outside-analysis"
        className="mt-6 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
      >
        Voltar à primeira página
      </Link>
    </section>
  );
}

function OutsideAnalysisError() {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(42%_0.09_32)] uppercase">
        Consulta indisponível
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Não foi possível carregar as decisões do CRM agora.
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(38%_0.045_32)]">
        Atualize a página para tentar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
    </section>
  );
}
