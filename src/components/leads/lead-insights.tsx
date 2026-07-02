import { UNAVAILABLE_LABEL } from "../../lib/formatters";
import type {
  LeadDetail,
  LeadInsightCollection,
} from "../../types/leads";

interface LeadInsightsProps {
  lead: LeadDetail;
}

interface FactItemProps {
  label: string;
  testId?: string;
  value: string;
}

interface InsightStateProps {
  collection: LeadInsightCollection;
  kind: "risks" | "signals";
}

const branchCountFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const stateAppearance: Record<
  LeadInsightCollection["status"],
  string
> = {
  available:
    "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]",
  missing:
    "border-[oklch(79%_0.02_252)] bg-[oklch(96%_0.008_252)] text-[oklch(41%_0.025_252)]",
  unavailable:
    "border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] text-[oklch(38%_0.07_32)]",
  omitted_by_policy:
    "border-[oklch(77%_0.07_77)] bg-[oklch(96%_0.025_77)] text-[oklch(36%_0.065_62)]",
};

function formatStoredText(value: string | null): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : UNAVAILABLE_LABEL;
}

function formatBranchCount(value: number | null): string {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? branchCountFormatter.format(value)
    : UNAVAILABLE_LABEL;
}

function FactItem({ label, testId, value }: FactItemProps) {
  return (
    <div className="border-t border-[oklch(88%_0.02_82)] pt-4">
      <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="mt-2 whitespace-pre-wrap text-sm leading-6 font-semibold [overflow-wrap:anywhere]"
      >
        {value}
      </dd>
    </div>
  );
}

function InsightState({ collection, kind }: InsightStateProps) {
  const isRisks = kind === "risks";
  const subject = kind === "risks" ? "riscos" : "sinais positivos";
  const copy =
    collection.status === "available"
      ? {
          label:
            isRisks
              ? "Sem riscos registrados"
              : "Sem sinais registrados",
          description: `A análise armazenada contém uma coleção vazia de ${subject}.`,
        }
      : collection.status === "missing"
        ? {
            label: "Dados ausentes",
            description: isRisks
              ? "Nenhuma informação de risco foi armazenada para esta análise."
              : "Nenhuma informação de sinal positivo foi armazenada para esta análise.",
          }
        : collection.status === "unavailable"
          ? {
              label: "Dados indisponíveis",
              description: `Não foi possível consultar os ${subject} desta análise.`,
            }
          : {
              label: "Retido por política",
              description: `O conteúdo de ${subject} não foi aprovado para exibição.`,
            };

  return (
    <div
      role={collection.status === "unavailable" ? "alert" : "status"}
      aria-label={copy.label}
      className={`mt-5 border px-5 py-5 ${stateAppearance[collection.status]}`}
    >
      <p className="text-xs font-bold tracking-[0.12em] uppercase">
        {copy.label}
      </p>
      <p className="mt-2 max-w-xl text-sm leading-6">
        {copy.description}
      </p>
    </div>
  );
}

export function LeadInsights({ lead }: LeadInsightsProps) {
  return (
    <div className="space-y-10">
      <section
        aria-labelledby="lead-facts-heading"
        className="border-b border-[oklch(82%_0.025_82)] pb-10"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            Dados armazenados
          </p>
          <h2
            id="lead-facts-heading"
            className="mt-2 font-serif text-3xl tracking-[-0.03em]"
          >
            Fatos armazenados
          </h2>
        </div>

        <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
          <section aria-labelledby="business-facts-heading">
            <h3
              id="business-facts-heading"
              className="font-serif text-2xl tracking-[-0.025em]"
            >
              Fatos empresariais
            </h3>
            <dl className="mt-5 grid gap-x-7 gap-y-5 sm:grid-cols-2">
              <FactItem
                label="Razão social"
                value={formatStoredText(lead.legalName)}
              />
              <FactItem
                label="Nome fantasia"
                value={formatStoredText(lead.tradeName)}
              />
              <FactItem
                label="CNAE principal"
                value={formatStoredText(lead.primaryCnae)}
              />
              <FactItem
                label="Descrição do CNAE"
                value={formatStoredText(
                  lead.primaryCnaeDescription,
                )}
              />
            </dl>
          </section>

          <section aria-labelledby="fiscal-facts-heading">
            <h3
              id="fiscal-facts-heading"
              className="font-serif text-2xl tracking-[-0.025em]"
            >
              Fatos fiscais
            </h3>
            <dl className="mt-5 grid gap-y-5">
              <FactItem
                label="Porte da empresa"
                value={formatStoredText(lead.companySize)}
              />
              <FactItem
                label="Regime tributário"
                value={formatStoredText(lead.taxRegime)}
              />
            </dl>
          </section>
        </div>

        <section
          aria-labelledby="commercial-facts-heading"
          className="mt-9 border-t border-[oklch(72%_0.035_82)] pt-7"
        >
          <h3
            id="commercial-facts-heading"
            className="font-serif text-2xl tracking-[-0.025em]"
          >
            Fatos comerciais
          </h3>
          <dl className="mt-5 grid gap-x-7 gap-y-5 sm:grid-cols-3">
            <FactItem
              label="Faturamento estimado"
              testId="lead-estimated-revenue"
              value={formatStoredText(lead.estimatedRevenue)}
            />
            <FactItem
              label="Quadro de funcionários"
              testId="lead-employee-count"
              value={formatStoredText(lead.employeeCount)}
            />
            <FactItem
              label="Quantidade de filiais"
              testId="lead-branch-count"
              value={formatBranchCount(lead.branchCount)}
            />
          </dl>
        </section>
      </section>

      <section aria-labelledby="lead-insights-heading">
        <div className="max-w-3xl">
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            Leitura da análise
          </p>
          <h2
            id="lead-insights-heading"
            className="mt-2 font-serif text-3xl tracking-[-0.03em]"
          >
            Riscos, sinais e evidências
          </h2>
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="risk-flags-heading">
            <h3
              id="risk-flags-heading"
              className="font-serif text-2xl tracking-[-0.025em]"
            >
              Riscos encontrados
            </h3>
            <InsightState
              collection={lead.riskFlags}
              kind="risks"
            />
          </section>

          <section aria-labelledby="positive-signals-heading">
            <h3
              id="positive-signals-heading"
              className="font-serif text-2xl tracking-[-0.025em]"
            >
              Sinais positivos
            </h3>
            <InsightState
              collection={lead.positiveSignals}
              kind="signals"
            />
          </section>
        </div>

        <section
          aria-labelledby="evidence-heading"
          className="mt-8 border-t border-[oklch(82%_0.025_82)] pt-7"
        >
          <h3
            id="evidence-heading"
            className="font-serif text-2xl tracking-[-0.025em]"
          >
            Evidências
          </h3>
          <div
            role="status"
            aria-label="Retido por política"
            className={`mt-5 border px-5 py-5 ${stateAppearance.omitted_by_policy}`}
          >
            <p className="text-xs font-bold tracking-[0.12em] uppercase">
              Retido por política
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6">
              As evidências desta análise não foram aprovadas para
              exibição.
            </p>
          </div>
        </section>
      </section>
    </div>
  );
}
