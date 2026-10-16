export const unknownMutationMessage =
  "Não foi possível confirmar o resultado desta ação. O motivo não foi informado. Consulte o registro atual antes de decidir repetir; seu rascunho foi preservado.";

export interface ActionErrorFeedback {
  readonly kind: "session" | "denied" | "conflict" | "validation" | "unavailable" | "unknown";
  readonly message: string;
}

export function actionErrorFeedback(
  status: number,
  payload: unknown,
  context: "read" | "mutation",
): ActionErrorFeedback {
  const code = typeof payload === "object" && payload !== null && "error" in payload &&
    typeof payload.error === "object" && payload.error !== null && "code" in payload.error
    ? payload.error.code : null;
  if (status === 401 || code === "AUTHENTICATION_REQUIRED") {
    return { kind: "session", message: "Sua sessão expirou. Entre novamente para continuar; nenhum reenvio será feito automaticamente." };
  }
  if (status === 403 || code === "ACCESS_DENIED") {
    return { kind: "denied", message: "Seu perfil ou a configuração deste ambiente não permite esta ação. Solicite ao responsável a verificação do acesso." };
  }
  if (status === 409) {
    return { kind: "conflict", message: "O registro mudou ou esta tentativa entra em conflito com uma anterior. Consulte a versão atual e revise os dados antes de salvar novamente." };
  }
  if (status === 400 || status === 413 || status === 422 || code === "VALIDATION_ERROR") {
    return { kind: "validation", message: "Os dados não foram aceitos. Confira os campos e as orientações de preenchimento antes de tentar novamente." };
  }
  if (context === "mutation") return { kind: "unknown", message: unknownMutationMessage };
  if (status === 404) {
    return { kind: "unavailable", message: "O registro não foi encontrado. Volte à lista e consulte um registro disponível." };
  }
  return { kind: "unavailable", message: "Não foi possível atualizar esta consulta. O motivo não foi informado. Tente atualizar novamente; esta ação apenas consulta os dados." };
}
