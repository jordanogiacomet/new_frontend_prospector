import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
  formatCnpj,
  formatScore,
} from "../../lib/formatters";
import {
  UNKNOWN_DOMAIN_LABEL,
  getLeadActionLabel,
  getPriorityLabel,
  getTrustStatusLabel,
  getVerdictLabel,
} from "../../lib/lead-labels";
import type {
  LeadConfidenceIndicator,
  LeadDetail,
} from "../../types/leads";

interface LeadDetailSummaryProps {
  lead: LeadDetail;
}

interface DecisionBadgeProps {
  children: string;
}

interface ConfidenceNoticeProps {
  indicator: LeadConfidenceIndicator;
}

function formatLocation(city: string | null, uf: string | null): string {
  if (city && uf) {
    return `${city} / ${uf}`;
  }

  return city ?? uf ?? UNAVAILABLE_LABEL;
}

function DecisionBadge({ children }: DecisionBadgeProps) {
  const isNeutral =
    children === UNAVAILABLE_LABEL || children === UNKNOWN_DOMAIN_LABEL;
  const appearance = isNeutral
    ? "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]"
    : "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]";

  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${appearance}`}
    >
      {children}
    </span>
  );
}

function ConfidenceNotice({ indicator }: ConfidenceNoticeProps) {
  if (indicator === "low") {
    return (
      <div
        role="alert"
        className="border border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] px-4 py-4 text-[oklch(35%_0.08_62)]"
      >
        <p className="text-sm font-bold">Baixa confiança</p>
        <p className="mt-1 text-xs leading-5">
          Considere validar os dados antes da abordagem.
        </p>
      </div>
    );
  }

  if (indicator === "unknown") {
    return (
      <div
        role="status"
        className="border border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] px-4 py-4 text-[oklch(40%_0.025_252)]"
      >
        <p className="text-sm font-bold">Confiança não mapeada</p>
        <p className="mt-1 text-xs leading-5">
          Não foi possível classificar a confiança com os valores
          armazenados.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] px-4 py-4 text-[oklch(32%_0.09_174)]">
      <p className="text-sm font-bold">Confiança normal</p>
      <p className="mt-1 text-xs leading-5">
        Classificação apresentada conforme a análise armazenada.
      </p>
    </div>
  );
}

export function LeadDetailSummary({ lead }: LeadDetailSummaryProps) {
  const actionLabel = getLeadActionLabel(lead.recommendedAction);
  const priorityLabel = getPriorityLabel(lead.priority);
  const verdictLabel = getVerdictLabel(lead.finalVerdict);
  const trustLabel = getTrustStatusLabel(lead.trustStatus);

  return (
    <section
      aria-labelledby="lead-detail-summary-heading"
      className="border-b border-[oklch(82%_0.025_82)] pb-9"
    >
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div>
          <p
            id="lead-detail-summary-heading"
            className="text-xs font-bold tracking-[0.18em] text-[oklch(45%_0.105_174)] uppercase"
          >
            Resumo da análise
          </p>
          <h1 className="mt-3 max-w-[20ch] font-serif text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.98] tracking-[-0.045em] text-balance">
            {lead.companyName ?? UNAVAILABLE_LABEL}
          </h1>
          <p className="mt-5 text-base font-semibold text-[oklch(43%_0.03_252)]">
            {formatLocation(lead.city, lead.uf)}
          </p>
        </div>

        <dl className="grid gap-x-8 gap-y-4 border-t border-[oklch(82%_0.025_82)] pt-5 sm:grid-cols-2 xl:min-w-[24rem]">
          <div>
            <dt className="text-xs font-bold tracking-[0.1em] text-[oklch(48%_0.025_252)] uppercase">
              CNPJ
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">
              {formatCnpj(lead.cnpj)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-[0.1em] text-[oklch(48%_0.025_252)] uppercase">
              Última análise
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">
              {formatBrazilianDate(lead.lastAnalysisAt)}
            </dd>
          </div>
        </dl>
      </div>

      <section
        aria-labelledby="lead-decision-heading"
        className="mt-9 border-y border-[oklch(72%_0.035_82)] py-7"
      >
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.6fr)] lg:gap-10">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
              Decisão armazenada
            </p>
            <h2
              id="lead-decision-heading"
              className="mt-2 font-serif text-3xl tracking-[-0.03em]"
            >
              Recomendação da análise
            </h2>

            <dl className="mt-6 grid gap-x-7 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
                  Ação recomendada
                </dt>
                <dd
                  data-testid="lead-recommended-action"
                  className="mt-2"
                >
                  <DecisionBadge>{actionLabel}</DecisionBadge>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
                  Pontuação
                </dt>
                <dd
                  data-testid="lead-score"
                  className="mt-1 font-serif text-4xl leading-none tracking-[-0.035em] tabular-nums"
                >
                  {formatScore(lead.score)}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
                  Prioridade
                </dt>
                <dd className="mt-2">
                  <DecisionBadge>{priorityLabel}</DecisionBadge>
                </dd>
              </div>

              <div>
                <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
                  Veredito
                </dt>
                <dd className="mt-2">
                  <DecisionBadge>{verdictLabel}</DecisionBadge>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
                  Motivo da recomendação
                </dt>
                <dd
                  data-testid="lead-recommendation-reason"
                  className="mt-2 max-w-3xl text-sm leading-6"
                >
                  {lead.recommendedActionReason ?? UNAVAILABLE_LABEL}
                </dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-[oklch(82%_0.025_82)] pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <p className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
              Status de confiança
            </p>
            <div className="mt-2">
              <DecisionBadge>{trustLabel}</DecisionBadge>
            </div>
            <div className="mt-5">
              <ConfidenceNotice indicator={lead.confidenceIndicator} />
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
