export const CONTACT_COMMERCIAL_SCORE_RULE_VERSION =
  "contact-commercial-score-v1" as const;

interface ContactScoreCandidate {
  readonly jobTitle: string | null;
  readonly governanceState: "AVAILABLE" | "SUPPRESSED" | "EXPIRED";
}

export type ContactCommercialScoreResult =
  | {
      readonly kind: "SCORED";
      readonly producerScore: number;
      readonly commercialScore: number;
      readonly bonus: number;
      readonly matchedProfile: string;
    }
  | {
      readonly kind: "NO_PRIORITY_PROFILE";
      readonly producerScore: number | null;
    }
  | {
      readonly kind: "PRODUCER_SCORE_UNAVAILABLE";
      readonly bonus: number;
      readonly matchedProfile: string;
    };

interface PriorityProfileRule {
  readonly label: string;
  readonly bonus: number;
  readonly titles: readonly string[];
}

const priorityProfileRules: readonly PriorityProfileRule[] = [
  {
    label: "Diretor Financeiro",
    bonus: 15,
    titles: [
      "diretor financeiro",
      "finance director",
      "financial director",
      "director of finance",
    ],
  },
  {
    label: "Controller",
    bonus: 15,
    titles: ["controller", "comptroller"],
  },
  {
    label: "Gerente Contábil",
    bonus: 12,
    titles: ["gerente contabil", "accounting manager", "manager of accounting"],
  },
  {
    label: "Coordenador Contábil",
    bonus: 10,
    titles: [
      "coordenador contabil",
      "accounting coordinator",
      "coordinator of accounting",
    ],
  },
  {
    label: "Supervisor Contábil",
    bonus: 8,
    titles: [
      "supervisor contabil",
      "accounting supervisor",
      "supervisor of accounting",
    ],
  },
  {
    label: "Analista/Assistente Contábil",
    bonus: 5,
    titles: [
      "analista contabil",
      "assistente contabil",
      "accounting analyst",
      "accounting assistant",
    ],
  },
  {
    label: "Analista/Assistente de Patrimônio",
    bonus: 5,
    titles: [
      "analista de patrimonio",
      "assistente de patrimonio",
      "fixed asset analyst",
      "fixed assets analyst",
      "fixed asset assistant",
      "fixed assets assistant",
      "asset accounting analyst",
      "asset accounting assistant",
    ],
  },
] as const;

export const CONTACT_PRIORITY_PROFILE_SEARCH_TITLES: readonly string[] =
  priorityProfileRules.flatMap((rule) => rule.titles);

export const CONTACT_ADJACENT_PROFILE_SEARCH_TITLES: readonly string[] = [
  "chief financial officer",
  "cfo",
  "vice president finance",
  "vice president of finance",
  "vp finance",
  "vp of finance",
  "head of finance",
  "head finance",
  "diretor administrativo financeiro",
  "diretor administrativo e financeiro",
  "administrative financial director",
  "finance and administration director",
  "gerente financeiro",
  "finance manager",
  "financial manager",
  "coordenador financeiro",
  "finance coordinator",
  "financial coordinator",
  "supervisor financeiro",
  "finance supervisor",
  "financial supervisor",
  "analista financeiro",
  "assistente financeiro",
  "finance analyst",
  "financial analyst",
  "finance assistant",
  "financial assistant",
  "finance business partner",
  "accounting director",
  "director of accounting",
  "head of accounting",
  "chief accounting officer",
  "lider contabil",
  "accounting lead",
  "accounting team lead",
  "diretor de tesouraria",
  "gerente de tesouraria",
  "treasury director",
  "director of treasury",
  "treasury manager",
  "diretor fiscal",
  "gerente fiscal",
  "coordenador fiscal",
  "tax director",
  "director of tax",
  "tax manager",
  "diretor de planejamento financeiro",
  "gerente de planejamento financeiro",
  "fp a director",
  "fp a manager",
] as const;

export function calculateContactCommercialScore(
  producerScore: number | null,
  candidates: readonly ContactScoreCandidate[],
): ContactCommercialScoreResult {
  const matchingRules = candidates
    .filter((candidate) => candidate.governanceState === "AVAILABLE")
    .map((candidate) => matchingPriorityRule(candidate.jobTitle))
    .filter((rule): rule is PriorityProfileRule => rule !== null)
    .sort((left, right) => right.bonus - left.bonus);
  const bestRule = matchingRules[0];

  if (bestRule === undefined) {
    return {
      kind: "NO_PRIORITY_PROFILE",
      producerScore,
    };
  }

  if (producerScore === null) {
    return {
      kind: "PRODUCER_SCORE_UNAVAILABLE",
      bonus: bestRule.bonus,
      matchedProfile: bestRule.label,
    };
  }

  return {
    kind: "SCORED",
    producerScore,
    commercialScore: Math.min(100, producerScore + bestRule.bonus),
    bonus: bestRule.bonus,
    matchedProfile: bestRule.label,
  };
}

function matchingPriorityRule(
  jobTitle: string | null,
): PriorityProfileRule | null {
  if (jobTitle === null) return null;
  const normalizedTitle = normalizeTitle(jobTitle);

  return (
    priorityProfileRules.find((rule) =>
      rule.titles.some((title) => hasTitlePhrase(normalizedTitle, title)),
    ) ?? null
  );
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function hasTitlePhrase(title: string, phrase: string): boolean {
  return ` ${title} `.includes(` ${phrase} `);
}
