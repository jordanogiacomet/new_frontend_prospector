import type { LeadDetail } from "../../types/leads";

type StrategicReportContract = LeadDetail["strategicReport"];

type StrategicReportDisplayState =
  | StrategicReportContract
  | { status: "missing" }
  | { status: "unavailable" };

interface StrategicReportProps {
  report: StrategicReportDisplayState;
}

interface ReportField {
  label: string;
  value: string;
}

const stateAppearance: Record<
  StrategicReportDisplayState["status"],
  string
> = {
  available:
    "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]",
  omitted_by_policy:
    "border-[oklch(77%_0.07_77)] bg-[oklch(96%_0.025_77)] text-[oklch(36%_0.065_62)]",
  missing:
    "border-[oklch(79%_0.02_252)] bg-[oklch(96%_0.008_252)] text-[oklch(41%_0.025_252)]",
  unavailable:
    "border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] text-[oklch(38%_0.07_32)]",
};

export function StrategicReport({ report }: StrategicReportProps) {
  const copy =
    report.status === "available"
      ? {
          label: "Relatório disponível",
          title: "Análise estratégica registrada",
          description: "Conteúdo disponível para consulta nesta análise.",
        }
      : report.status === "omitted_by_policy"
      ? {
          label: "Conteúdo protegido",
          title: "Relatório protegido",
          description:
            "Este relatório não pode ser exibido conforme a política de privacidade. A recomendação e os dados permitidos continuam disponíveis.",
        }
      : report.status === "missing"
        ? {
            label: "Não registrado",
            title: "Relatório não registrado",
            description:
              "Nenhum relatório foi associado a esta análise.",
          }
        : {
            label: "Indisponível",
            title: "Relatório indisponível",
            description:
              "Não foi possível apresentar o conteúdo com segurança nesta consulta. Consulte a recomendação e os demais dados disponíveis da análise.",
          };

  return (
    <section
      aria-labelledby="strategic-report-heading"
      className="border-y border-[oklch(82%_0.025_82)] py-8"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
          Análise estratégica
        </p>
        <h2
          id="strategic-report-heading"
          className="mt-2 font-serif text-3xl tracking-[-0.03em]"
        >
          Relatório estratégico
        </h2>
      </div>

      <div
        role={report.status === "unavailable" ? "alert" : "status"}
        aria-label={copy.label}
        className={`mt-6 grid gap-4 border px-5 py-6 sm:grid-cols-[minmax(9rem,auto)_1fr] sm:gap-8 ${stateAppearance[report.status]}`}
      >
        <p className="text-xs font-bold tracking-[0.12em] uppercase">
          {copy.label}
        </p>
        <div>
          <h3 className="font-serif text-2xl tracking-[-0.025em]">
            {copy.title}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-6">
            {copy.description}
          </p>
          {report.status === "available" ? (
            <ReadableReportContent content={report.content} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReadableReportContent({ content }: { content: string }) {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="mt-6 grid max-w-4xl gap-6 border-t border-current/20 pt-5">
      {blocks.map((block, index) => {
        const fields = parseReportFields(block);
        if (fields !== null) {
          return (
            <dl
              key={index}
              className="grid gap-x-8 sm:grid-cols-2"
            >
              {fields.map((field, fieldIndex) => (
                <div
                  key={`${field.label}:${fieldIndex}`}
                  className="border-t border-current/20 py-4 first:border-t-0 sm:first:border-t"
                >
                  <dt className="text-xs font-bold tracking-[0.1em] uppercase">
                    {field.label}
                  </dt>
                  <dd className="mt-1 break-words text-base leading-6">
                    {formatReportValue(field.value)}
                  </dd>
                </div>
              ))}
            </dl>
          );
        }

        return (
          <p
            key={index}
            className={
              index === 0
                ? "max-w-[65ch] font-serif text-xl leading-8 tracking-[-0.015em]"
                : "max-w-[65ch] whitespace-pre-wrap text-base leading-7"
            }
          >
            {block}
          </p>
        );
      })}
    </div>
  );
}

function formatReportValue(value: string): string {
  return /^[\p{L}\p{N}]+(?:_[\p{L}\p{N}]+)+$/u.test(value)
    ? value.replace(/_/g, " ")
    : value;
}

function parseReportFields(block: string): readonly ReportField[] | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const fields = lines.map((line): ReportField | null => {
    const separator = line.indexOf(":");
    if (separator <= 0 || separator > 80) {
      return null;
    }

    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    return label.length === 0 || value.length === 0
      ? null
      : { label, value };
  });

  return fields.length > 0 && fields.every((field) => field !== null)
    ? fields
    : null;
}
