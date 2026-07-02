"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { LeadListFilters } from "../../../components/leads/lead-list-filters";
import { LeadTable } from "../../../components/leads/lead-table";
import type { LeadSummary } from "../../../types/leads";

type ApprovedPriority = "B" | "C" | "E" | "R";

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
    }
  | {
      query: string;
      status: "error";
    };

const approvedPriorities: ReadonlySet<string> = new Set([
  "B",
  "C",
  "E",
  "R",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
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
    isNonNegativeInteger(meta.totalPages)
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

    async function loadLeads(): Promise<void> {
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
          throw new Error("Lead list request failed.");
        }

        const payload: unknown = await response.json();

        if (!isLeadListEnvelope(payload)) {
          throw new Error("Lead list response is invalid.");
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

    void loadLeads();

    return () => abortController.abort();
  }, [query]);

  const hasActiveFilters = ["cnpj", "uf", "priority"].some((key) =>
    searchParams.has(key),
  );

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
          Decisões qualificadas
        </p>
        <h1 className="mt-4 max-w-[14ch] font-serif text-[clamp(2.8rem,7vw,5.5rem)] leading-[0.96] tracking-[-0.05em] text-balance">
          Leads para análise
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Esta lista reúne decisões elegíveis, legíveis e retidas disponíveis
          para consulta. Ela não representa um inventário completo de todas as
          análises já produzidas.
        </p>
      </header>

      <div className="mt-10">
        <LeadListFilters />
      </div>

      <div className="mt-10">
        {currentState.status === "loading" ? <LeadListLoading /> : null}

        {currentState.status === "error" ? <LeadListError /> : null}

        {currentState.status === "success" &&
        currentState.response.data.length === 0 ? (
          hasActiveFilters ? (
            <NoMatchingLeads />
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
        As empresas aparecerão aqui assim que houver decisões elegíveis,
        legíveis e retidas disponíveis para consulta.
      </p>
    </section>
  );
}

function NoMatchingLeads() {
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
    </section>
  );
}

function LeadListError() {
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
        Atualize a página para tentar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
    </section>
  );
}
