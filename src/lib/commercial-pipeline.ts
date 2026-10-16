import type {
  CommercialStage,
  CommercialWorkQueueItem,
  LeadWorkspaceDto,
} from "../types/commercial";

export const prospectingPipelinePhases = [
  {
    id: "new",
    label: "Novos",
    description: "Empresas que ainda precisam de preparação comercial.",
  },
  {
    id: "preparation",
    label: "Preparação",
    description: "Oportunidades atribuídas e prontas para planejar o contato.",
  },
  {
    id: "prospecting",
    label: "Em prospecção",
    description: "Contatos iniciados e acompanhamentos em andamento.",
  },
  {
    id: "meeting",
    label: "Reunião",
    description: "Oportunidades qualificadas para uma conversa de diagnóstico.",
  },
  {
    id: "waiting",
    label: "Em espera",
    description: "Empresas pausadas para uma retomada futura.",
  },
  {
    id: "closed",
    label: "Encerrados",
    description: "Oportunidades ganhas ou encerradas sem avanço.",
  },
] as const;

export type ProspectingPipelinePhase =
  (typeof prospectingPipelinePhases)[number];
export type ProspectingPipelinePhaseId = ProspectingPipelinePhase["id"];

const phaseByStage: Readonly<Record<CommercialStage, ProspectingPipelinePhaseId>> = {
  NOT_STARTED: "new",
  ASSIGNED: "preparation",
  CONTACTED: "prospecting",
  FOLLOW_UP: "prospecting",
  MEETING: "meeting",
  PAUSED: "waiting",
  CLOSED_WON: "closed",
  CLOSED_LOST: "closed",
};

export function getProspectingPipelinePhaseId(
  item: CommercialWorkQueueItem,
): ProspectingPipelinePhaseId {
  return item.workspace === null
    ? "new"
    : phaseByStage[item.workspace.commercial_stage];
}

export function groupProspectingPipelineItems(
  items: readonly CommercialWorkQueueItem[],
): ReadonlyMap<ProspectingPipelinePhaseId, readonly CommercialWorkQueueItem[]> {
  const groups = new Map<
    ProspectingPipelinePhaseId,
    CommercialWorkQueueItem[]
  >(prospectingPipelinePhases.map((phase) => [phase.id, []]));

  for (const item of items) {
    groups.get(getProspectingPipelinePhaseId(item))?.push(item);
  }

  return groups;
}

export function getProspectingFallbackAction(
  workspace: LeadWorkspaceDto | null,
  approachDraft: CommercialWorkQueueItem["approachDraft"],
): string {
  const messageIsReady = approachDraft?.status === "ready";

  if (workspace === null) {
    return messageIsReady
      ? "Iniciar o acompanhamento e revisar a mensagem"
      : "Iniciar o acompanhamento comercial";
  }

  switch (workspace.commercial_stage) {
    case "NOT_STARTED":
      return messageIsReady
        ? "Revisar a mensagem e planejar o primeiro contato"
        : "Planejar o primeiro contato";
    case "ASSIGNED":
      return messageIsReady
        ? "Revisar a mensagem e realizar o primeiro contato"
        : "Preparar e realizar o primeiro contato";
    case "CONTACTED":
    case "FOLLOW_UP":
      return "Registrar o próximo contato de qualificação";
    case "MEETING":
      return "Agendar reunião de diagnóstico";
    case "PAUSED":
      return "Definir a data de retomada";
    case "CLOSED_WON":
    case "CLOSED_LOST":
      return "Nenhuma ação pendente";
  }
}
