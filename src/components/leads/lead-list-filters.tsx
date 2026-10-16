"use client";

import { useRef, useState, type FormEvent } from "react";
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

const APPROVED_PRIORITIES = ["B", "C", "D", "E", "R"] as const;
const APPROVED_UF_SET: ReadonlySet<string> = new Set(BRAZILIAN_UFS);
const APPROVED_PRIORITY_SET: ReadonlySet<string> = new Set(
  APPROVED_PRIORITIES,
);

type FilterKey = "cnpj" | "uf" | "priority";

interface FilterDraft {
  source: string;
  cnpj: string;
  uf: string;
  priority: string;
  cnpjError: string | null;
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

function getFilterDraft(source: string): FilterDraft {
  const params = new URLSearchParams(source);
  const uf = params.get("uf");
  const priority = params.get("priority");

  return {
    source,
    cnpj: getCnpjControlValue(params.get("cnpj")),
    uf: uf !== null && APPROVED_UF_SET.has(uf) ? uf : "",
    priority:
      priority !== null && APPROVED_PRIORITY_SET.has(priority) ? priority : "",
    cnpjError: null,
  };
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
  const source = searchParams.toString();
  const [draft, setDraft] = useState<FilterDraft>(() => getFilterDraft(source));
  const cnpjInputRef = useRef<HTMLInputElement>(null);

  if (draft.source !== source) {
    setDraft(getFilterDraft(source));
  }

  function navigate(
    update: (params: URLSearchParams) => void,
  ): void {
    const params = getApprovedParams(new URLSearchParams(searchParams));
    update(params);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const cnpj = draft.cnpj.trim();
    const result = cnpj === "" ? null : cnpjSchema.safeParse(cnpj);

    if (result !== null && !result.success) {
      setDraft((current) => ({
        ...current,
        cnpjError: "Informe um CNPJ completo com 14 dígitos.",
      }));
      cnpjInputRef.current?.focus();
      return;
    }

    setDraft((current) => ({ ...current, cnpjError: null }));
    navigate((params) => {
      if (result === null) params.delete("cnpj");
      else params.set("cnpj", result.data);

      if (draft.uf === "") params.delete("uf");
      else params.set("uf", draft.uf);

      if (draft.priority === "") params.delete("priority");
      else params.set("priority", draft.priority);
    });
  }

  function applyPriorityShortcut(value: string): void {
    navigate((params) => {
      if (value === "") {
        params.delete("priority");
        return;
      }

      params.set("priority", value);
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
  const selectedPriority =
    currentPriority !== null && APPROVED_PRIORITY_SET.has(currentPriority)
      ? currentPriority
      : "";
  const appliedDraft = getFilterDraft(source);
  const hasUnappliedFilters =
    (getNormalizedCnpj(draft.cnpj.trim()) ?? draft.cnpj.trim()) !==
      (getNormalizedCnpj(appliedDraft.cnpj) ?? "") ||
    draft.uf !== appliedDraft.uf ||
    draft.priority !== appliedDraft.priority;

  return (
    <section
      aria-labelledby="lead-filter-heading"
      className="border-y border-[oklch(82%_0.025_82)] py-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="lead-filter-heading"
            className="text-lg font-semibold tracking-[-0.02em]"
          >
            Refinar resultados
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Filtre por CNPJ, estado ou prioridade.
        </p>
      </div>

      <div role="group" aria-label="Atalhos de revisão" className="mt-3 flex flex-wrap gap-2">
        {[
          { value: "B", label: "Ver prioridade B" },
          { value: "C", label: "Ver prioridade C" },
          { value: "R", label: "Ver prioridade R" },
          { value: "", label: "Todas as prioridades" },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={selectedPriority === value}
            className={`ui-action ${selectedPriority === value ? "ui-action--primary" : "ui-action--secondary"}`}
            onClick={() => applyPriorityShortcut(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        A prioridade orienta a revisão; confira a recomendação antes de decidir.
      </p>

      <form
        onSubmit={handleFilterSubmit}
        aria-label="Filtros de empresas"
        className="mt-4"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(18rem,1.5fr)_minmax(8rem,0.65fr)_minmax(10rem,0.8fr)] lg:items-start">
          <div>
            <label
              htmlFor="lead-filter-cnpj"
              className="text-sm font-bold text-[oklch(29%_0.04_252)]"
            >
              CNPJ exato
            </label>
            <div className="mt-2 flex">
              <input
                ref={cnpjInputRef}
                id="lead-filter-cnpj"
                name="cnpj"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft.cnpj}
                aria-invalid={draft.cnpjError === null ? undefined : true}
                aria-describedby={
                  draft.cnpjError === null ? "lead-filter-cnpj-hint" : "lead-filter-cnpj-error"
                }
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    cnpj: event.target.value,
                    cnpjError: null,
                  }));
                }}
                className="min-h-12 min-w-0 flex-1 border border-[oklch(70%_0.035_82)] bg-[oklch(99%_0.006_82)] px-4 text-base outline-none transition-colors placeholder:text-[oklch(60%_0.025_252)] focus-visible:border-[oklch(45%_0.105_174)] focus-visible:ring-2 focus-visible:ring-[oklch(45%_0.105_174/0.24)] motion-reduce:transition-none"
                placeholder="00.000.000/0000-00"
              />
            </div>
            {draft.cnpjError === null ? (
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
                {draft.cnpjError}
              </p>
            )}
          </div>

          <FilterSelect
            id="lead-filter-uf"
            label="Estado (UF)"
            value={draft.uf}
            onChange={(value) => setDraft((current) => ({ ...current, uf: value }))}
          >
            <option value="">Todos os estados</option>
            {BRAZILIAN_UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            id="lead-filter-priority"
            label="Prioridade"
            value={draft.priority}
            onChange={(value) => setDraft((current) => ({ ...current, priority: value }))}
          >
            <option value="">Todas as prioridades</option>
            {APPROVED_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {getPriorityLabel(priority)}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
            {hasUnappliedFilters
              ? "Há filtros ainda não aplicados. A lista mantém os critérios anteriores."
              : "Escolha os filtros e clique em Aplicar filtros, ou pressione Enter."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {hasUnappliedFilters ? (
              <button
                type="button"
                className="ui-action ui-action--quiet"
                onClick={() => {
                  setDraft(getFilterDraft(source));
                  cnpjInputRef.current?.focus();
                }}
              >
                Descartar alterações dos filtros
              </button>
            ) : null}
            <button type="submit" className="ui-action ui-action--primary">
              Aplicar filtros
            </button>
          </div>
        </div>
      </form>

      {hasActiveFilters ? (
        <div
          role="region"
          aria-label="Filtros ativos"
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-[oklch(88%_0.02_82)] pt-3"
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
              label={`Estado: ${
                currentUf !== null && APPROVED_UF_SET.has(currentUf)
                  ? currentUf
                  : UNKNOWN_DOMAIN_LABEL
              }`}
              removeLabel="Remover filtro Estado"
              onRemove={() => clearFilter("uf")}
            />
          ) : null}

          {hasPriorityFilter ? (
            <ActiveFilter
              label={getPriorityLabel(currentPriority)}
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
      <div className="relative mt-2">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-12 w-full appearance-none border border-[oklch(70%_0.035_82)] bg-[oklch(99%_0.006_82)] pr-10 pl-4 text-base outline-none transition-colors focus-visible:border-[oklch(45%_0.105_174)] focus-visible:ring-2 focus-visible:ring-[oklch(45%_0.105_174/0.24)] motion-reduce:transition-none"
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-[oklch(43%_0.03_252)]"
        >
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
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
