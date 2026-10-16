import Link from "next/link";

import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
  formatCnpj,
} from "../../lib/formatters";
import {
  UNKNOWN_DOMAIN_LABEL,
  formatDecisionReason,
  getLeadActionLabel,
} from "../../lib/lead-labels";
import { appendReturnTo } from "../../lib/navigation-return";
import type { OutsideAnalysisCompany } from "../../types/leads";

interface OutsideAnalysisPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface OutsideAnalysisTableProps {
  companies: readonly OutsideAnalysisCompany[];
  pagination: OutsideAnalysisPagination;
}

function formatLocation(city: string | null, uf: string | null): string {
  if (city && uf) {
    return `${city} / ${uf}`;
  }

  return city ?? uf ?? UNAVAILABLE_LABEL;
}

function buildPageHref(targetPage: number, pageSize: number): string {
  const params = new URLSearchParams({
    page: String(targetPage),
    pageSize: String(pageSize),
  });

  return `/leads/outside-analysis?${params.toString()}`;
}

export function OutsideAnalysisTable({
  companies,
  pagination,
}: OutsideAnalysisTableProps) {
  const returnTo = buildPageHref(pagination.page, pagination.pageSize);
  const resultLabel =
    pagination.total === 1
      ? "1 resultado"
      : `${pagination.total} resultados`;

  return (
    <section aria-label="Resultados da consulta">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[oklch(82%_0.025_82)] pb-4">
        <h2 className="font-serif text-2xl tracking-[-0.025em]">
          Empresas com decisão do CRM
        </h2>
        <p className="text-sm font-semibold text-[oklch(43%_0.03_252)]">
          {resultLabel}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          aria-label="Empresas fora da análise"
          className="responsive-data-table w-full border-collapse text-left md:min-w-[76rem]"
        >
          <thead>
            <tr className="border-b border-[oklch(72%_0.035_82)]">
              {[
                "Empresa",
                "CNPJ",
                "Cidade / UF",
                "Setor",
                "Decisão do CRM",
                "Motivo registrado",
                "Data da decisão",
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
            {companies.map((company) => {
              const actionLabel = getLeadActionLabel(
                company.decidedAction,
              );
              const actionIsUnavailable =
                actionLabel === UNAVAILABLE_LABEL ||
                actionLabel === UNKNOWN_DOMAIN_LABEL;

              return (
                <tr
                  key={company.cnpj}
                  className="border-b border-[oklch(88%_0.02_82)] align-top transition-colors hover:bg-[oklch(95%_0.025_82)] motion-reduce:transition-none"
                >
                  <td data-label="Empresa" className="max-w-64 py-5 pr-3">
                    <p className="font-bold leading-5">
                      {company.companyName ?? UNAVAILABLE_LABEL}
                    </p>
                    <Link
                      href={appendReturnTo(
                        `/leads/outside-analysis/${company.cnpj}`,
                        returnTo,
                      )}
                      className="mt-3 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-0.5 text-xs font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
                    >
                      Ver decisão do CRM
                      <span aria-hidden="true" className="ml-1">
                        →
                      </span>
                    </Link>
                  </td>
                  <td data-label="CNPJ" className="px-3 py-5 text-sm whitespace-nowrap">
                    {formatCnpj(company.cnpj)}
                  </td>
                  <td data-label="Cidade / UF" className="max-w-48 px-3 py-5 text-sm leading-5">
                    {formatLocation(company.city, company.uf)}
                  </td>
                  <td data-label="Setor" className="max-w-56 px-3 py-5 text-sm leading-5">
                    {company.sector ?? UNAVAILABLE_LABEL}
                  </td>
                  <td data-label="Decisão do CRM" className="max-w-48 px-3 py-5">
                    <span
                      className={`inline-flex min-h-7 items-center border px-2.5 py-1 text-xs font-bold leading-4 ${
                        actionIsUnavailable
                          ? "border-[oklch(79%_0.02_252)] bg-[oklch(95%_0.01_252)] text-[oklch(43%_0.025_252)]"
                          : "border-[oklch(72%_0.07_77)] bg-[oklch(95%_0.035_77)] text-[oklch(36%_0.075_62)]"
                      }`}
                    >
                      {actionLabel}
                    </span>
                  </td>
                  <td data-label="Motivo" className="min-w-80 max-w-[30rem] px-3 py-5 text-sm leading-6 whitespace-pre-line break-words">
                    {formatDecisionReason(company.decisionReason)}
                  </td>
                  <td data-label="Data da decisão" className="px-3 py-5 text-sm whitespace-nowrap">
                    {formatBrazilianDate(company.decidedAt)}
                  </td>
                  <td data-label="Importação" className="py-5 pl-3 text-sm last:pr-0">
                    <span className="block max-w-48 break-all">
                      {company.import_batch_id ?? UNAVAILABLE_LABEL}
                    </span>
                    {company.source_row === null ? null : (
                      <span className="mt-1 block text-xs text-[oklch(48%_0.025_252)]">
                        Linha {company.source_row}
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
