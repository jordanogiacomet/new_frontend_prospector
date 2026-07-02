import type { LeadDetail } from "../../types/leads";

type StrategicReportContract = LeadDetail["strategicReport"];

type StrategicReportDisplayState =
  | StrategicReportContract
  | { status: "missing" }
  | { status: "unavailable" };

interface StrategicReportProps {
  report: StrategicReportDisplayState;
}

const stateAppearance = {
  omitted_by_policy:
    "border-[oklch(77%_0.07_77)] bg-[oklch(96%_0.025_77)] text-[oklch(36%_0.065_62)]",
  missing:
    "border-[oklch(79%_0.02_252)] bg-[oklch(96%_0.008_252)] text-[oklch(41%_0.025_252)]",
  unavailable:
    "border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] text-[oklch(38%_0.07_32)]",
} as const;

export function StrategicReport({ report }: StrategicReportProps) {
  const copy =
    report.status === "omitted_by_policy"
      ? {
          label: "Retido por política",
          title: "Conteúdo não exibido",
          description:
            "O conteúdo foi retido conforme a política de privacidade vigente. A decisão e os campos aprovados permanecem disponíveis.",
          note: "A proteção técnica contra código malicioso não substitui a aprovação de privacidade.",
        }
      : report.status === "missing"
        ? {
            label: "Ausente",
            title: "Relatório ainda não disponível",
            description:
              "Nenhum relatório foi associado a esta análise.",
            note: null,
          }
        : {
            label: "Indisponível",
            title: "Não foi possível consultar o relatório",
            description:
              "A consulta ao relatório não pôde ser concluída. Tente novamente mais tarde.",
            note: null,
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
        role={report.status === "unavailable" ? "alert" : undefined}
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
          {copy.note === null ? null : (
            <p className="mt-3 max-w-2xl border-t border-current/20 pt-3 text-xs leading-5">
              {copy.note}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
