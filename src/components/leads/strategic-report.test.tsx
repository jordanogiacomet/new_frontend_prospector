import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LeadDetail } from "../../types/leads";
import { StrategicReport } from "./strategic-report";

const omittedReport: LeadDetail["strategicReport"] = {
  status: "omitted_by_policy",
  content: null,
};

describe("strategic report", () => {
  it("renders the policy-omitted state in clear business language", () => {
    render(<StrategicReport report={omittedReport} />);

    expect(
      screen.getByRole("region", { name: "Relatório estratégico" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Retido por política" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Retido por política")).toBeInTheDocument();
    expect(screen.getByText("Conteúdo não exibido")).toBeInTheDocument();
    expect(
      screen.getByText(/política de privacidade vigente/i),
    ).toBeInTheDocument();
  });

  it("renders a missing report as distinct from policy omission", () => {
    render(<StrategicReport report={{ status: "missing" }} />);

    expect(
      screen.getByRole("status", { name: "Ausente" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ausente")).toBeInTheDocument();
    expect(
      screen.getByText("Relatório ainda não disponível"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Retido por política")).toBeNull();
    expect(
      screen.queryByText("Não foi possível consultar o relatório"),
    ).toBeNull();
  });

  it("renders an unavailable report as an accessible error state", () => {
    render(<StrategicReport report={{ status: "unavailable" }} />);

    const alert = screen.getByRole("alert", { name: "Indisponível" });

    expect(alert).toHaveTextContent("Indisponível");
    expect(alert).toHaveTextContent(
      "Não foi possível consultar o relatório",
    );
    expect(alert).toHaveTextContent(/tente novamente mais tarde/i);
    expect(screen.queryByText("Ausente")).toBeNull();
    expect(screen.queryByText("Retido por política")).toBeNull();
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

    expect(screen.getByText("Retido por política")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("SANITIZED_CONTENT_CANARY");
    expect(
      screen.getByText(/não substitui a aprovação de privacidade/i),
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
