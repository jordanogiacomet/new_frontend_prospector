import type {
  LeadEvidenceItem,
  LeadEvidenceContent,
  LeadInsightCollection,
  LeadStrategicReportContent,
} from "../../types/leads";

const maximumCollectionItems = 12;
const maximumInsightLength = 320;
const maximumEvidenceTitleLength = 160;
const maximumEvidenceSummaryLength = 800;
const maximumStrategicReportLength = 12_000;
const strategicReportPhoneRedaction = "[Telefone removido por privacidade]";
const strategicReportReductionNotice = "Conteúdo reduzido para exibição.";
const strategicReportPhonePattern =
  /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[\s-]?\d{4}/g;
const restrictedStrategicReportLabels = new Set([
  "api model",
  "effective generation",
  "effective model",
  "generation mode",
  "geracao efetiva",
  "ia concluida",
  "mode",
  "modo",
  "modelo",
  "modelo api",
  "modelo efetivo",
  "requested policy",
  "politica solicitada",
  "saida estruturada interpretada",
  "status",
  "structured output interpreted",
  "tipo",
  "type",
]);
const strategicReportFieldPattern =
  /\*\*([^*\n]{1,80}?):\*\*\s*([\s\S]*?)(?=(?:\s*\|\s*)?\*\*[^*\n]{1,80}?:\*\*|$)/g;

export interface SensitiveContentAccess {
  readonly enabled: boolean;
  readonly allowedUrlHosts: readonly string[];
  readonly now: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePlainText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(normalized) ||
    /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(normalized) ||
    /\bhttps?:\/\//i.test(normalized) ||
    /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[\s-]?\d{4}/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function isExpired(expiresAt: Date | string | null, now: Date): boolean {
  if (expiresAt === null) {
    return false;
  }

  const expiresAtTime = Date.parse(
    expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
  );

  return !Number.isFinite(expiresAtTime) || expiresAtTime <= now.getTime();
}

function hasSensitiveAccess(
  access: SensitiveContentAccess,
  expiresAt: Date | string | null,
): boolean {
  return access.enabled && !isExpired(expiresAt, access.now);
}

function mapTextCollection(
  value: unknown,
  access: SensitiveContentAccess,
  expiresAt: Date | string | null,
): LeadInsightCollection {
  if (!hasSensitiveAccess(access, expiresAt)) {
    return { status: "omitted_by_policy", items: null };
  }

  if (value === null) {
    return { status: "missing", items: null };
  }

  if (!Array.isArray(value) || value.length > maximumCollectionItems) {
    return { status: "unavailable", items: null };
  }

  const items = value.map((item) =>
    normalizePlainText(item, maximumInsightLength),
  );

  if (items.some((item) => item === null)) {
    return { status: "unavailable", items: null };
  }

  return { status: "available", items: items as readonly string[] };
}

function mapAllowedUrl(
  value: unknown,
  allowedUrlHosts: readonly string[],
): string | null {
  if (typeof value !== "string" || allowedUrlHosts.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !allowedUrlHosts.includes(url.hostname.toLowerCase())
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function mapEvidenceItem(
  value: unknown,
  allowedUrlHosts: readonly string[],
): LeadEvidenceItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = normalizePlainText(value.title, maximumEvidenceTitleLength);
  const summary =
    value.summary === undefined || value.summary === null
      ? null
      : normalizePlainText(value.summary, maximumEvidenceSummaryLength);

  if (title === null || (value.summary !== undefined && summary === null)) {
    return null;
  }

  return {
    title,
    summary,
    url: mapAllowedUrl(value.url, allowedUrlHosts),
  };
}

export function mapSensitiveLeadInsights(
  riskFlags: unknown,
  positiveSignals: unknown,
  access: SensitiveContentAccess,
  expiresAt: Date | string | null,
): Pick<LeadInsightCollectionResult, "riskFlags" | "positiveSignals"> {
  return {
    riskFlags: mapTextCollection(riskFlags, access, expiresAt),
    positiveSignals: mapTextCollection(positiveSignals, access, expiresAt),
  };
}

interface LeadInsightCollectionResult {
  riskFlags: LeadInsightCollection;
  positiveSignals: LeadInsightCollection;
}

export function mapSensitiveLeadEvidences(
  value: unknown,
  access: SensitiveContentAccess,
  expiresAt: Date | string | null,
): LeadEvidenceContent {
  if (!hasSensitiveAccess(access, expiresAt)) {
    return { status: "omitted_by_policy", content: null };
  }

  if (value === null) {
    return { status: "missing", content: null };
  }

  if (!Array.isArray(value) || value.length > maximumCollectionItems) {
    return { status: "unavailable", content: null };
  }

  const content = value.map((item) =>
    mapEvidenceItem(item, access.allowedUrlHosts),
  );

  if (content.some((item) => item === null)) {
    return { status: "unavailable", content: null };
  }

  return {
    status: "available",
    content: content as readonly LeadEvidenceItem[],
  };
}

function sanitizeStrategicReportMarkdown(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\r\n?/g, "\n").trim();

  if (
    normalized.length === 0 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized) ||
    /<\/?[a-z][^>]*>/i.test(normalized)
  ) {
    return null;
  }

  const sourceWasReduced = normalized.length > maximumStrategicReportLength;
  const boundedSource = sourceWasReduced
    ? normalized.slice(0, maximumStrategicReportLength)
    : normalized;
  const structurallySanitized = boundedSource
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[\t ]{0,3}(?:#{1,6}[\t ]+|[-*+]\s+|>\s?)/gm, "")
    .replace(/`{1,3}/g, "");
  const plainText = structurallySanitized
    .split(/\n{2,}/)
    .map(formatStrategicReportBlock)
    .filter((block) => block.length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (
    plainText.length === 0 ||
    /\b(?:javascript|data|vbscript):/i.test(plainText) ||
    /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(plainText)
  ) {
    return null;
  }

  const privacySanitized = plainText.replace(
    strategicReportPhonePattern,
    strategicReportPhoneRedaction,
  );

  if (
    !sourceWasReduced &&
    privacySanitized.length <= maximumStrategicReportLength
  ) {
    return privacySanitized;
  }

  const noticeSeparator = "\n\n";
  const contentLimit =
    maximumStrategicReportLength -
    noticeSeparator.length -
    strategicReportReductionNotice.length;
  const reducedContent = privacySanitized
    .slice(0, contentLimit)
    .trimEnd();

  return `${reducedContent}${noticeSeparator}${strategicReportReductionNotice}`;
}

function formatStrategicReportBlock(block: string): string {
  const fields = [...block.matchAll(strategicReportFieldPattern)];
  if (fields.length === 0) {
    return stripInlineMarkdown(block);
  }

  const firstFieldIndex = fields[0]?.index ?? 0;
  const preface = stripInlineMarkdown(
    block.slice(0, firstFieldIndex).replace(/\s*\|\s*$/, "").trim(),
  );
  const readableFields = fields.flatMap((field) => {
    const label = stripInlineMarkdown(field[1]?.trim() ?? "");
    const value = stripInlineMarkdown(
      (field[2] ?? "").replace(/\s*\|\s*$/, "").trim(),
    );
    if (
      label.length === 0 ||
      value.length === 0 ||
      isRestrictedStrategicReportLabel(label)
    ) {
      return [];
    }
    return [`${label}: ${value}`];
  });

  return [preface, ...readableFields].filter(Boolean).join("\n");
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .trim();
}

function isRestrictedStrategicReportLabel(label: string): boolean {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return (
    restrictedStrategicReportLabels.has(normalized) ||
    normalized.startsWith("modelo ") ||
    normalized.startsWith("model ")
  );
}

export function mapSensitiveStrategicReport(
  markdown: unknown,
  matchCount: unknown,
  integrityStatus: unknown,
  access: SensitiveContentAccess,
  expiresAt: Date | string | null,
): LeadStrategicReportContent {
  if (!hasSensitiveAccess(access, expiresAt)) {
    return { status: "omitted_by_policy", content: null };
  }

  if (
    typeof matchCount !== "number" ||
    !Number.isSafeInteger(matchCount) ||
    matchCount < 0
  ) {
    return { status: "unavailable", content: null };
  }

  if (matchCount === 0) {
    return { status: "missing", content: null };
  }

  if (matchCount !== 1 || integrityStatus !== "OK") {
    return { status: "unavailable", content: null };
  }

  if (markdown === null) {
    return { status: "missing", content: null };
  }

  const content = sanitizeStrategicReportMarkdown(markdown);

  return content === null
    ? { status: "unavailable", content: null }
    : { status: "available", content };
}
