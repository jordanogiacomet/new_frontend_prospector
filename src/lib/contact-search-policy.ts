import {
  CONTACT_ADJACENT_PROFILE_SEARCH_TITLES,
  CONTACT_PRIORITY_PROFILE_SEARCH_TITLES,
} from "./contact-commercial-score";

export const CONTACT_SEARCH_POLICY_VERSION = "contact-asset-targeting-v1" as const;

export const CONTACT_EXCLUDED_PROFILE_SEARCH_TITLES: readonly string[] = [
  "patrimonio pessoal",
  "gestao de fortunas",
  "wealth management",
  "wealth manager",
  "wealth advisor",
  "private wealth",
  "private banker",
];

// Physical assets and fixed-asset accounting; generic investment/wealth roles
// do not establish relevance to Apollo Gestão's asset-management services.
export const CONTACT_ASSET_PROFILE_SEARCH_TITLES: readonly string[] = [
  "diretor de patrimonio",
  "diretor patrimonial",
  "gerente de patrimonio",
  "gerente patrimonial",
  "gestor de patrimonio",
  "coordenador de patrimonio",
  "coordenador patrimonial",
  "supervisor de patrimonio",
  "supervisor patrimonial",
  "analista de patrimonio",
  "analista patrimonial",
  "assistente de patrimonio",
  "assistente patrimonial",
  "responsavel pelo patrimonio",
  "gerente de ativo imobilizado",
  "coordenador de ativo imobilizado",
  "supervisor de ativo imobilizado",
  "analista de ativo imobilizado",
  "assistente de ativo imobilizado",
  "fixed asset director",
  "fixed assets director",
  "director of fixed assets",
  "head of fixed assets",
  "fixed asset manager",
  "fixed assets manager",
  "fixed asset coordinator",
  "fixed assets coordinator",
  "fixed asset supervisor",
  "fixed assets supervisor",
  "fixed asset analyst",
  "fixed assets analyst",
  "fixed asset assistant",
  "fixed assets assistant",
  "fixed asset accountant",
  "fixed assets accountant",
  "asset accounting manager",
  "asset accounting analyst",
  "asset accounting assistant",
];

// Search order is independent of the existing, versioned commercial bonus.
export const CONTACT_FINANCE_PROFILE_SEARCH_TITLES: readonly string[] = [
  ...CONTACT_PRIORITY_PROFILE_SEARCH_TITLES.filter(
    (title) => !CONTACT_ASSET_PROFILE_SEARCH_TITLES.includes(title),
  ),
  ...CONTACT_ADJACENT_PROFILE_SEARCH_TITLES,
  "contador",
  "contadora",
  "accountant",
  "diretor de controladoria",
  "gerente de controladoria",
  "coordenador de controladoria",
  "supervisor de controladoria",
  "analista de controladoria",
];

// Require explicit stock/inventory/physical-asset responsibility rather than
// treating a generic operations, sales or people title as a target.
export const CONTACT_ASSET_OPERATIONS_PROFILE_SEARCH_TITLES: readonly string[] = [
  "gerente de inventario",
  "coordenador de inventario",
  "supervisor de inventario",
  "analista de inventario",
  "gerente de estoques",
  "gerente de estoque",
  "coordenador de estoques",
  "coordenador de estoque",
  "supervisor de estoques",
  "supervisor de estoque",
  "analista de estoques",
  "analista de estoque",
  "gerente de ativos fisicos",
  "coordenador de ativos fisicos",
  "physical asset manager",
  "physical assets manager",
  "physical asset coordinator",
  "physical assets coordinator",
  "inventory manager",
  "inventory coordinator",
  "inventory supervisor",
  "inventory analyst",
  "stock control manager",
  "stock control coordinator",
  "stock control analyst",
];
