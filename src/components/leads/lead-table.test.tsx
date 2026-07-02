import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LeadSummary } from "../../types/leads";

import { LeadTable } from "./lead-table";

const leadRunId = `lr_${"a".repeat(64)}`;

const completeLead: LeadSummary = {
  decision_id: "decision-synthetic-001",
  import_batch_id: "batch-synthetic-001",
  lead_run_id: leadRunId,
  source_row: 7,
  source_hash: "hash-synthetic-001",
  agent_version: "agent-synthetic-1",
  cnpj: "12345678000195",
  companyName: "Empresa Horizonte",
  city: "São Paulo",
  uf: "SP",
  sector: "Serviços de tecnologia",
  score: 87,
  priority: "B",
  recommendedAction: "PROSPECTAR_COM_CAUTELA",
  trustStatus: "Revisão Humana",
  confidenceIndicator: "unknown",
  lastAnalysisAt: "2026-06-15T15:00:00.000Z",
};

const defaultPagination = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

function renderTable(
  lead: LeadSummary = completeLead,
  pagination = defaultPagination,
  filters: {
    cnpj?: string;
    uf?: string;
    priority?: "B" | "C" | "E" | "R";
  } = {},
) {
  return render(
    <LeadTable
      leads={[lead]}
      pagination={pagination}
      filters={filters}
    />,
  );
}

describe("lead results table", () => {
  it("renders every required business column", () => {
    renderTable();

    const table = screen.getByRole("table", {
      name: "Resultados de leads",
    });

    [
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
    ].forEach((column) => {
      expect(
        within(table).getByRole("columnheader", { name: column }),
      ).toBeInTheDocument();
    });
  });

  it("formats CNPJ, score, date, location, and source row for Brazilian display", () => {
    renderTable();

    const row = screen.getByRole("row", { name: /Empresa Horizonte/ });
    expect(row).toHaveTextContent("12.345.678/0001-95");
    expect(row).toHaveTextContent("São Paulo / SP");
    expect(row).toHaveTextContent("87");
    expect(row).toHaveTextContent("15/06/2026");
    expect(row).toHaveTextContent("Linha 7");
  });

  it("uses the approved labels for known badge values", () => {
    renderTable();

    expect(screen.getByText("Prioridade B")).toBeInTheDocument();
    expect(
      screen.getByText("Prospectar com cautela"),
    ).toBeInTheDocument();
    expect(screen.getByText("Revisão humana")).toBeInTheDocument();
  });

  it("never presents nullable values as zero", () => {
    renderTable({
      ...completeLead,
      companyName: null,
      city: null,
      uf: null,
      sector: null,
      score: null,
      priority: null,
      recommendedAction: null,
      trustStatus: null,
      import_batch_id: null,
      source_row: null,
    });

    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByText("Não disponível")).toHaveLength(8);
    expect(row).not.toHaveTextContent(/\b0\b/);
  });

  it("renders unmapped badge values with a neutral fallback", () => {
    renderTable({
      ...completeLead,
      priority: "A",
      recommendedAction: "CONTATAR_AGORA",
      trustStatus: "CONFIANCA_ALTISSIMA",
    });

    expect(screen.getAllByText("Não mapeado")).toHaveLength(3);
    expect(screen.queryByText("CONTATAR_AGORA")).toBeNull();
    expect(screen.queryByText("CONFIANCA_ALTISSIMA")).toBeNull();
  });

  it("shows a low-confidence warning only when the DTO marks it as low", () => {
    const { rerender } = render(
      <LeadTable
        leads={[completeLead]}
        pagination={defaultPagination}
      />,
    );

    expect(screen.queryByText("Baixa confiança")).toBeNull();

    rerender(
      <LeadTable
        leads={[
          {
            ...completeLead,
            confidenceIndicator: "low",
          },
        ]}
        pagination={defaultPagination}
      />,
    );

    expect(screen.getByText("Baixa confiança")).toBeInTheDocument();
  });

  it("links to the exact lead run using the normalized CNPJ", () => {
    renderTable();

    expect(
      screen.getByRole("link", {
        name: "Abrir análise de Empresa Horizonte",
      }),
    ).toHaveAttribute(
      "href",
      `/leads/12345678000195?leadRunId=${leadRunId}`,
    );
  });

  it("renders a useful exact-run link even when the company name is missing", () => {
    renderTable({
      ...completeLead,
      companyName: null,
    });

    expect(
      screen.getByRole("link", {
        name: "Abrir análise de 12.345.678/0001-95",
      }),
    ).toBeInTheDocument();
  });

  it("preserves approved filters and page size in pagination links", () => {
    renderTable(
      completeLead,
      {
        page: 2,
        pageSize: 10,
        total: 30,
        totalPages: 3,
      },
      {
        cnpj: "12345678000195",
        uf: "SP",
        priority: "B",
      },
    );

    expect(
      screen.getByRole("link", { name: "Página anterior" }),
    ).toHaveAttribute(
      "href",
      "/leads?page=1&pageSize=10&cnpj=12345678000195&uf=SP&priority=B",
    );
    expect(
      screen.getByRole("link", { name: "Próxima página" }),
    ).toHaveAttribute(
      "href",
      "/leads?page=3&pageSize=10&cnpj=12345678000195&uf=SP&priority=B",
    );
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
  });

  it("disables pagination directions at their respective boundaries", () => {
    const { rerender } = render(
      <LeadTable
        leads={[completeLead]}
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
      <LeadTable
        leads={[completeLead]}
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
