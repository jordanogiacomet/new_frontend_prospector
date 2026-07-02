import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LeadAudit } from "../../types/leads";

import { LeadAuditDetails } from "./lead-audit";

const completeAudit: LeadAudit = {
  decision_id: "decision-synthetic-audit-001",
  import_batch_id: "batch-synthetic-audit-001",
  lead_run_id: `lr_${"a".repeat(64)}`,
  source_row: 17,
  source_hash: `sha256:${"b".repeat(64)}`,
  agent_version: "agent-synthetic-audit-3",
  idempotency_key: "idempotency-synthetic-audit-001",
  used_cache: true,
  validated_at: "2026-06-15T15:00:00.000Z",
  created_at: "2026-06-14T15:00:00.000Z",
  updated_at: "2026-06-16T15:00:00.000Z",
  expires_at: "2026-07-15T15:00:00.000Z",
};

function renderAudit(audit: LeadAudit = completeAudit) {
  return render(<LeadAuditDetails audit={audit} />);
}

function expandAudit() {
  fireEvent.click(screen.getByText("Auditoria avançada"));
}

describe("lead audit details", () => {
  it("starts collapsed with its advanced content hidden", () => {
    renderAudit();

    const details = screen.getByTestId("lead-audit-details");

    expect(details).not.toHaveAttribute("open");
    expect(screen.getByTestId("lead-audit-content")).not.toBeVisible();
  });

  it("expands through its semantic and accessible summary", () => {
    renderAudit();

    const summary = screen.getByText("Auditoria avançada");
    const details = screen.getByTestId("lead-audit-details");

    expect(summary.tagName).toBe("SUMMARY");

    fireEvent.click(summary);

    expect(details).toHaveAttribute("open");
    expect(screen.getByTestId("lead-audit-content")).toBeVisible();
  });

  it("renders every approved audit field with Portuguese business labels", () => {
    renderAudit();
    expandAudit();

    const content = screen.getByTestId("lead-audit-content");
    const labels = [
      "Identificador da decisão",
      "Lote de importação",
      "Execução da análise",
      "Linha de origem",
      "Hash da origem",
      "Versão do agente",
      "Chave de idempotência",
      "Cache utilizado",
      "Data de validação",
      "Data de criação",
      "Última atualização",
      "Data de expiração",
    ];

    for (const label of labels) {
      expect(within(content).getByText(label)).toBeInTheDocument();
    }

    expect(content).toHaveTextContent("decision-synthetic-audit-001");
    expect(content).toHaveTextContent("batch-synthetic-audit-001");
    expect(content).toHaveTextContent(`lr_${"a".repeat(64)}`);
    expect(content).toHaveTextContent("17");
    expect(content).toHaveTextContent(`sha256:${"b".repeat(64)}`);
    expect(content).toHaveTextContent("agent-synthetic-audit-3");
    expect(content).toHaveTextContent("idempotency-synthetic-audit-001");
  });

  it("renders every optional null field as unavailable", () => {
    renderAudit({
      ...completeAudit,
      import_batch_id: null,
      source_row: null,
      source_hash: null,
      agent_version: null,
      idempotency_key: null,
      used_cache: null,
      updated_at: null,
      expires_at: null,
    });
    expandAudit();

    expect(screen.getAllByText("Não disponível")).toHaveLength(8);
  });

  it.each([
    { usedCache: true, expected: "Sim" },
    { usedCache: false, expected: "Não" },
    { usedCache: null, expected: "Não disponível" },
  ] as const)(
    "renders used_cache $usedCache as $expected",
    ({ usedCache, expected }) => {
      renderAudit({
        ...completeAudit,
        used_cache: usedCache,
      });
      expandAudit();

      expect(screen.getByTestId("audit-used-cache")).toHaveTextContent(
        expected,
      );
    },
  );

  it("formats valid audit dates with the existing Brazilian formatter", () => {
    renderAudit();
    expandAudit();

    expect(screen.getByTestId("audit-validated-at")).toHaveTextContent(
      "15/06/2026",
    );
    expect(screen.getByTestId("audit-created-at")).toHaveTextContent(
      "14/06/2026",
    );
    expect(screen.getByTestId("audit-updated-at")).toHaveTextContent(
      "16/06/2026",
    );
    expect(screen.getByTestId("audit-expires-at")).toHaveTextContent(
      "15/07/2026",
    );
  });

  it("renders invalid audit dates as unavailable", () => {
    renderAudit({
      ...completeAudit,
      validated_at: "2026-02-30T15:00:00.000Z",
      created_at: "not-a-date",
      updated_at: "",
      expires_at: "2026-06-15",
    });
    expandAudit();

    expect(screen.getByTestId("audit-validated-at")).toHaveTextContent(
      "Não disponível",
    );
    expect(screen.getByTestId("audit-created-at")).toHaveTextContent(
      "Não disponível",
    );
    expect(screen.getByTestId("audit-updated-at")).toHaveTextContent(
      "Não disponível",
    );
    expect(screen.getByTestId("audit-expires-at")).toHaveTextContent(
      "Não disponível",
    );
  });

  it("preserves long audit identifiers exactly as received", () => {
    const exactDecisionId = ` decision::${"Xy-_.:".repeat(24)}::end `;
    const exactBatchId = `BATCH/${"09".repeat(36)}`;
    const exactRunId = `lr_${"Aa0-_".repeat(30)}`;
    const exactHash = `sha512:${"Ff".repeat(64)}`;
    const exactVersion = "agent/V.003+build_SYNTHETIC";
    const exactIdempotencyKey = `idem:${"k_".repeat(72)}`;

    renderAudit({
      ...completeAudit,
      decision_id: exactDecisionId,
      import_batch_id: exactBatchId,
      lead_run_id: exactRunId,
      source_hash: exactHash,
      agent_version: exactVersion,
      idempotency_key: exactIdempotencyKey,
    });
    expandAudit();

    expect(screen.getByTestId("audit-decision-id").textContent).toBe(
      exactDecisionId,
    );
    expect(screen.getByTestId("audit-import-batch-id").textContent).toBe(
      exactBatchId,
    );
    expect(screen.getByTestId("audit-lead-run-id").textContent).toBe(
      exactRunId,
    );
    expect(screen.getByTestId("audit-source-hash").textContent).toBe(
      exactHash,
    );
    expect(screen.getByTestId("audit-agent-version").textContent).toBe(
      exactVersion,
    );
    expect(screen.getByTestId("audit-idempotency-key").textContent).toBe(
      exactIdempotencyKey,
    );
  });

  it("does not render unapproved raw or technical fields", () => {
    const auditWithUnapprovedFields = {
      ...completeAudit,
      raw_payload: '{"credential":"synthetic-secret"}',
      stack_trace: "SyntheticDatabaseError: connection failed",
      database_url: "postgresql://synthetic:secret@example.invalid/leads",
    };

    renderAudit(auditWithUnapprovedFields);
    expandAudit();

    expect(document.body).not.toHaveTextContent("raw_payload");
    expect(document.body).not.toHaveTextContent("synthetic-secret");
    expect(document.body).not.toHaveTextContent("SyntheticDatabaseError");
    expect(document.body).not.toHaveTextContent("postgresql://");
    expect(document.body).not.toHaveTextContent("{");
  });
});
