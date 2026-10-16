"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { usePrivateCapabilities } from "../../../../components/auth/private-capabilities";
import {
  ContactEnrichmentAction,
  ContactEnrichmentProvider,
} from "../../../../components/contacts/contact-enrichment-action";
import { LeadAuditDetails } from "../../../../components/leads/lead-audit";
import { LeadApproachMessage } from "../../../../components/leads/lead-approach-message";
import { LeadDetailSummary } from "../../../../components/leads/lead-detail-summary";
import { LeadHistory } from "../../../../components/leads/lead-history";
import { LeadInsights } from "../../../../components/leads/lead-insights";
import { LeadLocationMap } from "../../../../components/leads/lead-location-map";
import { StrategicReport } from "../../../../components/leads/strategic-report";
import {
  resolveLeadReturnDestination,
  type LeadReturnDestination,
} from "../../../../lib/navigation-return";
import type {
  DataQualityNotice,
  LeadAudit,
  LeadDetail,
  LeadEvidenceContent,
  LeadInsightCollection,
  LeadStrategicReportContent,
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
      refreshFailed: boolean;
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
    }
  | {
      readonly requestKey: string;
      readonly status: "auth_required";
    }
  | {
      readonly requestKey: string;
      readonly status: "access_denied";
    };

const confidenceIndicators = new Set(["normal", "low", "unknown"]);
const insightStatuses = new Set([
  "available",
  "missing",
  "unavailable",
  "omitted_by_policy",
]);
const strategicReportStatuses = new Set([
  "available",
  "missing",
  "unavailable",
  "omitted_by_policy",
]);
const evidenceContentStatuses = new Set([
  "available",
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
const refreshIntervalMilliseconds = 5_000;

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

function isLeadEvidenceContent(
  value: unknown,
): value is LeadEvidenceContent {
  if (
    !isRecord(value) ||
    !isString(value.status) ||
    !evidenceContentStatuses.has(value.status)
  ) {
    return false;
  }

  if (value.status !== "available") {
    return value.content === null;
  }

  return (
    Array.isArray(value.content) &&
    value.content.every(
      (item) =>
        isRecord(item) &&
        isString(item.title) &&
        isNullableString(item.summary) &&
        isNullableString(item.url),
    )
  );
}

function isLeadStrategicReportContent(
  value: unknown,
): value is LeadStrategicReportContent {
  if (
    !isRecord(value) ||
    !isString(value.status) ||
    !strategicReportStatuses.has(value.status)
  ) {
    return false;
  }

  return value.status === "available"
    ? isString(value.content) && value.content.trim().length > 0
    : value.content === null;
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
    isLeadEvidenceContent(lead.evidences) &&
    isLeadStrategicReportContent(lead.strategicReport) &&
    isLeadAudit(lead.audit) &&
    Array.isArray(lead.dataQuality) &&
    lead.dataQuality.every(isDataQualityNotice)
  );
}

export default function LeadDetailPage() {
  const { hasPermission } = usePrivateCapabilities();
  const canReadLeads = hasPermission("leads:read");
  const canSearchContacts = hasPermission("contacts:enrich") && hasPermission("contacts:read");
  const params = useParams<{ cnpj: string }>();
  const searchParams = useSearchParams();
  const cnpj = params.cnpj;
  const leadRunId = searchParams.get("leadRunId");
  const query =
    leadRunId === null
      ? ""
      : new URLSearchParams({ leadRunId }).toString();
  const requestKey = `${cnpj}?${query}`;
  const returnDestination = resolveLeadReturnDestination(
    searchParams.get("returnTo"),
  );
  const [requestState, setRequestState] = useState<RequestState>(() => ({
    requestKey,
    status: "loading",
  }));
  const currentState: RequestState =
    requestState.requestKey === requestKey
      ? requestState
      : { requestKey, status: "loading" };
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const [manualRefreshKey, setManualRefreshKey] = useState<string | null>(null);
  const isRefreshing = manualRefreshKey === requestKey;

  useEffect(() => {
    if (!canReadLeads) return;

    const abortController = new AbortController();
    let requestInFlight = false;
    let accessStopped = false;

    async function loadLead(): Promise<void> {
      if (requestInFlight || accessStopped) {
        return;
      }

      requestInFlight = true;
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

          if (!abortController.signal.aborted) {
            setRequestState((previous) =>
              response.status >= 500 &&
              previous.requestKey === requestKey &&
              previous.status === "success"
                ? { ...previous, refreshFailed: true }
                : { requestKey, status },
            );
          }

          return;
        }

        const payload: unknown = await response.json().catch(() => undefined);

        if (!abortController.signal.aborted) {
          setRequestState(
            isLeadDetailEnvelope(payload)
              ? {
                  requestKey,
                  status: "success",
                  lead: payload.data,
                  refreshFailed: false,
                }
              : { requestKey, status: "unavailable" },
          );
        }
      } catch {
        if (!abortController.signal.aborted) {
          setRequestState((previous) =>
            previous.requestKey === requestKey && previous.status === "success"
              ? { ...previous, refreshFailed: true }
              : { requestKey, status: "error" },
          );
        }
      } finally {
        requestInFlight = false;
      }
    }

    refreshRef.current = loadLead;
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadLead();
      }
    }, refreshIntervalMilliseconds);
    void loadLead();

    return () => {
      window.clearInterval(refreshIntervalId);
      abortController.abort();
      refreshRef.current = null;
    };
  }, [cnpj, query, requestKey, canReadLeads]);

  function refreshLead(): void {
    const refresh = refreshRef.current;
    if (refresh === null || isRefreshing) {
      return;
    }
    setManualRefreshKey(requestKey);
    void refresh().finally(() => {
      setManualRefreshKey((pendingKey) =>
        pendingKey === requestKey ? null : pendingKey,
      );
    });
  }

  const recoveryProps: PageRecoveryProps = {
    onRetry: refreshLead,
    refreshing: isRefreshing,
    returnDestination,
  };

  if (!canReadLeads) {
    return <ReadAccessState status="access_denied" />;
  }
  if (currentState.status === "auth_required" || currentState.status === "access_denied") {
    return <ReadAccessState status={currentState.status} />;
  }

  if (currentState.status === "loading") {
    return <LeadDetailLoading />;
  }

  if (currentState.status === "not_found") {
    return <LeadNotFound {...recoveryProps} />;
  }

  if (currentState.status === "unavailable") {
    return <LeadDataUnavailable {...recoveryProps} />;
  }

  if (currentState.status === "error") {
    return <LeadDetailError {...recoveryProps} />;
  }

  const isStale = currentState.lead.dataQuality.some(
    (notice) => notice.code === "STALE_VALUE",
  );

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <nav aria-label="Navegação da análise" className="flex flex-wrap gap-4">
        <Link
          href={returnDestination.href}
          aria-label={returnDestination.label}
          className="ui-action ui-action--quiet"
        >
          ← {returnDestination.label}
        </Link>
        {canSearchContacts ? (
          <a
            href="#lead-contacts"
            className="ui-action ui-action--secondary"
          >
            Encontrar contatos
          </a>
        ) : null}
        <button
          type="button"
          onClick={refreshLead}
          disabled={isRefreshing}
          className="ui-action ui-action--quiet"
        >
          {isRefreshing ? "Atualizando…" : "Atualizar análise"}
        </button>
      </nav>

      {currentState.refreshFailed ? (
        <p
          role="status"
          className="mt-5 border border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] px-4 py-3 text-sm leading-6 text-[oklch(35%_0.08_62)]"
        >
          Não foi possível atualizar. Exibindo a última consulta disponível;
          a análise pode ter mudado. Use Atualizar análise para consultar
          novamente.
        </p>
      ) : null}

      <nav
        aria-label="Seções da análise"
        className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-[oklch(82%_0.025_82)] py-3"
      >
        {[
          ["#lead-summary", "Avaliação comercial"],
          ...(canSearchContacts ? [["#lead-contacts", "Contatos"]] : []),
          ["#lead-insights", "Fundamentos da decisão"],
          ["#lead-report", "Relatório"],
          ["#lead-message", "Mensagem de abordagem"],
          ["#lead-history", "Histórico"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="ui-action ui-action--quiet">
            {label}
          </a>
        ))}
      </nav>

      <div id="lead-summary" className="mt-8 scroll-mt-8">
        {isStale ? <StaleDataNotice /> : null}
        <LeadDetailSummary lead={currentState.lead} />
      </div>

      <section
        id="lead-contacts"
        aria-labelledby="lead-contacts-heading"
        className="mt-10 scroll-mt-8 border-y border-[oklch(82%_0.025_82)] py-6"
      >
        <h2 id="lead-contacts-heading" className="font-serif text-2xl tracking-[-0.025em]">
          Contatos profissionais
        </h2>
        {canSearchContacts ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
            Localize a empresa, confira os perfis encontrados e escolha os
            canais profissionais que deseja recuperar.
          </p>
        ) : null}
        <ContactEnrichmentProvider key={currentState.lead.cnpj}>
          <ContactEnrichmentAction
            attemptKey={currentState.lead.cnpj}
            companyName={currentState.lead.companyName}
            companyCity={currentState.lead.city}
            companyState={currentState.lead.uf}
            companySector={currentState.lead.sector}
            cnpj={currentState.lead.cnpj}
            initialDomain={null}
            producerScore={currentState.lead.score}
          />
        </ContactEnrichmentProvider>
      </section>

      <div id="lead-insights" className="mt-10 scroll-mt-8">
        <LeadInsights lead={currentState.lead} />
      </div>

      <div className="mt-10">
        <LeadLocationMap
          cnpj={currentState.lead.cnpj}
          city={currentState.lead.city}
          leadRunId={currentState.lead.lead_run_id}
          uf={currentState.lead.uf}
        />
      </div>

      <div id="lead-report" className="mt-10 scroll-mt-8">
        <StrategicReport report={currentState.lead.strategicReport} />
      </div>

      <div id="lead-message" className="mt-10 scroll-mt-8">
        <LeadApproachMessage lead={currentState.lead} />
      </div>

      <div id="lead-history" className="mt-10 scroll-mt-8">
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

function LeadNotFound(props: PageRecoveryProps) {
  return (
    <PageState
      eyebrow="Consulta sem correspondência"
      title="Empresa não encontrada"
      description="Não encontramos uma análise disponível para esta empresa. Volte à lista e escolha outra empresa para consultar."
      {...props}
    />
  );
}

function LeadDataUnavailable(props: PageRecoveryProps) {
  return (
    <PageState
      alert
      eyebrow="Consulta indisponível"
      title="Dados da análise indisponíveis"
      description="Os dados não puderam ser apresentados com segurança agora. Tente consultar novamente."
      {...props}
    />
  );
}

function LeadDetailError(props: PageRecoveryProps) {
  return (
    <PageState
      alert
      eyebrow="Falha na consulta"
      title="Não foi possível carregar esta análise agora."
      description="Tente consultar novamente. Se o problema continuar, contate o suporte responsável."
      {...props}
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

interface PageRecoveryProps {
  onRetry: () => void;
  refreshing: boolean;
  returnDestination: LeadReturnDestination;
}

interface PageStateProps extends PageRecoveryProps {
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
  onRetry,
  refreshing,
  returnDestination,
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
      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRetry}
          disabled={refreshing}
          className="ui-action ui-action--secondary"
        >
          {refreshing ? "Tentando novamente…" : "Tentar novamente"}
        </button>
        <Link href={returnDestination.href} className="ui-action ui-action--quiet">
          {returnDestination.label}
        </Link>
      </div>
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
