"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { LeadAuditDetails } from "../../../../components/leads/lead-audit";
import { LeadDetailSummary } from "../../../../components/leads/lead-detail-summary";
import { LeadHistory } from "../../../../components/leads/lead-history";
import { LeadInsights } from "../../../../components/leads/lead-insights";
import { StrategicReport } from "../../../../components/leads/strategic-report";
import type {
  DataQualityNotice,
  LeadAudit,
  LeadDetail,
  LeadInsightCollection,
  LeadSensitiveContent,
} from "../../../../types/leads";

interface LeadDetailEnvelope {
  data: LeadDetail;
}

type RequestState =
  | {
      requestKey: string;
      status: "loading";
    }
  | {
      requestKey: string;
      status: "success";
      lead: LeadDetail;
    }
  | {
      requestKey: string;
      status: "not_found";
    }
  | {
      requestKey: string;
      status: "error";
    }
  | {
      requestKey: string;
      status: "unavailable";
    };

const confidenceIndicators = new Set(["normal", "low", "unknown"]);
const insightStatuses = new Set([
  "available",
  "missing",
  "unavailable",
  "omitted_by_policy",
]);
const sensitiveContentStatuses = new Set([
  "missing",
  "unavailable",
  "omitted_by_policy",
]);
const dataQualityCodes = new Set([
  "MISSING_VALUE",
  "UNKNOWN_DOMAIN_VALUE",
  "STALE_VALUE",
  "CONTENT_WITHHELD",
]);

const nullableDetailTextFields = [
  "companyName",
  "city",
  "uf",
  "sector",
  "priority",
  "recommendedAction",
  "trustStatus",
  "legalName",
  "tradeName",
  "primaryCnae",
  "primaryCnaeDescription",
  "companySize",
  "taxRegime",
  "estimatedRevenue",
  "employeeCount",
  "finalVerdict",
  "recommendedActionReason",
  "strategicTier",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableInteger(
  value: unknown,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): value is number | null {
  return (
    value === null ||
    (Number.isInteger(value) &&
      Number(value) >= minimum &&
      Number(value) <= maximum)
  );
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isLeadInsightCollection(
  value: unknown,
): value is LeadInsightCollection {
  if (
    !isRecord(value) ||
    !isString(value.status) ||
    !insightStatuses.has(value.status)
  ) {
    return false;
  }

  if (value.status === "available") {
    return (
      Array.isArray(value.items) &&
      value.items.every(
        (item) => isString(item) && item.trim().length > 0,
      )
    );
  }

  return value.items === null;
}

function isLeadSensitiveContent(
  value: unknown,
): value is LeadSensitiveContent {
  return (
    isRecord(value) &&
    isString(value.status) &&
    sensitiveContentStatuses.has(value.status) &&
    value.content === null
  );
}

function isDataQualityNotice(
  value: unknown,
): value is DataQualityNotice {
  return (
    isRecord(value) &&
    isString(value.code) &&
    dataQualityCodes.has(value.code) &&
    isString(value.field)
  );
}

function isLeadAudit(value: unknown): value is LeadAudit {
  return (
    isRecord(value) &&
    isString(value.decision_id) &&
    isNullableString(value.import_batch_id) &&
    isString(value.lead_run_id) &&
    isNullableInteger(value.source_row, Number.NEGATIVE_INFINITY) &&
    isNullableString(value.source_hash) &&
    isNullableString(value.agent_version) &&
    isNullableString(value.idempotency_key) &&
    isNullableBoolean(value.used_cache) &&
    isString(value.validated_at) &&
    isString(value.created_at) &&
    isNullableString(value.updated_at) &&
    isNullableString(value.expires_at)
  );
}

function isLeadDetailEnvelope(value: unknown): value is LeadDetailEnvelope {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }

  const lead = value.data;

  return (
    isString(lead.decision_id) &&
    isNullableString(lead.import_batch_id) &&
    isString(lead.lead_run_id) &&
    isNullableInteger(lead.source_row, Number.NEGATIVE_INFINITY) &&
    isNullableString(lead.source_hash) &&
    isString(lead.agent_version) &&
    isString(lead.cnpj) &&
    nullableDetailTextFields.every((field) =>
      isNullableString(lead[field]),
    ) &&
    isNullableInteger(lead.score, 0, 100) &&
    isString(lead.confidenceIndicator) &&
    confidenceIndicators.has(lead.confidenceIndicator) &&
    isString(lead.lastAnalysisAt) &&
    isNullableInteger(lead.branchCount, 0) &&
    isNullableInteger(lead.icpScore, 0, 100) &&
    isNullableInteger(lead.strategicAssetScore, 0, 100) &&
    isLeadInsightCollection(lead.riskFlags) &&
    isLeadInsightCollection(lead.positiveSignals) &&
    isLeadSensitiveContent(lead.evidences) &&
    isLeadSensitiveContent(lead.strategicReport) &&
    isLeadAudit(lead.audit) &&
    Array.isArray(lead.dataQuality) &&
    lead.dataQuality.every(isDataQualityNotice)
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ cnpj: string }>();
  const searchParams = useSearchParams();
  const cnpj = params.cnpj;
  const query = searchParams.toString();
  const requestKey = `${cnpj}?${query}`;
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

    async function loadLead(): Promise<void> {
      const path = `/api/leads/${encodeURIComponent(cnpj)}`;
      const endpoint = query === "" ? path : `${path}?${query}`;

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: abortController.signal,
        });

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

        if (!abortController.signal.aborted) {
          setRequestState(
            isLeadDetailEnvelope(payload)
              ? {
                  requestKey,
                  status: "success",
                  lead: payload.data,
                }
              : { requestKey, status: "unavailable" },
          );
        }
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState({ requestKey, status: "error" });
        }
      }
    }

    void loadLead();

    return () => abortController.abort();
  }, [cnpj, query, requestKey]);

  if (currentState.status === "loading") {
    return <LeadDetailLoading />;
  }

  if (currentState.status === "not_found") {
    return <LeadNotFound />;
  }

  if (currentState.status === "unavailable") {
    return <LeadDataUnavailable />;
  }

  if (currentState.status === "error") {
    return <LeadDetailError />;
  }

  const isStale = currentState.lead.dataQuality.some(
    (notice) => notice.code === "STALE_VALUE",
  );

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <Link
        href="/leads"
        className="inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 py-2 text-sm font-bold transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
      >
        Voltar para leads
      </Link>

      <div className="mt-8">
        {isStale ? <StaleDataNotice /> : null}
        <LeadDetailSummary lead={currentState.lead} />
      </div>

      <div className="mt-10">
        <LeadInsights lead={currentState.lead} />
      </div>

      <div className="mt-10">
        <StrategicReport report={currentState.lead.strategicReport} />
      </div>

      <div className="mt-10">
        <LeadHistory cnpj={cnpj} />
      </div>

      <div className="mt-10">
        <LeadAuditDetails audit={currentState.lead.audit} />
      </div>
    </div>
  );
}

function LeadDetailLoading() {
  return (
    <section
      role="status"
      aria-label="Carregando detalhes do lead"
      aria-live="polite"
      className="mx-auto w-full max-w-[96rem] border-y border-[oklch(82%_0.025_82)] py-8"
    >
      <span className="sr-only">Carregando detalhes do lead</span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-5 motion-reduce:animate-none"
      >
        <div className="h-4 w-40 bg-[oklch(89%_0.02_82)]" />
        <div className="h-14 w-4/5 max-w-3xl bg-[oklch(91%_0.018_82)]" />
        <div className="h-5 w-64 bg-[oklch(93%_0.014_82)]" />
        <div className="grid gap-4 pt-5 sm:grid-cols-3">
          <div className="h-24 bg-[oklch(93%_0.014_82)]" />
          <div className="h-24 bg-[oklch(94%_0.012_82)]" />
          <div className="h-24 bg-[oklch(94%_0.012_82)]" />
        </div>
      </div>
    </section>
  );
}

function LeadNotFound() {
  return (
    <PageState
      eyebrow="Consulta sem correspondência"
      title="Empresa não encontrada"
      description="Não encontramos uma análise elegível para este CNPJ e execução. Revise o endereço ou volte para a lista de leads."
    />
  );
}

function LeadDataUnavailable() {
  return (
    <PageState
      alert
      eyebrow="Consulta indisponível"
      title="Dados da análise indisponíveis"
      description="Os dados não puderam ser apresentados com segurança agora. Atualize a página para tentar novamente."
    />
  );
}

function LeadDetailError() {
  return (
    <PageState
      alert
      eyebrow="Falha na consulta"
      title="Não foi possível carregar esta análise agora."
      description="Atualize a página para tentar novamente. Se o problema continuar, contate o suporte responsável."
    />
  );
}

function StaleDataNotice() {
  return (
    <section
      role="status"
      aria-label="Dados desatualizados"
      className="mb-8 border border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] px-5 py-5 text-[oklch(35%_0.08_62)]"
    >
      <p className="text-xs font-bold tracking-[0.14em] uppercase">
        Dados desatualizados
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-6">
        Esta análise foi marcada como desatualizada. Os valores continuam
        sendo exibidos como foram armazenados. Nenhum valor foi recalculado.
      </p>
    </section>
  );
}

interface PageStateProps {
  alert?: boolean;
  description: string;
  eyebrow: string;
  title: string;
}

function PageState({
  alert = false,
  description,
  eyebrow,
  title,
}: PageStateProps) {
  return (
    <section
      role={alert ? "alert" : undefined}
      className="mx-auto w-full max-w-4xl border-y border-[oklch(82%_0.025_82)] py-12"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-serif text-4xl tracking-[-0.035em]">
        {title}
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {description}
      </p>
      <Link
        href="/leads"
        className="mt-7 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 py-2 text-sm font-bold transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
      >
        Voltar para leads
      </Link>
    </section>
  );
}
