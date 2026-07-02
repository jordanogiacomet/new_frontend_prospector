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
    expect(screen.getByRole("combobox", { name: "UF" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Prioridade" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/empresa|cidade|ação|confiança/i)).toBeNull();
    expect(
      screen.queryByLabelText(/pontuação|data|ordenação|direção/i),
    ).toBeNull();
  });

  it("shows known URL filters as current controls and active business labels", () => {
    renderFilters(
      "page=3&pageSize=10&cnpj=12345678000195&uf=SP&priority=B",
    );

    expect(screen.getByRole("textbox", { name: "CNPJ exato" })).toHaveValue(
      "12.345.678/0001-95",
    );
    expect(screen.getByRole("combobox", { name: "UF" })).toHaveValue("SP");
    expect(screen.getByRole("combobox", { name: "Prioridade" })).toHaveValue(
      "B",
    );

    const activeFilters = screen.getByRole("region", {
      name: "Filtros ativos",
    });
    expect(activeFilters).toHaveTextContent("CNPJ: 12.345.678/0001-95");
    expect(activeFilters).toHaveTextContent("UF: SP");
    expect(activeFilters).toHaveTextContent("Prioridade: Prioridade B");
  });

  it("normalizes an exact formatted CNPJ, resets the page, and strips unsupported parameters", () => {
    renderFilters(
      "page=8&pageSize=10&uf=SP&priority=B&q=empresa&sort=score&direction=asc",
    );

    fireEvent.change(screen.getByRole("textbox", { name: "CNPJ exato" }), {
      target: { value: "12.345.678/0001-95" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Aplicar CNPJ" }).closest("form")!,
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
    fireEvent.click(screen.getByRole("button", { name: "Aplicar CNPJ" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Informe um CNPJ completo com 14 dígitos.",
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("applies one exact UF and resets the page", () => {
    renderFilters("page=5&pageSize=20&priority=C");

    fireEvent.change(screen.getByRole("combobox", { name: "UF" }), {
      target: { value: "RJ" },
    });

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      pageSize: "20",
      uf: "RJ",
      priority: "C",
    });
  });

  it("applies one exact approved priority and resets the page", () => {
    renderFilters("page=5&uf=MG");

    fireEvent.change(screen.getByRole("combobox", { name: "Prioridade" }), {
      target: { value: "R" },
    });

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      uf: "MG",
      priority: "R",
    });
  });

  it("clears a select filter while preserving the other approved criteria", () => {
    renderFilters("page=2&pageSize=10&uf=BA&priority=E");

    fireEvent.change(screen.getByRole("combobox", { name: "UF" }), {
      target: { value: "" },
    });

    expect(Object.fromEntries(replacedSearchParams())).toEqual({
      page: "1",
      pageSize: "10",
      priority: "E",
    });
  });

  it("clears one active filter from its visible removal control", () => {
    renderFilters("page=6&cnpj=12345678000195&uf=SC&priority=C");

    fireEvent.click(
      screen.getByRole("button", { name: "Remover filtro UF" }),
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

    expect(screen.getByRole("combobox", { name: "UF" })).toHaveValue("");
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
});
