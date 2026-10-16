import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OutsideAnalysisCompany } from "../../types/leads";
import { OutsideAnalysisTable } from "./outside-analysis-table";

const completeCompany: OutsideAnalysisCompany = {
  import_batch_id: "batch-synthetic-outside-001",
  source_row: 9,
  cnpj: "11222333000181",
  companyName: "Empresa Horizonte CRM",
  city: "Recife",
  uf: "PE",
  sector: "Serviços técnicos",
  decidedAction: "NAO_ABORDAR",
  decisionReason:
    "O CRM já registrou uma decisão para esta empresa.\nManter o acompanhamento existente.",
  decidedAt: "2026-07-23T14:30:00.000Z",
};

const pagination = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

function renderTable(
  company: OutsideAnalysisCompany = completeCompany,
  page = pagination,
) {
  return render(
    <OutsideAnalysisTable companies={[company]} pagination={page} />,
  );
}

describe("outside-analysis table", () => {
  it("renders every approved business column", () => {
    renderTable();

    const table = screen.getByRole("table", {
      name: "Empresas fora da análise",
    });

    [
      "Empresa",
      "CNPJ",
      "Cidade / UF",
      "Setor",
      "Decisão do CRM",
      "Motivo registrado",
      "Data da decisão",
      "Lote de importação",
    ].forEach((column) => {
      expect(
        within(table).getByRole("columnheader", { name: column }),
      ).toBeInTheDocument();
    });
  });

  it("formats CNPJ, location, date, action, batch, and source row", () => {
    renderTable();

    const row = screen.getByRole("row", { name: /Empresa Horizonte CRM/ });
    expect(row).toHaveTextContent("11.222.333/0001-81");
    expect(row).toHaveTextContent("Recife / PE");
    expect(row).toHaveTextContent("Não abordar");
    expect(row).toHaveTextContent("23/07/2026");
    expect(row).toHaveTextContent("batch-synthetic-outside-001");
    expect(row).toHaveTextContent("Linha 9");
  });

  it("shows the complete stored reason as plain text", () => {
    renderTable();

    expect(screen.getByText(/O CRM já registrou uma decisão/)).toHaveTextContent(
      "O CRM já registrou uma decisão para esta empresa. Manter o acompanhamento existente.",
    );
    expect(screen.getByText(/O CRM já registrou uma decisão/)).not.toHaveClass(
      "line-clamp-1",
      "line-clamp-2",
      "line-clamp-3",
    );
  });

  it("presents an approved technical reason term in business language", () => {
    renderTable({
      ...completeCompany,
      decisionReason:
        "Histórico CRM encontrado: REENGAJAR_COM_HISTORICO. Revisão humana obrigatória.",
    });

    expect(document.body).toHaveTextContent(
      "Histórico CRM encontrado: Reengajar com histórico. Revisão humana obrigatória.",
    );
    expect(document.body).not.toHaveTextContent(
      "REENGAJAR_COM_HISTORICO",
    );
  });

  it("uses safe fallbacks without exposing an unknown stored action", () => {
    renderTable({
      ...completeCompany,
      companyName: null,
      city: null,
      uf: null,
      sector: null,
      decidedAction: "ACAO_INTERNA_NAO_MAPEADA",
      decisionReason: null,
      import_batch_id: null,
      source_row: null,
    });

    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByText("Não disponível")).toHaveLength(5);
    expect(within(row).getByText("Não mapeado")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("ACAO_INTERNA_NAO_MAPEADA");
  });

  it("does not offer a public analysis link for a CRM decision", () => {
    renderTable();

    expect(
      screen.getByRole("link", { name: "Ver decisão do CRM" }),
    ).toHaveAttribute(
      "href",
      `/leads/outside-analysis/${completeCompany.cnpj}?returnTo=${encodeURIComponent("/leads/outside-analysis?page=1&pageSize=20")}`,
    );
    expect(
      screen.queryByRole("link", { name: /abrir análise/i }),
    ).not.toBeInTheDocument();
  });

  it("preserves page size in pagination links", () => {
    renderTable(completeCompany, {
      page: 2,
      pageSize: 10,
      total: 30,
      totalPages: 3,
    });

    expect(
      screen.getByRole("link", { name: "Página anterior" }),
    ).toHaveAttribute(
      "href",
      "/leads/outside-analysis?page=1&pageSize=10",
    );
    expect(
      screen.getByRole("link", { name: "Próxima página" }),
    ).toHaveAttribute(
      "href",
      "/leads/outside-analysis?page=3&pageSize=10",
    );
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver decisão do CRM" })).toHaveAttribute(
      "href",
      `/leads/outside-analysis/${completeCompany.cnpj}?returnTo=${encodeURIComponent("/leads/outside-analysis?page=2&pageSize=10")}`,
    );
  });

  it("disables pagination at the first and last pages", () => {
    const { rerender } = render(
      <OutsideAnalysisTable
        companies={[completeCompany]}
        pagination={{
          page: 1,
          pageSize: 20,
          total: 40,
          totalPages: 2,
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Página anterior" })).toBeNull();
    expect(screen.getByText("Anterior")).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    rerender(
      <OutsideAnalysisTable
        companies={[completeCompany]}
        pagination={{
          page: 2,
          pageSize: 20,
          total: 40,
          totalPages: 2,
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Próxima página" })).toBeNull();
    expect(screen.getByText("Próxima")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
