import Link from "next/link";

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
} from "../../lib/lead-labels";
import type { LeadSummary } from "../../types/leads";

type ApprovedPriority = "B" | "C" | "E" | "R";

interface LeadTableFilters {
  cnpj?: string;
  uf?: string;
  priority?: ApprovedPriority;
}

interface LeadTablePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface LeadTableProps {
  leads: readonly LeadSummary[];
  pagination: LeadTablePagination;
  filters?: LeadTableFilters;
}

interface BadgeProps {
  label: string;
  warning?: boolean;
}

function formatLocation(city: string | null, uf: string | null): string {
  if (city && uf) {
    return `${city} / ${uf}`;
  }

  return city ?? uf ?? UNAVAILABLE_LABEL;
}

function isNeutralLabel(label: string): boolean {
  return label === UNAVAILABLE_LABEL || label === UNKNOWN_DOMAIN_LABEL;
}

function Badge({ label, warning = false }: BadgeProps) {
  const appearance = warning
    ? "border-[oklch(69%_0.11_77)] bg-[oklch(94%_0.04_77)] text-[oklch(35%_0.08_62)]"
    : isNeutralLabel(label)
      ? "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]"
      : "border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] text-[oklch(32%_0.09_174)]";

  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${appearance}`}
    >
      {label}
    </span>
  );
}

function buildPageHref(
  targetPage: number,
  pageSize: number,
  filters: LeadTableFilters,
): string {
  const params = new URLSearchParams({
    page: String(targetPage),
    pageSize: String(pageSize),
  });

  if (filters.cnpj) {
    params.set("cnpj", filters.cnpj);
  }

  if (filters.uf) {
    params.set("uf", filters.uf);
  }

  if (filters.priority) {
    params.set("priority", filters.priority);
  }

  return `/leads?${params.toString()}`;
}

export function LeadTable({
  leads,
  pagination,
  filters = {},
}: LeadTableProps) {
  const resultLabel =
    pagination.total === 1
      ? "1 resultado"
      : `${pagination.total} resultados`;

  return (
    <section aria-label="Resultados da consulta">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[oklch(82%_0.025_82)] pb-4">
        <h2 className="font-serif text-2xl tracking-[-0.025em]">
          Empresas analisadas
        </h2>
        <p className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
          {resultLabel}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          aria-label="Resultados de leads"
          className="w-full min-w-[78rem] border-collapse text-left"
        >
          <thead>
            <tr className="border-b border-[oklch(72%_0.035_82)]">
              {[
                "Empresa",
                "CNPJ",
                "Cidade / UF",
                "Setor",
                "Pontuação",
                "Prioridade",
                "Ação recomendada",
                "Status de confiança",
                "Última análise",
                "Lote de importação",
              ].map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-4 text-xs font-bold tracking-[0.09em] text-[oklch(43%_0.03_252)] uppercase first:pl-0 last:pr-0"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const formattedCnpj = formatCnpj(lead.cnpj);
              const priorityLabel = getPriorityLabel(lead.priority);
              const actionLabel = getLeadActionLabel(
                lead.recommendedAction,
              );
              const trustLabel = getTrustStatusLabel(lead.trustStatus);
              const detailLabel =
                lead.companyName ?? formattedCnpj;

              return (
                <tr
                  key={lead.decision_id}
                  className="border-b border-[oklch(88%_0.02_82)] align-top transition-colors hover:bg-[oklch(95%_0.025_82)] motion-reduce:transition-none"
                >
                  <td className="max-w-64 py-5 pr-3">
                    <p className="font-bold leading-5">
                      {lead.companyName ?? UNAVAILABLE_LABEL}
                    </p>
                    <Link
                      href={`/leads/${encodeURIComponent(lead.cnpj)}?leadRunId=${encodeURIComponent(lead.lead_run_id)}`}
                      aria-label={`Abrir análise de ${detailLabel}`}
                      className="mt-2 inline-flex min-h-8 items-center border-b border-[oklch(45%_0.105_174)] text-xs font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
                    >
                      Abrir análise
                      <span aria-hidden="true" className="ml-1">
                        →
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-5 text-sm whitespace-nowrap">
                    {formattedCnpj}
                  </td>
                  <td className="max-w-48 px-3 py-5 text-sm leading-5">
                    {formatLocation(lead.city, lead.uf)}
                  </td>
                  <td className="max-w-56 px-3 py-5 text-sm leading-5">
                    {lead.sector ?? UNAVAILABLE_LABEL}
                  </td>
                  <td className="px-3 py-5">
                    <span className="font-serif text-2xl leading-none">
                      {formatScore(lead.score)}
                    </span>
                  </td>
                  <td className="px-3 py-5">
                    <Badge label={priorityLabel} />
                  </td>
                  <td className="max-w-48 px-3 py-5">
                    <Badge label={actionLabel} />
                  </td>
                  <td className="max-w-48 px-3 py-5">
                    <div className="flex flex-col items-start gap-2">
                      <Badge label={trustLabel} />
                      {lead.confidenceIndicator === "low" ? (
                        <Badge label="Baixa confiança" warning />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-5 text-sm whitespace-nowrap">
                    {formatBrazilianDate(lead.lastAnalysisAt)}
                  </td>
                  <td className="py-5 pl-3 text-sm last:pr-0">
                    <span className="block max-w-48 break-all">
                      {lead.import_batch_id ?? UNAVAILABLE_LABEL}
                    </span>
                    {lead.source_row === null ? null : (
                      <span className="mt-1 block text-xs text-[oklch(48%_0.025_252)]">
                        Linha {lead.source_row}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="Paginação dos resultados"
        className="mt-6 flex flex-wrap items-center justify-between gap-4"
      >
        {pagination.page > 1 ? (
          <Link
            href={buildPageHref(
              pagination.page - 1,
              pagination.pageSize,
              filters,
            )}
            aria-label="Página anterior"
            className="inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
          >
            ← Anterior
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-[oklch(63%_0.02_252)]"
          >
            Anterior
          </span>
        )}

        <span className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
          Página {pagination.page} de {pagination.totalPages}
        </span>

        {pagination.page < pagination.totalPages ? (
          <Link
            href={buildPageHref(
              pagination.page + 1,
              pagination.pageSize,
              filters,
            )}
            aria-label="Próxima página"
            className="inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
          >
            Próxima →
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-[oklch(63%_0.02_252)]"
          >
            Próxima
          </span>
        )}
      </nav>
    </section>
  );
}
