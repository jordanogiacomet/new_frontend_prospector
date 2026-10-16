import type { BatchSummary } from "../types/imports";

export function hasConfirmedBatchCounts(batch: BatchSummary): boolean {
  return [
    batch.rowCountAccepted,
    batch.terminalCount,
    batch.leadCount,
    batch.blockedCount,
    batch.failedCount,
  ].some((count) => count !== null);
}

export function batchResultsHeading(batch: BatchSummary): string {
  if (batch.observationStatus === "UNAVAILABLE") {
    return "Consulta de resultados indisponível";
  }

  if (batch.observationStatus === "INCONSISTENT") {
    return "Resultados em verificação";
  }

  return "Resultados ainda não confirmados";
}

export function batchResultsNarrative(batch: BatchSummary): string {
  if (batch.observationStatus === "UNAVAILABLE") {
    return "Não foi possível consultar os resultados agora. Atualize a consulta mais tarde.";
  }

  if (batch.observationStatus === "INCONSISTENT") {
    return "Há informações divergentes. As contagens aguardam confirmação.";
  }

  if (batch.workflowReportedClosedAt !== null) {
    return "O encerramento foi informado, mas os resultados de cada linha ainda não foram confirmados.";
  }

  if (batch.workflowReportedStartedAt !== null) {
    return "O início foi informado. As contagens de linhas e resultados ainda aguardam confirmação.";
  }

  return "O envio foi registrado. As contagens de linhas e resultados ainda aguardam confirmação.";
}
