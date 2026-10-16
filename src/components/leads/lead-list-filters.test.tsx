import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigation, replaceMock } = vi.hoisted(() => ({
  navigation: { query: "" },
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

import { LeadListFilters } from "./lead-list-filters";

function renderFilters(query = "") {
  navigation.query = query;
  return render(<LeadListFilters />);
}

function replacedSearchParams(): URLSearchParams {
  expect(replaceMock).toHaveBeenCalledTimes(1);
  const destination = replaceMock.mock.calls[0][0] as string;
  return new URL(destination, "http://localhost").searchParams;
}

describe("lead list filters", () => {
  beforeEach(() => {
    navigation.query = "";
    replaceMock.mockReset();
  });

  it("renders only the exact filters approved for the lead list", () => {
    renderFilters();

    expect(
      screen.getByRole("textbox", { name: "CNPJ exato" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Prioridade" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/empresa|cidade|ação|confiança/i, {
      selector: "input, select",
    })).toBeNull();
    expect(
      screen.queryByLabelText(/pontuação|data|ordenação|direção/i, {
        selector: "input, select",
      }),
    ).toBeNull();
  });

  it("shows known URL filters as current controls and active business labels", () => {
    renderFilters(
      "page=3&pageSize=10&cnpj=12345678000195&uf=SP&priority=B",
    );

    expect(screen.getByRole("textbox", { name: "CNPJ exato" })).toHaveValue(
      "12.345.678/0001-95",
    );
    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toHaveValue("SP");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue(
      "B",
    );

    const activeFilters = screen.getByRole("region", {
      name: "Filtros ativos",
    });
    expect(activeFilters).toHaveTextContent("CNPJ: 12.345.678/0001-95");
    expect(activeFilters).toHaveTextContent("Estado: SP");
    expect(activeFilters).toHaveTextContent("Prioridade B");
    expect(activeFilters).not.toHaveTextContent("Prioridade: Prioridade");
  });

  it.each([
    ["Ver prioridade B", "B"],
    ["Ver prioridade C", "C"],
    ["Ver prioridade R", "R"],
  ])("%s keeps the exact company and UF while resetting pagination", (label, priority) => {
    renderFilters("page=4&pageSize=10&cnpj=12345678000195&uf=SP&priority=E&sort=score");

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      pageSize: "10",
      cnpj: "12345678000195",
      uf: "SP",
      priority,
    });
  });

  it("opens all priorities without discarding the company or UF", () => {
    renderFilters("page=3&cnpj=12345678000195&uf=SP&priority=B");

    const shortcuts = screen.getByRole("group", { name: "Atalhos de revisão" });
    expect(within(shortcuts).getByRole("button", { name: "Ver prioridade B" }))
      .toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(shortcuts).getByRole("button", { name: "Todas as prioridades" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      cnpj: "12345678000195",
      uf: "SP",
    });
  });

  it("normalizes an exact formatted CNPJ, resets the page, and strips unsupported parameters", () => {
    renderFilters(
      "page=8&pageSize=10&uf=SP&priority=B&q=empresa&sort=score&direction=asc",
    );

    fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
      target: { value: "12.345.678/0001-95" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Aplicar filtros" }).closest("form")!,
    );

    const params = replacedSearchParams();
    expect(Object.fromEntries(params)).toEqual({
      page: "1",
      pageSize: "10",
      cnpj: "12345678000195",
      uf: "SP",
      priority: "B",
    });
    expect(params.has("q")).toBe(false);
    expect(params.has("sort")).toBe(false);
    expect(params.has("direction")).toBe(false);
  });

  it("rejects a non-exact CNPJ without changing the URL", () => {
    renderFilters("page=4");

    fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
      target: { value: "12.345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Informe um CNPJ completo com 14 dígitos.",
    );
    expect(screen.getByRole("textbox", { name: "CNPJ exato" })).toHaveFocus();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("marks drafts as unapplied and discards them without changing the applied query", () => {
    renderFilters("page=4&cnpj=12345678000195&uf=SP&priority=B");

    const cnpj = screen.getByRole("textbox", { name: "CNPJ exato" });
    fireEvent.change(cnpj, { target: { value: "123" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado (UF)" }), {
      target: { value: "BA" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Prioridade" }), {
      target: { value: "C" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Filtros de empresas" }));

    expect(screen.getByText(/Há filtros ainda não aplicados/)).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("region", { name: "Filtros ativos" })).toHaveTextContent("Estado: SP");
    fireEvent.click(screen.getByRole("button", { name: "Descartar alterações dos filtros" }));

    expect(cnpj).toHaveValue("12.345.678/0001-95");
    expect(cnpj).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toHaveValue("SP");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue("B");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Há filtros ainda não aplicados/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descartar alterações dos filtros" })).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("treats equivalent CNPJ formatting as the applied filter and clears the notice when values match", () => {
    renderFilters("cnpj=12345678000195&uf=SP");

    for (const value of ["12345678000195", " 12345678000195 ", " 12.345.678/0001-95 "]) {
      fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
        target: { value },
      });
      expect(screen.queryByText(/Há filtros ainda não aplicados/)).not.toBeInTheDocument();
    }

    const state = screen.getByRole("combobox", { name: "Estado (UF)" });
    fireEvent.change(state, { target: { value: "BA" } });
    expect(screen.getByText(/Há filtros ainda não aplicados/)).toBeInTheDocument();
    fireEvent.change(state, { target: { value: "SP" } });
    expect(screen.queryByText(/Há filtros ainda não aplicados/)).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("keeps a UF change as a draft until filters are applied", () => {
    renderFilters("page=5&pageSize=20&priority=C");

    fireEvent.change(screen.getByRole("combobox", { name: "Estado (UF)" }), {
      target: { value: "RJ" },
    });

    expect(replaceMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      pageSize: "20",
      uf: "RJ",
      priority: "C",
    });
  });

  it("keeps an approved priority as a draft until filters are applied", () => {
    renderFilters("page=5&uf=MG");

    fireEvent.change(screen.getByRole("combobox", { name: "Prioridade" }), {
      target: { value: "D" },
    });

    expect(replaceMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      uf: "MG",
      priority: "D",
    });
  });

  it("clears a select filter while preserving the other approved criteria", () => {
    renderFilters("page=2&pageSize=10&uf=BA&priority=E");

    fireEvent.change(screen.getByRole("combobox", { name: "Estado (UF)" }), {
      target: { value: "" },
    });

    expect(replaceMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      pageSize: "10",
      priority: "E",
    });
  });

  it("clears one active filter from its visible removal control", () => {
    renderFilters("page=6&cnpj=12345678000195&uf=SC&priority=C");

    fireEvent.click(
      screen.getByRole("button", { name: "Remover filtro Estado" }),
    );

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      cnpj: "12345678000195",
      priority: "C",
    });
  });

  it("clears every active filter but preserves the approved page size", () => {
    renderFilters(
      "page=9&pageSize=10&cnpj=12345678000195&uf=PR&priority=R",
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      pageSize: "10",
    });
  });

  it("renders unknown current URL values neutrally and keeps them clearable", () => {
    renderFilters("page=2&cnpj=invalido&uf=XX&priority=A");

    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue(
      "",
    );

    const activeFilters = screen.getByRole("region", {
      name: "Filtros ativos",
    });
    expect(within(activeFilters).getAllByText(/Não mapeado/)).toHaveLength(3);
    expect(activeFilters).not.toHaveTextContent(/invalido|XX|Prioridade A/);
    expect(
      within(activeFilters).getByRole("button", {
        name: "Remover filtro CNPJ",
      }),
    ).toBeInTheDocument();
  });

  it("applies CNPJ, state, and priority together through the form used by Enter", () => {
    renderFilters("page=5&pageSize=10&uf=SP&priority=B");

    const cnpj = screen.getByRole("textbox", { name: "CNPJ exato" });
    const state = screen.getByRole("combobox", { name: "Estado (UF)" });
    const priority = screen.getByRole("combobox", { name: "Prioridade" });
    const form = screen.getByRole("form", { name: "Filtros de empresas" });

    expect(cnpj.closest("form")).toBe(form);
    expect(state.closest("form")).toBe(form);
    expect(priority.closest("form")).toBe(form);
    expect(screen.getByRole("button", { name: "Aplicar filtros" }))
      .toHaveAttribute("type", "submit");

    fireEvent.change(cnpj, { target: { value: " 12.345.678/0001-95 " } });
    fireEvent.change(state, { target: { value: "MG" } });
    fireEvent.change(priority, { target: { value: "D" } });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Filtros ativos" }))
      .toHaveTextContent("Estado: SP");
    expect(screen.getByRole("button", { name: "Ver prioridade B" }))
      .toHaveAttribute("aria-pressed", "true");

    fireEvent.submit(form);

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      pageSize: "10",
      cnpj: "12345678000195",
      uf: "MG",
      priority: "D",
    });
  });

  it("keeps state and priority drafts when the CNPJ needs correction", () => {
    renderFilters("page=4&uf=SP&priority=B");

    const cnpj = screen.getByRole("textbox", { name: "CNPJ exato" });
    fireEvent.change(cnpj, { target: { value: "12.345" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado (UF)" }), {
      target: { value: "BA" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Prioridade" }), {
      target: { value: "C" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Filtros de empresas" }));

    expect(cnpj).toHaveAttribute("aria-invalid", "true");
    expect(cnpj).toHaveAttribute("aria-describedby", "lead-filter-cnpj-error");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toHaveValue("BA");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue("C");

    fireEvent.change(cnpj, { target: { value: "12345678000195" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.submit(screen.getByRole("form", { name: "Filtros de empresas" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      cnpj: "12345678000195",
      uf: "BA",
      priority: "C",
    });
  });

  it("removes the exact CNPJ when the submitted field is blank", () => {
    renderFilters("page=4&cnpj=12345678000195&uf=SP&priority=B");

    fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
      target: { value: " " },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Filtros de empresas" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      uf: "SP",
      priority: "B",
    });
  });

  it("uses applied company and state filters for a shortcut while drafts are unsaved", () => {
    renderFilters("page=4&cnpj=12345678000195&uf=SP&priority=B");

    fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
      target: { value: "incompleto" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado (UF)" }), {
      target: { value: "BA" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Prioridade" }), {
      target: { value: "D" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ver prioridade C" }));

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      cnpj: "12345678000195",
      uf: "SP",
      priority: "C",
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps unsaved filter drafts through rerenders of the same URL", () => {
    const rendered = renderFilters("page=4&uf=SP&priority=B");

    fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
      target: { value: "12345678000195" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado (UF)" }), {
      target: { value: "BA" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Prioridade" }), {
      target: { value: "C" },
    });
    rendered.rerender(<LeadListFilters />);

    expect(screen.getByRole("textbox", { name: "CNPJ exato" })).toHaveValue("12345678000195");
    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toHaveValue("BA");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue("C");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("restores URL filters on navigation and back without reviving discarded drafts", () => {
    const originalQuery = "page=4&cnpj=12345678000195&uf=SP&priority=B";
    const rendered = renderFilters(originalQuery);

    fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
      target: { value: "incompleto" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado (UF)" }), {
      target: { value: "BA" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Prioridade" }), {
      target: { value: "D" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Filtros de empresas" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    navigation.query = "page=1&uf=MG&priority=C";
    rendered.rerender(<LeadListFilters />);

    expect(screen.getByRole("textbox", { name: "CNPJ exato" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toHaveValue("MG");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue("C");
    expect(screen.queryByRole("alert")).toBeNull();

    navigation.query = originalQuery;
    rendered.rerender(<LeadListFilters />);

    expect(screen.getByRole("textbox", { name: "CNPJ exato" }))
      .toHaveValue("12.345.678/0001-95");
    expect(screen.getByRole("combobox", { name: "Estado (UF)" })).toHaveValue("SP");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue("B");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
