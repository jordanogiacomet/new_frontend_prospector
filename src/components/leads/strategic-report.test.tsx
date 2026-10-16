import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LeadDetail } from "../../types/leads";
import { StrategicReport } from "./strategic-report";

const omittedReport: LeadDetail["strategicReport"] = {
  status: "omitted_by_policy",
  content: null,
};

const availableReport: LeadDetail["strategicReport"] = {
  status: "available",
  content: "Prioridade estratégica registrada para análise.",
};

describe("strategic report", () => {
  it("renders a sanitized report supplied by the approved contract", () => {
    render(<StrategicReport report={availableReport} />);

    expect(
      screen.getByRole("status", { name: "Relatório disponível" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Análise estratégica registrada"),
    ).toBeInTheDocument();
    expect(screen.getByText(availableReport.content)).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo protegido")).toBeNull();
    expect(
      screen.getByText("Conteúdo disponível para consulta nesta análise."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Conteúdo sintético disponível para esta análise de demonstração.",
      ),
    ).toBeNull();
  });

  it("presents labeled business fields as a readable definition list", () => {
    const { container } = render(
      <StrategicReport
        report={{
          status: "available",
          content:
            "Relatório comercial sintético\n\nPrioridade comercial: R\nFit estratégico: 72/100\nConfiança: média\nSetor detectado: manufatura_sintetica",
        }}
      />,
    );

    expect(
      screen.getByText("Relatório comercial sintético"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("dl")).toHaveLength(1);
    expect(container.querySelectorAll("dt")).toHaveLength(4);
    expect(container.querySelectorAll("dd")).toHaveLength(4);
    expect(screen.getByText("Prioridade comercial")).toBeInTheDocument();
    expect(screen.getByText("72/100")).toBeInTheDocument();
    expect(screen.getByText("manufatura sintetica")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("**");
  });

  it("renders the policy-omitted state in clear business language", () => {
    render(<StrategicReport report={omittedReport} />);

    expect(
      screen.getByRole("region", { name: "Relatório estratégico" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Conteúdo protegido" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
    expect(screen.getByText("Relatório protegido")).toBeInTheDocument();
    expect(
      screen.getByText(/política de privacidade/i),
    ).toBeInTheDocument();
  });

  it("renders a missing report as distinct from policy omission", () => {
    render(<StrategicReport report={{ status: "missing" }} />);

    expect(
      screen.getByRole("status", { name: "Não registrado" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Não registrado")).toBeInTheDocument();
    expect(
      screen.getByText("Relatório não registrado"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo protegido")).toBeNull();
    expect(
      screen.queryByText("Relatório indisponível"),
    ).toBeNull();
  });

  it("renders an unavailable report as an accessible error state", () => {
    render(<StrategicReport report={{ status: "unavailable" }} />);

    const alert = screen.getByRole("alert", { name: "Indisponível" });

    expect(alert).toHaveTextContent("Indisponível");
    expect(alert).toHaveTextContent(
      "Relatório indisponível",
    );
    expect(alert).toHaveTextContent(/consulte a recomendação e os demais dados disponíveis/i);
    expect(screen.queryByText("Não registrado")).toBeNull();
    expect(screen.queryByText("Conteúdo protegido")).toBeNull();
  });

  it("does not render Markdown or raw HTML supplied at runtime", () => {
    const reportWithUnapprovedContent = {
      ...omittedReport,
      markdown: "# MARKDOWN_CONTENT_CANARY",
      html: '<img src="x" onerror="RAW_HTML_CANARY">',
      executableMarkup:
        '<script>SCRIPT_CANARY</script><iframe srcdoc="IFRAME_CANARY"></iframe><button onclick="EVENT_HANDLER_CANARY">Executar</button>',
    };
    const { container } = render(
      <StrategicReport report={reportWithUnapprovedContent} />,
    );

    expect(container).not.toHaveTextContent("MARKDOWN_CONTENT_CANARY");
    expect(container.innerHTML).not.toContain("RAW_HTML_CANARY");
    expect(container.innerHTML).not.toContain("SCRIPT_CANARY");
    expect(container.innerHTML).not.toContain("IFRAME_CANARY");
    expect(container.innerHTML).not.toContain("EVENT_HANDLER_CANARY");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("does not render evidence text or evidence URLs supplied at runtime", () => {
    const reportWithUnapprovedEvidence = {
      ...omittedReport,
      evidenceText: "EVIDENCE_TEXT_CANARY",
      evidenceUrl: "https://evidence.invalid/EVIDENCE_URL_CANARY",
    };
    const { container } = render(
      <StrategicReport report={reportWithUnapprovedEvidence} />,
    );

    expect(container).not.toHaveTextContent("EVIDENCE_TEXT_CANARY");
    expect(container.innerHTML).not.toContain("EVIDENCE_URL_CANARY");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps sanitized or XSS-safe content withheld by the privacy policy", () => {
    const technicallySanitizedReport = {
      ...omittedReport,
      sanitizedHtml: "<p>SANITIZED_CONTENT_CANARY</p>",
      xssSafe: true,
    };
    const { container } = render(
      <StrategicReport report={technicallySanitizedReport} />,
    );

    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("SANITIZED_CONTENT_CANARY");
    expect(
      screen.getByText(/não pode ser exibido conforme a política de privacidade/i),
    ).toBeInTheDocument();
  });

  it("does not expose a content insertion surface in its component props", () => {
    const propsWithMarkdown: Parameters<typeof StrategicReport>[0] = {
      report: omittedReport,
      // @ts-expect-error Markdown is deliberately absent from the component API.
      markdown: "MARKDOWN_PROP_CANARY",
    };

    const propsWithEvidenceUrl: Parameters<typeof StrategicReport>[0] = {
      report: omittedReport,
      // @ts-expect-error Evidence URLs are deliberately absent from the component API.
      evidenceUrl: "https://evidence.invalid/EVIDENCE_PROP_CANARY",
    };

    const propsWithReportContent: Parameters<typeof StrategicReport>[0] = {
      report: {
        status: "omitted_by_policy",
        content: null,
        // @ts-expect-error Report content is deliberately absent from the approved contract.
        markdown: "MARKDOWN_REPORT_PROP_CANARY",
      },
    };

    expect("markdown" in propsWithMarkdown).toBe(true);
    expect("evidenceUrl" in propsWithEvidenceUrl).toBe(true);
    expect("markdown" in propsWithReportContent.report).toBe(true);
  });
});
