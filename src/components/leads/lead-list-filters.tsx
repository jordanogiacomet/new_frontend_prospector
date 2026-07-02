"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { formatCnpj } from "../../lib/formatters";
import {
  UNKNOWN_DOMAIN_LABEL,
  getPriorityLabel,
} from "../../lib/lead-labels";
import { cnpjSchema } from "../../lib/validators/lead-query";

const BRAZILIAN_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const APPROVED_PRIORITIES = ["B", "C", "E", "R"] as const;
const APPROVED_UF_SET: ReadonlySet<string> = new Set(BRAZILIAN_UFS);
const APPROVED_PRIORITY_SET: ReadonlySet<string> = new Set(
  APPROVED_PRIORITIES,
);

type FilterKey = "cnpj" | "uf" | "priority";

interface CnpjDraft {
  source: string | null;
  value: string;
}

interface CnpjValidationError {
  message: string;
  source: string | null;
}

function getNormalizedCnpj(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const result = cnpjSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function getCnpjControlValue(value: string | null): string {
  const normalizedCnpj = getNormalizedCnpj(value);
  return normalizedCnpj === undefined ? "" : formatCnpj(normalizedCnpj);
}

function getApprovedParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  const pageSize = searchParams.get("pageSize");
  const cnpj = getNormalizedCnpj(searchParams.get("cnpj"));
  const uf = searchParams.get("uf");
  const priority = searchParams.get("priority");

  params.set("page", "1");

  if (
    pageSize !== null &&
    /^\d+$/.test(pageSize) &&
    Number(pageSize) >= 1 &&
    Number(pageSize) <= 20
  ) {
    params.set("pageSize", pageSize);
  }

  if (cnpj !== undefined) {
    params.set("cnpj", cnpj);
  }

  if (uf !== null && APPROVED_UF_SET.has(uf)) {
    params.set("uf", uf);
  }

  if (priority !== null && APPROVED_PRIORITY_SET.has(priority)) {
    params.set("priority", priority);
  }

  return params;
}

export function LeadListFilters() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCnpj = searchParams.get("cnpj");
  const currentUf = searchParams.get("uf");
  const currentPriority = searchParams.get("priority");
  const [cnpjDraft, setCnpjDraft] = useState<CnpjDraft>(() => ({
    source: currentCnpj,
    value: getCnpjControlValue(currentCnpj),
  }));
  const [cnpjValidationError, setCnpjValidationError] =
    useState<CnpjValidationError | null>(null);
  const cnpjInput =
    cnpjDraft.source === currentCnpj
      ? cnpjDraft.value
      : getCnpjControlValue(currentCnpj);
  const cnpjError =
    cnpjValidationError?.source === currentCnpj
      ? cnpjValidationError.message
      : null;

  function navigate(
    update: (params: URLSearchParams) => void,
  ): void {
    const params = getApprovedParams(new URLSearchParams(searchParams));
    update(params);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleCnpjSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (cnpjInput.trim() === "") {
      setCnpjValidationError(null);
      navigate((params) => params.delete("cnpj"));
      return;
    }

    const result = cnpjSchema.safeParse(cnpjInput.trim());

    if (!result.success) {
      setCnpjValidationError({
        message: "Informe um CNPJ completo com 14 dígitos.",
        source: currentCnpj,
      });
      return;
    }

    setCnpjValidationError(null);
    navigate((params) => params.set("cnpj", result.data));
  }

  function handleExactFilterChange(
    key: Exclude<FilterKey, "cnpj">,
    value: string,
  ): void {
    navigate((params) => {
      if (value === "") {
        params.delete(key);
        return;
      }

      params.set(key, value);
    });
  }

  function clearFilter(key: FilterKey): void {
    navigate((params) => params.delete(key));
  }

  function clearAllFilters(): void {
    navigate((params) => {
      params.delete("cnpj");
      params.delete("uf");
      params.delete("priority");
    });
  }

  const normalizedCnpj = getNormalizedCnpj(currentCnpj);
  const hasCnpjFilter = currentCnpj !== null;
  const hasUfFilter = currentUf !== null;
  const hasPriorityFilter = currentPriority !== null;
  const hasActiveFilters =
    hasCnpjFilter || hasUfFilter || hasPriorityFilter;
  const selectedUf =
    currentUf !== null && APPROVED_UF_SET.has(currentUf) ? currentUf : "";
  const selectedPriority =
    currentPriority !== null && APPROVED_PRIORITY_SET.has(currentPriority)
      ? currentPriority
      : "";

  return (
    <section
      aria-labelledby="lead-filter-heading"
      className="border-y border-[oklch(82%_0.025_82)] py-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            Consulta exata
          </p>
          <h2
            id="lead-filter-heading"
            className="mt-1 font-serif text-2xl tracking-[-0.025em]"
          >
            Refinar resultados
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Use um identificador completo ou uma única classificação.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(18rem,1.5fr)_minmax(8rem,0.65fr)_minmax(10rem,0.8fr)] lg:items-start">
        <form onSubmit={handleCnpjSubmit}>
          <label
            htmlFor="lead-filter-cnpj"
            className="text-sm font-bold text-[oklch(29%_0.04_252)]"
          >
            CNPJ exato
          </label>
          <div className="mt-2 flex">
            <input
              id="lead-filter-cnpj"
              name="cnpj"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cnpjInput}
              aria-invalid={cnpjError === null ? undefined : true}
              aria-describedby={
                cnpjError === null ? "lead-filter-cnpj-hint" : "lead-filter-cnpj-error"
              }
              onChange={(event) => {
                setCnpjDraft({
                  source: currentCnpj,
                  value: event.target.value,
                });
                setCnpjValidationError(null);
              }}
              className="min-h-12 min-w-0 flex-1 border border-r-0 border-[oklch(70%_0.035_82)] bg-[oklch(99%_0.006_82)] px-4 text-base outline-none transition-colors placeholder:text-[oklch(60%_0.025_252)] focus-visible:border-[oklch(45%_0.105_174)] focus-visible:ring-2 focus-visible:ring-[oklch(45%_0.105_174/0.24)] motion-reduce:transition-none"
              placeholder="00.000.000/0000-00"
            />
            <button
              type="submit"
              className="min-h-12 shrink-0 bg-[oklch(24%_0.045_252)] px-5 text-sm font-bold text-[oklch(97%_0.012_82)] transition-colors hover:bg-[oklch(31%_0.055_252)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)] active:bg-[oklch(19%_0.04_252)] motion-reduce:transition-none"
            >
              Aplicar CNPJ
            </button>
          </div>
          {cnpjError === null ? (
            <p
              id="lead-filter-cnpj-hint"
              className="mt-2 text-xs leading-5 text-[oklch(48%_0.025_252)]"
            >
              Informe os 14 dígitos, com ou sem pontuação.
            </p>
          ) : (
            <p
              id="lead-filter-cnpj-error"
              role="alert"
              className="mt-2 text-xs font-semibold leading-5 text-[oklch(48%_0.16_28)]"
            >
              {cnpjError}
            </p>
          )}
        </form>

        <FilterSelect
          id="lead-filter-uf"
          label="UF"
          value={selectedUf}
          onChange={(value) => handleExactFilterChange("uf", value)}
        >
          <option value="">Todas</option>
          {BRAZILIAN_UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect
          id="lead-filter-priority"
          label="Prioridade"
          value={selectedPriority}
          onChange={(value) => handleExactFilterChange("priority", value)}
        >
          <option value="">Todas</option>
          {APPROVED_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {getPriorityLabel(priority)}
            </option>
          ))}
        </FilterSelect>
      </div>

      {hasActiveFilters ? (
        <div
          role="region"
          aria-label="Filtros ativos"
          className="mt-6 flex flex-wrap items-center gap-2 border-t border-[oklch(88%_0.02_82)] pt-5"
        >
          <span className="mr-1 text-xs font-bold tracking-[0.12em] text-[oklch(48%_0.025_252)] uppercase">
            Ativos
          </span>

          {hasCnpjFilter ? (
            <ActiveFilter
              label={`CNPJ: ${
                normalizedCnpj === undefined
                  ? UNKNOWN_DOMAIN_LABEL
                  : formatCnpj(normalizedCnpj)
              }`}
              removeLabel="Remover filtro CNPJ"
              onRemove={() => clearFilter("cnpj")}
            />
          ) : null}

          {hasUfFilter ? (
            <ActiveFilter
              label={`UF: ${
                currentUf !== null && APPROVED_UF_SET.has(currentUf)
                  ? currentUf
                  : UNKNOWN_DOMAIN_LABEL
              }`}
              removeLabel="Remover filtro UF"
              onRemove={() => clearFilter("uf")}
            />
          ) : null}

          {hasPriorityFilter ? (
            <ActiveFilter
              label={`Prioridade: ${getPriorityLabel(currentPriority)}`}
              removeLabel="Remover filtro Prioridade"
              onRemove={() => clearFilter("priority")}
            />
          ) : null}

          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-1 min-h-11 border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(36%_0.08_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)] active:text-[oklch(18%_0.04_252)] motion-reduce:transition-none"
          >
            Limpar filtros
          </button>
        </div>
      ) : null}
    </section>
  );
}

interface FilterSelectProps {
  children: React.ReactNode;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}

function FilterSelect({
  children,
  id,
  label,
  onChange,
  value,
}: FilterSelectProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-bold text-[oklch(29%_0.04_252)]"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full appearance-none border border-[oklch(70%_0.035_82)] bg-[oklch(99%_0.006_82)] px-4 text-base outline-none transition-colors focus-visible:border-[oklch(45%_0.105_174)] focus-visible:ring-2 focus-visible:ring-[oklch(45%_0.105_174/0.24)] motion-reduce:transition-none"
      >
        {children}
      </select>
    </div>
  );
}

interface ActiveFilterProps {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}

function ActiveFilter({
  label,
  onRemove,
  removeLabel,
}: ActiveFilterProps) {
  return (
    <span className="inline-flex min-h-11 items-center border border-[oklch(72%_0.04_174)] bg-[oklch(94%_0.025_174)] pl-3 text-sm font-semibold text-[oklch(30%_0.065_174)]">
      {label}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="ml-2 grid min-h-11 min-w-11 place-items-center border-l border-[oklch(78%_0.04_174)] text-lg leading-none transition-colors hover:bg-[oklch(88%_0.04_174)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(36%_0.08_174)] active:bg-[oklch(83%_0.05_174)] motion-reduce:transition-none"
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}
