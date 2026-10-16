import {
  cnpjSchema,
  leadListQuerySchema,
  outsideAnalysisQuerySchema,
} from "./validators/lead-query";

const internalOrigin = "https://prospecta.internal";
const maximumReturnToLength = 2_048;
const workspacePathPattern =
  /^\/workspaces\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LeadReturnDestination {
  readonly href: string;
  readonly label: "Voltar para leads" | "Voltar ao acompanhamento";
}

export function appendReturnTo(href: string, returnTo: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

export function resolveLeadReturnDestination(
  returnTo: string | null,
): LeadReturnDestination {
  const parsed = parseInternalReturnTo(returnTo);

  if (parsed?.pathname === "/leads") {
    return { href: parsed.href, label: "Voltar para leads" };
  }

  if (parsed !== null && workspacePathPattern.test(parsed.pathname)) {
    return { href: parsed.href, label: "Voltar ao acompanhamento" };
  }

  return { href: "/leads", label: "Voltar para leads" };
}

export function resolveLeadListReturnHref(
  returnTo: string | null,
  cnpj: string,
): string {
  const leadList = parseExactListReturnTo(returnTo, "/leads");

  if (leadList !== null && leadListQuerySchema.safeParse(leadList.searchParams).success) {
    return `/leads${leadList.search}`;
  }

  const legacyQueue = parseExactListReturnTo(returnTo, "/work-queue");

  if (legacyQueue !== null) {
    const query = new URLSearchParams();

    for (const key of ["page", "pageSize", "uf", "priority", "cnpj_normalizado"]) {
      for (const value of legacyQueue.searchParams.getAll(key)) {
        query.append(key === "cnpj_normalizado" ? "cnpj" : key, value);
      }
    }

    if (leadListQuerySchema.safeParse(query).success) {
      return query.size > 0 ? `/leads?${query.toString()}` : "/leads";
    }
  }

  const company = cnpjSchema.safeParse(cnpj);

  return company.success
    ? `/leads?cnpj=${encodeURIComponent(company.data)}`
    : "/leads";
}

export function resolveBatchListReturnHref(returnTo: string | null): string {
  const path = "/imports/batches";
  const parsed = parseExactListReturnTo(returnTo, path);

  if (parsed === null || parsed.search.length === 0) {
    return path;
  }

  const searchParams = new URLSearchParams(parsed.search);
  const pagination = new URLSearchParams({
    page: String(readPaginationValue(searchParams.get("page"), 1, 10_000)),
    pageSize: String(readPaginationValue(searchParams.get("pageSize"), 20, 100)),
  });

  return `${path}?${pagination.toString()}`;
}

export function resolveOutsideAnalysisReturnHref(returnTo: string | null): string {
  const path = "/leads/outside-analysis";
  const parsed = parseExactListReturnTo(returnTo, path);

  if (parsed === null || parsed.search.length === 0) {
    return path;
  }

  const query = outsideAnalysisQuerySchema.safeParse(
    new URLSearchParams(parsed.search),
  );

  if (!query.success) {
    return path;
  }

  const pagination = new URLSearchParams({
    page: String(query.data.page),
    pageSize: String(query.data.pageSize),
  });

  return `${path}?${pagination.toString()}`;
}

function parseExactListReturnTo(
  returnTo: string | null,
  path: string,
): URL | null {
  const parsed = parseInternalReturnTo(returnTo);

  if (parsed?.pathname !== path || parsed.href.split("?")[0] !== path) {
    return null;
  }

  return new URL(parsed.href, internalOrigin);
}

function readPaginationValue(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (value === null || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : fallback;
}

function parseInternalReturnTo(
  returnTo: string | null,
): { readonly href: string; readonly pathname: string } | null {
  if (
    returnTo === null ||
    returnTo.length === 0 ||
    returnTo.length > maximumReturnToLength ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\") ||
    returnTo.includes("#")
  ) {
    return null;
  }

  try {
    const parsed = new URL(returnTo, internalOrigin);

    if (parsed.origin !== internalOrigin) {
      return null;
    }

    return { href: returnTo, pathname: parsed.pathname };
  } catch {
    return null;
  }
}

