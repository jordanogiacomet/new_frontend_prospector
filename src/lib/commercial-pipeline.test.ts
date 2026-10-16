import { describe, expect, it } from "vitest";

import type { CommercialStage, CommercialWorkQueueItem } from "../types/commercial";
import {
  getProspectingFallbackAction,
  getProspectingPipelinePhaseId,
  groupProspectingPipelineItems,
  prospectingPipelinePhases,
} from "./commercial-pipeline";

function queueItem(
  commercialStage: CommercialStage | null,
  decisionId = commercialStage ?? "missing",
): CommercialWorkQueueItem {
  const workspace =
    commercialStage === null
      ? null
      : {
          workspace_id: `workspace-${decisionId}`,
          organization_id: "org-synthetic",
          cnpj_normalizado: "12345678000195",
          observed_lead_run_id: `lr_${"a".repeat(64)}`,
          responsible_subject: null,
          commercial_stage: commercialStage,
          next_action: null,
          next_action_due_at: null,
          commercial_outcome: null,
          version: 1,
          created_by_subject: "actor-synthetic",
          updated_by_subject: "actor-synthetic",
          created_at: "2026-08-18T12:00:00.000Z",
          updated_at: "2026-08-18T12:00:00.000Z",
          archived_at: null,
          archived_by_subject: null,
        };

  return {
    approachDraft: null,
    companyDomain: null,
    producerLead: {
      decision_id: decisionId,
      import_batch_id: "batch-synthetic",
      lead_run_id: `lr_${"a".repeat(64)}`,
      source_row: 1,
      source_hash: "hash-synthetic",
      agent_version: "agent-synthetic",
      cnpj: "12345678000195",
      companyName: `Empresa ${decisionId}`,
      city: "Recife",
      uf: "PE",
      sector: "Serviços sintéticos",
      score: 80,
      priority: "B",
      recommendedAction: "PROSPECTAR",
      trustStatus: "Confiável",
      confidenceIndicator: "normal",
      lastAnalysisAt: "2026-08-18T12:00:00.000Z",
    },
    workspace,
    sources: {
      producer: { factSource: "producer_current_leads_v1" },
      workspace: {
        factSource: "app_lead_workspaces_v1",
        state: workspace === null ? "missing" : "matched",
      },
    },
  };
}

describe("commercial prospecting pipeline", () => {
  it.each([
    [null, "new"],
    ["NOT_STARTED", "new"],
    ["ASSIGNED", "preparation"],
    ["CONTACTED", "prospecting"],
    ["FOLLOW_UP", "prospecting"],
    ["MEETING", "meeting"],
    ["PAUSED", "waiting"],
    ["CLOSED_WON", "closed"],
    ["CLOSED_LOST", "closed"],
  ] as const)("maps stage %s to %s", (stage, expectedPhase) => {
    expect(getProspectingPipelinePhaseId(queueItem(stage))).toBe(expectedPhase);
  });

  it("keeps every opportunity in exactly one ordered phase", () => {
    const items = [
      queueItem("MEETING"),
      queueItem(null),
      queueItem("FOLLOW_UP"),
      queueItem("CLOSED_LOST"),
      queueItem("ASSIGNED"),
    ];
    const groups = groupProspectingPipelineItems(items);

    expect([...groups.keys()]).toEqual(
      prospectingPipelinePhases.map((phase) => phase.id),
    );
    expect([...groups.values()].flat()).toHaveLength(items.length);
    expect(groups.get("prospecting")?.[0]?.producerLead.decision_id).toBe(
      "FOLLOW_UP",
    );
  });

  it("prioritizes message review when a new opportunity already has a draft", () => {
    expect(
      getProspectingFallbackAction(null, {
        status: "ready",
        message: "Mensagem sintética",
      }),
    ).toBe("Iniciar o acompanhamento e revisar a mensagem");
    expect(getProspectingFallbackAction(null, null)).toBe(
      "Iniciar o acompanhamento comercial",
    );
  });

  it.each([
    ["NOT_STARTED", "Planejar o primeiro contato"],
    ["ASSIGNED", "Preparar e realizar o primeiro contato"],
    ["CONTACTED", "Registrar o próximo contato de qualificação"],
    ["FOLLOW_UP", "Registrar o próximo contato de qualificação"],
    ["MEETING", "Agendar reunião de diagnóstico"],
    ["PAUSED", "Definir a data de retomada"],
    ["CLOSED_WON", "Nenhuma ação pendente"],
    ["CLOSED_LOST", "Nenhuma ação pendente"],
  ] as const)("derives a safe fallback for %s", (stage, expectedAction) => {
    expect(
      getProspectingFallbackAction(queueItem(stage).workspace, null),
    ).toBe(expectedAction);
  });
});
