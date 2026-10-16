import {
  CONTACT_SEARCH_DIAGNOSTIC_CODES,
  CONTACT_REVEAL_STATUSES,
  type ContactCandidateDto,
  type ContactRevealStatus,
  type ContactSearchDiagnosticDto,
} from "../types/contact-enrichment";

export function readContactSearchDiagnostics(
  value: unknown,
): readonly ContactSearchDiagnosticDto[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return null;
  const stages = new Set<string>();
  for (const item of value as readonly unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const diagnostic = item as Record<string, unknown>;
    if (
      Object.keys(diagnostic).some((key) => !["provider", "stage", "code"].includes(key)) ||
      typeof diagnostic.provider !== "string" ||
      typeof diagnostic.stage !== "string" ||
      !["LUSHA", "APOLLO"].includes(diagnostic.provider) ||
      !["COMPANY_SEARCH", "CONTACT_PREVIEW", "COMPANY_MATCH"].includes(diagnostic.stage) ||
      !CONTACT_SEARCH_DIAGNOSTIC_CODES.some((code) => code === diagnostic.code) ||
      (diagnostic.code === "NO_RELEVANT_MATCHES" && diagnostic.stage !== "CONTACT_PREVIEW") ||
      (diagnostic.provider === "LUSHA" && diagnostic.stage === "COMPANY_MATCH") ||
      (diagnostic.provider === "APOLLO" && diagnostic.stage === "COMPANY_SEARCH")) return null;
    const key = `${diagnostic.provider}:${diagnostic.stage}`;
    if (stages.has(key)) return null;
    stages.add(key);
  }
  return value as readonly ContactSearchDiagnosticDto[];
}

export function describeContactSearchDiagnostic(
  diagnostic: ContactSearchDiagnosticDto,
): string {
  const provider = diagnostic.provider === "LUSHA" ? "Lusha" : "Apollo";
  switch (diagnostic.code) {
    case "RESULTS_FOUND":
      return diagnostic.stage === "CONTACT_PREVIEW"
        ? `${provider} retornou perfis profissionais nesta amostra.`
        : `${provider} retornou uma correspondência de empresa.`;
    case "NO_MATCHES":
      return diagnostic.stage === "CONTACT_PREVIEW"
        ? `${provider} não retornou decisores válidos nesta amostra.`
        : `${provider} não localizou uma empresa com os dados informados.`;
    case "NO_RELEVANT_MATCHES":
      return `${provider} retornou perfis, mas nenhum dos cargos desta amostra corresponde às áreas prioritárias. Isso não comprova ausência desses profissionais na empresa.`;
    case "ACCESS_DENIED":
      return `${provider} recusou o acesso à consulta. A credencial ou a permissão da integração precisa ser verificada.`;
    case "RATE_LIMITED":
      return `${provider} informou que o limite de consultas foi atingido.`;
    case "PROVIDER_ERROR":
      return `${provider} informou um erro ao realizar a consulta.`;
    case "INVALID_RESPONSE":
      return `O retorno do ${provider} não pôde ser validado. O resultado desta etapa permanece desconhecido.`;
    case "TIMEOUT":
      return `O tempo de espera pela resposta do ${provider} foi excedido. O resultado desta etapa permanece desconhecido.`;
    case "OUTCOME_UNKNOWN":
      return `O resultado da consulta ao ${provider} não foi confirmado.`;
    case "DOMAIN_UNAVAILABLE":
      return `${provider} não foi consultado porque a empresa confirmada não possui um domínio válido para esta busca.`;
    case "COMPANY_NOT_CONFIRMED":
      return `${provider} não confirmou a empresa pelo domínio informado. A busca de pessoas não foi realizada.`;
    case "NOT_ATTEMPTED":
      return `${provider} não foi consultado nesta solicitação.`;
  }
}

export function contactApiErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value) ||
    typeof value.error !== "object" || value.error === null || !("code" in value.error)) return null;
  switch (value.error.code) {
    case "CONTACT_DATA_HTTPS_REQUIRED":
      return "A consulta de contatos requer uma conexão segura. Abra o Prospecta pelo endereço HTTPS aprovado.";
    case "AUTHENTICATION_REQUIRED":
      return "Sua sessão expirou ou não pôde ser confirmada. Entre novamente e consulte o pedido existente antes de tentar uma nova ação.";
    case "ACCESS_DENIED":
      return "Seu perfil ou a configuração deste ambiente não permite esta ação com contatos. Solicite a liberação ao responsável pelo acesso.";
    case "CONTACT_COMPANY_MATCH_UNAVAILABLE":
      return "A confirmação da empresa expirou ou não está mais disponível. Localize e confirme a empresa novamente.";
    case "VALIDATION_ERROR":
      return "Os dados da busca não foram aceitos. Confira o domínio ou a empresa selecionada.";
    case "DATA_SOURCE_UNAVAILABLE":
      return "O Prospecta não conseguiu acessar os dados desta solicitação agora. Consulte o pedido existente antes de enviar uma nova solicitação.";
    case "CONTACT_REVEAL_UNAVAILABLE":
      return "Este contato ou os canais selecionados não estão disponíveis para recuperação. Motivo não informado. Atualize os contatos para consultar a disponibilidade registrada.";
    case "CONTACT_PREVIEW_NOT_FOUND":
    case "CONTACT_COMPANY_SEARCH_NOT_FOUND":
      return "A solicitação não foi encontrada para seu acesso. Confira a empresa e o pedido; se necessário, peça ajuda ao responsável pelo acesso.";
    case "CONTACT_NOT_FOUND":
      return "O contato não foi encontrado para seu acesso. Atualize o pedido existente antes de realizar outra ação.";
    case "CONTACT_REVEAL_IDEMPOTENCY_CONFLICT":
    case "CONTACT_PREVIEW_IDEMPOTENCY_CONFLICT":
    case "CONTACT_COMPANY_SEARCH_IDEMPOTENCY_CONFLICT":
      return "Esta ação conflita com uma solicitação já registrada. Consulte o pedido existente antes de iniciar uma nova busca.";
    default:
      return null;
  }
}

export function isContactRevealStatus(value: unknown): value is ContactRevealStatus {
  return CONTACT_REVEAL_STATUSES.some((status) => status === value);
}

export function describeContactRevealStatus(
  status: ContactRevealStatus,
  contact?: ContactCandidateDto,
): string {
  switch (status) {
    case "REQUEST_RECORDED":
      return "Solicitação de recuperação registrada. O envio ainda não foi confirmado. Consulte o pedido existente; não envie uma nova solicitação.";
    case "REVEAL_DISPATCHED":
      return "Recuperação enviada e aguardando resposta. Consulte o pedido existente para conferir o resultado.";
    case "DISPATCH_OUTCOME_UNKNOWN":
    case "PROVIDER_OUTCOME_UNKNOWN":
      return "O resultado da recuperação permanece desconhecido. Motivo não informado. Consulte o pedido existente antes de solicitar novamente.";
    case "REVEAL_EMPTY":
      return "Recuperação encerrada sem canais profissionais disponíveis nesta solicitação. Motivo não informado. Confira o pedido existente; isso não comprova ausência de e-mail ou telefone.";
    case "REVEAL_FAILED":
      return "A recuperação registrou uma falha. Motivo não informado. Consulte o pedido existente e peça ajuda ao responsável pela integração antes de solicitar novamente.";
    case "REVEAL_AVAILABLE": {
      if (!contact?.reveal || !contact.reveal.channelsMatchResult || !contact.channels || contact.governanceState !== "AVAILABLE") {
        return "A recuperação tem resultado registrado. Consulte o pedido existente para conferir os canais; a conclusão ainda não foi validada nesta tela.";
      }
      const requested = contact.reveal.requestedChannels;
      const channels = contact.channels;
      const recovered = requested.filter((channel) => channel === "work_email"
        ? channels.workEmails.length > 0 : channels.businessPhones.length > 0);
      if (recovered.length === 0) {
        return "O resultado foi registrado, mas os canais recuperados estão indisponíveis nesta leitura. Motivo não informado. Consulte o pedido existente para verificar a disponibilidade.";
      }
      return recovered.length === requested.length
        ? "Recuperação concluída: os canais profissionais selecionados estão disponíveis nesta leitura."
        : "Recuperação parcial: parte dos canais selecionados está disponível. Motivo não informado para os demais canais. Consulte o pedido existente antes de solicitar novamente.";
    }
  }
}
