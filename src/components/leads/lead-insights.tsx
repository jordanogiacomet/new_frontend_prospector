import { UNAVAILABLE_LABEL } from "../../lib/formatters";
import { getRiskFlagLabel } from "../../lib/lead-labels";
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

interface EvidenceStateProps {
  evidence: LeadDetail["evidences"];
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
  const hasItems =
    collection.status === "available" && collection.items.length > 0;
  const copy =
    collection.status === "available"
      ? {
          label:
            hasItems
              ? isRisks
                ? "Riscos registrados"
                : "Sinais registrados"
              : isRisks
                ? "Sem riscos registrados"
                : "Sem sinais registrados",
          description: hasItems
            ? isRisks
              ? "A análise registrou os seguintes pontos de atenção."
              : "A análise registrou os seguintes sinais positivos."
            : isRisks
              ? "Esta análise não registra riscos. Isso não garante ausência de risco."
              : "Esta análise não registra sinais positivos.",
        }
      : collection.status === "missing"
        ? {
            label: "Dados ausentes",
            description: isRisks
              ? "Não há informação sobre riscos nesta análise."
              : "Não há informação sobre sinais positivos nesta análise.",
          }
        : collection.status === "unavailable"
          ? {
              label: "Dados indisponíveis",
              description: `Não foi possível consultar os ${subject} desta análise.`,
            }
          : {
              label: "Conteúdo protegido",
              description: `Os ${subject} não podem ser exibidos conforme a política de privacidade.`,
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
      {hasItems ? (
        <ul className="mt-4 grid gap-2 text-sm leading-6">
          {collection.items.map((item) => (
            <li
              key={item}
              className="border-l-2 border-current pl-3"
            >
              {isRisks ? getRiskFlagLabel(item) : item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EvidenceState({ evidence }: EvidenceStateProps) {
  const hasContent =
    evidence.status === "available" && evidence.content.length > 0;
  const copy =
    evidence.status === "available"
      ? {
          label: hasContent
            ? "Evidências registradas"
            : "Sem evidências registradas",
          description: hasContent
            ? "Estas fontes apoiam a análise e estão disponíveis para consulta."
            : "Esta análise não registra evidências.",
        }
      : evidence.status === "missing"
      ? {
          label: "Evidências ausentes",
          description:
            "Não há informação sobre evidências nesta análise.",
        }
      : evidence.status === "unavailable"
        ? {
            label: "Evidências indisponíveis",
            description:
              "Não foi possível consultar as evidências desta análise.",
          }
        : {
            label: "Conteúdo protegido",
            description:
              "As evidências não podem ser exibidas conforme a política de privacidade.",
          };

  return (
    <div
      role={evidence.status === "unavailable" ? "alert" : "status"}
      aria-label={copy.label}
      className={`mt-5 border px-5 py-5 ${stateAppearance[evidence.status]}`}
    >
      <p className="text-xs font-bold tracking-[0.12em] uppercase">
        {copy.label}
      </p>
      <p className="mt-2 max-w-xl text-sm leading-6">
        {copy.description}
      </p>
      {hasContent ? (
        <ul className="mt-4 grid gap-3 text-sm leading-6">
          {evidence.content.map((item, index) => (
            <li
              key={`${item.title}-${index}`}
              className="border-l-2 border-current pl-3"
            >
              <p className="font-semibold">{item.title}</p>
              {item.summary === null ? null : (
                <p className="mt-1">{item.summary}</p>
              )}
              {item.url === null ? null : (
                <a
                  className="mt-2 inline-flex font-semibold underline underline-offset-4"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Abrir fonte aprovada
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : null}
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
            Informações disponíveis
          </p>
          <h2
            id="lead-facts-heading"
            className="mt-2 font-serif text-3xl tracking-[-0.03em]"
          >
            Dados da empresa
          </h2>
        </div>

        <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
          <section aria-labelledby="business-facts-heading">
            <h3
              id="business-facts-heading"
              className="font-serif text-2xl tracking-[-0.025em]"
            >
              Identificação da empresa
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
              Porte e regime tributário
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
            Dados comerciais
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
          <EvidenceState evidence={lead.evidences} />
        </section>
      </section>
    </div>
  );
}
