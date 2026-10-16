"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { usePrivateCapabilities } from "../../../../../components/auth/private-capabilities";
import { PrivateReadAccessState } from "../../../../../components/auth/private-read-access-state";
import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
  formatCnpj,
} from "../../../../../lib/formatters";
import {
  UNKNOWN_DOMAIN_LABEL,
  formatDecisionReason,
  getLeadActionLabel,
} from "../../../../../lib/lead-labels";
import { resolveOutsideAnalysisReturnHref } from "../../../../../lib/navigation-return";
import type { OutsideAnalysisCompany } from "../../../../../types/leads";

interface OutsideAnalysisDetailEnvelope {
  data: OutsideAnalysisCompany;
}

type RequestState =
  | { cnpj: string; status: "loading" }
  | {
      cnpj: string;
      status: "success";
      company: OutsideAnalysisCompany;
    }
  | { cnpj: string; status: "not_found" }
  | { cnpj: string; status: "error" }
  | { cnpj: string; status: "auth_required" | "access_denied" };

const nullableTextFields = [
  "import_batch_id",
  "companyName",
  "city",
  "uf",
  "sector",
  "decidedAction",
  "decisionReason",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOutsideAnalysisDetailEnvelope(
  value: unknown,
): value is OutsideAnalysisDetailEnvelope {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }

  const company = value.data;

  return (
    typeof company.cnpj === "string" &&
    /^[0-9]{14}$/.test(company.cnpj) &&
    nullableTextFields.every((field) =>
      isNullableString(company[field]),
    ) &&
    (company.source_row === null ||
      Number.isInteger(company.source_row)) &&
    typeof company.decidedAt === "string"
  );
}

function formatLocation(city: string | null, uf: string | null): string {
  if (city && uf) {
    return `${city} / ${uf}`;
  }

  return city ?? uf ?? UNAVAILABLE_LABEL;
}

export default function OutsideAnalysisDetailPage() {
  const { hasPermission } = usePrivateCapabilities();
  const canReadLeads = hasPermission("leads:read");
  const params = useParams<{ cnpj: string }>();
  const searchParams = useSearchParams();
  const returnHref = resolveOutsideAnalysisReturnHref(searchParams.get("returnTo"));
  const cnpj = params.cnpj;
  const [reloadKey, setReloadKey] = useState(0);
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    cnpj,
    status: "loading",
  }));
  const currentState: RequestState =
    requestState.cnpj === cnpj
      ? requestState
      : { cnpj, status: "loading" };

  useEffect(() => {
    if (!canReadLeads) return;

    const abortController = new AbortController();

    async function loadDecision(): Promise<void> {
      try {
        const response = await fetch(
          `/api/leads/outside-analysis/${encodeURIComponent(cnpj)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            credentials: "same-origin",
            signal: abortController.signal,
          },
        );

        if (response.status === 404) {
          if (!abortController.signal.aborted) {
            setRequestState({ cnpj, status: "not_found" });
          }
          return;
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            if (!abortController.signal.aborted) {
              setRequestState({ cnpj, status: response.status === 401 ? "auth_required" : "access_denied" });
            }
            return;
          }
          throw new Error("Outside-analysis detail request failed.");
        }

        const payload: unknown = await response.json();

        if (!isOutsideAnalysisDetailEnvelope(payload)) {
          throw new Error("Outside-analysis detail response is invalid.");
        }

        if (!abortController.signal.aborted) {
          setRequestState({
            cnpj,
            status: "success",
            company: payload.data,
          });
        }
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState({ cnpj, status: "error" });
        }
      }
    }

    void loadDecision();

    return () => {
      abortController.abort();
    };
  }, [cnpj, canReadLeads, reloadKey]);

  if (!canReadLeads) return <PrivateReadAccessState status="access_denied" />;
  if (currentState.status === "auth_required" || currentState.status === "access_denied") {
    return <PrivateReadAccessState status={currentState.status} />;
  }

  return (
    <div className="mx-auto w-full max-w-[88rem]">
      <Link
        href={returnHref}
        className="inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-0.5 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="mr-1">
          ←
        </span>
        Voltar para fora da análise
      </Link>

      <div className="mt-8">
        {currentState.status === "loading" ? (
          <DecisionLoading />
        ) : null}
        {currentState.status === "success" ? (
          <DecisionDetail company={currentState.company} />
        ) : null}
        {currentState.status === "not_found" ? (
          <DecisionNotFound />
        ) : null}
        {currentState.status === "error" ? (
          <DecisionError onRetry={() => {
            setRequestState({ cnpj, status: "loading" });
            setReloadKey((key) => key + 1);
          }} />
        ) : null}
      </div>
    </div>
  );
}

function DecisionDetail({
  company,
}: {
  company: OutsideAnalysisCompany;
}) {
  const companyName = company.companyName ?? "Empresa sem nome disponível";
  const location = formatLocation(company.city, company.uf);
  const actionLabel = getLeadActionLabel(company.decidedAction);
  const actionIsUnavailable =
    actionLabel === UNAVAILABLE_LABEL ||
    actionLabel === UNKNOWN_DOMAIN_LABEL;

  return (
    <article>
      <header className="border-b border-[oklch(72%_0.035_82)] pb-8">
        <p className="text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
          Decisão atual do CRM
        </p>
        <div className="mt-4 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.55fr)] lg:items-end">
          <div>
            <h1 className="operational-title max-w-4xl break-words">
              {companyName}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
              Registro somente leitura da decisão que manteve esta empresa fora
              da análise pública do Prospecta.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-l border-[oklch(82%_0.025_82)] pl-6">
            <Metadata label="CNPJ" value={formatCnpj(company.cnpj)} />
            <Metadata label="Localidade" value={location} />
            <Metadata
              label="Data da decisão"
              value={formatBrazilianDate(company.decidedAt)}
            />
          </dl>
        </div>
      </header>

      <div className="grid border-b border-[oklch(82%_0.025_82)] lg:grid-cols-12">
        <section className="py-9 lg:col-span-4 lg:border-r lg:border-[oklch(82%_0.025_82)] lg:pr-10">
          <SectionLabel>Contexto da empresa</SectionLabel>
          <dl className="mt-6 space-y-6">
            <Metadata
              label="Setor"
              value={company.sector ?? UNAVAILABLE_LABEL}
            />
            <Metadata label="Cidade / UF" value={location} />
          </dl>
        </section>

        <section className="border-t border-[oklch(82%_0.025_82)] py-9 lg:col-span-8 lg:border-t-0 lg:pl-10">
          <SectionLabel>Decisão registrada</SectionLabel>
          <div className="mt-6">
            <span
              className={`inline-flex min-h-8 items-center border px-3 py-1.5 text-xs font-bold leading-4 ${
                actionIsUnavailable
                  ? "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]"
                  : "border-[oklch(72%_0.07_77)] bg-[oklch(95%_0.035_77)] text-[oklch(36%_0.075_62)]"
              }`}
            >
              {actionLabel}
            </span>
            <h2 className="mt-7 font-serif text-2xl tracking-[-0.025em]">
              Motivo registrado pelo CRM
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 whitespace-pre-line text-[oklch(34%_0.03_252)]">
              {formatDecisionReason(company.decisionReason)}
            </p>
          </div>
        </section>
      </div>

      <section className="py-8">
        <SectionLabel>Origem do registro</SectionLabel>
        <dl className="mt-5 grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
          <Metadata
            label="Lote de importação"
            value={company.import_batch_id ?? UNAVAILABLE_LABEL}
            breakWords
          />
          <Metadata
            label="Linha de origem"
            value={
              company.source_row === null
                ? UNAVAILABLE_LABEL
                : `Linha ${company.source_row}`
            }
          />
        </dl>
      </section>
    </article>
  );
}

function Metadata({
  label,
  value,
  breakWords = false,
}: {
  label: string;
  value: string;
  breakWords?: boolean;
}) {
  return (
    <div>
      <dt className="text-[0.68rem] font-bold tracking-[0.14em] text-[oklch(48%_0.03_252)] uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-sm font-semibold leading-5 ${
          breakWords ? "break-all" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-bold tracking-[0.18em] text-[oklch(45%_0.105_174)] uppercase">
      {children}
    </p>
  );
}

function DecisionLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando decisão do CRM"
      aria-live="polite"
      className="border-y border-[oklch(82%_0.025_82)] py-8"
    >
      <span className="sr-only">Carregando decisão do CRM</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-5 motion-reduce:animate-none"
      >
        <div className="h-3 w-44 bg-[oklch(88%_0.03_174)]" />
        <div className="h-12 w-3/5 bg-[oklch(89%_0.02_82)]" />
        <div className="h-24 w-full bg-[oklch(93%_0.015_82)]" />
      </div>
    </section>
  );
}

function DecisionNotFound() {
  return (
    <section className="border-y border-[oklch(82%_0.025_82)] py-12">
      <SectionLabel>Registro não disponível</SectionLabel>
      <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Decisão do CRM não encontrada
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Esta empresa pode ter deixado de fazer parte desta visão ou o endereço
        informado não corresponde a uma decisão atual disponível.
      </p>
    </section>
  );
}

function DecisionError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <section
      role="alert"
      className="border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-10"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(42%_0.09_32)] uppercase">
        Consulta indisponível
      </p>
      <h1 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        Não foi possível carregar esta decisão agora.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[oklch(38%_0.045_32)]">
        Tente consultar novamente. Se o problema continuar,
        contate o suporte responsável.
      </p>
      <button type="button" onClick={onRetry} className="ui-action ui-action--secondary mt-6">
        Tentar novamente
      </button>
    </section>
  );
}
